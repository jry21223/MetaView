import type { DirectorScript, PlaybookScript } from "../playbook/types";

export interface ReviewIssue {
  code: string;
  severity: "info" | "warning" | "error";
  path: string;
  message: string;
  suggestion?: string | null;
}

export interface ReviewReport {
  status: "clean" | "warnings" | "repaired" | "failed";
  attempts: number;
  issues: ReviewIssue[];
  actions: string[];
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
}
