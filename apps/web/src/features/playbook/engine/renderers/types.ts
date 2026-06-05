import type { MetaStep } from "../types";

export type RendererRenderMode = "standalone" | "stage-base" | "stage-overlay";

export interface RendererProps {
  step: MetaStep;
  prevStep: MetaStep | null;
  frame: number;
  stepStartFrame: number;
  stepEndFrame: number;
  /**
   * Current step progress. Geometry renderers should usually use `progress`
   * instead; this field is for labels/text that intentionally restart on
   * every narration step.
   */
  stepProgress?: number;
  /** Start frame of the visual slot whose geometry is currently being rendered. */
  visualStartFrame?: number;
  /** Stable key for the visual slot, used by the continuity compiler. */
  visualKey?: string;
  /** True when this visual slot is continuing from the immediately previous step. */
  isVisualContinuation?: boolean;
  /** Geometry progress. This may span multiple narration steps. */
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
}

export type RendererComponent = React.FC<RendererProps>;
