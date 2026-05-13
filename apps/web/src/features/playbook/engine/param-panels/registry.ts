import type { ParamPanelComponent } from "./types";
import { AlgorithmParamPanel } from "./AlgorithmParamPanel";
import { MathParamPanel } from "./MathParamPanel";

const paramPanelRegistry = new Map<string, ParamPanelComponent>([
  ["algorithm", AlgorithmParamPanel],
  ["math", MathParamPanel],
]);

export function getParamPanel(domain: string): ParamPanelComponent | null {
  return paramPanelRegistry.get(domain) ?? null;
}
