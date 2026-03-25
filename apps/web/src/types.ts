export type TopicDomain =
  | "algorithm"
  | "math"
  | "code"
  | "physics"
  | "chemistry"
  | "biology"
  | "geography";
export type UITheme = "dark" | "light";
export type ModelProvider = string;
export type SandboxMode = "dry_run" | "off";
export type SandboxStatus = "passed" | "failed" | "skipped";
export type PipelineRunStatus = "queued" | "running" | "succeeded" | "failed";
export type ProviderKind = "mock" | "openai_compatible";
export type ProviderStage = "router" | "planning" | "coding" | "critic" | "test";
export type TTSBackend = "auto" | "system" | "openai_compatible";

export type VisualKind =
  | "array"
  | "flow"
  | "formula"
  | "graph"
  | "text"
  | "motion"
  | "circuit"
  | "molecule"
  | "map"
  | "cell";

export interface VisualToken {
  id: string;
  label: string;
  value?: string | null;
  emphasis: string;
}

export interface CirStep {
  id: string;
  title: string;
  narration: string;
  visual_kind: VisualKind;
  tokens: VisualToken[];
  annotations: string[];
  start_time?: number | null;
  end_time?: number | null;
}

export interface CirDocument {
  version: string;
  title: string;
  domain: TopicDomain;
  summary: string;
  steps: CirStep[];
}

export interface ExecutionParameterControl {
  id: string;
  label: string;
  value: string;
  description?: string | null;
  placeholder?: string | null;
}

export interface ExecutionArrayTrack {
  id: string;
  label: string;
  values: string[];
  target_value?: string | null;
}

export interface ExecutionCheckpoint {
  id: string;
  step_id: string;
  title: string;
  summary: string;
  start_s: number;
  end_s: number;
  code_lines: number[];
  focus_tokens: string[];
  array_focus_indices: number[];
  array_reference_indices: number[];
  breakpoint: boolean;
  guiding_question?: string | null;
}

export interface ExecutionMap {
  duration_s: number;
  interaction_hint?: string | null;
  checkpoints: ExecutionCheckpoint[];
  parameter_controls: ExecutionParameterControl[];
  array_track?: ExecutionArrayTrack | null;
}

export interface AgentDiagnostic {
  agent: string;
  message: string;
}

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

export interface SkillDescriptor {
  id: string;
  domain: TopicDomain;
  label: string;
  description: string;
  version: string;
  triggers: string[];
  dependencies: string[];
  supports_image_input: boolean;
  execution_notes: string[];
}

export interface AgentTrace {
  agent: string;
  provider: ModelProvider;
  model: string;
  summary: string;
  raw_output?: string | null;
}

export interface SandboxReport {
  mode: SandboxMode;
  engine: string;
  status: SandboxStatus;
  duration_ms: number;
  warnings: string[];
  errors: string[];
}

export type ValidationSeverity = "info" | "warning" | "error";
export type ValidationStatus = "valid" | "invalid";

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  step_id?: string | null;
}

export interface CirValidationReport {
  status: ValidationStatus;
  issues: ValidationIssue[];
}

export interface PipelineRuntime {
  skill: SkillDescriptor;
  provider?: ProviderDescriptor | null;
  router_provider: ProviderDescriptor;
  generation_provider: ProviderDescriptor;
  sandbox: SandboxReport;
  validation: CirValidationReport;
  agent_traces: AgentTrace[];
  repair_count: number;
  repair_actions: string[];
}

export interface RuntimeCatalog {
  default_provider?: ModelProvider | null;
  default_router_provider: ModelProvider;
  default_generation_provider: ModelProvider;
  sandbox_engine: string;
  providers: ProviderDescriptor[];
  skills: SkillDescriptor[];
  sandbox_modes: SandboxMode[];
  settings: RuntimeSettings;
}

export interface PipelineResponse {
  request_id: string;
  cir: CirDocument;
  renderer_script: string;
  preview_video_url?: string | null;
  execution_map?: ExecutionMap | null;
  diagnostics: AgentDiagnostic[];
  runtime: PipelineRuntime;
  step_timing: Array<{
    step_id: string;
    start_time: number;
    end_time: number;
    start_line?: number;
    end_line?: number;
  }>;
}

export interface PipelineSubmitResponse {
  request_id: string;
  created_at: string;
  status: PipelineRunStatus;
}

export interface PipelineRunSummary {
  request_id: string;
  created_at: string;
  updated_at: string;
  status: PipelineRunStatus;
  prompt: string;
  title: string;
  domain?: TopicDomain | null;
  provider?: ModelProvider | null;
  router_provider?: ModelProvider | null;
  generation_provider?: ModelProvider | null;
  sandbox_status?: SandboxStatus | null;
  error_message?: string | null;
}

export interface PipelineRunDetail {
  created_at: string;
  updated_at: string;
  status: PipelineRunStatus;
  error_message?: string | null;
  request: {
    prompt: string;
    domain?: TopicDomain | null;
    provider?: ModelProvider | null;
    router_provider?: ModelProvider | null;
    generation_provider?: ModelProvider | null;
    source_code?: string | null;
    source_code_language?: string | null;
    source_image?: string | null;
    source_image_name?: string | null;
    ui_theme?: UITheme | null;
    enable_narration: boolean;
    sandbox_mode: SandboxMode;
    persist_run: boolean;
  };
  response?: PipelineResponse | null;
}

export interface PromptReferenceRequest {
  subject: TopicDomain;
  provider?: ModelProvider | null;
  notes?: string | null;
  write: boolean;
}

export interface PromptReferenceResponse {
  subject: TopicDomain;
  provider: ModelProvider;
  model: string;
  output_path: string;
  markdown: string;
  wrote_file: boolean;
  raw_output?: string | null;
}

export interface CustomSubjectPromptRequest {
  subject_name: string;
  provider?: ModelProvider | null;
  summary?: string | null;
  notes?: string | null;
  write: boolean;
}

export interface CustomSubjectPromptResponse {
  subject_name: string;
  slug: string;
  provider: ModelProvider;
  model: string;
  output_path: string;
  markdown: string;
  wrote_file: boolean;
  raw_output?: string | null;
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

export interface ManimScriptPrepareResponse {
  code: string;
  scene_class_name: string;
  diagnostics: string[];
  is_runnable: boolean;
}

export interface ManimScriptRenderResponse extends ManimScriptPrepareResponse {
  request_id: string;
  preview_video_url: string;
  render_backend: string;
}
