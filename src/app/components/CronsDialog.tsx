"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { Client } from "@langchain/langgraph-sdk";
import type { Cron } from "@langchain/langgraph-sdk";
import { Calendar, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getConfig } from "@/lib/config";
import { useTenant } from "@/app/hooks/useTenant";

/**
 * UI for langgraph's built-in cron scheduler. Lets users schedule
 * recurring runs of the current assistant: a cron string plus a prompt
 * that gets sent as the user message at each fire.
 *
 * Crons created here carry the active tenant id in
 * `config.configurable.tenant_id` so the scheduled run sees the same
 * long-term memory as interactive sessions.
 */
export function CronsDialog({
  open,
  onOpenChange,
  assistantId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assistantId: string | null;
}) {
  const { tenantId } = useTenant();
  const [schedule, setSchedule] = useState("0 9 * * *");
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const client = useMemo(() => {
    const config = getConfig();
    if (!config) return null;
    return new Client({
      apiUrl: config.deploymentUrl,
      defaultHeaders: config.langsmithApiKey
        ? { "X-Api-Key": config.langsmithApiKey }
        : {},
    });
  }, []);

  const crons = useSWR<{ crons: Cron[] }>(
    open && assistantId && client ? ["crons", assistantId] : null,
    async () => {
      if (!client || !assistantId) return { crons: [] };
      const list = await client.crons.search({ assistantId, limit: 50 });
      return { crons: list as unknown as Cron[] };
    }
  );

  const handleCreate = useCallback(async () => {
    setError(null);
    if (!client || !assistantId) {
      setError("Pick an assistant first.");
      return;
    }
    const sched = schedule.trim();
    const msg = prompt.trim();
    if (!sched) {
      setError("Schedule (cron expression) is required.");
      return;
    }
    if (!msg) {
      setError("Prompt (what to send at each fire) is required.");
      return;
    }
    setSubmitting(true);
    try {
      await client.crons.create(assistantId, {
        schedule: sched,
        input: { messages: [{ type: "human", content: msg }] },
        config: { configurable: { tenant_id: tenantId } },
      });
      setPrompt("");
      await crons.mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [client, assistantId, schedule, prompt, tenantId, crons]);

  const handleDelete = useCallback(
    async (cronId: string) => {
      if (!client) return;
      try {
        await client.crons.delete(cronId);
        await crons.mutate();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [client, crons]
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="flex max-h-[85vh] w-[min(48rem,calc(100vw-2rem))] max-w-[min(48rem,calc(100vw-2rem))] flex-col overflow-hidden sm:max-w-[min(48rem,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Schedules
          </DialogTitle>
          <DialogDescription>
            Cron-style recurring runs of the current assistant. Each fire
            opens a fresh thread, sends the prompt below as the user
            message, and runs the agent. Carries the active tenant id
            (<code>{tenantId}</code>) so scheduled runs see the same
            long-term memory as interactive ones.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 overflow-hidden">
          <div className="flex flex-col gap-3 rounded-md border border-border p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Create a new schedule
            </p>
            <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-2">
              <div className="flex flex-col gap-1">
                <Label
                  htmlFor="cron-schedule"
                  className="text-xs"
                >
                  Cron expression
                </Label>
                <Input
                  id="cron-schedule"
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                  placeholder="0 9 * * *"
                  className="font-mono text-xs"
                  spellCheck={false}
                />
                <span className="text-[10px] text-muted-foreground">
                  m h dom mon dow · UTC
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <Label
                  htmlFor="cron-prompt"
                  className="text-xs"
                >
                  Prompt sent at each fire
                </Label>
                <Textarea
                  id="cron-prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. Summarize yesterday's news on AI infrastructure."
                  className="min-h-[80px] resize-none text-sm"
                />
              </div>
            </div>
            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => void handleCreate()}
                disabled={
                  submitting ||
                  !assistantId ||
                  !schedule.trim() ||
                  !prompt.trim()
                }
              >
                <Plus className="mr-1 h-3 w-3" />
                {submitting ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-1 overflow-hidden">
            <p className="text-xs font-medium text-muted-foreground">
              Active schedules for this assistant
            </p>
            <ScrollArea className="min-h-0 flex-1 rounded-md border border-border">
              <div className="flex flex-col gap-1 p-2">
                {crons.isLoading && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">
                    Loading…
                  </p>
                )}
                {crons.error && (
                  <p className="px-2 py-1 text-xs text-destructive">
                    Failed to list schedules: {String(crons.error)}
                  </p>
                )}
                {!crons.isLoading &&
                  !crons.error &&
                  (crons.data?.crons.length ?? 0) === 0 && (
                    <p className="px-2 py-1 text-xs text-muted-foreground">
                      No schedules yet.
                    </p>
                  )}
                {crons.data?.crons.map((c) => (
                  <CronRow
                    key={c.cron_id}
                    cron={c}
                    onDelete={() => void handleDelete(c.cron_id)}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CronRow({
  cron,
  onDelete,
}: {
  cron: Cron;
  onDelete: () => void;
}) {
  const created = cron.created_at ? new Date(cron.created_at) : null;
  return (
    <div
      className={cn(
        "flex min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-xs"
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-mono">{cron.schedule}</span>
        <span className="truncate text-muted-foreground">
          {created ? `created ${created.toLocaleString()}` : "scheduled"}
          {cron.end_time && ` · ends ${new Date(cron.end_time).toLocaleString()}`}
        </span>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={onDelete}
        title="Delete schedule"
      >
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </Button>
    </div>
  );
}
