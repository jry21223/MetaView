import type { CirDocument, ExecutionMap } from "../cir/types";
import type { ProviderDescriptor, SkillDescriptor } from "../provider/types";
import type { PlaybookScript } from "../playbook/types";

export type UITheme = "dark" | "light";
export type SandboxMode = "dry_run" | "off";
export type SandboxStatus = "passed" | "failed" | "skipped";
export type PipelineRunStatus = "queued" | "running" | "succeeded" | "failed";
export type PipelineStage = "domain_routing" | "cir_planning" | "script_coding" | "render_output";
export type ValidationSeverity = "info" | "warning" | "error";
export type ValidationStatus = "valid" | "invalid";

export interface AgentDiagnostic {
  agent: string;
  message: string;
}

export interface AgentTrace {
  agent: string;
  provider: string;
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

export interface PipelineResponse {
  request_id: string;
  cir: CirDocument;
  renderer_script: string;
  playbook?: PlaybookScript | null;
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
  domain?: string | null;
  provider?: string | null;
  router_provider?: string | null;
  generation_provider?: string | null;
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
    domain?: string | null;
    provider?: string | null;
    router_provider?: string | null;
    generation_provider?: string | null;
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
