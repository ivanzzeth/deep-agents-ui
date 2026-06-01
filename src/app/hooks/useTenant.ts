"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryState } from "nuqs";

/**
 * Tenant ID state. Backed by URL query (`?tenantId=ivan`) and a local
 * recents list so previously-used tenants can be picked from a dropdown.
 *
 * Semantics:
 *   - The tenant id is just a free-text string (e.g. "ivan", "team-a").
 *   - The backend uses it as the `("tenant", <id>, "memory")` Store
 *     namespace, so each id gets a fully isolated long-term memory.
 *   - Switching tenants is a session-level action; existing threads stay
 *     bound to whichever tenant created them (filtered out of the list
 *     until you switch back).
 *   - Empty / unset → "default" tenant.
 */
const DEFAULT_TENANT = "default";
const RECENTS_KEY = "deep-agents-ui:tenant-recents";
const RECENTS_LIMIT = 8;

export function useTenant(): {
  tenantId: string;
  setTenantId: (next: string) => Promise<void>;
  recents: string[];
} {
  const [raw, setRaw] = useQueryState("tenantId");
  const tenantId = (raw ?? "").trim() || DEFAULT_TENANT;
  const [recents, setRecents] = useState<string[]>([]);

  // Hydrate recents from localStorage on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(RECENTS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRecents(parsed.filter((s): s is string => typeof s === "string"));
        }
      }
    } catch {
      // Corrupt storage — just start fresh.
    }
  }, []);

  // Whenever the current tenant changes, push it to the front of recents.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setRecents((prev) => {
      const without = prev.filter((t) => t !== tenantId);
      const next = [tenantId, ...without].slice(0, RECENTS_LIMIT);
      try {
        window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      } catch {
        // Quota / private-mode — ignore; URL is the source of truth anyway.
      }
      return next;
    });
  }, [tenantId]);

  const setTenantId = useCallback(
    async (next: string) => {
      const cleaned = next.trim();
      // Writing `null` clears the URL param so the default-tenant case
      // doesn't leave a stale `?tenantId=` lying around.
      await setRaw(cleaned && cleaned !== DEFAULT_TENANT ? cleaned : null);
    },
    [setRaw]
  );

  return useMemo(
    () => ({ tenantId, setTenantId, recents }),
    [tenantId, setTenantId, recents]
  );
}

export { DEFAULT_TENANT };
