"use client";

import { useCallback, useMemo } from "react";
import { useQueryState } from "nuqs";

/**
 * Filesystem backend mode for new threads. Backed by URL query
 * (`?fsBackend=store`) so the choice is shareable and bookmarkable.
 *
 * Semantics:
 *   - `"state"` (default) — files go to checkpoint `state.files`,
 *     visible in the UI Files panel. Per-thread isolation.
 *   - `"store"` — files go to LangGraph Store KV, cross-thread
 *     persistent within the same workspace_id, NOT visible in UI.
 *
 * The value is forwarded to:
 *   1. Thread metadata (`filesystem_backend`) on creation
 *   2. `RunnableConfig.configurable.filesystem_backend` on every run
 *
 * The backend's `ConfigurableCompositeBackend` reads this at runtime
 * and dynamically selects StateBackend vs StoreBackend.
 */
export type FilesystemBackend = "state" | "store";

const DEFAULT_BACKEND: FilesystemBackend = "state";
const VALID_VALUES: ReadonlySet<string> = new Set(["state", "store"]);

export function useFilesystemBackend(): {
  backend: FilesystemBackend;
  setBackend: (next: FilesystemBackend) => Promise<void>;
  toggle: () => Promise<void>;
} {
  const [raw, setRaw] = useQueryState("fsBackend");

  const backend: FilesystemBackend =
    raw && VALID_VALUES.has(raw) ? (raw as FilesystemBackend) : DEFAULT_BACKEND;

  const setBackend = useCallback(
    async (next: FilesystemBackend) => {
      // Clear the URL param when switching back to default so the
      // common case doesn't leave a stale `?fsBackend=state` around.
      await setRaw(next === DEFAULT_BACKEND ? null : next);
    },
    [setRaw],
  );

  const toggle = useCallback(async () => {
    await setBackend(backend === "state" ? "store" : "state");
  }, [backend, setBackend]);

  return useMemo(
    () => ({ backend, setBackend, toggle }),
    [backend, setBackend, toggle],
  );
}
