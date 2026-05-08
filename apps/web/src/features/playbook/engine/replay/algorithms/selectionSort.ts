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

export function selectionSort(input: string[]): ReplayedStep[] {
  const arr = [...input];
  const n = arr.length;
  const steps: ReplayedStep[] = [];
  const sortedSet = new Set<number>();

  if (n <= 1) {
    steps.push({ snapshot: snapshot(arr, [], Array.from({ length: n }, (_, i) => i)), hint: "已有序" });
    return steps;
  }

  steps.push({ snapshot: snapshot(arr, [], []), hint: "开始选择排序" });

  for (let i = 0; i < n - 1; i++) {
    let minIdx = i;

    steps.push({
      snapshot: snapshot(arr, [i], Array.from(sortedSet), [], { i, min: minIdx }),
      hint: `从位置 ${i} 开始寻找最小值`,
    });

    for (let j = i + 1; j < n; j++) {
      steps.push({
        snapshot: snapshot(arr, [j, minIdx], Array.from(sortedSet), [], { i, j, min: minIdx }),
        hint: `比较 arr[${j}]=${arr[j]} 与当前最小值 arr[${minIdx}]=${arr[minIdx]}`,
      });

      if (compareValues(arr[j], arr[minIdx]) < 0) {
        minIdx = j;
        steps.push({
          snapshot: snapshot(arr, [minIdx], Array.from(sortedSet), [], { i, j, min: minIdx }),
          hint: `新的最小值：arr[${minIdx}]=${arr[minIdx]}`,
        });
      }
    }

    if (minIdx !== i) {
      [arr[i], arr[minIdx]] = [arr[minIdx], arr[i]];
      steps.push({
        snapshot: snapshot(arr, [i, minIdx], Array.from(sortedSet), [i, minIdx], { i, min: minIdx }),
        hint: `将最小值 arr[${minIdx}] 交换到位置 ${i}`,
      });
    }

    sortedSet.add(i);
    steps.push({
      snapshot: snapshot(arr, [], Array.from(sortedSet), [], { i }),
      hint: `位置 ${i} 已就位：arr[${i}]=${arr[i]}`,
    });
  }

  sortedSet.add(n - 1);
  steps.push({ snapshot: snapshot(arr, [], Array.from(sortedSet)), hint: "排序完成" });

  return steps;
}
