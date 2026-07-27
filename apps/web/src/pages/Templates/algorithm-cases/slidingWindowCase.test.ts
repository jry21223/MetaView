import { describe, expect, it } from "vitest";

import { visualQualityGate } from "../../../features/playbook/engine/assets/visualQualityGate";
import {
  SLIDING_WINDOW_PREVIEW_CASE,
  SLIDING_WINDOW_VALUES,
  buildSlidingWindowFollowups,
  buildSlidingWindowScript,
  resolveWindowSize,
  slidingWindowTrace,
} from "./slidingWindowCase";

describe("slidingWindowCase", () => {
  it("builds a default script around indexed cells, a window range, and auxiliary lanes", () => {
    const script = buildSlidingWindowScript(SLIDING_WINDOW_PREVIEW_CASE.defaultParams);

    expect(script.schema_version).toBe("2.0.0");
    expect(script.fps).toBe(30);
    expect(script.steps.length).toBeGreaterThanOrEqual(5);
    expect(script.total_frames).toBe(script.steps.at(-1)?.end_frame);
    expect(new Set(script.steps.map((step) => step.step_id)).size).toBe(script.steps.length);

    const snapshotKeys = script.steps.map((step) => JSON.stringify(step.snapshot));
    expect(new Set(snapshotKeys).size).toBeGreaterThanOrEqual(5);

    for (const step of script.steps) {
      expect(step.snapshot.kind).toBe("algorithm_array");
      if (step.snapshot.kind !== "algorithm_array") continue;
      expect(step.snapshot.array_values).toEqual(SLIDING_WINDOW_VALUES.map(String));
      expect(step.snapshot.sorted_indices).toEqual([]);
      expect(step.snapshot.ranges).toEqual([
        expect.objectContaining({
          id: "active-window",
          role: "window",
        }),
      ]);
      expect(step.snapshot.auxiliary_lanes?.map((lane) => lane.role)).toEqual([
        "deque",
        "result",
      ]);
      expect(step.end_frame % 90).toBe(0);

      if (step.code_highlight) {
        expect(step.code_highlight.active_line).toBeGreaterThanOrEqual(0);
        expect(step.code_highlight.active_line).toBeLessThan(step.code_highlight.lines.length);
        for (const line of step.code_highlight.active_lines) {
          expect(line).toBeGreaterThanOrEqual(0);
          expect(line).toBeLessThan(step.code_highlight.lines.length);
        }
      }
    }

    expect(script.parameter_controls.some((control) => control.id === "windowSize")).toBe(true);
    expect(SLIDING_WINDOW_PREVIEW_CASE.posterFrame).toBeLessThan(script.total_frames);
  });

  it("keeps every teaching step visually focused", () => {
    const script = buildSlidingWindowScript(SLIDING_WINDOW_PREVIEW_CASE.defaultParams);

    expect(visualQualityGate(script)).toEqual([]);
  });

  it("covers every step with at least three follow-up questions", () => {
    const params = SLIDING_WINDOW_PREVIEW_CASE.defaultParams;
    const script = buildSlidingWindowScript(params);
    const followups = buildSlidingWindowFollowups(params);

    for (const step of script.steps) {
      expect(followups[step.step_id]?.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("recomputes the maxima sequence when windowSize changes", () => {
    const size2 = slidingWindowTrace(SLIDING_WINDOW_VALUES, 2).map((frame) => frame.maxValue);
    const size3 = slidingWindowTrace(SLIDING_WINDOW_VALUES, 3).map((frame) => frame.maxValue);
    const size4 = slidingWindowTrace(SLIDING_WINDOW_VALUES, 4).map((frame) => frame.maxValue);

    expect(size3).toEqual([3, 3, 5, 5, 6, 7]);
    expect(size2).toEqual([3, 3, -1, 5, 5, 6, 7]);
    expect(size4).toEqual([3, 5, 5, 6, 7]);
    expect(size2).not.toEqual(size3);
    expect(size3).not.toEqual(size4);

    const script2 = buildSlidingWindowScript({ windowSize: 2 });
    const script3 = buildSlidingWindowScript({ windowSize: 3 });
    const result2 = script2.steps.find((step) => step.step_id === "sliding-result");
    const result3 = script3.steps.find((step) => step.step_id === "sliding-result");

    expect(result2?.voiceover_text).toContain("[3, 3, -1, 5, 5, 6, 7]");
    expect(result3?.voiceover_text).toContain("[3, 3, 5, 5, 6, 7]");
    expect(script2.steps.length).not.toBe(script3.steps.length);
  });

  it("clamps invalid windowSize values to the supported set", () => {
    expect(resolveWindowSize({ windowSize: 3 })).toBe(3);
    expect(resolveWindowSize({ windowSize: "4" })).toBe(4);
    expect(resolveWindowSize({ windowSize: 99 })).toBe(3);
    expect(resolveWindowSize({})).toBe(3);

    const script = buildSlidingWindowScript({ windowSize: 99 });
    expect(script.parameter_controls[0]?.value).toBe("3");
  });

  it("exposes a preview case wired to the pure builders", () => {
    expect(SLIDING_WINDOW_PREVIEW_CASE.id).toBe("sliding-window");
    expect(SLIDING_WINDOW_PREVIEW_CASE.controls[0]?.id).toBe("windowSize");

    const script = SLIDING_WINDOW_PREVIEW_CASE.buildScript(
      SLIDING_WINDOW_PREVIEW_CASE.defaultParams,
    );
    const followups = SLIDING_WINDOW_PREVIEW_CASE.buildFollowups(
      SLIDING_WINDOW_PREVIEW_CASE.defaultParams,
      script,
    );

    expect(script.algorithm_id).toBe("sliding_window_maximum");
    expect(Object.keys(followups).length).toBe(script.steps.length);
  });
});
