import { describe, expect, it } from "vitest";
import type { PlaybookScript } from "../types";
import { resolveScript } from "./useResolvedScript";

function script(): PlaybookScript {
  return {
    fps: 30,
    total_frames: 60,
    domain: "math",
    title: "参数直线",
    summary: "Shows a parameterized line",
    parameter_controls: [{ id: "a", label: "斜率 a", value: "1" }],
    steps: [
      {
        step_id: "s1",
        end_frame: 60,
        title: "画直线",
        voiceover_text: "观察斜率变化",
        tokens: [],
        snapshot: {
          kind: "math_plot",
          curves: [{ expression: "a*x", label: "f(x)", emphasis: "primary" }],
          x_min: -2,
          x_max: 2,
          x_label: "x",
          y_label: "y",
        },
      },
    ],
  };
}

describe("useResolvedScript", () => {
  it("applies math params to math_plot snapshots", () => {
    const resolved = resolveScript(script(), { mathParams: { a: 3 } });
    expect(resolved.steps[0]?.snapshot.kind).toBe("math_plot");
    expect(resolved.steps[0]?.snapshot.kind === "math_plot" ? resolved.steps[0].snapshot.params : null).toEqual({ a: 3 });
  });
});
