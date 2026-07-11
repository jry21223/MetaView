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
  coverage_mode: CoverageMode | "unknown";
  issues: ReviewIssue[];
  scores: Record<string, number>;
  repair_targets: string[];
  summary: string;
  actions: string[];
  attempts: number;
}

export type CoverageMode =
  | "specialized"
  | "composable"
  | "experimental"
  | "unsupported";

export type CoverageFallbackPolicy =
  | "use_skill"
  | "compose"
  | "limited_visual"
  | "text_only"
  | "reject";

export interface CoverageDecision {
  mode: CoverageMode;
  domain: string | null;
  confidence: number;
  matched_skill_ids: string[];
  available_tool_ids: string[];
  missing_capabilities: string[];
  fallback_policy: CoverageFallbackPolicy;
  reason: string;
}

export type LessonArc =
  | "intuition_to_abstraction"
  | "problem_to_solution"
  | "state_transition"
  | "comparison"
  | "derivation";

export type SceneTeachingStrategy =
  | "intuition"
  | "demonstration"
  | "derivation"
  | "comparison"
  | "state_transition"
  | "summary";

export interface SceneIntent {
  scene_id: string;
  teaching_goal: string;
  strategy: SceneTeachingStrategy;
  required_fact_ids: string[];
  required_visual_roles: string[];
  preferred_scene_type: string | null;
  narration_goal: string;
}

export interface LessonPlan {
  schema_version: "1.0.0";
  domain: string;
  title: string;
  learning_objectives: string[];
  prerequisites: string[];
  misconceptions: string[];
  expected_conclusion: string;
  lesson_arc: LessonArc;
  scenes: SceneIntent[];
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
  lesson_plan?: LessonPlan | null;
  coverage_decision?: CoverageDecision | null;
}
