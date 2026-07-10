import type { DirectorScript, PlaybookScript } from "../playbook/types";

export interface ReviewIssue {
  code: string;
  severity: "info" | "warning" | "error";
  path: string;
  message: string;
  suggestion?: string | null;
  requires_repair?: boolean;
}

export interface ReviewReport {
  status:
    | "clean"
    | "warnings"
    | "repaired"
    | "failed"
    | "repairable"
    | "blocked";
  attempts: number;
  issues: ReviewIssue[];
  actions: string[];
}

export interface QualityReport {
  status: "clean" | "warnings" | "repairable" | "blocked";
  generator_path: string;
  coverage_mode: string;
  issues: ReviewIssue[];
  scores: Record<string, number>;
  repair_targets: string[];
  summary: string;
  actions: string[];
  attempts: number;
}

export type PipelineRunStatus =
  | "queued"
  | "running"
  | "reviewing"
  | "succeeded"
  | "failed";

export interface PipelineRunResult {
  run_id: string;
  status: PipelineRunStatus;
  prompt?: string;
  playbook?: PlaybookScript | null;
  director?: DirectorScript | null;
  error?: string | null;
  created_at: string;
  review?: ReviewReport | null;
  quality_report?: QualityReport | null;
}
