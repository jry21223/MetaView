export type ModelProvider = string;
export type ProviderKind = "mock" | "openai_compatible";
export type ProviderStage = "router" | "planning" | "coding" | "critic" | "test";
export type TTSBackend = "auto" | "system" | "openai_compatible";

export interface ProviderDescriptor {
  name: ModelProvider;
  label: string;
  kind: ProviderKind;
  model: string;
  stage_models: Partial<Record<ProviderStage, string>>;
  description: string;
  configured: boolean;
  is_custom: boolean;
  supports_vision: boolean;
  base_url?: string | null;
  temperature?: number | null;
  api_key_configured: boolean;
}

export interface SkillDescriptor {
  id: string;
  domain: string;
  label: string;
  description: string;
  version: string;
  triggers: string[];
  dependencies: string[];
  supports_image_input: boolean;
  execution_notes: string[];
}

export interface TTSSettings {
  enabled: boolean;
  backend: TTSBackend;
  model: string;
  base_url?: string | null;
  api_key_configured: boolean;
  voice: string;
  rate_wpm: number;
  speed: number;
  max_chars: number;
  timeout_s?: number | null;
}

export interface RuntimeSettings {
  mock_provider_enabled: boolean;
  tts: TTSSettings;
}

export interface RuntimeSettingsUpdateRequest {
  mock_provider_enabled: boolean;
  tts: {
    enabled: boolean;
    backend: TTSBackend;
    model: string;
    base_url?: string | null;
    api_key?: string | null;
    voice: string;
    rate_wpm: number;
    speed: number;
    max_chars: number;
    timeout_s?: number | null;
  };
}

export interface RuntimeCatalog {
  default_provider?: ModelProvider | null;
  default_router_provider: ModelProvider;
  default_generation_provider: ModelProvider;
  sandbox_engine: string;
  providers: ProviderDescriptor[];
  skills: SkillDescriptor[];
  sandbox_modes: string[];
  settings: RuntimeSettings;
}

export interface CustomProviderUpsertRequest {
  name: string;
  label: string;
  base_url: string;
  model: string;
  router_model?: string;
  planning_model?: string;
  coding_model?: string;
  critic_model?: string;
  test_model?: string;
  api_key?: string;
  description: string;
  temperature: number;
  supports_vision: boolean;
  enabled: boolean;
}

export interface CustomProviderTestResponse {
  ok: boolean;
  provider: string;
  model: string;
  message: string;
  raw_excerpt?: string | null;
}
