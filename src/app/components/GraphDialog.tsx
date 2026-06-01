"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import type { AssistantGraph } from "@langchain/langgraph-sdk";
import { Client } from "@langchain/langgraph-sdk";
import { Network } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getConfig } from "@/lib/config";

/**
 * Visualizes the assistant's LangGraph as a mermaid diagram.
 *
 * Mermaid is lazy-imported (only when this dialog mounts) so it stays
 * out of the initial bundle — the lib is ~700KB unminified and we don't
 * need it for normal chat usage.
 */
export function GraphDialog({
  open,
  onOpenChange,
  assistantId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assistantId: string | null;
}) {
  const { data, error, isLoading } = useSWR(
    open && assistantId ? ["graph", assistantId] : null,
    async ([, id]) => {
      const config = getConfig();
      if (!config) return null;
      const client = new Client({
        apiUrl: config.deploymentUrl,
        defaultHeaders: config.langsmithApiKey
          ? { "X-Api-Key": config.langsmithApiKey }
          : {},
      });
      return await client.assistants.getGraph(id);
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
            <Network className="h-4 w-4" />
            Agent graph
          </DialogTitle>
          <DialogDescription>
            The runtime LangGraph for this assistant — nodes are runnables,
            edges are control-flow transitions.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="py-4 text-center text-sm text-destructive">
            Failed to load graph: {String((error as Error).message ?? error)}
          </p>
        )}
        {isLoading && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Loading…
          </p>
        )}
        {data && (
          <ScrollArea className="max-h-[70vh]">
            <MermaidRender graph={data} />
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

function toMermaid(graph: AssistantGraph): string {
  const sanitize = (id: string | number) =>
    String(id).replace(/[^A-Za-z0-9_]/g, "_") || "node";
  const labelOf = (n: AssistantGraph["nodes"][number]) => {
    const name =
      n.name ??
      (typeof n.data === "string"
        ? n.data
        : (n.data as { name?: string })?.name) ??
      String(n.id);
    return name.replace(/"/g, "'");
  };

  const lines = ["graph TD"];
  for (const node of graph.nodes) {
    lines.push(`  ${sanitize(node.id)}["${labelOf(node)}"]`);
  }
  for (const edge of graph.edges) {
    const arrow = edge.conditional ? "-.->" : "-->";
    const label = edge.data ? `|${edge.data.replace(/"/g, "'")}|` : "";
    lines.push(
      `  ${sanitize(edge.source)} ${arrow}${label} ${sanitize(edge.target)}`
    );
  }
  return lines.join("\n");
}

function MermaidRender({ graph }: { graph: AssistantGraph }) {
  const mermaidStr = useMemo(() => toMermaid(graph), [graph]);
  const [svg, setSvg] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });
        const { svg: rendered } = await mermaid.render(
          `mermaid-${Date.now()}`,
          mermaidStr
        );
        if (!cancelled) {
          setSvg(rendered);
          setRenderError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setRenderError((e as Error).message ?? String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mermaidStr]);

  if (renderError) {
    return (
      <div className="p-4">
        <p className="mb-2 text-sm text-destructive">
          Mermaid render failed: {renderError}
        </p>
        <pre className="overflow-auto rounded bg-muted p-2 text-xs">
          {mermaidStr}
        </pre>
      </div>
    );
  }
  if (!svg) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        Rendering…
      </p>
    );
  }
  return (
    <div
      className="flex justify-center p-4"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
