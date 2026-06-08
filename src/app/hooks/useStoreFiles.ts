"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { Client } from "@langchain/langgraph-sdk";
import type { Item } from "@langchain/langgraph-sdk";
import { getConfig } from "@/lib/config";
import { useTenant } from "@/app/hooks/useTenant";
import { useFilesystemBackend } from "@/app/hooks/useFilesystemBackend";

/**
 * Represents a file stored in LangGraph Store under the workspace
 * namespace. The `key` is the file path (e.g. "/src/main.py") and
 * `content` is the plain-text file body.
 */
export interface StoreFile {
  /** Full file path, e.g. "/src/main.py" */
  path: string;
  /** Plain-text content */
  content: string;
  /** Size in bytes */
  size: number;
  /** ISO timestamp of last modification */
  updatedAt: string;
}

/**
 * Fetch files from LangGraph Store when filesystem backend is "store".
 *
 * Files are stored under namespace ("workspace", <workspace_id>, "files")
 * by StoreBackend in the agent-server. Each item's key is the file path
 * and value contains { content: string, encoding: "utf-8" }.
 *
 * Returns an empty list when backend is "state" (files come from
 * checkpoint state.files instead).
 */
export function useStoreFiles(): {
  files: StoreFile[];
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
} {
  const { tenantId } = useTenant();
  const { backend } = useFilesystemBackend();
  const isStore = backend === "store";

  const result = useSWR(
    isStore ? ["store-files", tenantId] : null,
    async (): Promise<StoreFile[]> => {
      const config = getConfig();
      if (!config) return [];

      const client = new Client({
        apiUrl: config.deploymentUrl,
        defaultHeaders: config.langsmithApiKey
          ? { "X-Api-Key": config.langsmithApiKey }
          : {},
      });

      // Paginate through all items in the workspace files namespace.
      // StoreBackend uses ("workspace", workspace_id, "files").
      const namespace = ["workspace", tenantId, "files"];
      const allItems: Item[] = [];
      let offset = 0;
      const pageSize = 100;

      while (true) {
        const page = await client.store.searchItems(namespace, {
          limit: pageSize,
          offset,
        });
        if (!page.items.length) break;
        allItems.push(...page.items);
        if (page.items.length < pageSize) break;
        offset += pageSize;
      }

      return allItems.map((item) => {
        // StoreBackend stores value as { content: string, encoding?: string }
        // Handle both v2 (string) and v1 (string[]) content formats.
        const value = item.value as Record<string, unknown>;
        let content = "";
        if (typeof value?.content === "string") {
          content = value.content;
        } else if (Array.isArray(value?.content)) {
          content = (value.content as string[]).join("\n");
        }

        return {
          path: item.key,
          content,
          size: new TextEncoder().encode(content).length,
          updatedAt: item.updatedAt,
        };
      });
    }
  );

  return useMemo(
    () => ({
      files: result.data ?? [],
      isLoading: result.isLoading,
      error: result.error,
      mutate: () => void result.mutate(),
    }),
    [result.data, result.isLoading, result.error, result.mutate]
  );
}
