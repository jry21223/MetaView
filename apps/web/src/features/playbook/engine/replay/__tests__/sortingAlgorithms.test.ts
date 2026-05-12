import { describe, expect, it } from "vitest";
import type { AlgorithmReplay } from "../types";
import { bubbleSort } from "../algorithms/bubbleSort";
import { quickSort } from "../algorithms/quickSort";
import { selectionSort } from "../algorithms/selectionSort";
import { insertionSort } from "../algorithms/insertionSort";
import { mergeSort } from "../mergeSort";

const numericSort = (a: string, b: string): number => Number(a) - Number(b);

const CASES: Array<[label: string, input: string[]]> = [
  ["empty", []],
  ["single", ["5"]],
  ["sorted", ["1", "2", "3", "4", "5"]],
  ["reverse", ["5", "4", "3", "2", "1"]],
  ["duplicates", ["3", "1", "3", "2", "3"]],
  ["mixed", ["8", "3", "1", "9", "4", "7", "2", "6", "5"]],
  ["two-elements-equal", ["7", "7"]],
];

const ALGORITHMS: Array<[string, AlgorithmReplay]> = [
  ["bubbleSort", bubbleSort],
  ["quickSort", quickSort],
  ["selectionSort", selectionSort],
  ["insertionSort", insertionSort],
  ["mergeSort", mergeSort],
];

describe.each(ALGORITHMS)("%s replay", (name, sort) => {
  it.each(CASES)("produces correct final sorted state — %s", (_label, input) => {
    const steps = sort([...input]);
    expect(steps.length).toBeGreaterThan(0);
    const final = steps[steps.length - 1].snapshot.array_values;
    const expected = [...input].sort(numericSort);
    expect(final).toEqual(expected);
  });

  it.each(CASES)("final step marks every index as sorted — %s", (_label, input) => {
    const steps = sort([...input]);
    const lastSnap = steps[steps.length - 1].snapshot;
    expect(lastSnap.sorted_indices).toEqual(
      Array.from({ length: input.length }, (_, i) => i),
    );
  });

  it.each(CASES)("never reports an index outside the array — %s", (_label, input) => {
    const steps = sort([...input]);
    const n = input.length;
    for (const step of steps) {
      const s = step.snapshot;
      for (const idx of [...s.active_indices, ...s.swap_indices, ...s.sorted_indices]) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(n);
      }
      expect(s.array_values).toHaveLength(n);
    }
  });

  it.each(CASES)("sorted_indices only grows over time — %s", (_label, input) => {
    const steps = sort([...input]);
    let lastSet = new Set<number>();
    for (const step of steps) {
      const current = new Set(step.snapshot.sorted_indices);
      for (const idx of lastSet) {
        expect(current.has(idx)).toBe(true);
      }
      lastSet = current;
    }
  });

  it.each(CASES)("sorted_indices is always ascending — %s (#35)", (_label, input) => {
    const steps = sort([...input]);
    for (const step of steps) {
      const idxs = step.snapshot.sorted_indices;
      for (let i = 1; i < idxs.length; i++) {
        expect(idxs[i]).toBeGreaterThan(idxs[i - 1]);
      }
    }
  });

  it(`${name}: does not mutate the caller's input array`, () => {
    const input = ["3", "1", "2"];
    const snapshot = [...input];
    sort(input);
    expect(input).toEqual(snapshot);
  });
});

describe("bubbleSort step semantics", () => {
  it("emits a swap step with both swap_indices when a swap happens", () => {
    const steps = bubbleSort(["2", "1"]);
    const swapStep = steps.find((s) => s.snapshot.swap_indices.length === 2);
    expect(swapStep).toBeDefined();
    expect(swapStep!.snapshot.swap_indices).toEqual([0, 1]);
  });

  it("does NOT emit a swap step when input is already ordered pairwise", () => {
    const steps = bubbleSort(["1", "2"]);
    const swapSteps = steps.filter((s) => s.snapshot.swap_indices.length > 0);
    expect(swapSteps).toHaveLength(0);
  });
});

describe("quickSort step semantics", () => {
  it("marks pivot as active when chosen", () => {
    const steps = quickSort(["3", "1", "2"]);
    // first non-initial step should highlight the pivot (index hi = 2)
    const pivotStep = steps.find((s) => s.hint?.startsWith("选定 pivot"));
    expect(pivotStep).toBeDefined();
    expect(pivotStep!.snapshot.active_indices).toEqual([2]);
  });
});

describe("insertionSort step semantics", () => {
  it("emits a key-extraction hint for each non-leading index", () => {
    const steps = insertionSort(["3", "1", "2"]);
    const keyHints = steps.filter((s) => s.hint?.startsWith("取出 key"));
    expect(keyHints.length).toBe(2);
  });
});

describe("selectionSort step semantics", () => {
  it("performs a swap when min isn't already at position i", () => {
    const steps = selectionSort(["3", "1", "2"]);
    const swapStep = steps.find((s) => s.snapshot.swap_indices.length === 2);
    expect(swapStep).toBeDefined();
    expect(swapStep!.snapshot.swap_indices).toEqual([0, 1]);
  });
});
