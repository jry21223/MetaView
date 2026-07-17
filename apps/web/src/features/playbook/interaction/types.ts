import type { GraphSceneSnapshot, PlaybookScript } from "../engine/types";

export type InteractionAdapterId =
  | "math.derivative-tangent"
  | "algorithm.bfs";

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

export type InteractionBinding =
  | DerivativeInteractionBinding
  | BfsInteractionBinding;

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

export type InteractionCommand =
  | DerivativeInteractionCommand
  | BfsInteractionCommand;

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

export class InteractionEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InteractionEngineError";
  }
}
