"use client";

import { useState } from "react";
import useSWR from "swr";
import { Client } from "@langchain/langgraph-sdk";
import type { Item } from "@langchain/langgraph-sdk";
import { Database, FolderTree } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getConfig } from "@/lib/config";

/**
 * Browse the LangGraph Store — the cross-thread key/value memory layer.
 * Useful for DeepAgents' MemoryMiddleware and any custom long-term state.
 *
 * Two panels: namespaces (left, click to drill in) and items in the
 * selected namespace (right, JSON-rendered).
 */
export function StoreDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [activeNs, setActiveNs] = useState<string[] | null>(null);

  const namespaces = useSWR(open ? "store-namespaces" : null, async () => {
    const config = getConfig();
    if (!config) return { namespaces: [] };
    const client = new Client({
      apiUrl: config.deploymentUrl,
      defaultHeaders: config.langsmithApiKey
        ? { "X-Api-Key": config.langsmithApiKey }
        : {},
    });
    return await client.store.listNamespaces({ limit: 200 });
  });

  const items = useSWR(
    open && activeNs ? ["store-items", activeNs.join("/")] : null,
    async () => {
      const config = getConfig();
      if (!config || !activeNs) return { items: [] };
      const client = new Client({
        apiUrl: config.deploymentUrl,
        defaultHeaders: config.langsmithApiKey
          ? { "X-Api-Key": config.langsmithApiKey }
          : {},
      });
      return await client.store.searchItems(activeNs, { limit: 100 });
    }
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Store
          </DialogTitle>
          <DialogDescription>
            Cross-thread persistent memory. Pick a namespace to see items.
          </DialogDescription>
        </DialogHeader>
        <div className="grid h-[60vh] grid-cols-[260px_1fr] gap-3">
          <ScrollArea className="rounded-md border border-border">
            <div className="flex flex-col gap-1 p-2">
              {namespaces.error && (
                <p className="px-2 py-1 text-xs text-destructive">
                  Failed to list namespaces.
                </p>
              )}
              {namespaces.isLoading && (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  Loading…
                </p>
              )}
              {namespaces.data?.namespaces.length === 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  No namespaces yet.
                </p>
              )}
              {namespaces.data?.namespaces.map((ns, i) => {
                const key = ns.join("/");
                const isActive = activeNs?.join("/") === key;
                return (
                  <button
                    key={`${key}-${i}`}
                    type="button"
                    onClick={() => setActiveNs(ns)}
                    className={cn(
                      "flex items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent",
                      isActive && "bg-accent"
                    )}
                  >
                    <FolderTree className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                    <span className="truncate font-mono">{key}</span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
          <ScrollArea className="rounded-md border border-border">
            <div className="flex flex-col gap-2 p-3">
              {!activeNs && (
                <p className="text-center text-sm text-muted-foreground">
                  Select a namespace on the left.
                </p>
              )}
              {activeNs && items.isLoading && (
                <p className="text-sm text-muted-foreground">Loading items…</p>
              )}
              {activeNs && items.data?.items.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No items in this namespace.
                </p>
              )}
              {items.data?.items.map((item) => (
                <ItemRow
                  key={`${item.namespace.join("/")}::${item.key}`}
                  item={item}
                />
              ))}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ItemRow({ item }: { item: Item }) {
  return (
    <div className="rounded border border-border p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate font-mono text-xs">{item.key}</span>
        <span className="flex-shrink-0 text-xs text-muted-foreground">
          {new Date(item.updatedAt).toLocaleString()}
        </span>
      </div>
      <pre className="overflow-auto rounded bg-muted/50 p-2 font-mono text-[11px] leading-snug">
        {JSON.stringify(item.value, null, 2)}
      </pre>
    </div>
  );
}
