import type { ReplayedStep } from "./types";
import { addSortedIndex, compareValues, range, snapshot } from "./algorithms/_helpers";

export function mergeSort(input: string[]): ReplayedStep[] {
  const arr = [...input];
  const n = arr.length;
  const steps: ReplayedStep[] = [];
  const sortedAccum: number[] = [];

  if (n <= 1) {
    steps.push({ snapshot: snapshot(arr, [], range(0, n)), hint: "已有序" });
    return steps;
  }

  steps.push({
    snapshot: snapshot(arr, range(0, n), []),
    hint: "整体划分",
  });

  const recurse = (lo: number, hi: number): void => {
    if (hi - lo <= 1) return;
    const mid = (lo + hi) >> 1;

    steps.push({
      snapshot: snapshot(arr, range(lo, hi), [...sortedAccum]),
      hint: `划分 [${lo}, ${hi})`,
    });

    recurse(lo, mid);
    recurse(mid, hi);

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
      addSortedIndex(sortedAccum, k);
      steps.push({
        snapshot: snapshot(
          arr,
          range(lo, hi),
          [...sortedAccum],
          [k],
          { i: lo + i, j: mid + j, k: k + 1 },
        ),
        hint: `合并 [${lo}, ${hi})`,
      });
      k += 1;
    }
    while (i < left.length) {
      arr[k] = left[i];
      addSortedIndex(sortedAccum, k);
      steps.push({
        snapshot: snapshot(arr, range(lo, hi), [...sortedAccum], [k]),
        hint: `合并 [${lo}, ${hi})`,
      });
      i += 1;
      k += 1;
    }
    while (j < right.length) {
      arr[k] = right[j];
      addSortedIndex(sortedAccum, k);
      steps.push({
        snapshot: snapshot(arr, range(lo, hi), [...sortedAccum], [k]),
        hint: `合并 [${lo}, ${hi})`,
      });
      j += 1;
      k += 1;
    }
  };

  recurse(0, n);

  steps.push({
    snapshot: snapshot(arr, [], range(0, n)),
    hint: "排序完成",
  });

  return steps;
}
