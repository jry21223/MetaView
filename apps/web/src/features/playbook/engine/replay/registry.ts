import type { AlgorithmReplay } from "./types";
import { mergeSort } from "./mergeSort";

export const algorithmReplayRegistry: Record<string, AlgorithmReplay> = {
  merge_sort: mergeSort,
};

export function getReplay(algorithmId: string | null | undefined): AlgorithmReplay | null {
  if (!algorithmId) return null;
  return algorithmReplayRegistry[algorithmId] ?? null;
}

export function isReplaySupported(algorithmId: string | null | undefined): boolean {
  return getReplay(algorithmId) !== null;
}
