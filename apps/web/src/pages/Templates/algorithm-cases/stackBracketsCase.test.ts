import { describe, expect, it } from "vitest";

import { visualQualityGate } from "../../../features/playbook/engine/assets/visualQualityGate";
import type { AlgorithmArraySnapshot } from "../../../features/playbook/engine/types";
import {
  STACK_BRACKETS_PREVIEW_CASE,
  STACK_BRACKET_PRESETS,
  buildStackBracketsFollowups,
  buildStackBracketsScript,
  resolveBracketPreset,
  stackBracketTrace,
} from "./stackBracketsCase";

function asArray(snapshot: unknown): AlgorithmArraySnapshot {
  expect(snapshot).toMatchObject({ kind: "algorithm_array" });
  return snapshot as AlgorithmArraySnapshot;
}

describe("stackBracketsCase", () => {
  it("traces every preset to the verdict the code would return", () => {
    expect(stackBracketTrace("{[()]}").verdict).toBe("valid");
    expect(stackBracketTrace("()[]{}").verdict).toBe("valid");
    expect(stackBracketTrace("([)]").verdict).toBe("mismatch");
    expect(stackBracketTrace("(()").verdict).toBe("unclosed");
    expect(stackBracketTrace("())").verdict).toBe("underflow");

    const nested = stackBracketTrace("{[()]}");
    expect(nested.events.map((event) => event.kind)).toEqual(["push", "push", "push", "pop", "pop", "pop"]);
    expect(nested.events.at(-1)?.pairs).toEqual([[2, 3], [1, 4], [0, 5]]);

    const crossed = stackBracketTrace("([)]");
    expect(crossed.events).toHaveLength(3);
    expect(crossed.events.at(-1)).toMatchObject({ kind: "mismatch", index: 2, partnerIndex: 1 });
  });

  it("builds a default script with a scan cursor, a stack lane and a matched-pair lane", () => {
    const script = buildStackBracketsScript(STACK_BRACKETS_PREVIEW_CASE.defaultParams);

    expect(script.schema_version).toBe("2.0.0");
    expect(script.algorithm_id).toBe("stack_bracket_matching");
    expect(script.steps).toHaveLength(8);
    expect(script.total_frames).toBe(script.steps.at(-1)?.end_frame);
    expect(new Set(script.steps.map((step) => step.step_id)).size).toBe(script.steps.length);
    expect(new Set(script.steps.map((step) => JSON.stringify(step.snapshot))).size).toBe(script.steps.length);

    for (const step of script.steps) {
      const snapshot = asArray(step.snapshot);
      expect(snapshot.array_values).toEqual([..."{[()]}"]);
      expect(snapshot.sorted_indices).toEqual([]);
      expect(snapshot.swap_indices).toEqual([]);
      expect(snapshot.auxiliary_lanes?.map((lane) => lane.role)).toEqual(["stack", "result"]);
      expect(step.code_highlight?.active_line).toBeLessThan(step.code_highlight!.lines.length);
    }

    const deepest = asArray(script.steps.find((step) => step.step_id === "bracket-read-2")?.snapshot);
    expect(deepest.auxiliary_lanes?.[0]?.items.map((item) => item.label)).toEqual(["{", "[", "("]);
    expect(deepest.pointers).toEqual({ i: 2 });

    const firstPop = asArray(script.steps.find((step) => step.step_id === "bracket-read-3")?.snapshot);
    expect(firstPop.ranges).toEqual([
      expect.objectContaining({ id: "scan-range", role: "search_range", start: 4, end: 5 }),
      expect.objectContaining({ id: "matched-pair", role: "current_subarray", start: 2, end: 3 }),
    ]);
    expect(firstPop.element_states).toEqual({ 2: ["leaving"] });
    expect(firstPop.auxiliary_lanes?.[1]?.items.map((item) => item.label)).toEqual(["()"]);

    const result = asArray(script.steps.at(-1)?.snapshot);
    expect(result.auxiliary_lanes?.[0]?.items).toEqual([]);
    expect(script.steps.at(-1)?.title).toBe("栈为空，表达式合法");
  });

  it("keeps every step visually focused", () => {
    for (const preset of STACK_BRACKET_PRESETS) {
      expect(visualQualityGate(buildStackBracketsScript({ expression: preset.id }))).toEqual([]);
    }
  });

  it("stops early on a mismatch and reports leftovers when unclosed", () => {
    const crossed = buildStackBracketsScript({ expression: "crossed" });
    expect(crossed.steps.map((step) => step.step_id)).toEqual([
      "bracket-intro",
      "bracket-read-0",
      "bracket-read-1",
      "bracket-read-2",
      "bracket-result",
    ]);
    const mismatch = asArray(crossed.steps[3]?.snapshot);
    expect(mismatch.pointers).toEqual({ i: 2, top: 1 });
    expect(mismatch.auxiliary_lanes?.[0]?.items.at(-1)?.emphasis).toBe("accent");
    expect(crossed.steps.at(-1)?.title).toBe("提前返回 false");

    const unclosed = buildStackBracketsScript({ expression: "unclosed" });
    expect(unclosed.steps.at(-1)?.title).toBe("扫描结束但栈非空");
    expect(asArray(unclosed.steps.at(-1)?.snapshot).auxiliary_lanes?.[0]?.items.map((item) => item.label)).toEqual(["("]);

    const extra = buildStackBracketsScript({ expression: "extra-close" });
    expect(extra.steps.at(-1)?.voiceover_text).toContain("false");
    expect(extra.steps).toHaveLength(5);
  });

  it("covers every step with at least three follow-up questions for every preset", () => {
    for (const preset of STACK_BRACKET_PRESETS) {
      const params = { expression: preset.id };
      const script = buildStackBracketsScript(params);
      const followups = buildStackBracketsFollowups(params);
      expect(script.steps.length).toBeGreaterThanOrEqual(5);
      for (const step of script.steps) {
        expect(followups[step.step_id]?.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("clamps unknown presets to the nested default", () => {
    expect(resolveBracketPreset({})).toBe("nested");
    expect(resolveBracketPreset({ expression: "nope" })).toBe("nested");
    expect(resolveBracketPreset({ expression: "crossed" })).toBe("crossed");
    expect(buildStackBracketsScript({ expression: 42 }).parameter_controls[0]?.value).toBe("nested");
  });

  it("exposes a preview case wired to the pure builders", () => {
    expect(STACK_BRACKETS_PREVIEW_CASE.id).toBe("stack-brackets");
    expect(STACK_BRACKETS_PREVIEW_CASE.controls[0]?.id).toBe("expression");
    const script = STACK_BRACKETS_PREVIEW_CASE.buildScript(STACK_BRACKETS_PREVIEW_CASE.defaultParams);
    expect(STACK_BRACKETS_PREVIEW_CASE.posterFrame).toBeLessThan(script.total_frames);
  });
});
