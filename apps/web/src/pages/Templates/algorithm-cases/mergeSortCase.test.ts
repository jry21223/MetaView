import { describe, expect, it } from "vitest";

import type { AlgorithmBarsSnapshot } from "../../../features/playbook/engine/types";
import {
  MERGE_SORT_CODE,
  MERGE_SORT_PREVIEW_CASE,
  MERGE_SORT_SORTED,
  MERGE_SORT_VALUES,
  barsSnapshot,
  buildMergeSortBeats,
  buildMergeSortFollowups,
  buildMergeSortScript,
  mergeRangeSteps,
  resolveMergeSortOrder,
} from "./mergeSortCase";

function asBars(snapshot: unknown): AlgorithmBarsSnapshot {
  expect(snapshot).toMatchObject({ kind: "algorithm_bars" });
  return snapshot as AlgorithmBarsSnapshot;
}

describe("mergeSortCase", () => {
  it("publishes a complete deterministic Playbook with step-aware follow-ups", () => {
    const item = MERGE_SORT_PREVIEW_CASE;
    expect(item.id).toBe("merge-sort");
    expect(item.templateId).toBe("merge-sort");

    const script = item.buildScript(item.defaultParams);
    const followups = item.buildFollowups(item.defaultParams, script);

    expect(script.schema_version).toBe("2.0.0");
    expect(script.fps).toBe(30);
    expect(script.algorithm_id).toBe("merge_sort");
    expect(script.steps.length).toBeGreaterThanOrEqual(5);
    expect(script.steps.length).toBeLessThanOrEqual(16);
    expect(script.total_frames).toBe(script.steps.at(-1)?.end_frame);
    expect(new Set(script.steps.map((step) => step.step_id)).size).toBe(script.steps.length);
    expect(
      new Set(script.steps.map((step) => JSON.stringify(step.snapshot))).size,
    ).toBeGreaterThanOrEqual(5);

    for (const step of script.steps) {
      expect(followups[step.step_id]?.length).toBeGreaterThanOrEqual(3);
      expect(step.end_frame).toBeGreaterThan(0);
      expect(step.code_highlight).toBeTruthy();
      if (!step.code_highlight) continue;
      expect(step.code_highlight.lines).toEqual([...MERGE_SORT_CODE]);
      expect(step.code_highlight.active_line).toBeGreaterThanOrEqual(0);
      expect(step.code_highlight.active_line).toBeLessThan(step.code_highlight.lines.length);
      for (const line of step.code_highlight.active_lines) {
        expect(line).toBeGreaterThanOrEqual(0);
        expect(line).toBeLessThan(step.code_highlight.lines.length);
      }
      expect(step.snapshot.kind).toBe("algorithm_bars");
    }
  });

  it("ends with the fully sorted catalog array", () => {
    const script = buildMergeSortScript({ order: "ascending" });
    const result = script.steps.find((step) => step.step_id === "merge-result");
    const complexity = script.steps.find((step) => step.step_id === "merge-complexity");
    const resultBars = asBars(result?.snapshot);
    const complexityBars = asBars(complexity?.snapshot);

    expect(resultBars.numeric_values).toEqual([...MERGE_SORT_SORTED]);
    expect(resultBars.sorted_indices).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(complexityBars.numeric_values).toEqual([...MERGE_SORT_SORTED]);
    expect(script.steps.at(-1)?.step_id).toBe("merge-complexity");
    expect(script.steps.at(-1)?.voiceover_text).toContain("O(n log n)");
  });

  it("changes active and sorted indices across intermediate merge steps", () => {
    const script = buildMergeSortScript({});
    const mergeSteps = script.steps.filter((step) =>
      step.step_id.startsWith("merge-pair")
      || step.step_id.startsWith("merge-left")
      || step.step_id.startsWith("merge-right")
      || step.step_id.startsWith("merge-final"),
    );

    expect(mergeSteps.length).toBeGreaterThanOrEqual(4);

    const signatures = mergeSteps.map((step) => {
      const bars = asBars(step.snapshot);
      return JSON.stringify({
        active: bars.active_indices,
        sorted: bars.sorted_indices,
        values: bars.numeric_values,
      });
    });
    expect(new Set(signatures).size).toBeGreaterThanOrEqual(4);

    const firstPair = asBars(
      script.steps.find((step) => step.step_id === "merge-pair-02")?.snapshot,
    );
    const leftDone = asBars(
      script.steps.find((step) => step.step_id === "merge-left-done")?.snapshot,
    );
    expect(firstPair.active_indices).toEqual([0, 1]);
    expect(firstPair.sorted_indices).toEqual([0, 1]);
    expect(leftDone.numeric_values.slice(0, 4)).toEqual([1, 2, 5, 8]);
    expect(leftDone.sorted_indices).toEqual([0, 1, 2, 3]);
  });

  it("keeps active_line within code bounds on every beat", () => {
    for (const beat of buildMergeSortBeats()) {
      expect(beat.active_line).toBeGreaterThanOrEqual(0);
      expect(beat.active_line).toBeLessThan(MERGE_SORT_CODE.length);
      for (const line of beat.active_lines) {
        expect(line).toBeGreaterThanOrEqual(0);
        expect(line).toBeLessThan(MERGE_SORT_CODE.length);
      }
    }
  });

  it("merges two sorted halves correctly via mergeRangeSteps", () => {
    const source = [1, 2, 5, 8, 3, 4, 7, 9];
    const frames = mergeRangeSteps(source, 0, 4, 8);
    expect(frames.at(-1)).toEqual([...MERGE_SORT_SORTED]);
    expect(frames[0]?.[0]).toBe(1);
    expect(frames.length).toBe(8);
  });

  it("builds bars snapshots and resolves the order control", () => {
    const snap = barsSnapshot(MERGE_SORT_VALUES, {
      active: [1],
      sorted: [0],
      pointers: { mid: 4 },
    });
    expect(snap.kind).toBe("algorithm_bars");
    expect(snap.array_values).toEqual(MERGE_SORT_VALUES.map(String));
    expect(snap.pointers.mid).toBe(4);
    expect(resolveMergeSortOrder({ order: "ascending" })).toBe("ascending");
    expect(resolveMergeSortOrder({ order: "descending" })).toBe("ascending");
    expect(resolveMergeSortOrder({})).toBe("ascending");
  });

  it("exposes follow-ups for every generated step id", () => {
    const script = buildMergeSortScript({ order: "ascending" });
    const followups = buildMergeSortFollowups({ order: "ascending" }, script);
    for (const step of script.steps) {
      expect(followups[step.step_id]).toHaveLength(3);
    }
  });

  it("starts from the catalog prompt array", () => {
    const script = buildMergeSortScript({});
    const intro = asBars(script.steps[0]?.snapshot);
    expect(intro.numeric_values).toEqual([...MERGE_SORT_VALUES]);
    expect(script.initial_data?.array).toEqual(MERGE_SORT_VALUES.map(String));
  });
});
