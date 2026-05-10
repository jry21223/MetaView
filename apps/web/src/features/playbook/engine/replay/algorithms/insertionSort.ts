import type { ReplayedStep } from "../types";
import { compareValues, range, snapshot } from "./_helpers";

export function insertionSort(input: string[]): ReplayedStep[] {
  const arr = [...input];
  const n = arr.length;
  const steps: ReplayedStep[] = [];

  if (n <= 1) {
    steps.push({ snapshot: snapshot(arr, [], range(0, n)), hint: "已有序" });
    return steps;
  }

  steps.push({ snapshot: snapshot(arr, [0], [0]), hint: "首元素视为已有序" });

  for (let i = 1; i < n; i++) {
    const sortedHead = range(0, i);
    const key = arr[i];
    steps.push({
      snapshot: snapshot(arr, [i], sortedHead, [], { i, key: i }),
      hint: `取出 key = A[${i}] = ${key}`,
    });

    let j = i - 1;
    while (j >= 0 && compareValues(arr[j], key) > 0) {
      steps.push({
        snapshot: snapshot(arr, [j, j + 1], sortedHead, [], { i, j }),
        hint: `比较 A[${j}] 与 key`,
      });
      arr[j + 1] = arr[j];
      steps.push({
        snapshot: snapshot(arr, [j, j + 1], sortedHead, [j, j + 1], { i, j }),
        hint: `A[${j}] 右移到 A[${j + 1}]`,
      });
      j -= 1;
    }
    arr[j + 1] = key;
    steps.push({
      snapshot: snapshot(arr, [j + 1], range(0, i + 1), [], { i, j: j + 1 }),
      hint: `key 落位至 A[${j + 1}]`,
    });
  }

  steps.push({ snapshot: snapshot(arr, [], range(0, n)), hint: "排序完成" });
  return steps;
}
