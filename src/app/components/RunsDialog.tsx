"use client";

import useSWR from "swr";
import { format } from "date-fns";
import { Client } from "@langchain/langgraph-sdk";
import type { Run } from "@langchain/langgraph-sdk";
import { Activity } from "lucide-react";
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

const STATUS_COLORS: Record<Run["status"], string> = {
  pending: "bg-blue-500",
  running: "bg-blue-500",
  success: "bg-green-500",
  error: "bg-red-600",
  timeout: "bg-orange-500",
  interrupted: "bg-orange-500",
};

/**
 * Lists every run that has ever been issued against the current thread —
 * langgraph keeps them around for audit / debugging even after they
 * complete. Useful for "why did this thread end up in state X" forensics.
 */
export function RunsDialog({
  open,
  onOpenChange,
  threadId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  threadId: string | null;
}) {
  const { data, error, isLoading } = useSWR(
    open && threadId ? ["runs", threadId] : null,
    async ([, id]) => {
      const config = getConfig();
      if (!config) return [];
      const client = new Client({
        apiUrl: config.deploymentUrl,
        defaultHeaders: config.langsmithApiKey
          ? { "X-Api-Key": config.langsmithApiKey }
          : {},
      });
      return await client.runs.list(id, { limit: 50 });
    }
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Runs
          </DialogTitle>
          <DialogDescription>
            Every run issued against this thread, newest first.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="py-4 text-center text-sm text-destructive">
            Failed to load runs: {String((error as Error).message ?? error)}
          </p>
        )}
        {isLoading && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Loading…
          </p>
        )}
        {!isLoading && data && data.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No runs found for this thread.
          </p>
        )}
        {data && data.length > 0 && (
          <ScrollArea className="max-h-[60vh]">
            <div className="flex flex-col gap-1 pr-2">
              {data.map((run) => (
                <RunRow
                  key={run.run_id}
                  run={run}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RunRow({ run }: { run: Run }) {
  const created = run.created_at ? new Date(run.created_at) : null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-xs">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "h-2 w-2 flex-shrink-0 rounded-full",
            STATUS_COLORS[run.status] ?? "bg-gray-400"
          )}
        />
        <span className="font-semibold">{run.status}</span>
        <span className="truncate font-mono text-muted-foreground">
          {run.run_id.slice(0, 8)}…
        </span>
        <span className="truncate text-muted-foreground">
          assistant {run.assistant_id.slice(0, 8)}…
        </span>
      </div>
      <span className="flex-shrink-0 text-muted-foreground">
        {created ? format(created, "MMM d HH:mm:ss") : ""}
      </span>
    </div>
  );
}
