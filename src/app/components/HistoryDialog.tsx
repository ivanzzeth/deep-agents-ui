"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import type { ThreadState } from "@langchain/langgraph-sdk";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useChatContext } from "@/providers/ChatProvider";

/**
 * Time-travel viewer. Reads `stream.history` (already maintained by
 * langgraph-sdk's useStream — no extra fetch) and lets the user:
 *
 *   - inspect the full state at any checkpoint (read-only JSON view)
 *   - fork a new branch from a checkpoint (`stream.submit(undefined, { checkpoint })`)
 *
 * Editing state at a checkpoint (true H1) is deferred — the read-only
 * branch-fork workflow already covers most "what if I went back here"
 * intent without risking destructive mutations to existing branches.
 */
export function HistoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { stream } = useChatContext();
  // Newest first — easier to spot recent checkpoints.
  const history = useMemo(
    () =>
      stream && Array.isArray(stream.history)
        ? [...stream.history].reverse()
        : [],
    [stream]
  );
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Thread history
          </DialogTitle>
          <DialogDescription>
            Every checkpoint LangGraph has captured for this thread. Click a row
            to inspect its state; fork to branch a new thread from that point
            without disturbing the current one.
          </DialogDescription>
        </DialogHeader>
        {history.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No history yet. Send a message to create checkpoints.
          </p>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="flex flex-col gap-1 pr-2">
              {history.map((state, idx) => (
                <CheckpointRow
                  key={(state.checkpoint?.checkpoint_id ?? "root") + idx}
                  state={state}
                  index={history.length - idx}
                  expanded={
                    expanded ===
                    (state.checkpoint?.checkpoint_id ?? `root-${idx}`)
                  }
                  onToggle={() =>
                    setExpanded((prev) =>
                      prev ===
                      (state.checkpoint?.checkpoint_id ?? `root-${idx}`)
                        ? null
                        : state.checkpoint?.checkpoint_id ?? `root-${idx}`
                    )
                  }
                  onFork={() => {
                    void stream.submit(undefined, {
                      checkpoint: state.checkpoint,
                    });
                    onOpenChange(false);
                  }}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CheckpointRow({
  state,
  index,
  expanded,
  onToggle,
  onFork,
}: {
  state: ThreadState;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onFork: () => void;
}) {
  const stepRaw =
    state.metadata && (state.metadata as Record<string, unknown>).step;
  const step = typeof stepRaw === "number" ? stepRaw : undefined;
  const checkpointId = state.checkpoint?.checkpoint_id;
  const timestamp = state.created_at ? new Date(state.created_at) : null;
  const messageCount = Array.isArray(
    (state.values as Record<string, unknown> | undefined)?.messages
  )
    ? ((state.values as Record<string, unknown>).messages as unknown[]).length
    : undefined;

  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-accent",
          expanded && "bg-accent"
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
          )}
          <span className="text-xs font-semibold">
            #{index} {step !== undefined ? `· step ${step}` : ""}
          </span>
          {messageCount !== undefined && (
            <span className="text-xs text-muted-foreground">
              {messageCount} msg{messageCount === 1 ? "" : "s"}
            </span>
          )}
          {checkpointId && (
            <span className="truncate font-mono text-xs text-muted-foreground">
              {checkpointId.slice(0, 8)}…
            </span>
          )}
        </div>
        <span className="flex-shrink-0 text-xs text-muted-foreground">
          {timestamp ? format(timestamp, "MMM d HH:mm:ss") : ""}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border bg-muted/30 px-3 py-2">
          <div className="mb-2 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onFork();
              }}
            >
              Fork from here
            </Button>
          </div>
          <pre className="max-h-[40vh] overflow-auto rounded bg-background p-2 font-mono text-xs">
            {JSON.stringify(state.values, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
