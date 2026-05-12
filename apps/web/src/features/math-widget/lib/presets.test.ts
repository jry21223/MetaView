import { describe, expect, it } from "vitest";
import {
  MATH_WIDGET_PRESETS,
  getPreset,
  initialParams,
} from "./presets";
import { compileExpr } from "../../../shared/lib/mathExpr";

describe("math-widget presets", () => {
  it("ships at least four presets with unique ids", () => {
    expect(MATH_WIDGET_PRESETS.length).toBeGreaterThanOrEqual(4);
    const ids = MATH_WIDGET_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("getPreset resolves by id and returns undefined for unknown ids", () => {
    expect(getPreset(MATH_WIDGET_PRESETS[0].id)).toBe(MATH_WIDGET_PRESETS[0]);
    expect(getPreset("nope")).toBeUndefined();
  });

  it("initialParams covers every declared parameter", () => {
    for (const preset of MATH_WIDGET_PRESETS) {
      const p = initialParams(preset);
      for (const param of preset.params) {
        expect(p[param.key]).toBe(param.initial);
        expect(param.initial).toBeGreaterThanOrEqual(param.min);
        expect(param.initial).toBeLessThanOrEqual(param.max);
        expect(param.step).toBeGreaterThan(0);
      }
    }
  });

  it("every curve expression compiles and evaluates to a number at the initial params", () => {
    for (const preset of MATH_WIDGET_PRESETS) {
      const scope = { ...initialParams(preset), x: (preset.xRange[0] + preset.xRange[1]) / 2 };
      for (const curve of preset.curves) {
        const fn = compileExpr(curve.expression);
        expect(typeof fn(scope)).toBe("number");
      }
    }
  });

  it("xRange is ordered and non-degenerate", () => {
    for (const preset of MATH_WIDGET_PRESETS) {
      expect(preset.xRange[0]).toBeLessThan(preset.xRange[1]);
      if (preset.yRange) expect(preset.yRange[0]).toBeLessThan(preset.yRange[1]);
    }
  });

  it("markerX expression (when present) compiles to a finite value at initial params", () => {
    for (const preset of MATH_WIDGET_PRESETS) {
      if (!preset.markerX) continue;
      const fn = compileExpr(preset.markerX);
      expect(Number.isFinite(fn(initialParams(preset)))).toBe(true);
    }
  });

  it("formula() returns a non-empty string for the initial params", () => {
    for (const preset of MATH_WIDGET_PRESETS) {
      expect(preset.formula(initialParams(preset)).length).toBeGreaterThan(0);
      for (const r of preset.readouts?.(initialParams(preset)) ?? []) {
        expect(r.length).toBeGreaterThan(0);
      }
    }
  });

  it("the derivative preset's tangent passes through the marked point", () => {
    const preset = getPreset("derivative");
    expect(preset).toBeDefined();
    if (!preset) return;
    const params = { ...initialParams(preset), a: 2 };
    const f = compileExpr(preset.curves[0].expression); // 0.5*x^2
    const tangent = compileExpr(preset.curves[1].expression); // a*x - 0.5*a^2
    // both equal f(a) at x = a
    expect(tangent({ ...params, x: params.a })).toBeCloseTo(f({ ...params, x: params.a }));
  });
});
