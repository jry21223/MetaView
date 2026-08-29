import type { MetaStep } from "../types";
import type { DirectorFramePlan } from "../director/framePlan";

export type RendererRenderMode = "standalone" | "stage-base" | "stage-overlay";

export type RendererInteractionEvent =
  | {
      type: "set-number";
      phase: "preview" | "commit";
      step_id: string;
      target_role: "marker-x";
      value: number;
    }
  | {
      type: "set-number";
      phase: "cancel";
      step_id: string;
      target_role: "marker-x";
    }
  | {
      type: "select-node";
      phase: "commit";
      step_id: string;
      target_role: "start-node";
      value: string;
    };

/*
 * Four progress semantics coexist on this render path — know which one you
 * are holding:
 *
 * 1. `progress` — VISUAL-SLOT progress, 0→1 across the slot the continuity
 *    compiler assigned (may span several narration steps), spring-eased by
 *    useStepProgress. Drives long glides: camera moves, slot-length sweeps.
 * 2. `stepProgress` — NARRATION-STEP progress, 0→1 within the current step,
 *    also spring-eased. Restarts every step; for labels/text meant to re-run.
 * 3. Entrance clocks — draw-ins of newly added objects run on short FIXED
 *    frame budgets derived from `frame - stepStartFrame` (math scenes:
 *    MATH_SCENE_ENTRANCE_FRAMES via the director adapter; physics scenes:
 *    their own trajectory/vector clocks). Narration length must never
 *    stretch a draw-in.
 * 4. Director beat progress — lives inside `directorFrame` (per-beat local
 *    progress), only meaningful when a DirectorScript is present.
 *
 * Note: with a null director the composition STILL synthesizes
 * `directorFrame` through the adapters, so math scenes always receive their
 * plan from it — a renderer-local plan is only ever a standalone-mount
 * fallback and must reuse the adapter's composer.
 */
export interface RendererProps {
  step: MetaStep;
  prevStep: MetaStep | null;
  frame: number;
  stepStartFrame: number;
  stepEndFrame: number;
  /**
   * Narration-step progress (semantic 2 above): 0→1 within the current step,
   * spring-eased, restarts every step. Geometry usually wants `progress`.
   */
  stepProgress?: number;
  /** Start frame of the visual slot whose geometry is currently being rendered. */
  visualStartFrame?: number;
  /** Stable key for the visual slot, used by the continuity compiler. */
  visualKey?: string;
  /** True when this visual slot is continuing from the immediately previous step. */
  isVisualContinuation?: boolean;
  /**
   * Visual-slot progress (semantic 1 above): 0→1 across the whole slot,
   * spring-eased, may span multiple narration steps. Never use it to pace a
   * draw-in — that's what the fixed entrance clocks are for.
   */
  progress: number;
  theme: "dark" | "light";
  /** Script domain, used by generic snapshots that need domain-specific fallback UI. */
  domain?: string;
  /** Whether the renderer is drawing alone, as the base stage, or as stage geometry only. */
  renderMode?: RendererRenderMode;
  /**
   * Total frames for the bar-swap animation. Optional — consumers should
   * fall back to `DEFAULT_SWAP_FRAMES` when absent so existing tests and
   * call sites that don't pipe it through keep working.
   */
  swapDurationFrames?: number;
  /** Per-frame director runtime plan for renderer-specific camera execution. */
  directorFrame?: DirectorFramePlan;
  /** Optional semantic interaction channel used only by browser previews. */
  onInteraction?: (event: RendererInteractionEvent) => void;
}

export type RendererComponent = React.FC<RendererProps>;
