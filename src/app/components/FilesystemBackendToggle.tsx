"use client";

import { HardDrive, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useFilesystemBackend,
  type FilesystemBackend,
} from "@/app/hooks/useFilesystemBackend";

/**
 * Compact toggle button for switching between `state` and `store`
 * filesystem backends. Displayed in the header next to the tenant picker.
 *
 * - **State** (default): files go to checkpoint `state.files`, visible
 *   in the UI Files panel. Per-thread isolation.
 * - **Store**: files go to LangGraph Store KV, cross-thread persistent,
 *   NOT visible in the UI Files panel.
 *
 * Switching the backend does NOT affect existing threads — they keep
 * whichever backend was active when they were created. Only new threads
 * (created after the switch) pick up the new value.
 */
export function FilesystemBackendToggle({
  onSwitch,
}: {
  onSwitch?: (backend: FilesystemBackend) => void;
}) {
  const { backend, toggle } = useFilesystemBackend();

  const isStore = backend === "store";

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2"
      onClick={() => {
        void toggle().then(() => onSwitch?.(backend === "state" ? "store" : "state"));
      }}
      title={
        isStore
          ? "Backend: Store (cross-thread, UI invisible) — click to switch to State"
          : "Backend: State (per-thread, UI visible) — click to switch to Store"
      }
    >
      {isStore ? (
        <HardDrive className="h-4 w-4 text-amber-500" />
      ) : (
        <Layers className="h-4 w-4 text-emerald-500" />
      )}
      <span className="text-xs font-medium">
        {isStore ? "Store" : "State"}
      </span>
    </Button>
  );
}
