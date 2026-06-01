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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getConfig } from "@/lib/config";
import { useTenant } from "@/app/hooks/useTenant";

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
  const { tenantId } = useTenant();
  // Default to scoping the listing to the active tenant; flip this off
  // for an admin-style "all namespaces in the store" view (useful when
  // debugging which tenants exist).
  const [scopeToTenant, setScopeToTenant] = useState(true);

  const namespaces = useSWR(
    open ? ["store-namespaces", scopeToTenant ? tenantId : "*"] : null,
    async () => {
      const config = getConfig();
      if (!config) return { namespaces: [] };
      const client = new Client({
        apiUrl: config.deploymentUrl,
        defaultHeaders: config.langsmithApiKey
          ? { "X-Api-Key": config.langsmithApiKey }
          : {},
      });
      return await client.store.listNamespaces({
        limit: 200,
        ...(scopeToTenant ? { prefix: ["tenant", tenantId] } : {}),
      });
    }
  );

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
      <DialogContent className="flex max-h-[85vh] w-[min(64rem,calc(100vw-2rem))] max-w-[min(64rem,calc(100vw-2rem))] flex-col overflow-hidden sm:max-w-[min(64rem,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Store
          </DialogTitle>
          <DialogDescription>
            Cross-thread persistent memory. Each tenant gets its own
            namespace under <code>(&quot;tenant&quot;, &lt;id&gt;, ...)</code>.
            Empty here means the agent has never called{" "}
            <code>memory_save</code> for this tenant yet.
          </DialogDescription>
          <div className="flex items-center gap-2 pt-1">
            <Switch
              id="store-tenant-scope"
              checked={scopeToTenant}
              onCheckedChange={setScopeToTenant}
            />
            <Label
              htmlFor="store-tenant-scope"
              className="text-xs text-muted-foreground"
            >
              Scope to current tenant ({tenantId})
            </Label>
          </div>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)] gap-3">
          <ScrollArea className="min-h-0 min-w-0 rounded-md border border-border">
            <div className="flex min-w-0 flex-col gap-1 p-2">
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
                      "flex min-w-0 items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent",
                      isActive && "bg-accent"
                    )}
                  >
                    <FolderTree className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-mono">
                      {key}
                    </span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
          <ScrollArea className="min-h-0 min-w-0 rounded-md border border-border">
            <div className="flex min-w-0 flex-col gap-2 p-3">
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
    <div className="min-w-0 rounded border border-border p-2">
      <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate font-mono text-xs">{item.key}</span>
        <span className="flex-shrink-0 text-xs text-muted-foreground">
          {new Date(item.updatedAt).toLocaleString()}
        </span>
      </div>
      <pre className="w-full max-w-full overflow-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 font-mono text-[11px] leading-snug">
        {JSON.stringify(item.value, null, 2)}
      </pre>
    </div>
  );
}
