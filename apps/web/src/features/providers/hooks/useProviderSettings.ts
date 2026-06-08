import { useState, useCallback } from "react";

export type RouterModeSetting = "off" | "heuristic" | "llm" | "hybrid";

export interface ProviderSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Controls topic/skill routing before generation. */
  routerMode: RouterModeSetting;
  /** Optional small model for routing; empty means reuse server/provider defaults. */
  routerModel: string;
  /** Minimum confidence for accepting an LLM router decision. */
  routerMinConfidence: number;
  /** Router-only timeout in seconds. */
  routerTimeoutS: number;
}

const STORAGE_KEY = "mv_provider_settings";

const DEFAULTS: ProviderSettings = {
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  routerMode: "hybrid",
  routerModel: "",
  routerMinConfidence: 0.72,
  routerTimeoutS: 12,
};

function normalizeRouterMode(value: unknown): RouterModeSetting {
  return value === "off" || value === "heuristic" || value === "llm" || value === "hybrid"
    ? value
    : DEFAULTS.routerMode;
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeSettings(value: unknown): ProviderSettings {
  const parsed = typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Partial<ProviderSettings>)
    : {};

  return {
    ...DEFAULTS,
    ...parsed,
    apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : DEFAULTS.apiKey,
    baseUrl: typeof parsed.baseUrl === "string" && parsed.baseUrl.trim()
      ? parsed.baseUrl
      : DEFAULTS.baseUrl,
    model: typeof parsed.model === "string" && parsed.model.trim()
      ? parsed.model
      : DEFAULTS.model,
    routerMode: normalizeRouterMode(parsed.routerMode),
    routerModel: typeof parsed.routerModel === "string" ? parsed.routerModel : DEFAULTS.routerModel,
    routerMinConfidence: normalizeNumber(
      parsed.routerMinConfidence,
      DEFAULTS.routerMinConfidence,
      0,
      1,
    ),
    routerTimeoutS: normalizeNumber(parsed.routerTimeoutS, DEFAULTS.routerTimeoutS, 1, 60),
  };
}

function load(): ProviderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULTS };
  }
}

function save(settings: ProviderSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
}

export function useProviderSettings() {
  const [settings, setSettings] = useState<ProviderSettings>(load);

  const update = useCallback((next: ProviderSettings) => {
    const normalized = normalizeSettings(next);
    save(normalized);
    setSettings(normalized);
  }, []);

  const isConfigured = settings.apiKey.trim().length > 0;

  return { settings, update, isConfigured };
}
