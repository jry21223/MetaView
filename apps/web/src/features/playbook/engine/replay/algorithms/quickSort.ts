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

export function quickSort(input: string[]): ReplayedStep[] {
  const arr = [...input];
  const n = arr.length;
  const steps: ReplayedStep[] = [];
  const sortedSet = new Set<number>();

  if (n <= 1) {
    steps.push({ snapshot: snapshot(arr, [], Array.from({ length: n }, (_, i) => i)), hint: "已有序" });
    return steps;
  }

  steps.push({ snapshot: snapshot(arr, [], []), hint: "开始快速排序" });

  function partition(lo: number, hi: number): number {
    const pivotVal = arr[hi];
    let i = lo - 1;

    steps.push({
      snapshot: snapshot(arr, Array.from({ length: hi - lo + 1 }, (_, k) => lo + k), Array.from(sortedSet), [], { pivot: hi }),
      hint: `选择基准 arr[${hi}]=${pivotVal}`,
    });

    for (let j = lo; j < hi; j++) {
      steps.push({
        snapshot: snapshot(arr, [j, hi], Array.from(sortedSet), [], { i, j, pivot: hi }),
        hint: `比较 arr[${j}]=${arr[j]} 与基准 ${pivotVal}`,
      });

      if (compareValues(arr[j], pivotVal) <= 0) {
        i++;
        if (i !== j) {
          [arr[i], arr[j]] = [arr[j], arr[i]];
          steps.push({
            snapshot: snapshot(arr, [i, j], Array.from(sortedSet), [i, j], { i, j, pivot: hi }),
            hint: `交换 arr[${i}] 与 arr[${j}]`,
          });
        }
      }
    }

    // Place pivot
    const pivotPos = i + 1;
    if (pivotPos !== hi) {
      [arr[pivotPos], arr[hi]] = [arr[hi], arr[pivotPos]];
      steps.push({
        snapshot: snapshot(arr, [pivotPos, hi], Array.from(sortedSet), [pivotPos, hi], { pivot: pivotPos }),
        hint: `将基准放入最终位置 arr[${pivotPos}]`,
      });
    }
    sortedSet.add(pivotPos);
    steps.push({
      snapshot: snapshot(arr, [], Array.from(sortedSet), [], { pivot: pivotPos }),
      hint: `arr[${pivotPos}]=${arr[pivotPos]} 已就位`,
    });
    return pivotPos;
  }

  function recurse(lo: number, hi: number): void {
    if (lo >= hi) {
      if (lo === hi) sortedSet.add(lo);
      return;
    }
    const p = partition(lo, hi);
    recurse(lo, p - 1);
    recurse(p + 1, hi);
  }

  recurse(0, n - 1);

  for (let k = 0; k < n; k++) sortedSet.add(k);
  steps.push({ snapshot: snapshot(arr, [], Array.from(sortedSet)), hint: "排序完成" });

  return steps;
}
