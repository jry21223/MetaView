import { describe, expect, it } from "vitest";

import { visualQualityGate } from "../../../features/playbook/engine/assets/visualQualityGate";
import {
  QUICK_SORT_PREVIEW_CASE,
  QUICK_SORT_VALUES,
  buildQuickSortFollowups,
  buildQuickSortScript,
  buildQuickSortTrace,
  lomutoPartition,
  quickSortLomuto,
} from "./quickSortCase";

describe("quickSortCase helpers", () => {
  it("partitions the catalog sample with Lomuto last-element pivot", () => {
    const sample = [...QUICK_SORT_VALUES];
    expect(sample).toEqual([3, 6, 1, 8, 2, 5, 4, 7]);

    const { array, pivotIndex, pivotValue } = lomutoPartition(sample, 0, sample.length - 1);

    expect(pivotValue).toBe(7);
    expect(pivotIndex).toBe(6);
    expect(array[pivotIndex]).toBe(7);
    expect(array).toEqual([3, 6, 1, 2, 5, 4, 7, 8]);

    for (let idx = 0; idx < pivotIndex; idx++) {
      expect(array[idx]!).toBeLessThanOrEqual(pivotValue);
    }
    for (let idx = pivotIndex + 1; idx < array.length; idx++) {
      expect(array[idx]!).toBeGreaterThan(pivotValue);
    }
  });

  it("keeps the partition invariant on arbitrary subranges", () => {
    const base = [9, 1, 4, 7, 3, 8, 2, 6];
    const lo = 1;
    const hi = 6;
    const { array, pivotIndex, pivotValue } = lomutoPartition(base, lo, hi);

    expect(array[pivotIndex]).toBe(pivotValue);
    expect(pivotValue).toBe(base[hi]);
    for (let idx = lo; idx < pivotIndex; idx++) {
      expect(array[idx]!).toBeLessThanOrEqual(pivotValue);
    }
    for (let idx = pivotIndex + 1; idx <= hi; idx++) {
      expect(array[idx]!).toBeGreaterThan(pivotValue);
    }
    // Outside the range stays untouched.
    expect(array[0]).toBe(base[0]);
    expect(array[7]).toBe(base[7]);
  });

  it("sorts the catalog array to ascending order", () => {
    expect(quickSortLomuto(QUICK_SORT_VALUES)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("emits a FIFO trace that places the first pivot at index 6", () => {
    const trace = buildQuickSortTrace(QUICK_SORT_VALUES);
    const firstPlace = trace.find(
      (event) => event.kind === "place_pivot" && event.partitionId === 0,
    );
    expect(firstPlace).toBeDefined();
    expect(firstPlace?.pivotIndex).toBe(6);
    expect(firstPlace?.pivotValue).toBe(7);
    expect(firstPlace?.array).toEqual([3, 6, 1, 2, 5, 4, 7, 8]);
    expect(trace.at(-1)?.kind).toBe("done");
    expect(trace.at(-1)?.array).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("quickSortCase playbook", () => {
  it("exports the catalog case id quick-sort", () => {
    expect(QUICK_SORT_PREVIEW_CASE.id).toBe("quick-sort");
    expect(QUICK_SORT_PREVIEW_CASE.templateId).toBe("quick-sort");
    // v1 exposes no pivot-strategy control: a single-option select is not a
    // real parameter, so the case ships without user-facing controls.
    expect(QUICK_SORT_PREVIEW_CASE.defaultParams).toEqual({});
    expect(QUICK_SORT_PREVIEW_CASE.controls).toEqual([]);
  });

  it("builds a deterministic multi-step playbook with bars and code highlight", () => {
    const script = buildQuickSortScript({ pivotStrategy: "last" });
    const followups = buildQuickSortFollowups({ pivotStrategy: "last" }, script);

    expect(script.schema_version).toBe("2.0.0");
    expect(script.fps).toBe(30);
    expect(script.algorithm_id).toBe("quick_sort");
    expect(script.steps.length).toBeGreaterThanOrEqual(5);
    expect(script.total_frames).toBe(script.steps.at(-1)?.end_frame);

    const snapshotKeys = new Set(script.steps.map((step) => JSON.stringify(step.snapshot)));
    expect(snapshotKeys.size).toBeGreaterThanOrEqual(5);
    expect(new Set(script.steps.map((step) => step.step_id)).size).toBe(script.steps.length);

    for (const step of script.steps) {
      expect(step.snapshot.kind).toBe("algorithm_bars");
      expect(step.code_highlight).toBeTruthy();
      if (!step.code_highlight) continue;
      expect(step.code_highlight.active_line).toBeGreaterThanOrEqual(0);
      expect(step.code_highlight.active_line).toBeLessThan(step.code_highlight.lines.length);
      for (const line of step.code_highlight.active_lines) {
        expect(line).toBeGreaterThanOrEqual(0);
        expect(line).toBeLessThan(step.code_highlight.lines.length);
      }
      expect(followups[step.step_id]?.length).toBeGreaterThanOrEqual(3);
    }

    const result = script.steps.at(-1);
    expect(result?.step_id).toBe("quick-result");
    expect(result?.voiceover_text).toMatch(/O\(n log n\)/);
    expect(result?.voiceover_text).toMatch(/O\(n²\)|O\(n\^2\)/);
    if (result?.snapshot.kind === "algorithm_bars") {
      expect(result.snapshot.numeric_values).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(result.snapshot.sorted_indices).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    }

    const firstPlace = script.steps.find((step) => step.step_id === "quick-place-1");
    expect(firstPlace).toBeTruthy();
    if (firstPlace?.snapshot.kind === "algorithm_bars") {
      expect(firstPlace.snapshot.numeric_values[6]).toBe(7);
      expect(firstPlace.snapshot.sorted_indices).toContain(6);
      expect(firstPlace.snapshot.pointers.pivot).toBe(6);
    }

    const firstPartition = script.steps.find((step) => step.step_id === "quick-pivot-1");
    if (firstPartition?.snapshot.kind === "algorithm_bars") {
      expect(firstPartition.snapshot.ranges).toEqual([{
        id: "active-partition",
        start: 0,
        end: 7,
        role: "partition",
        label: "partition [0, 7]",
        emphasis: "primary",
      }]);
    }
  });

  it("keeps every teaching step visually focused", () => {
    const script = buildQuickSortScript({ pivotStrategy: "last" });

    expect(visualQualityGate(script)).toEqual([]);
  });

  it("falls back to last when pivotStrategy is unsupported", () => {
    const script = buildQuickSortScript({ pivotStrategy: "median" });
    expect(script.parameter_controls).toEqual([]);
    expect(script.initial_data?.pivotStrategy).toEqual(["last"]);
    const again = buildQuickSortScript({ pivotStrategy: "last" });
    expect(script.steps.map((step) => step.step_id)).toEqual(
      again.steps.map((step) => step.step_id),
    );
  });

  it("keeps preview case builders pure across repeated calls", () => {
    const a = QUICK_SORT_PREVIEW_CASE.buildScript(QUICK_SORT_PREVIEW_CASE.defaultParams);
    const b = QUICK_SORT_PREVIEW_CASE.buildScript(QUICK_SORT_PREVIEW_CASE.defaultParams);
    expect(a).toEqual(b);
    const fa = QUICK_SORT_PREVIEW_CASE.buildFollowups(QUICK_SORT_PREVIEW_CASE.defaultParams, a);
    const fb = QUICK_SORT_PREVIEW_CASE.buildFollowups(QUICK_SORT_PREVIEW_CASE.defaultParams, b);
    expect(fa).toEqual(fb);
  });
});
