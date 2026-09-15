import { describe, expect, it } from "vitest";

import type { AlgorithmBarsSnapshot } from "../../../features/playbook/engine/types";
import {
  MONOTONIC_STACK_PRESETS,
  MONOTONIC_STACK_PREVIEW_CASE,
  buildMonotonicStackScript,
  monotonicStackTrace,
  resolveMonotonicPreset,
} from "./monotonicStackCase";
import { expectDeterministicCase } from "./testing/expectDeterministicCase";

const PARAM_MATRIX = MONOTONIC_STACK_PRESETS.map((preset) => ({ preset: preset.id }));

function asBars(snapshot: unknown): AlgorithmBarsSnapshot {
  expect(snapshot).toMatchObject({ kind: "algorithm_bars" });
  return snapshot as AlgorithmBarsSnapshot;
}

describe("monotonicStackCase", () => {
  it("holds the shared preview-case invariants for every preset", () => {
    expectDeterministicCase(MONOTONIC_STACK_PREVIEW_CASE, PARAM_MATRIX);
  });

  it("computes next-greater answers with a decreasing index stack", () => {
    const mixed = monotonicStackTrace([4, 2, 5, 1, 3, 6]);
    expect(mixed.at(-1)?.answer).toEqual([5, 5, 6, 3, 6, -1]);
    expect(mixed.map((frame) => frame.popped)).toEqual([[], [], [1, 0], [], [3], [4, 2]]);
    expect(mixed.at(-1)?.stack).toEqual([5]);

    const descending = monotonicStackTrace([6, 5, 4, 3, 2, 1]);
    expect(descending.at(-1)?.answer).toEqual([-1, -1, -1, -1, -1, -1]);
    expect(descending.at(-1)?.stack).toEqual([0, 1, 2, 3, 4, 5]);

    const ascending = monotonicStackTrace([1, 2, 3, 4, 5, 6]);
    expect(ascending.at(-1)?.answer).toEqual([2, 3, 4, 5, 6, -1]);
    expect(ascending.every((frame) => frame.stack.length === 1)).toBe(true);
  });

  it("builds a default bars script with a stack lane and an answer lane", () => {
    const script = buildMonotonicStackScript(MONOTONIC_STACK_PREVIEW_CASE.defaultParams);

    expect(script.algorithm_id).toBe("monotonic_stack_next_greater");
    expect(script.steps).toHaveLength(8);

    for (const step of script.steps) {
      const snapshot = asBars(step.snapshot);
      expect(snapshot.numeric_values).toEqual([4, 2, 5, 1, 3, 6]);
      expect(snapshot.auxiliary_lanes?.map((lane) => lane.role)).toEqual(["stack", "result"]);
      expect(snapshot.auxiliary_lanes?.[1]?.items).toHaveLength(6);
    }

    const doublePop = asBars(script.steps.find((step) => step.step_id === "monotonic-visit-2")?.snapshot);
    expect(doublePop.pointers).toEqual({ i: 2 });
    expect(doublePop.element_states).toEqual({ 2: ["entering"] });
    // Bars whose answer is known stay settled from now on.
    expect(doublePop.sorted_indices).toEqual([0, 1]);
    const afterFour = asBars(script.steps.find((step) => step.step_id === "monotonic-visit-4")?.snapshot);
    expect(afterFour.sorted_indices).toEqual([0, 1, 3]);
    expect(doublePop.auxiliary_lanes?.[0]?.items.map((item) => item.index)).toEqual([2]);
    expect(doublePop.auxiliary_lanes?.[1]?.items.map((item) => item.label)).toEqual(["5", "5", "?", "?", "?", "?"]);
    expect(doublePop.auxiliary_lanes?.[1]?.items.slice(0, 2).every((item) => item.emphasis === "accent")).toBe(true);

    const result = asBars(script.steps.at(-1)?.snapshot);
    expect(result.pointers).toEqual({});
    expect(result.auxiliary_lanes?.[1]?.items.map((item) => item.label)).toEqual(["5", "5", "6", "3", "6", "-1"]);
    expect(result.sorted_indices).toEqual([0, 1, 2, 3, 4, 5]);
    expect(script.steps.at(-1)?.voiceover_text).toContain("[5, 5, 6, 3, 6, -1]");
  });

  it("distinguishes the stack-only-grows and pop-every-step presets", () => {
    const descending = buildMonotonicStackScript({ preset: "descending" });
    expect(descending.steps.slice(1, -1).every((step) => step.title.includes("直接入栈"))).toBe(true);
    expect(asBars(descending.steps.at(-1)?.snapshot).auxiliary_lanes?.[0]?.items).toHaveLength(6);

    const ascending = buildMonotonicStackScript({ preset: "ascending" });
    expect(ascending.steps.slice(2, -1).every((step) => step.title.includes("弹出 1 个"))).toBe(true);
    expect(asBars(ascending.steps.at(-1)?.snapshot).auxiliary_lanes?.[0]?.items).toHaveLength(1);
  });

  it("clamps unknown presets to the mixed default", () => {
    expect(resolveMonotonicPreset({})).toBe("mixed");
    expect(resolveMonotonicPreset({ preset: "zigzag" })).toBe("mixed");
    expect(buildMonotonicStackScript({ preset: "zigzag" }).parameter_controls[0]?.value).toBe("mixed");
  });

  it("exposes a preview case wired to the pure builders", () => {
    expect(MONOTONIC_STACK_PREVIEW_CASE.id).toBe("monotonic-stack");
    expect(MONOTONIC_STACK_PREVIEW_CASE.controls[0]?.id).toBe("preset");
  });
});
