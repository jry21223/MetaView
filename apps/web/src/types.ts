export type TopicDomain =
  | "algorithm"
  | "math"
  | "code"
  | "physics"
  | "chemistry"
  | "biology"
  | "geography";
export type ModelProvider = string;
export type SandboxMode = "dry_run" | "off";
export type SandboxStatus = "passed" | "failed" | "skipped";
export type ProviderKind = "mock" | "openai_compatible";
export type ProviderStage = "router" | "planning" | "coding" | "critic" | "test";

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
  // 新增字段 (用于代码高亮和时间估算)
  code_start_line?: number;
  code_end_line?: number;
  estimated_duration?: number;
}

export interface CirDocument {
  version: string;
  title: string;
  domain: TopicDomain;
  summary: string;
  steps: CirStep[];
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
}

export interface PipelineResponse {
  request_id: string;
  cir: CirDocument;
  renderer_script: string;
  preview_video_url?: string | null;
  diagnostics: AgentDiagnostic[];
  runtime: PipelineRuntime;
}

export interface PipelineRunSummary {
  request_id: string;
  created_at: string;
  prompt: string;
  title: string;
  domain: TopicDomain;
  provider?: ModelProvider | null;
  router_provider: ModelProvider;
  generation_provider: ModelProvider;
  sandbox_status: SandboxStatus;
}

export interface PipelineRunDetail {
  created_at: string;
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
    sandbox_mode: SandboxMode;
    persist_run: boolean;
  };
  response: PipelineResponse;
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
