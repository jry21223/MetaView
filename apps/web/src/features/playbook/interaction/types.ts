import type { GraphSceneSnapshot, PlaybookScript } from "../engine/types";

export type InteractionAdapterId =
  | "math.derivative-tangent"
  | "algorithm.bfs"
  | "math.conic-followup";

export interface DerivativeInteractionBinding {
  id: string;
  adapter_id: "math.derivative-tangent";
  step_id: string;
  target_role: "marker-x";
  action: "set-value";
  label: string;
  min: number;
  max: number;
  value: number;
}

export interface BfsInteractionBinding {
  id: string;
  adapter_id: "algorithm.bfs";
  step_id: string;
  target_role: "start-node";
  action: "select";
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
}

export type ConicFollowupAction =
  | "slow-current-segment"
  | "change-explanation"
  | "emphasize-conclusion"
  | "set-parameter"
  | "clarify-current-step";

export interface ConicFollowupBinding {
  id: string;
  adapter_id: "math.conic-followup";
  step_id: string;
  target_role: ConicFollowupAction;
  action: ConicFollowupAction;
  label: string;
}

export type InteractionBinding =
  | DerivativeInteractionBinding
  | BfsInteractionBinding
  | ConicFollowupBinding;

export interface InteractionAdapterManifest {
  adapter_id: InteractionAdapterId;
  experimental: true;
  bindings: InteractionBinding[];
}

export interface InteractionManifest {
  version: "1";
  adapters: InteractionAdapterManifest[];
}

export interface DerivativeInteractionCommand {
  adapter_id: "math.derivative-tangent";
  step_id: string;
  target_id: string;
  action: "set-value";
  value: number;
}

export interface BfsInteractionCommand {
  adapter_id: "algorithm.bfs";
  step_id: string;
  target_id: string;
  action: "select";
  value: string;
}

export interface SlowConicSegmentCommand {
  adapter_id: "math.conic-followup";
  step_id: string;
  target_id: string;
  action: "slow-current-segment";
  factor: number;
}

export interface ChangeConicExplanationCommand {
  adapter_id: "math.conic-followup";
  step_id: string;
  target_id: string;
  action: "change-explanation";
  explanation: string;
}

export interface EmphasizeConicConclusionCommand {
  adapter_id: "math.conic-followup";
  step_id: string;
  target_id: string;
  action: "emphasize-conclusion";
  reason: string;
  semantic_role?: string;
}

export interface SetConicParameterCommand {
  adapter_id: "math.conic-followup";
  step_id: string;
  target_id: string;
  action: "set-parameter";
  parameter_id: string;
  value: number | string;
}

export interface ClarifyCurrentConicStepCommand {
  adapter_id: "math.conic-followup";
  step_id: string;
  target_id: string;
  action: "clarify-current-step";
  clarification: string;
}

export type ConicFollowupCommand =
  | SlowConicSegmentCommand
  | ChangeConicExplanationCommand
  | EmphasizeConicConclusionCommand
  | SetConicParameterCommand
  | ClarifyCurrentConicStepCommand;

export type InteractionCommand =
  | DerivativeInteractionCommand
  | BfsInteractionCommand
  | ConicFollowupCommand;

export type InteractionEvent = InteractionCommand & {
  sequence: number;
};

export interface InteractionFollowUpContext {
  manifest_version: "1";
  events: InteractionEvent[];
}

export interface BfsInteractionReplayFrame {
  index: number;
  current_node_id: string;
  visited_node_ids: string[];
  queue_node_ids: string[];
  snapshot: GraphSceneSnapshot;
}

export interface BfsInteractionReplay {
  adapter_id: "algorithm.bfs";
  step_id: string;
  start_node_id: string;
  visit_order: string[];
  frames: BfsInteractionReplayFrame[];
}

export interface InteractionResult {
  script: PlaybookScript;
  event: InteractionEvent;
  summary: string;
  replay?: BfsInteractionReplay;
}

export interface InteractionAdapter {
  adapter_id: InteractionAdapterId;
  deriveManifest: (script: PlaybookScript) => InteractionAdapterManifest | null;
  apply: (
    script: PlaybookScript,
    command: InteractionCommand,
  ) => Pick<InteractionResult, "script" | "summary">;
}

export class InteractionEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InteractionEngineError";
  }
}
