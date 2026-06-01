"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { format } from "date-fns";
import {
  Check,
  Copy,
  Loader2,
  MessageSquare,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useQueryState } from "nuqs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getConfig } from "@/lib/config";
import type { ThreadItem } from "@/app/hooks/useThreads";
import {
  copyThread as copyThreadApi,
  deleteThread as deleteThreadApi,
  renameThread as renameThreadApi,
  useThreads,
} from "@/app/hooks/useThreads";

type StatusFilter = "all" | "idle" | "busy" | "interrupted" | "error";

const GROUP_LABELS = {
  interrupted: "Requiring Attention",
  today: "Today",
  yesterday: "Yesterday",
  week: "This Week",
  older: "Older",
} as const;

const STATUS_COLORS: Record<ThreadItem["status"], string> = {
  idle: "bg-green-500",
  busy: "bg-blue-500",
  interrupted: "bg-orange-500",
  error: "bg-red-600",
};

function getThreadColor(status: ThreadItem["status"]): string {
  return STATUS_COLORS[status] ?? "bg-gray-400";
}

function formatTime(date: Date, now = new Date()): string {
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return format(date, "HH:mm");
  if (days === 1) return "Yesterday";
  if (days < 7) return format(date, "EEEE");
  return format(date, "MM/dd");
}

function StatusFilterItem({
  status,
  label,
  badge,
}: {
  status: ThreadItem["status"];
  label: string;
  badge?: number;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={cn(
          "inline-block size-2 rounded-full",
          getThreadColor(status)
        )}
      />
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-1 inline-flex items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-bold leading-none text-white">
          {badge}
        </span>
      )}
    </span>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <p className="text-sm text-red-600">Failed to load threads</p>
      <p className="mt-1 text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-16 w-full"
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <MessageSquare className="mb-2 h-12 w-12 text-gray-300" />
      <p className="text-sm text-muted-foreground">No threads found</p>
    </div>
  );
}

interface ThreadListProps {
  /** Called with the thread id and (optionally) its associated assistant id,
   *  so the caller can simultaneously switch threadId + assistantId in the URL. */
  onThreadSelect: (id: string, assistantId?: string) => void;
  onMutateReady?: (mutate: () => void) => void;
  onClose?: () => void;
  onInterruptCountChange?: (count: number) => void;
}

