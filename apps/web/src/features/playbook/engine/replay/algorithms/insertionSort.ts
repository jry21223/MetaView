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

export function insertionSort(input: string[]): ReplayedStep[] {
  const arr = [...input];
  const n = arr.length;
  const steps: ReplayedStep[] = [];

  if (n <= 1) {
    steps.push({ snapshot: snapshot(arr, [], Array.from({ length: n }, (_, i) => i)), hint: "已有序" });
    return steps;
  }

  // Position 0 is trivially sorted
  const sortedEnd = 1; // exclusive
  steps.push({
    snapshot: snapshot(arr, [], [0], [], {}),
    hint: "开始插入排序，第 0 位已有序",
  });

  for (let i = 1; i < n; i++) {
    const key = arr[i];
    const sortedSoFar = Array.from({ length: i }, (_, k) => k);

    steps.push({
      snapshot: snapshot(arr, [i], sortedSoFar, [], { i }),
      hint: `取出 arr[${i}]=${key}，准备插入已排序区`,
    });

    let j = i - 1;
    while (j >= 0 && compareValues(arr[j], key) > 0) {
      steps.push({
        snapshot: snapshot(arr, [j, j + 1], Array.from({ length: i }, (_, k) => k), [], { i, j }),
        hint: `arr[${j}]=${arr[j]} > ${key}，后移`,
      });

      arr[j + 1] = arr[j];
      steps.push({
        snapshot: snapshot(arr, [j + 1], Array.from({ length: i }, (_, k) => k), [j + 1], { i, j }),
        hint: `将 arr[${j}]=${arr[j]} 后移到 arr[${j + 1}]`,
      });
      j--;
    }

    arr[j + 1] = key;
    const newSorted = Array.from({ length: i + 1 }, (_, k) => k);
    steps.push({
      snapshot: snapshot(arr, [j + 1], newSorted, [], { i, insertPos: j + 1 }),
      hint: `将 ${key} 插入到位置 ${j + 1}`,
    });
  }

  const allSorted = Array.from({ length: n }, (_, i) => i);
  steps.push({ snapshot: snapshot(arr, [], allSorted), hint: "排序完成" });

  return steps;
}
