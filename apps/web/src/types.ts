export type TopicDomain = "algorithm" | "math";
export type ModelProvider = "mock" | "openai";
export type SandboxMode = "dry_run" | "off";
export type SandboxStatus = "passed" | "failed" | "skipped";

export type VisualKind = "array" | "flow" | "formula" | "graph" | "text";

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
  model: string;
  description: string;
  configured: boolean;
}

export interface AgentTrace {
  agent: string;
  provider: ModelProvider;
  model: string;
  summary: string;
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
  provider: ProviderDescriptor;
  sandbox: SandboxReport;
  validation: CirValidationReport;
  agent_traces: AgentTrace[];
  repair_count: number;
  repair_actions: string[];
}

export interface RuntimeCatalog {
  default_provider: ModelProvider;
  sandbox_engine: string;
  providers: ProviderDescriptor[];
  sandbox_modes: SandboxMode[];
}

export interface PipelineResponse {
  request_id: string;
  cir: CirDocument;
  renderer_script: string;
  diagnostics: AgentDiagnostic[];
  runtime: PipelineRuntime;
}

export interface PipelineRunSummary {
  request_id: string;
  created_at: string;
  prompt: string;
  title: string;
  domain: TopicDomain;
  provider: ModelProvider;
  sandbox_status: SandboxStatus;
}

export interface PipelineRunDetail {
  created_at: string;
  request: {
    prompt: string;
    domain: TopicDomain;
    provider?: ModelProvider | null;
    sandbox_mode: SandboxMode;
    persist_run: boolean;
  };
  response: PipelineResponse;
}
