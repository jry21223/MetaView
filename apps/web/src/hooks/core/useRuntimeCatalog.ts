import { useState, useEffect } from "react";
import { getRuntimeCatalog } from "../../api/client";
import type { RuntimeCatalog, ModelProvider } from "../../types";

export const fallbackRuntimeCatalog: RuntimeCatalog = {
  default_provider: "openai",
  default_router_provider: "openai",
  default_generation_provider: "openai",
  sandbox_engine: "hybrid-runtime-dry-run",
  providers: [
    {
      name: "openai",
      label: "OpenAI Compatible",
      kind: "openai_compatible",
      model: "not-configured",
      stage_models: {},
      description: "OpenAI 兼容 Provider，需配置环境变量后启用。",
      configured: false,
      is_custom: false,
      supports_vision: false,
      base_url: null,
      api_key_configured: false,
    },
  ],
  skills: [],
  sandbox_modes: ["dry_run", "off"],
  settings: {
    mock_provider_enabled: false,
    tts: {
      enabled: true,
      backend: "openai_compatible",
      model: "mimotts-v2",
      base_url: null,
      api_key_configured: false,
      voice: "default",
      rate_wpm: 150,
      speed: 0.88,
      max_chars: 1500,
      timeout_s: 120,
    },
  },
};

export function activeProviderSupportsVision(catalog: RuntimeCatalog, providerName: ModelProvider): boolean {
  return catalog.providers.find((candidate) => candidate.name === providerName)?.supports_vision ?? false;
}

export function resolveConfiguredProvider(
  catalog: RuntimeCatalog,
  requestedProvider: ModelProvider | null | undefined,
  fallbackProvider: ModelProvider,
): ModelProvider {
  const availableProviders = catalog.providers;
  const configuredProviders = catalog.providers.filter((candidate) => candidate.configured);
  if (configuredProviders.some((candidate) => candidate.name === requestedProvider)) {
    return requestedProvider as ModelProvider;
  }
  if (configuredProviders.some((candidate) => candidate.name === fallbackProvider)) {
    return fallbackProvider;
  }
  if (configuredProviders[0]?.name) {
    return configuredProviders[0].name;
  }
  if (availableProviders.some((candidate) => candidate.name === requestedProvider)) {
    return requestedProvider as ModelProvider;
  }
  if (availableProviders.some((candidate) => candidate.name === fallbackProvider)) {
    return fallbackProvider;
  }
  return availableProviders[0]?.name ?? fallbackProvider;
}

export function useRuntimeCatalog() {
  const [runtimeCatalog, setRuntimeCatalog] = useState<RuntimeCatalog>(fallbackRuntimeCatalog);
  const [routerProvider, setRouterProvider] = useState<ModelProvider>(
    fallbackRuntimeCatalog.default_router_provider,
  );
  const [generationProvider, setGenerationProvider] = useState<ModelProvider>(
    fallbackRuntimeCatalog.default_generation_provider,
  );

  async function refreshRuntimeCatalog(): Promise<RuntimeCatalog> {
    try {
      const catalog = await getRuntimeCatalog();
      setRuntimeCatalog(catalog);
      setRouterProvider((current) =>
        resolveConfiguredProvider(catalog, current, catalog.default_router_provider),
      );
      setGenerationProvider((current) =>
        resolveConfiguredProvider(catalog, current, catalog.default_generation_provider),
      );
      return catalog;
    } catch {
      setRuntimeCatalog(fallbackRuntimeCatalog);
      return fallbackRuntimeCatalog;
    }
  }

  useEffect(() => {
    let active = true;

    void getRuntimeCatalog()
      .then((catalog) => {
        if (!active) {
          return;
        }

        setRuntimeCatalog(catalog);
        setRouterProvider(
          resolveConfiguredProvider(
            catalog,
            catalog.default_router_provider,
            catalog.default_router_provider,
          ),
        );
        setGenerationProvider(
          resolveConfiguredProvider(
            catalog,
            catalog.default_generation_provider,
            catalog.default_generation_provider,
          ),
        );
      })
      .catch(() => {
        if (active) {
          setRuntimeCatalog(fallbackRuntimeCatalog);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return {
    runtimeCatalog,
    setRuntimeCatalog,
    routerProvider,
    setRouterProvider,
    generationProvider,
    setGenerationProvider,
    refreshRuntimeCatalog,
  };
}
