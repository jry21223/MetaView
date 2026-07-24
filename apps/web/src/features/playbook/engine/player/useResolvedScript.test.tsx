import { describe, expect, it } from "vitest";
import type {
  AlgorithmArraySnapshot,
  AlgorithmBarsSnapshot,
  MathSceneSnapshot,
  MathPlotSnapshot,
  PlaybookScript,
} from "../types";
import {
  applyMathPlotOverride,
  coerceToBarValues,
  resolveScript,
} from "./useResolvedScript";

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
  it("injects parameter control defaults before the first interaction", () => {
    const resolved = resolveScript(script(), {});
    const snap = resolved.steps[0]?.snapshot as MathPlotSnapshot;

    expect(snap.params).toEqual({ a: 1 });
  });

  it("applies math params to math_plot snapshots", () => {
    const resolved = resolveScript(script(), { mathParams: { a: 3 } });
    expect(resolved.steps[0]?.snapshot.kind).toBe("math_plot");
    expect(resolved.steps[0]?.snapshot.kind === "math_plot" ? resolved.steps[0].snapshot.params : null).toEqual({ a: 3 });
  });

  it("applies math params to math_scene snapshots", () => {
    const base = script();
    base.steps[0].snapshot = {
      kind: "math_scene",
      x_min: -2,
      x_max: 2,
      y_min: -2,
      y_max: 2,
      x_label: "x",
      y_label: "y",
      curves: [{ expression_y: "a*sin(x)", label: "wave" }],
      params: { b: 2 },
    };

    const resolved = resolveScript(base, { mathParams: { a: 3 } });
    const snap = resolved.steps[0].snapshot as MathSceneSnapshot;
    expect(snap.params).toEqual({ b: 2, a: 3 });
  });

  it("restores parameter defaults when overrides are reset", () => {
    const resolved = resolveScript(script(), { mathParams: undefined });
    const snap = resolved.steps[0]?.snapshot as MathPlotSnapshot;

    expect(snap.params).toEqual({ a: 1 });
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

describe("coerceToBarValues (issue #41)", () => {
  function arraySnap(values: string[]): AlgorithmArraySnapshot {
    return {
      kind: "algorithm_array",
      array_values: values,
      active_indices: [],
      swap_indices: [],
      sorted_indices: [],
      pointers: {},
    };
  }

  function barsSnap(values: number[]): AlgorithmBarsSnapshot {
    return {
      kind: "algorithm_bars",
      array_values: values.map(String),
      numeric_values: values,
      active_indices: [],
      swap_indices: [],
      sorted_indices: [],
      pointers: {},
    };
  }

  it("returns numeric_values verbatim when the snapshot is already algorithm_bars", () => {
    expect(coerceToBarValues(barsSnap([3, 1, 4]))).toEqual([3, 1, 4]);
  });

  it("parses numeric strings to numbers for algorithm_array snapshots", () => {
    expect(coerceToBarValues(arraySnap(["5", "3", "8", "1"]))).toEqual([5, 3, 8, 1]);
  });

  it("returns null when any element fails to parse (would have been NaN)", () => {
    expect(coerceToBarValues(arraySnap(["5", "x", "8"]))).toBeNull();
    expect(coerceToBarValues(arraySnap(["N/A", "1"]))).toBeNull();
    expect(coerceToBarValues(arraySnap(["", "1"]))).toEqual([0, 1]); // "" → 0 is Number's well-defined behavior
  });

  it("treats Infinity-producing strings as invalid (Number.isFinite check)", () => {
    expect(coerceToBarValues(arraySnap(["Infinity", "1"]))).toBeNull();
  });

  it("handles an empty array without producing NaN", () => {
    expect(coerceToBarValues(arraySnap([]))).toEqual([]);
  });
});
