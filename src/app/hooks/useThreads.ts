import useSWRInfinite from "swr/infinite";
import type { Thread } from "@langchain/langgraph-sdk";
import { Client } from "@langchain/langgraph-sdk";
import { getConfig } from "@/lib/config";

function makeClient(deploymentUrl: string, apiKey?: string): Client {
  return new Client({
    apiUrl: deploymentUrl,
    defaultHeaders: apiKey ? { "X-Api-Key": apiKey } : {},
  });
}

/** Update a thread's title by writing to its metadata. */
export async function renameThread(
  deploymentUrl: string,
  threadId: string,
  title: string,
  apiKey?: string
): Promise<void> {
  await makeClient(deploymentUrl, apiKey).threads.update(threadId, {
    metadata: { title },
  });
}

/** Permanently delete a thread. */
export async function deleteThread(
  deploymentUrl: string,
  threadId: string,
  apiKey?: string
): Promise<void> {
  await makeClient(deploymentUrl, apiKey).threads.delete(threadId);
}

/**
 * Fork a thread — server copies the full checkpoint history into a new
 * thread. Returns the new thread id so the caller can navigate to it.
 */
export async function copyThread(
  deploymentUrl: string,
  threadId: string,
  apiKey?: string
): Promise<string> {
  const copy = await makeClient(deploymentUrl, apiKey).threads.copy(threadId);
  return copy.thread_id;
}

export interface ThreadItem {
  id: string;
  updatedAt: Date;
  status: Thread["status"];
  title: string;
  description: string;
  assistantId?: string;
}

const DEFAULT_PAGE_SIZE = 20;

export function useThreads(props: {
  status?: Thread["status"];
  limit?: number;
  /** When set, only threads whose `metadata.tenant_id` matches this id
   *  (or are untagged) appear. Tenant scoping is enforced server-side via
   *  the `metadata` filter on `client.threads.search`. */
  tenantId?: string;
}) {
  const pageSize = props.limit || DEFAULT_PAGE_SIZE;

  return useSWRInfinite(
    (pageIndex: number, previousPageData: ThreadItem[] | null) => {
      const config = getConfig();
      const apiKey =
        config?.langsmithApiKey ||
        process.env.NEXT_PUBLIC_LANGSMITH_API_KEY ||
        "";

      if (!config) {
        return null;
      }

      // If the previous page returned no items, we've reached the end
      if (previousPageData && previousPageData.length === 0) {
        return null;
      }

      return {
        kind: "threads" as const,
        pageIndex,
        pageSize,
        deploymentUrl: config.deploymentUrl,
        assistantId: config.assistantId,
        apiKey,
        status: props?.status,
        tenantId: props?.tenantId,
      };
    },
    async ({
      deploymentUrl,
      assistantId,
      apiKey,
      status,
      pageIndex,
      pageSize,
      tenantId,
    }: {
      kind: "threads";
      pageIndex: number;
      pageSize: number;
      deploymentUrl: string;
      assistantId: string;
      apiKey: string;
      status?: Thread["status"];
      tenantId?: string;
    }) => {
      const client = new Client({
        apiUrl: deploymentUrl,
        defaultHeaders: apiKey ? { "X-Api-Key": apiKey } : {},
      });

      // Check if assistantId is a UUID (deployed) or graph name (local)
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          assistantId
        );

      // Compose metadata filters. The tenant_id filter is intentionally
      // strict (exact match); legacy threads without the tag won't show
      // until they're tagged or the user picks "default".
      const metadataFilter: Record<string, string> = {};
      if (isUUID) metadataFilter.assistant_id = assistantId;
      if (tenantId) metadataFilter.tenant_id = tenantId;

      const threads = await client.threads.search({
        limit: pageSize,
        offset: pageIndex * pageSize,
        sortBy: "updated_at" as const,
        sortOrder: "desc" as const,
        status,
        ...(Object.keys(metadataFilter).length
          ? { metadata: metadataFilter }
          : {}),
      });

      return threads.map((thread): ThreadItem => {
        // User-set title (via PATCH metadata.title) wins; otherwise derive
        // from the first human message.
        const explicitTitle =
          typeof thread.metadata?.title === "string"
            ? (thread.metadata.title as string)
            : undefined;
        let title = explicitTitle ?? "Untitled Thread";
        let description = "";

        try {
          if (thread.values && typeof thread.values === "object") {
            const values = thread.values as any;
            const firstHumanMessage = values.messages.find(
              (m: any) => m.type === "human"
            );
            if (!explicitTitle && firstHumanMessage?.content) {
              const content =
                typeof firstHumanMessage.content === "string"
                  ? firstHumanMessage.content
                  : firstHumanMessage.content[0]?.text || "";
              title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
            }
            const firstAiMessage = values.messages.find(
              (m: any) => m.type === "ai"
            );
            if (firstAiMessage?.content) {
              const content =
                typeof firstAiMessage.content === "string"
                  ? firstAiMessage.content
                  : firstAiMessage.content[0]?.text || "";
              description = content.slice(0, 100);
            }
          }
        } catch {
          if (!explicitTitle) {
            title = `Thread ${thread.thread_id.slice(0, 8)}`;
          }
        }

        // The thread's *own* assistant comes from metadata that langgraph
        // writes on first run (graph_id = agent name, assistant_id = UUID).
        // Fall back to the caller's current selection only when missing,
        // so legacy threads don't render with a blank.
        const threadAssistantId =
          (typeof thread.metadata?.graph_id === "string"
            ? (thread.metadata.graph_id as string)
            : undefined) ??
          (typeof thread.metadata?.assistant_id === "string"
            ? (thread.metadata.assistant_id as string)
            : undefined) ??
          assistantId;

        return {
          id: thread.thread_id,
          updatedAt: new Date(thread.updated_at),
          status: thread.status,
          title,
          description,
          assistantId: threadAssistantId,
        };
      });
    },
    {
      revalidateFirstPage: true,
      revalidateOnFocus: true,
    }
  );
}
