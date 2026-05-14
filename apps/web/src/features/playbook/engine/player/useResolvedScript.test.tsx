import { describe, expect, it } from "vitest";
import type { MathPlotSnapshot, PlaybookScript } from "../types";
import { applyMathPlotOverride, resolveScript } from "./useResolvedScript";

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

describe("applyMathPlotOverride", () => {
  it("returns the base script unchanged when override is undefined", () => {
    const base = script();
    const result = applyMathPlotOverride(base, undefined);
    expect(result).toBe(base);
  });

  it("returns the base script unchanged when override is an empty object", () => {
    const base = script();
    const result = applyMathPlotOverride(base, {});
    expect(result).toBe(base);
  });

  it("overwrites curves on every math_plot step", () => {
    const result = applyMathPlotOverride(script(), {
      curves: [{ expression: "x^2", label: "f(x)", emphasis: "primary" }],
    });
    const snap = result.steps[0].snapshot as MathPlotSnapshot;
    expect(snap.curves[0].expression).toBe("x^2");
  });

  it("merges params into snapshot params (preserving existing keys)", () => {
    const base = script();
    base.steps[0].snapshot = { ...(base.steps[0].snapshot as MathPlotSnapshot), params: { a: 1 } };
    const result = applyMathPlotOverride(base, { params: { b: 2 } });
    const snap = result.steps[0].snapshot as MathPlotSnapshot;
    expect(snap.params).toEqual({ a: 1, b: 2 });
  });

  it("propagates x/y range, marker_x, and formula_latex changes", () => {
    const result = applyMathPlotOverride(script(), {
      x_min: -10,
      x_max: 10,
      y_min: null,
      y_max: 5,
      marker_x: 0.5,
      formula_latex: "f(x)=2x",
    });
    const snap = result.steps[0].snapshot as MathPlotSnapshot;
    expect(snap.x_min).toBe(-10);
    expect(snap.x_max).toBe(10);
    expect(snap.y_min).toBe(null);
    expect(snap.y_max).toBe(5);
    expect(snap.marker_x).toBe(0.5);
    expect(snap.formula_latex).toBe("f(x)=2x");
  });

  it("leaves non-math_plot snapshots untouched", () => {
    const base = script();
    base.steps[0].snapshot = {
      kind: "math_formula",
      formula_latex: "f(x)=x",
      caption: "intro",
    };
    const result = applyMathPlotOverride(base, {
      curves: [{ expression: "x^2", label: "f", emphasis: "primary" }],
    });
    // Same reference because no math_plot step needed updating.
    expect(result).toBe(base);
  });
});
