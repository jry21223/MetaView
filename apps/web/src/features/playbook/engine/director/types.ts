export type DirectorIntent =
  | "hook"
  | "focus"
  | "reveal"
  | "compare"
  | "summary"
  | "explain";

export type DirectorShotType = "wide" | "medium" | "close" | "detail";

export type DirectorCameraMotion =
  | "hold"
  | "push_in"
  | "pull_out"
  | "pan_left"
  | "pan_right"
  | "focus_target";

export type DirectorPacing = "fast" | "normal" | "slow";

export type DirectorSource = "rule" | "llm" | "agent" | "manual";

export interface DirectorBeat {
  beat_id: string;
  step_id: string;
  start_frame: number;
  end_frame: number;
  intent: DirectorIntent;
  shot_type: DirectorShotType;
  camera_motion: DirectorCameraMotion;
  pacing: DirectorPacing;
  voiceover_text?: string | null;
  emphasis_terms: string[];
  focus_target?: string | null;
}

export interface DirectorScript {
  schema_version: "1.0.0";
  source: DirectorSource;
  run_id: string;
  beats: DirectorBeat[];
}