export function ThreadList({
  onThreadSelect,
  onMutateReady,
  onClose,
  onInterruptCountChange,
}: ThreadListProps) {
  const [currentThreadId, setCurrentThreadId] = useQueryState("threadId");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Inline-rename state: which thread is in edit mode, and the draft text.
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  // Pending-delete confirmation target (null = dialog closed).
  const [deletingThread, setDeletingThread] = useState<ThreadItem | null>(null);

  const threads = useThreads({
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 20,
  });

  const startRename = useCallback((thread: ThreadItem) => {
    setEditingThreadId(thread.id);
    setEditingTitle(thread.title);
    requestAnimationFrame(() => renameInputRef.current?.select());
  }, []);

  const cancelRename = useCallback(() => {
    setEditingThreadId(null);
    setEditingTitle("");
  }, []);

  const saveRename = useCallback(async () => {
    const id = editingThreadId;
    const title = editingTitle.trim();
    if (!id || !title) {
      cancelRename();
      return;
    }
    const config = getConfig();
    if (!config) return;
    try {
      await renameThreadApi(
        config.deploymentUrl,
        id,
        title,
        config.langsmithApiKey
      );
      await threads.mutate();
    } finally {
      cancelRename();
    }
  }, [editingThreadId, editingTitle, threads, cancelRename]);

  const forkThread = useCallback(
    async (thread: ThreadItem) => {
      const config = getConfig();
      if (!config) return;
      const newId = await copyThreadApi(
        config.deploymentUrl,
        thread.id,
        config.langsmithApiKey
      );
      await threads.mutate();
      // Fork inherits the source thread's assistant — pass it along so the
      // URL flips both threadId and assistantId in a single navigation.
      onThreadSelect(newId, thread.assistantId);
    },
    [threads, onThreadSelect]
  );

  const confirmDelete = useCallback(async () => {
    if (!deletingThread) return;
    const config = getConfig();
    if (!config) return;
    const wasCurrent = deletingThread.id === currentThreadId;
    try {
      await deleteThreadApi(
        config.deploymentUrl,
        deletingThread.id,
        config.langsmithApiKey
      );
      await threads.mutate();
      if (wasCurrent) {
        setCurrentThreadId(null);
      }
    } finally {
      setDeletingThread(null);
    }
  }, [deletingThread, currentThreadId, threads, setCurrentThreadId]);

  const flattened = useMemo(() => {
    return threads.data?.flat() ?? [];
  }, [threads.data]);

  const isLoadingMore =
    threads.size > 0 && threads.data?.[threads.size - 1] == null;
  const isEmpty = threads.data?.at(0)?.length === 0;
  const isReachingEnd = isEmpty || (threads.data?.at(-1)?.length ?? 0) < 20;

  // Group threads by time and status
  const grouped = useMemo(() => {
    const now = new Date();
    const groups: Record<keyof typeof GROUP_LABELS, ThreadItem[]> = {
      interrupted: [],
      today: [],
      yesterday: [],
      week: [],
      older: [],
    };

    flattened.forEach((thread) => {
      if (thread.status === "interrupted") {
        groups.interrupted.push(thread);
        return;
      }

      const diff = now.getTime() - thread.updatedAt.getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));

      if (days === 0) {
        groups.today.push(thread);
      } else if (days === 1) {
        groups.yesterday.push(thread);
      } else if (days < 7) {
        groups.week.push(thread);
      } else {
        groups.older.push(thread);
      }
    });

    return groups;
  }, [flattened]);

  const interruptedCount = useMemo(() => {
    return flattened.filter((t) => t.status === "interrupted").length;
  }, [flattened]);

  // Expose thread list revalidation to parent component
  // Use refs to create a stable callback that always calls the latest mutate function
  const onMutateReadyRef = useRef(onMutateReady);
  const mutateRef = useRef(threads.mutate);

  useEffect(() => {
    onMutateReadyRef.current = onMutateReady;
  }, [onMutateReady]);

  useEffect(() => {
    mutateRef.current = threads.mutate;
  }, [threads.mutate]);

  const mutateFn = useCallback(() => {
    mutateRef.current();
  }, []);

  useEffect(() => {
    onMutateReadyRef.current?.(mutateFn);
    // Only run once on mount to avoid infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Notify parent of interrupt count changes
  useEffect(() => {
    onInterruptCountChange?.(interruptedCount);
  }, [interruptedCount, onInterruptCountChange]);

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Header with title, filter, and close button */}
      <div className="grid flex-shrink-0 grid-cols-[1fr_auto] items-center gap-3 border-b border-border p-4">
        <h2 className="text-lg font-semibold tracking-tight">Threads</h2>
        <div className="flex items-center gap-2">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          >
            <SelectTrigger className="w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">All statuses</SelectItem>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Active</SelectLabel>
                <SelectItem value="idle">
                  <StatusFilterItem
                    status="idle"
                    label="Idle"
                  />
                </SelectItem>
                <SelectItem value="busy">
                  <StatusFilterItem
                    status="busy"
                    label="Busy"
                  />
                </SelectItem>
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Attention</SelectLabel>
                <SelectItem value="interrupted">
                  <StatusFilterItem
                    status="interrupted"
                    label="Interrupted"
                    badge={interruptedCount}
                  />
                </SelectItem>
                <SelectItem value="error">
                  <StatusFilterItem
                    status="error"
                    label="Error"
                  />
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
              aria-label="Close threads sidebar"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="h-0 flex-1">
        {threads.error && <ErrorState message={threads.error.message} />}

        {!threads.error && !threads.data && threads.isLoading && (
          <LoadingState />
        )}

        {!threads.error && !threads.isLoading && isEmpty && <EmptyState />}

        {!threads.error && !isEmpty && (
          <div className="box-border w-full max-w-full overflow-hidden p-2">
            {(
              Object.keys(GROUP_LABELS) as Array<keyof typeof GROUP_LABELS>
            ).map((group) => {
              const groupThreads = grouped[group];
              if (groupThreads.length === 0) return null;

              return (
                <div
                  key={group}
                  className="mb-4"
                >
                  <h4 className="m-0 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {GROUP_LABELS[group]}
                  </h4>
                  <div className="flex flex-col gap-1">
                    {groupThreads.map((thread) => {
                      const isEditing = editingThreadId === thread.id;
                      const isActive = currentThreadId === thread.id;
                      return (
                        <div
                          key={thread.id}
                          role="button"
                          tabIndex={isEditing ? -1 : 0}
                          aria-current={isActive}
                          onClick={() => {
                            if (isEditing) return;
                            onThreadSelect(thread.id, thread.assistantId);
                          }}
                          onKeyDown={(e) => {
                            if (isEditing) return;
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onThreadSelect(thread.id, thread.assistantId);
                            }
                          }}
                          className={cn(
                            "group/row relative grid w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors duration-200",
                            "hover:bg-accent",
                            isActive
                              ? "border border-primary bg-accent hover:bg-accent"
                              : "border border-transparent bg-transparent"
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            {/* Title + Timestamp Row */}
                            <div className="mb-1 flex items-center justify-between">
                              {isEditing ? (
                                <div
                                  className="flex flex-1 items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Input
                                    ref={renameInputRef}
                                    value={editingTitle}
                                    onChange={(e) =>
                                      setEditingTitle(e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        void saveRename();
                                      } else if (e.key === "Escape") {
                                        e.preventDefault();
                                        cancelRename();
                                      }
                                    }}
                                    className="h-7 text-sm"
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    aria-label="Save title"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void saveRename();
                                    }}
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    aria-label="Cancel rename"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      cancelRename();
                                    }}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <h3 className="truncate text-sm font-semibold">
                                    {thread.title}
                                  </h3>
                                  <span className="ml-2 flex-shrink-0 text-xs text-muted-foreground">
                                    {formatTime(thread.updatedAt)}
                                  </span>
                                </>
                              )}
                            </div>
                            {/* Description + Status Row */}
                            <div className="flex items-center justify-between">
                              <p className="flex-1 truncate text-sm text-muted-foreground">
                                {thread.description}
                              </p>
                              <div className="ml-2 flex-shrink-0">
                                <div
                                  className={cn(
                                    "h-2 w-2 rounded-full",
                                    getThreadColor(thread.status)
                                  )}
                                />
                              </div>
                            </div>
                          </div>
                          {!isEditing && (
                            <div
                              className="absolute right-2 top-2 hidden gap-1 group-focus-within/row:flex group-hover/row:flex"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 bg-background/80 backdrop-blur-sm"
                                aria-label="Rename thread"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startRename(thread);
                                }}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 bg-background/80 backdrop-blur-sm"
                                aria-label="Fork thread"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void forkThread(thread);
                                }}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 bg-background/80 text-destructive backdrop-blur-sm hover:text-destructive"
                                aria-label="Delete thread"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingThread(thread);
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {!isReachingEnd && (
              <div className="flex justify-center py-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => threads.setSize(threads.size + 1)}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Load More"
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      <Dialog
        open={!!deletingThread}
        onOpenChange={(open) => {
          if (!open) setDeletingThread(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete thread?</DialogTitle>
            <DialogDescription>
              This permanently removes &quot;{deletingThread?.title}&quot; and
              all of its messages. This action can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingThread(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
