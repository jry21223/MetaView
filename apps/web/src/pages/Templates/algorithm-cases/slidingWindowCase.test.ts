import { describe, expect, it } from "vitest";

import {
  SLIDING_WINDOW_PREVIEW_CASE,
  SLIDING_WINDOW_SIZES,
  SLIDING_WINDOW_VALUES,
  buildSlidingWindowScript,
  resolveWindowSize,
  slidingWindowTrace,
} from "./slidingWindowCase";
import { expectDeterministicCase } from "./testing/expectDeterministicCase";

const PARAM_MATRIX = SLIDING_WINDOW_SIZES.map((windowSize) => ({ windowSize }));

describe("slidingWindowCase", () => {
  it("holds the shared preview-case invariants for every window size", () => {
    expectDeterministicCase(SLIDING_WINDOW_PREVIEW_CASE, PARAM_MATRIX);
  });

  it("draws indexed cells, a window range and the deque / result lanes", () => {
    const script = buildSlidingWindowScript(SLIDING_WINDOW_PREVIEW_CASE.defaultParams);

    expect(script.algorithm_id).toBe("sliding_window_maximum");
    expect(script.parameter_controls.some((control) => control.id === "windowSize")).toBe(true);

    for (const step of script.steps) {
      expect(step.snapshot.kind).toBe("algorithm_array");
      if (step.snapshot.kind !== "algorithm_array") continue;
      expect(step.snapshot.array_values).toEqual(SLIDING_WINDOW_VALUES.map(String));
      // Nothing is ever "sorted" here; the window is a shared range overlay.
      expect(step.snapshot.sorted_indices).toEqual([]);
      expect(step.snapshot.ranges).toEqual([
        expect.objectContaining({ id: "active-window", role: "window" }),
      ]);
      expect(step.snapshot.auxiliary_lanes?.map((lane) => lane.role)).toEqual([
        "deque",
        "result",
      ]);
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
  });
});
