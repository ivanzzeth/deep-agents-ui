"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, ChevronDown, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DEFAULT_TENANT, useTenant } from "@/app/hooks/useTenant";
import { cn } from "@/lib/utils";

/**
 * Header button for switching the active tenant id. Opens a dialog that
 * lists previously-used tenants (from localStorage) and an inline input
 * for creating a new one.
 *
 * Switching:
 *   - replaces the URL `tenantId` query param
 *   - calls `onSwitch` so the page can clear the current threadId
 *     (threads are bound to whichever tenant created them)
 *
 * Free-text input — this is a multi-tenant exploration tool, not a
 * managed-user system, so we don't validate or enumerate tenants.
 */
export function TenantPicker({ onSwitch }: { onSwitch?: (id: string) => void }) {
  const { tenantId, setTenantId, recents } = useTenant();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const choose = useCallback(
    async (next: string) => {
      const cleaned = next.trim() || DEFAULT_TENANT;
      if (cleaned === tenantId) {
        setOpen(false);
        return;
      }
      await setTenantId(cleaned);
      onSwitch?.(cleaned);
      setOpen(false);
      setDraft("");
    },
    [tenantId, setTenantId, onSwitch]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const cleaned = draft.trim();
      if (!cleaned) return;
      await choose(cleaned);
    },
    [draft, choose]
  );

  const items = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const r of [DEFAULT_TENANT, tenantId, ...recents]) {
      if (!seen.has(r)) {
        seen.add(r);
        ordered.push(r);
      }
    }
    return ordered;
  }, [tenantId, recents]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setOpen(true)}
        title={`Tenant: ${tenantId}`}
      >
        <UserCircle2 className="h-4 w-4" />
        <span className="max-w-[140px] truncate font-mono text-xs">
          {tenantId}
        </span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCircle2 className="h-4 w-4" />
              Switch tenant
            </DialogTitle>
            <DialogDescription>
              Each tenant id is an isolated long-term memory namespace.
              Switching clears the current thread; existing threads remain
              bound to the tenant that created them.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground">
              Recent
            </p>
            <div className="flex flex-col gap-1">
              {items.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => void choose(id)}
                  className={cn(
                    "flex items-center justify-between rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-accent",
                    id === tenantId && "bg-accent"
                  )}
                >
                  <span className="truncate font-mono">{id}</span>
                  {id === tenantId && (
                    <Check className="h-4 w-4 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-2"
          >
            <label
              htmlFor="tenant-new"
              className="text-xs font-medium text-muted-foreground"
            >
              New tenant id
            </label>
            <div className="flex gap-2">
              <Input
                id="tenant-new"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="e.g. ivan / team-a / persona-1"
                className="font-mono text-sm"
                autoComplete="off"
              />
              <Button
                type="submit"
                disabled={!draft.trim() || draft.trim() === tenantId}
              >
                Switch
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
