import type { ReplayedStep } from "../types";
import { compareValues, range, snapshot } from "./_helpers";

export function selectionSort(input: string[]): ReplayedStep[] {
  const arr = [...input];
  const n = arr.length;
  const steps: ReplayedStep[] = [];

  if (n <= 1) {
    steps.push({ snapshot: snapshot(arr, [], range(0, n)), hint: "已有序" });
    return steps;
  }

  steps.push({ snapshot: snapshot(arr, [], []), hint: "初始数组" });

  for (let i = 0; i < n - 1; i++) {
    const sortedHead = range(0, i);
    let minIdx = i;
    steps.push({
      snapshot: snapshot(arr, [i], sortedHead, [], { i, minIdx }),
      hint: `寻找区间 [${i}, ${n - 1}] 的最小值`,
    });
    for (let j = i + 1; j < n; j++) {
      steps.push({
        snapshot: snapshot(arr, [minIdx, j], sortedHead, [], { i, j, minIdx }),
        hint: `比较 A[${j}] 与当前最小 A[${minIdx}]`,
      });
      if (compareValues(arr[j], arr[minIdx]) < 0) {
        minIdx = j;
        steps.push({
          snapshot: snapshot(arr, [minIdx], sortedHead, [], { i, j, minIdx }),
          hint: `更新最小值索引为 ${minIdx}`,
        });
      }
    }
    if (minIdx !== i) {
      [arr[i], arr[minIdx]] = [arr[minIdx], arr[i]];
      steps.push({
        snapshot: snapshot(arr, [i, minIdx], sortedHead, [i, minIdx], { i, minIdx }),
        hint: `交换 A[${i}] 与 A[${minIdx}]`,
      });
    }
  }

  steps.push({ snapshot: snapshot(arr, [], range(0, n)), hint: "排序完成" });
  return steps;
}
