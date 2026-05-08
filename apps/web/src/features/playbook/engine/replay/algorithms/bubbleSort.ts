import type { AlgorithmArraySnapshot } from "../../types";
import type { ReplayedStep } from "../types";

function compareValues(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
}

function snapshot(
  arr: string[],
  active: number[],
  sorted: number[],
  swap: number[] = [],
  pointers: Record<string, number> = {},
): AlgorithmArraySnapshot {
  return {
    kind: "algorithm_array",
    array_values: [...arr],
    active_indices: active,
    swap_indices: swap,
    sorted_indices: sorted,
    pointers,
  };
}

export function bubbleSort(input: string[]): ReplayedStep[] {
  const arr = [...input];
  const n = arr.length;
  const steps: ReplayedStep[] = [];
  const sortedSet = new Set<number>();

  if (n <= 1) {
    steps.push({ snapshot: snapshot(arr, [], Array.from({ length: n }, (_, i) => i)), hint: "已有序" });
    return steps;
  }

  steps.push({ snapshot: snapshot(arr, [], []), hint: "开始冒泡排序" });

  for (let i = 0; i < n - 1; i++) {
    let swapped = false;
    for (let j = 0; j < n - 1 - i; j++) {
      // Compare step
      steps.push({
        snapshot: snapshot(arr, [j, j + 1], Array.from(sortedSet), [], { i, j }),
        hint: `比较 arr[${j}]=${arr[j]} 与 arr[${j + 1}]=${arr[j + 1]}`,
      });

      if (compareValues(arr[j], arr[j + 1]) > 0) {
        // Swap step
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
        swapped = true;
        steps.push({
          snapshot: snapshot(arr, [j, j + 1], Array.from(sortedSet), [j, j + 1], { i, j }),
          hint: `交换 arr[${j}] 与 arr[${j + 1}]`,
        });
      }
    }
    sortedSet.add(n - 1 - i);
    steps.push({
      snapshot: snapshot(arr, [], Array.from(sortedSet), [], { i }),
      hint: `第 ${i + 1} 轮完成，arr[${n - 1 - i}] 已就位`,
    });
    if (!swapped) break;
  }

  // Mark all sorted
  for (let k = 0; k < n; k++) sortedSet.add(k);
  steps.push({ snapshot: snapshot(arr, [], Array.from(sortedSet)), hint: "排序完成" });

  return steps;
}
