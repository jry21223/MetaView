import type { PlaybookScript } from "../engine/types";

export type InteractionAdapterId =
  | "math.derivative-tangent"
  | "algorithm.bfs";

export type InteractionAction = "set-value" | "select";

export interface InteractionBinding {
  id: string;
  adapter_id: InteractionAdapterId;
  step_id: string;
  target_role: "marker-x" | "start-node";
  action: InteractionAction;
  label: string;
  min?: number;
  max?: number;
  value?: number | string;
  options?: Array<{ id: string; label: string }>;
}

export interface InteractionAdapterManifest {
  adapter_id: InteractionAdapterId;
  experimental: true;
  bindings: InteractionBinding[];
}

export interface InteractionManifest {
  version: "1";
  adapters: InteractionAdapterManifest[];
}

export interface InteractionCommand {
  adapter_id: InteractionAdapterId;
  step_id: string;
  target_id: string;
  action: InteractionAction;
  value: number | string;
}

export interface InteractionEvent extends InteractionCommand {
  sequence: number;
}

export interface InteractionResult {
  script: PlaybookScript;
  event: InteractionEvent;
  summary: string;
}

export class InteractionEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InteractionEngineError";
  }
}
