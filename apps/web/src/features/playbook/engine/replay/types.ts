import type { AlgorithmArraySnapshot, AlgorithmBarsSnapshot } from "../types";

export interface ReplayedStep {
  snapshot: AlgorithmArraySnapshot | AlgorithmBarsSnapshot;
  hint?: string;
}

export type AlgorithmReplay = (input: string[]) => ReplayedStep[];
