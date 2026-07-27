import type { ReplayedStep } from "../types";
import { compareValues, range, sortingSnapshot as snapshot } from "./_helpers";

export function bubbleSort(input: string[]): ReplayedStep[] {
  const arr = [...input];
  const n = arr.length;
  const steps: ReplayedStep[] = [];

  if (n <= 1) {
    steps.push({ snapshot: snapshot(arr, [], range(0, n)), hint: "已有序" });
    return steps;
  }

  steps.push({ snapshot: snapshot(arr, [], []), hint: "初始数组" });

  for (let i = 0; i < n - 1; i++) {
    const sortedTail = range(n - i, n);
    for (let j = 0; j < n - i - 1; j++) {
      steps.push({
        snapshot: snapshot(arr, [j, j + 1], sortedTail, [], { i, j }),
        hint: `比较 A[${j}] 与 A[${j + 1}]`,
      });
      if (compareValues(arr[j], arr[j + 1]) > 0) {
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
        steps.push({
          snapshot: snapshot(arr, [j, j + 1], sortedTail, [j, j + 1], { i, j }),
          hint: `交换 A[${j}] 与 A[${j + 1}]`,
        });
      }
    }
  }

  steps.push({ snapshot: snapshot(arr, [], range(0, n)), hint: "排序完成" });
  return steps;
}
