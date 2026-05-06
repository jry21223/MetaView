import type { AlgorithmArraySnapshot } from "../types";
import type { ReplayedStep } from "./types";

function range(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let i = lo; i < hi; i++) out.push(i);
  return out;
}

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

export function mergeSort(input: string[]): ReplayedStep[] {
  const arr = [...input];
  const n = arr.length;
  const steps: ReplayedStep[] = [];
  const sortedAccum = new Set<number>();

  if (n <= 1) {
    steps.push({ snapshot: snapshot(arr, [], range(0, n)), hint: "已有序" });
    return steps;
  }

  // Initial overall divide
  steps.push({
    snapshot: snapshot(arr, range(0, n), []),
    hint: "整体划分",
  });

  const recurse = (lo: number, hi: number): void => {
    if (hi - lo <= 1) return;
    const mid = (lo + hi) >> 1;

    // Divide step
    steps.push({
      snapshot: snapshot(arr, range(lo, hi), Array.from(sortedAccum).sort((a, b) => a - b)),
      hint: `划分 [${lo}, ${hi})`,
    });

    recurse(lo, mid);
    recurse(mid, hi);

    // Merge: walk two pointers, emit a snapshot per assignment
    const left = arr.slice(lo, mid);
    const right = arr.slice(mid, hi);
    let i = 0;
    let j = 0;
    let k = lo;
    while (i < left.length && j < right.length) {
      if (compareValues(left[i], right[j]) <= 0) {
        arr[k] = left[i];
        i += 1;
      } else {
        arr[k] = right[j];
        j += 1;
      }
      sortedAccum.add(k);
      steps.push({
        snapshot: snapshot(
          arr,
          range(lo, hi),
          Array.from(sortedAccum).sort((a, b) => a - b),
          [k],
          { i: lo + i, j: mid + j, k: k + 1 },
        ),
        hint: `合并 [${lo}, ${hi})`,
      });
      k += 1;
    }
    while (i < left.length) {
      arr[k] = left[i];
      sortedAccum.add(k);
      steps.push({
        snapshot: snapshot(
          arr,
          range(lo, hi),
          Array.from(sortedAccum).sort((a, b) => a - b),
          [k],
        ),
        hint: `合并 [${lo}, ${hi})`,
      });
      i += 1;
      k += 1;
    }
    while (j < right.length) {
      arr[k] = right[j];
      sortedAccum.add(k);
      steps.push({
        snapshot: snapshot(
          arr,
          range(lo, hi),
          Array.from(sortedAccum).sort((a, b) => a - b),
          [k],
        ),
        hint: `合并 [${lo}, ${hi})`,
      });
      j += 1;
      k += 1;
    }
  };

  recurse(0, n);

  // Final sorted state
  steps.push({
    snapshot: snapshot(arr, [], range(0, n)),
    hint: "排序完成",
  });

  return steps;
}
