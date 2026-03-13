export type TopicDomain = "algorithm" | "math";
export type ModelProvider = "mock";
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

export interface PipelineRuntime {
  provider: ProviderDescriptor;
  sandbox: SandboxReport;
  agent_traces: AgentTrace[];
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
