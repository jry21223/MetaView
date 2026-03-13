export type TopicDomain = "algorithm" | "math";

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

export interface PipelineResponse {
  request_id: string;
  cir: CirDocument;
  renderer_script: string;
  diagnostics: AgentDiagnostic[];
}

