"use client";

import { useCallback, useEffect, useState } from "react";
import { useStream } from "@langchain/langgraph-sdk/react";
import {
  type Message,
  type Assistant,
  type Checkpoint,
} from "@langchain/langgraph-sdk";
import { v4 as uuidv4 } from "uuid";
import type { UseStreamThread } from "@langchain/langgraph-sdk/react";
import type { TodoItem } from "@/app/types/types";
import {
  type RichMessage,
  type RichMessageContent,
  type SendInput,
  fromSdkMessages,
  toSdkMessages,
} from "@/app/types/chat";
import { useClient } from "@/providers/ClientProvider";
import { useQueryState } from "nuqs";
import { useTenant } from "@/app/hooks/useTenant";

export type StateType = {
  messages: Message[];
  todos: TodoItem[];
  files: Record<string, string>;
  email?: {
    id?: string;
    subject?: string;
    page_content?: string;
  };
  ui?: any;
};

function isHttpStatusError(err: unknown): err is Error & { status: number } {
  return (
    err instanceof Error &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  );
}

export function useChat({
  activeAssistant,
  onHistoryRevalidate,
  thread,
}: {
  activeAssistant: Assistant | null;
  onHistoryRevalidate?: () => void;
  thread?: UseStreamThread<StateType>;
}) {
  const [threadId, setThreadId] = useQueryState("threadId");
  const client = useClient();
  const { tenantId } = useTenant();

  // Tag freshly-created threads with the current tenant. Without this,
  // ThreadList can't filter by tenant — langgraph dev auto-creates the
  // thread on first submit and only the server-side run config sees the
  // tenant id. `workspace_id` mirrors `tenant_id` so backend @tool helpers
  // that read either key (Task #17) resolve to the same isolated namespace.
  const tagThreadWithTenant = useCallback(
    async (newThreadId: string) => {
      try {
        await client.threads.update(newThreadId, {
          metadata: { tenant_id: tenantId, workspace_id: tenantId },
        });
      } catch (err) {
        console.warn(
          "[useChat] failed to tag thread with tenant",
          newThreadId,
          tenantId,
          err
        );
      }
    },
    [client, tenantId]
  );

  // A thread that langgraph dev no longer knows about (server restarted,
  // pickle wiped, thread deleted by another tab) shows up here as a 404.
  // Clear the URL so the next render starts a fresh conversation instead
  // of looping retries against a thread that won't come back.
  const handleStreamError = useCallback(
    (err: unknown) => {
      if (
        isHttpStatusError(err) &&
        err.status === 404 &&
        /thread/i.test(err.message)
      ) {
        console.warn("[useChat] thread no longer exists; clearing URL:", err.message);
        void setThreadId(null);
      }
      onHistoryRevalidate?.();
    },
    [setThreadId, onHistoryRevalidate],
  );

  const stream = useStream<StateType>({
    assistantId: activeAssistant?.assistant_id || "",
    client: client ?? undefined,
    reconnectOnMount: true,
    threadId: threadId ?? null,
    onThreadId: setThreadId,
    defaultHeaders: { "x-auth-scheme": "langsmith" },
    // Enable fetching state history when switching to existing threads
    fetchStateHistory: true,
    // Revalidate thread list when stream finishes, errors, or creates new thread
    onFinish: onHistoryRevalidate,
    onError: handleStreamError,
    onCreated: (meta) => {
      if (meta?.thread_id) {
        void tagThreadWithTenant(meta.thread_id);
      }
      onHistoryRevalidate?.();
    },
    experimental_thread: thread,
  });

  // Belt-and-suspenders: if the SDK exposes a 404-on-thread error via
  // `stream.error` without firing `onError` (e.g. when initial state
  // fetch retries exhaust), clear the URL the same way.
  useEffect(() => {
    const err = stream.error;
    if (
      err &&
      isHttpStatusError(err) &&
      err.status === 404 &&
      /thread/i.test(err.message)
    ) {
      console.warn("[useChat] stream.error 404 on thread; clearing URL:", err.message);
      void setThreadId(null);
    }
  }, [stream.error, setThreadId]);

  // Every run carries the active tenant id in `configurable` so the
  // backend MemoryRecallMiddleware + memory_save/recall tools can scope
  // long-term memory to ("tenant", tenantId, "memory"). Recursion limit
  // is folded in here too so callers never forget it.
  //
  // `workspace_id` is published alongside `tenant_id` so backend @tool
  // implementations that read the workspace key (Task #17 — tenant
  // file system / sandbox tools) resolve to the same isolated namespace
  // without relying on a separate handshake. Both default to "default"
  // via useTenant() when the user hasn't picked a tenant yet.
  const buildConfig = useCallback(
    (extra?: Record<string, unknown>) => {
      const base = activeAssistant?.config ?? {};
      const baseConfigurable =
        (base as { configurable?: Record<string, unknown> }).configurable ?? {};
      return {
        ...base,
        recursion_limit: 100,
        ...extra,
        configurable: {
          ...baseConfigurable,
          tenant_id: tenantId,
          workspace_id: tenantId,
          ...((extra as { configurable?: Record<string, unknown> })?.configurable ?? {}),
        },
      };
    },
    [activeAssistant?.config, tenantId]
  );

  const sendMessage = useCallback(
    (input: SendInput) => {
      const content: RichMessageContent = input.attachments?.length
        ? [{ type: "text", text: input.text }, ...input.attachments]
        : input.text;
      const newMessage: RichMessage = { id: uuidv4(), type: "human", content };
      const sdkPayload = toSdkMessages([newMessage]);
      stream.submit(
        { messages: sdkPayload },
        {
          optimisticValues: (prev) => ({
            messages: [...(prev.messages ?? []), ...sdkPayload],
          }),
          config: buildConfig(),
        }
      );
      // Update thread list immediately when sending a message
      onHistoryRevalidate?.();
    },
    [stream, buildConfig, onHistoryRevalidate]
  );

  const runSingleStep = useCallback(
    (
      messages: Message[],
      checkpoint?: Checkpoint,
      isRerunningSubagent?: boolean,
      optimisticMessages?: Message[]
    ) => {
      if (checkpoint) {
        stream.submit(undefined, {
          ...(optimisticMessages
            ? { optimisticValues: { messages: optimisticMessages } }
            : {}),
          config: buildConfig(),
          checkpoint: checkpoint,
          ...(isRerunningSubagent
            ? { interruptAfter: ["tools"] }
            : { interruptBefore: ["tools"] }),
        });
      } else {
        stream.submit(
          { messages },
          { config: buildConfig(), interruptBefore: ["tools"] }
        );
      }
    },
    [stream, buildConfig]
  );

  const setFiles = useCallback(
    async (files: Record<string, string>) => {
      if (!threadId) return;
      // TODO: missing a way how to revalidate the internal state
      // I think we do want to have the ability to externally manage the state
      await client.threads.updateState(threadId, { values: { files } });
    },
    [client, threadId]
  );

  const continueStream = useCallback(
    (hasTaskToolCall?: boolean) => {
      stream.submit(undefined, {
        config: buildConfig(),
        ...(hasTaskToolCall
          ? { interruptAfter: ["tools"] }
          : { interruptBefore: ["tools"] }),
      });
      // Update thread list when continuing stream
      onHistoryRevalidate?.();
    },
    [stream, buildConfig, onHistoryRevalidate]
  );

  const markCurrentThreadAsResolved = useCallback(() => {
    stream.submit(null, {
      command: { goto: "__end__", update: null },
      // Carry tenant_id forward so any cleanup hook the agent runs can
      // still see which tenant's namespace it's operating against.
      config: buildConfig(),
    });
    // Update thread list when marking thread as resolved
    onHistoryRevalidate?.();
  }, [stream, buildConfig, onHistoryRevalidate]);

  const resumeInterrupt = useCallback(
    (value: any) => {
      // CRITICAL: resume after HITL approval is a new submit, and
      // langgraph treats its config as authoritative. Forgetting to
      // pass tenant_id here was causing the resumed memory_save call
      // to land in the "default" namespace even when the user was
      // logged in as a specific tenant.
      stream.submit(null, {
        command: { resume: value },
        config: buildConfig(),
      });
      // Update thread list when resuming from interrupt
      onHistoryRevalidate?.();
    },
    [stream, buildConfig, onHistoryRevalidate]
  );

  const stopStream = useCallback(() => {
    stream.stop();
  }, [stream]);

  // Fallback: when LangGraph uses incremental checkpoints, the
  // /threads/{id}/state and /history endpoints can return
  // `messages: null` if the latest step didn't touch the messages
  // channel. The SDK surfaces null as an empty array, so the chat
  // pane renders blank even though the thread has a full transcript.
  // GET /threads/{threadId} (Oscar's fix) always returns the
  // materialized state, so fall back to it whenever stream.messages
  // is empty for an existing thread that has finished loading.
  const [fallbackState, setFallbackState] = useState<StateType | null>(null);

  useEffect(() => {
    // Reset fallback whenever the active thread changes so we don't
    // leak the previous thread's transcript into a new conversation.
    setFallbackState(null);
  }, [threadId]);

  useEffect(() => {
    if (!threadId) return;
    if (stream.isThreadLoading) return;
    if (stream.isLoading) return;
    // Always try to fetch the complete state from GET /threads/{id}
    // because stream.messages may be incomplete (incremental checkpoints).
    // This ensures we get the full conversation history.

    let cancelled = false;
    (async () => {
      try {
        const thread = await client.threads.get<StateType>(threadId);
        if (cancelled) return;
        const values = thread?.values;
        if (values && Array.isArray(values.messages) && values.messages.length > 0) {
          setFallbackState(values);
        }
      } catch (err) {
        if (cancelled) return;
        // 404 is handled elsewhere (clears the URL); only log other errors.
        if (!(isHttpStatusError(err) && err.status === 404)) {
          console.warn(
            "[useChat] failed to fetch materialized thread state for fallback",
            threadId,
            err,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, threadId, stream.isThreadLoading, stream.isLoading]);

  // Priority order for messages:
  // 1. fallbackState.messages (from GET /threads/{id}) — always complete
  // 2. stream.messages — may be incomplete (only latest checkpoint)
  //
  // LangGraph's incremental checkpoints mean /threads/{id}/state and
  // /history can return partial messages if the latest step didn't touch
  // the messages channel. GET /threads/{id} always returns materialized
  // state, so prefer it when available.
  const streamMessages = stream.messages ?? [];
  const effectiveMessages =
    fallbackState?.messages ?? streamMessages;
  const effectiveTodos =
    stream.values.todos ?? fallbackState?.todos ?? [];
  const effectiveFiles =
    stream.values.files ?? fallbackState?.files ?? {};
  const effectiveEmail = stream.values.email ?? fallbackState?.email;
  const effectiveUi = stream.values.ui ?? fallbackState?.ui;

  return {
    stream,
    todos: effectiveTodos,
    files: effectiveFiles,
    email: effectiveEmail,
    ui: effectiveUi,
    setFiles,
    messages: fromSdkMessages(effectiveMessages),
    isLoading: stream.isLoading,
    isThreadLoading: stream.isThreadLoading,
    interrupt: stream.interrupt,
    getMessagesMetadata: stream.getMessagesMetadata,
    sendMessage,
    runSingleStep,
    continueStream,
    stopStream,
    markCurrentThreadAsResolved,
    resumeInterrupt,
  };
}
