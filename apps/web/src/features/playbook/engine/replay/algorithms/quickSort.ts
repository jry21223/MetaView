import type { ReplayedStep } from "../types";
import { compareValues, range, snapshot } from "./_helpers";

export function quickSort(input: string[]): ReplayedStep[] {
  const arr = [...input];
  const n = arr.length;
  const steps: ReplayedStep[] = [];
  const sortedAccum = new Set<number>();

  if (n <= 1) {
    steps.push({ snapshot: snapshot(arr, [], range(0, n)), hint: "已有序" });
    return steps;
  }

  steps.push({ snapshot: snapshot(arr, range(0, n), []), hint: "初始数组" });

  const partition = (lo: number, hi: number): number => {
    const pivot = arr[hi];
    let i = lo - 1;
    steps.push({
      snapshot: snapshot(arr, [hi], Array.from(sortedAccum), [], { lo, hi, pivot: hi }),
      hint: `选定 pivot = A[${hi}] = ${pivot}`,
    });
    for (let j = lo; j < hi; j++) {
      steps.push({
        snapshot: snapshot(arr, [j, hi], Array.from(sortedAccum), [], { lo, hi, i, j }),
        hint: `比较 A[${j}] 与 pivot`,
      });
      if (compareValues(arr[j], pivot) <= 0) {
        i += 1;
        if (i !== j) {
          [arr[i], arr[j]] = [arr[j], arr[i]];
          steps.push({
            snapshot: snapshot(arr, [i, j], Array.from(sortedAccum), [i, j], { lo, hi, i, j }),
            hint: `交换 A[${i}] 与 A[${j}]`,
          });
        }
      }
    }
    if (i + 1 !== hi) {
      [arr[i + 1], arr[hi]] = [arr[hi], arr[i + 1]];
      steps.push({
        snapshot: snapshot(arr, [i + 1, hi], Array.from(sortedAccum), [i + 1, hi], { lo, hi, i }),
        hint: `pivot 归位至 A[${i + 1}]`,
      });
    }
    sortedAccum.add(i + 1);
    return i + 1;
  };

  const recurse = (lo: number, hi: number): void => {
    if (lo >= hi) {
      if (lo === hi) sortedAccum.add(lo);
      return;
    }
    const p = partition(lo, hi);
    recurse(lo, p - 1);
    recurse(p + 1, hi);
  };

  recurse(0, n - 1);

  steps.push({ snapshot: snapshot(arr, [], range(0, n)), hint: "排序完成" });
  return steps;
}
