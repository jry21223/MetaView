import type { MetaStep } from "../types";

export interface RendererProps {
  step: MetaStep;
  prevStep: MetaStep | null;
  frame: number;
  stepStartFrame: number;
  stepEndFrame: number;
  progress: number;
  theme: "dark" | "light";
}

export type RendererComponent = React.FC<RendererProps>;
