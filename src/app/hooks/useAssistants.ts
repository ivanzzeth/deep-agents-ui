import useSWR from "swr";
import { Client } from "@langchain/langgraph-sdk";
import type { Assistant } from "@langchain/langgraph-sdk";
import { getConfig } from "@/lib/config";

/**
 * List all assistants known to the connected LangGraph deployment.
 *
 * Uses the same client construction pattern as useThreads — a new Client
 * per fetch — so swapping deploymentUrl / apiKey reflects on next render.
 * Cached by SWR keyed on deploymentUrl, so multiple consumers share a fetch.
 */
export function useAssistants() {
  return useSWR(
    () => {
      const config = getConfig();
      if (!config) return null;
      return {
        kind: "assistants" as const,
        deploymentUrl: config.deploymentUrl,
        apiKey: config.langsmithApiKey ?? "",
      };
    },
    async ({ deploymentUrl, apiKey }): Promise<Assistant[]> => {
      const client = new Client({
        apiUrl: deploymentUrl,
        defaultHeaders: apiKey ? { "X-Api-Key": apiKey } : {},
      });
      return await client.assistants.search({ limit: 100 });
    },
    {
      // Auto-refresh: backend's fsnotify watcher can register new agents
      // at any time. Without polling, the dropdown would silently lag
      // until the user defocuses + refocuses the tab.
      refreshInterval: 5000,
    }
  );
}
