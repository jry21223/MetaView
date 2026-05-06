import type { AlgorithmArraySnapshot } from "../types";

export interface ReplayedStep {
  snapshot: AlgorithmArraySnapshot;
  hint?: string;
}

export type AlgorithmReplay = (input: string[]) => ReplayedStep[];
