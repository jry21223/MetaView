import { useState, useCallback } from "react";

export interface ProviderSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const STORAGE_KEY = "mv_provider_settings";

const DEFAULTS: ProviderSettings = {
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
};

function load(): ProviderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(settings: ProviderSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function useProviderSettings() {
  const [settings, setSettings] = useState<ProviderSettings>(load);

  const update = useCallback((next: ProviderSettings) => {
    save(next);
    setSettings(next);
  }, []);

  const isConfigured = settings.apiKey.trim().length > 0;

  return { settings, update, isConfigured };
}
