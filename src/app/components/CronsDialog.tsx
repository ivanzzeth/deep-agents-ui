"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { Client } from "@langchain/langgraph-sdk";
import type { Cron, Thread } from "@langchain/langgraph-sdk";
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getConfig } from "@/lib/config";
import { useTenant } from "@/app/hooks/useTenant";

const COMMON_TIMEZONES = [
  "UTC",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
] as const;

const DEFAULT_TIMEZONE = "Asia/Shanghai";

/** Form state for the create / edit panel. */
interface CronFormState {
  schedule: string;
  prompt: string;
  timezone: string;
  /** When non-null, this form is editing an existing cron. The save
   *  action deletes that cron and creates a new one (langgraph has no
   *  update endpoint). */
  editingCronId: string | null;
}

function emptyForm(): CronFormState {
  return {
    schedule: "0 9 * * *",
    prompt: "",
    timezone: DEFAULT_TIMEZONE,
    editingCronId: null,
  };
}

/**
 * UI for langgraph's built-in cron scheduler. Three features beyond the
 * v1 dialog:
 *   - Timezone dropdown (langgraph natively supports IANA zones).
 *   - Per-cron edit (delete + recreate behind one Save button).
 *   - Per-cron history: expandable to show threads tagged with this
 *     cron_id (server-side `CronThreadTaggingMiddleware` writes the tag).
 *
 * Crons carry the active tenant id in `config.configurable.tenant_id`,
 * so scheduled runs hit the same long-term memory as interactive ones.
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
  const [form, setForm] = useState<CronFormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedHistoryFor, setExpandedHistoryFor] = useState<string | null>(
    null,
  );
  // Default to "all crons" so newly-curious users don't have to figure
  // out the toggle to find anything. Flip to scoped when working on
  // schedules for a specific agent.
  const [scopeToCurrent, setScopeToCurrent] = useState(false);

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

  // Map assistant_id → graph_id so the "Assistant" column shows the
  // human-readable name (researcher / tweet-writer / …) instead of UUIDs.
  const assistants = useSWR(
    open && client ? "cron-assistants" : null,
    async () => {
      if (!client) return [];
      return await client.assistants.search({ limit: 100 });
    },
  );
  const assistantNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of assistants.data ?? []) {
      map[a.assistant_id] = a.graph_id ?? a.name ?? a.assistant_id;
    }
    return map;
  }, [assistants.data]);

  const crons = useSWR<{ crons: Cron[] }>(
    open && client ? ["crons", scopeToCurrent ? assistantId : "*"] : null,
    async () => {
      if (!client) return { crons: [] };
      const list = await client.crons.search({
        ...(scopeToCurrent && assistantId ? { assistantId } : {}),
        limit: 100,
      });
      return { crons: list as unknown as Cron[] };
    },
  );

  const resetForm = useCallback(() => {
    setForm(emptyForm());
    setError(null);
  }, []);

  const startEditing = useCallback((c: Cron) => {
    const payload = (c.payload ?? {}) as Record<string, unknown>;
    const input = (payload.input as { messages?: Array<{ type?: string; content?: unknown }> } | undefined);
    const firstHuman = input?.messages?.find((m) => m.type === "human");
    const promptText =
      typeof firstHuman?.content === "string" ? firstHuman.content : "";
    setForm({
      schedule: c.schedule,
      prompt: promptText,
      timezone: (c as Cron & { timezone?: string }).timezone || DEFAULT_TIMEZONE,
      editingCronId: c.cron_id,
    });
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    setError(null);
    if (!client || !assistantId) {
      setError("Pick an assistant first.");
      return;
    }
    const sched = form.schedule.trim();
    const msg = form.prompt.trim();
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
      // Edit = delete + recreate. langgraph has no PATCH /runs/crons/{id}
      // and we don't want partial state where the old cron lives on if
      // the new one fails to create — so do create first, then delete
      // on success.
      const created = await createCron(client, {
        assistantId,
        schedule: sched,
        prompt: msg,
        timezone: form.timezone,
        tenantId,
      });
      if (form.editingCronId) {
        try {
          await client.crons.delete(form.editingCronId);
        } catch (e) {
          // Old cron lingers; report but don't block. User can manually
          // delete it from the list.
          console.warn(
            "[CronsDialog] created new cron but failed to delete old",
            form.editingCronId,
            e,
          );
        }
      }
      void created;
      resetForm();
      await crons.mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [client, assistantId, form, tenantId, crons, resetForm]);

  const handleDelete = useCallback(
    async (cronId: string) => {
      if (!client) return;
      try {
        await client.crons.delete(cronId);
        if (form.editingCronId === cronId) resetForm();
        await crons.mutate();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [client, crons, form.editingCronId, resetForm],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[min(56rem,calc(100vw-2rem))] max-w-[min(56rem,calc(100vw-2rem))] flex-col overflow-hidden sm:max-w-[min(56rem,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Schedules
          </DialogTitle>
          <DialogDescription>
            Cron-style recurring runs. Each fire opens a fresh thread,
            sends the prompt as the user message, and runs the chosen
            agent. Carries tenant id <code>{tenantId}</code> so
            scheduled runs see the same long-term memory as interactive
            ones.
          </DialogDescription>
          <div className="flex items-center gap-2 pt-1">
            <Switch
              id="crons-scope"
              checked={scopeToCurrent}
              onCheckedChange={setScopeToCurrent}
              disabled={!assistantId}
            />
            <Label
              htmlFor="crons-scope"
              className="text-xs text-muted-foreground"
            >
              {scopeToCurrent && assistantId
                ? `Showing schedules for ${assistantNameById[assistantId] ?? "this agent"}`
                : "Showing schedules for ALL agents"}
            </Label>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
          <CronForm
            form={form}
            onChange={setForm}
            onSave={() => void handleSave()}
            onCancelEdit={resetForm}
            submitting={submitting}
            error={error}
            disabled={!assistantId}
          />

          <div className="flex min-h-0 flex-col gap-1 overflow-hidden">
            <p className="text-xs font-medium text-muted-foreground">
              {scopeToCurrent
                ? "Active schedules for this assistant"
                : "All active schedules in the workspace"}
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
                    assistantName={assistantNameById[c.assistant_id]}
                    showAssistantName={!scopeToCurrent}
                    isEditing={form.editingCronId === c.cron_id}
                    isHistoryOpen={expandedHistoryFor === c.cron_id}
                    onToggleHistory={() =>
                      setExpandedHistoryFor((prev) =>
                        prev === c.cron_id ? null : c.cron_id,
                      )
                    }
                    onEdit={() => startEditing(c)}
                    onDelete={() => void handleDelete(c.cron_id)}
                    client={client}
                    onCloseDialog={() => onOpenChange(false)}
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

function CronForm({
  form,
  onChange,
  onSave,
  onCancelEdit,
  submitting,
  error,
  disabled,
}: {
  form: CronFormState;
  onChange: (next: CronFormState) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  submitting: boolean;
  error: string | null;
  disabled: boolean;
}) {
  const editing = form.editingCronId !== null;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          {editing ? "Editing schedule" : "Create a new schedule"}
        </p>
        {editing && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancelEdit}
            className="h-7 px-2 text-xs text-muted-foreground"
          >
            <X className="mr-1 h-3 w-3" />
            Cancel
          </Button>
        )}
      </div>
      <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="cron-schedule" className="text-xs">
            Cron expression
          </Label>
          <Input
            id="cron-schedule"
            value={form.schedule}
            onChange={(e) => onChange({ ...form, schedule: e.target.value })}
            placeholder="0 9 * * *"
            className="font-mono text-xs"
            spellCheck={false}
          />
          <span className="text-[10px] text-muted-foreground">
            m h dom mon dow
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="cron-timezone" className="text-xs">
            Timezone
          </Label>
          <Select
            value={form.timezone}
            onValueChange={(v) => onChange({ ...form, timezone: v })}
          >
            <SelectTrigger id="cron-timezone" className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMMON_TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz} className="font-mono text-xs">
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[10px] text-muted-foreground">
            Schedule fires in this zone
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="cron-prompt" className="text-xs">
          Prompt sent at each fire
        </Label>
        <Textarea
          id="cron-prompt"
          value={form.prompt}
          onChange={(e) => onChange({ ...form, prompt: e.target.value })}
          placeholder="e.g. Summarize yesterday's news on AI infrastructure."
          className="min-h-[80px] resize-none text-sm"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          onClick={onSave}
          disabled={
            submitting ||
            disabled ||
            !form.schedule.trim() ||
            !form.prompt.trim()
          }
        >
          {editing ? (
            <>
              <Pencil className="mr-1 h-3 w-3" />
              {submitting ? "Saving…" : "Save changes"}
            </>
          ) : (
            <>
              <Plus className="mr-1 h-3 w-3" />
              {submitting ? "Creating…" : "Create"}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function CronRow({
  cron,
  assistantName,
  showAssistantName,
  isEditing,
  isHistoryOpen,
  onToggleHistory,
  onEdit,
  onDelete,
  client,
  onCloseDialog,
}: {
  cron: Cron;
  assistantName: string | undefined;
  showAssistantName: boolean;
  isEditing: boolean;
  isHistoryOpen: boolean;
  onToggleHistory: () => void;
  onEdit: () => void;
  onDelete: () => void;
  client: Client | null;
  onCloseDialog: () => void;
}) {
  const created = cron.created_at ? new Date(cron.created_at) : null;
  const tz = (cron as Cron & { timezone?: string }).timezone || "UTC";
  const next =
    (cron as Cron & { next_run_date?: string }).next_run_date || null;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-md border border-border bg-card",
        isEditing && "ring-1 ring-foreground/20",
      )}
    >
      <div className="flex min-w-0 items-center gap-3 px-3 py-2 text-xs">
        <button
          type="button"
          onClick={onToggleHistory}
          className="flex flex-shrink-0 items-center gap-1 rounded p-0.5 hover:bg-accent"
          title="Show triggered threads"
        >
          {isHistoryOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-baseline gap-2 truncate font-mono">
            {showAssistantName && (
              <span className="flex-shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {assistantName ?? "?"}
              </span>
            )}
            <span className="truncate">
              {cron.schedule} · {tz}
            </span>
          </span>
          <span className="truncate text-muted-foreground">
            {next ? `next ${new Date(next).toLocaleString()}` : "scheduled"}
            {created && ` · created ${created.toLocaleString()}`}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onEdit}
          title="Edit schedule"
          className="h-7 w-7 p-0"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          title="Delete schedule"
          className="h-7 w-7 p-0"
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
      {isHistoryOpen && (
        <CronHistory
          cronId={cron.cron_id}
          client={client}
          onPickThread={(threadId) => {
            const url = new URL(window.location.href);
            url.searchParams.set("threadId", threadId);
            window.history.pushState({}, "", url.toString());
            onCloseDialog();
            // Force re-evaluation of nuqs state in the app.
            window.dispatchEvent(new PopStateEvent("popstate"));
          }}
        />
      )}
    </div>
  );
}

function CronHistory({
  cronId,
  client,
  onPickThread,
}: {
  cronId: string;
  client: Client | null;
  onPickThread: (threadId: string) => void;
}) {
  const history = useSWR<Thread[]>(
    client ? ["cron-history", cronId] : null,
    async () => {
      if (!client) return [];
      // NOTE: `cron_id` is reserved on thread metadata (langgraph
      // silently strips it on write). The server-side
      // `CronThreadTaggingMiddleware` writes `fired_by_cron` instead;
      // mirror that here.
      const threads = await client.threads.search({
        limit: 20,
        metadata: { fired_by_cron: cronId },
        sortBy: "updated_at" as const,
        sortOrder: "desc" as const,
      });
      return threads as Thread[];
    },
  );

  return (
    <div className="border-t border-border bg-muted/20 px-3 py-2">
      <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        Triggered threads
      </p>
      {history.isLoading && (
        <p className="text-xs text-muted-foreground">Loading…</p>
      )}
      {history.error && (
        <p className="text-xs text-destructive">
          Failed: {String(history.error)}
        </p>
      )}
      {!history.isLoading &&
        !history.error &&
        (history.data?.length ?? 0) === 0 && (
          <p className="text-xs text-muted-foreground">
            No fires yet (or fires happened before cron-id tagging was
            available — open the thread from ThreadList instead).
          </p>
        )}
      <div className="flex flex-col gap-1">
        {history.data?.map((t) => (
          <button
            key={t.thread_id}
            type="button"
            onClick={() => onPickThread(t.thread_id)}
            className="flex min-w-0 items-center justify-between gap-3 rounded border border-border bg-background px-2 py-1 text-left text-xs hover:bg-accent"
          >
            <span className="min-w-0 truncate font-mono">
              {t.thread_id.slice(0, 8)}…
            </span>
            <span className="flex-shrink-0 text-muted-foreground">
              {new Date(t.updated_at).toLocaleString()}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

async function createCron(
  client: Client,
  {
    assistantId,
    schedule,
    prompt,
    timezone,
    tenantId,
  }: {
    assistantId: string;
    schedule: string;
    prompt: string;
    timezone: string;
    tenantId: string;
  },
): Promise<unknown> {
  // langgraph-sdk's typed `crons.create` doesn't surface `timezone` in
  // its TS schema, but the server accepts it. Send via the raw fetch
  // path on the client instead of going through the typed wrapper.
  const fetchRaw = (
    client as unknown as { fetch: (path: string, opts: { method: string; json: unknown }) => Promise<unknown> }
  ).fetch;
  return await fetchRaw.call(client, "/runs/crons", {
    method: "POST",
    json: {
      assistant_id: assistantId,
      schedule,
      timezone,
      input: { messages: [{ type: "human", content: prompt }] },
      config: { configurable: { tenant_id: tenantId } },
    },
  });
}
