import type { MetaStep } from "../types";

export interface RendererProps {
  step: MetaStep;
  prevStep: MetaStep | null;
  frame: number;
  stepStartFrame: number;
  stepEndFrame: number;
  progress: number;
  theme: "dark" | "light";
  /**
   * Total frames for the bar-swap animation. Optional — consumers should
   * fall back to `DEFAULT_SWAP_FRAMES` when absent so existing tests and
   * call sites that don't pipe it through keep working.
   */
  swapDurationFrames?: number;
}

export type RendererComponent = React.FC<RendererProps>;
