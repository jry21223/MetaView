import type { AlgorithmReplay } from "./types";
import { mergeSort } from "./mergeSort";
import { bubbleSort } from "./algorithms/bubbleSort";
import { quickSort } from "./algorithms/quickSort";
import { selectionSort } from "./algorithms/selectionSort";
import { insertionSort } from "./algorithms/insertionSort";

export const algorithmReplayRegistry: Record<string, AlgorithmReplay> = {
  merge_sort: mergeSort,
  bubble_sort: bubbleSort,
  quick_sort: quickSort,
  selection_sort: selectionSort,
  insertion_sort: insertionSort,
};

export function getReplay(algorithmId: string | null | undefined): AlgorithmReplay | null {
  if (!algorithmId) return null;
  return algorithmReplayRegistry[algorithmId] ?? null;
}

export function isReplaySupported(algorithmId: string | null | undefined): boolean {
  return getReplay(algorithmId) !== null;
}
