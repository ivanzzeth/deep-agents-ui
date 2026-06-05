export interface StandaloneConfig {
  deploymentUrl: string;
  assistantId: string;
  langsmithApiKey?: string;
}

const CONFIG_KEY = "deep-agent-config";

/** Read the persisted config from localStorage. Returns null if absent or malformed. */
export function getStoredConfig(): StandaloneConfig | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(CONFIG_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

/**
 * Build a config from NEXT_PUBLIC_* env vars.
 *
 * Only NEXT_PUBLIC_API_URL (deployment URL) is required. When
 * NEXT_PUBLIC_ASSISTANT_ID is omitted, an empty assistantId is returned and
 * the page-level fetcher will auto-discover the first available assistant
 * from the deployment.
 */
export function getEnvConfig(): StandaloneConfig | null {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  const envAssistantId = process.env.NEXT_PUBLIC_ASSISTANT_ID;
  if (envUrl) {
    return { deploymentUrl: envUrl, assistantId: envAssistantId ?? "" };
  }
  return null;
}

/**
 * Resolve the active config with precedence: localStorage > env.
 *
 * This is the single source of truth used both by the page-level mount
 * effect and by hooks like useThreads. Before this unified resolution
 * existed, useThreads only checked localStorage — clearing it left the
 * thread sidebar empty even when env defaults were perfectly serviceable.
 */
export function getConfig(): StandaloneConfig | null {
  return getStoredConfig() ?? getEnvConfig();
}

export function saveConfig(config: StandaloneConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}
