export type TeachingDeckRenderer = "pptmaster" | "metaview";

export type TeachingDeckSlideKind =
  | "cover"
  | "objectives"
  | "context"
  | "concept"
  | "dynamic_explanation"
  | "derivation"
  | "example"
  | "exercise"
  | "summary";

export type TeachingDeckDynamicState =
  | "idle"
  | "generating"
  | "ready"
  | "failed";

export interface TeachingDeckInput {
  topic: string;
  grade: string;
  durationMinutes: number;
  teachingGoals: string;
  sourceMaterial: string;
}

export interface TeachingDeckSlide {
  id: string;
  order: number;
  kind: TeachingDeckSlideKind;
  title: string;
  teachingGoal: string;
  points: string[];
  renderer: TeachingDeckRenderer;
  visualStrategy?: string;
  durationSeconds?: number;
  metaViewRunId?: string | null;
  dynamicState?: TeachingDeckDynamicState;
  dynamicError?: string | null;
}

export interface TeachingDeckProject {
  schemaVersion: "0.1.0";
  id: string;
  title: string;
  input: TeachingDeckInput;
  slides: TeachingDeckSlide[];
  createdAt: string;
  updatedAt: string;
}

export interface TeachingDeckValidationIssue {
  code:
    | "missing_topic"
    | "missing_slide_title"
    | "missing_teaching_goal"
    | "missing_slide_points"
    | "dynamic_slide_without_strategy"
    | "deck_too_short"
    | "deck_too_long";
  slideId?: string;
  message: string;
}
