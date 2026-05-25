/**
 * Unit tests for PlaybookEmitter. These don't touch pi-agent-core — they
 * exercise the state machine that L1 / L2 / assert tools mutate.
 */

import { describe, expect, it } from "vitest";
import { PlaybookEmitter } from "../src/state/playbookEmitter.js";

describe("PlaybookEmitter — step lifecycle", () => {
  it("rejects draw calls without an open step", () => {
    const e = new PlaybookEmitter();
    expect(() => e.addPoint(0, 0, "p", "primary")).toThrow(/begin_step/);
  });

  it("rejects begin_step while another is open", () => {
    const e = new PlaybookEmitter();
    e.beginStep(1, "first");
    expect(() => e.beginStep(2, "second")).toThrow(/not committed/);
  });

  it("commit_step closes the current step", () => {
    const e = new PlaybookEmitter();
    e.beginStep(1, "intro");
    expect(e.hasOpenStep()).toBe(true);
    e.commitStep();
    expect(e.hasOpenStep()).toBe(false);
    expect(e.stepCount()).toBe(1);
  });

  it("finalize auto-commits a forgotten open step", () => {
    const e = new PlaybookEmitter();
    e.beginStep(1, "forgot");
    const out = e.finalize();
    expect(out.steps).toHaveLength(1);
  });
});

describe("PlaybookEmitter — parametric curve + orientation lookup", () => {
  it("resolveParametricCurve returns the curve previously added", () => {
    const e = new PlaybookEmitter();
    e.beginStep(1, "circle");
    const id = e.addCurveParametric("cos(t)", "-sin(t)", 0, 6.28, "C", "primary");
    const resolved = e.resolveParametricCurve(id);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.expression_x).toBe("cos(t)");
      expect(resolved.expression_y).toBe("-sin(t)");
      expect(resolved.t_min).toBe(0);
      expect(resolved.t_max).toBe(6.28);
    }
  });

  it("resolveParametricCurve refuses 1D curves", () => {
    const e = new PlaybookEmitter();
    e.beginStep(1, "plot");
    const id = e.addCurve1D("x**2", "f", "primary");
    const resolved = e.resolveParametricCurve(id);
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.reason).toMatch(/not a parametric curve/);
    }
  });
});

describe("PlaybookEmitter — finalize", () => {
  it("emits Python PlaybookScript step_id instead of the internal id field", () => {
    const e = new PlaybookEmitter();
    e.beginStep(1, "array");
    e.addArrayTokens(["3", "1"]);
    e.commitStep();

    const step = e.finalize().steps[0];

    expect(step.step_id).toBe("step_01");
    expect(step).not.toHaveProperty("id");
  });

  it("never emits a vector_field field on any snapshot", () => {
    const e = new PlaybookEmitter();
    e.setOutline("math", ["a"]);
    e.beginStep(1, "scene");
    e.setAxes(-2, 2, -2, 2);
    e.addCurveParametric("cos(t)", "sin(t)", 0, 6.28, "C", "primary");
    e.addArrow(1, 0, 0, 0.5, "v");
    e.commitStep();
    const out = e.finalize();
    for (const step of out.steps) {
      const snapshot = step.snapshot as Record<string, unknown> | undefined;
      expect(snapshot).toBeDefined();
      expect(snapshot).not.toHaveProperty("vector_field");
    }
  });

  it("aggregates parametric + segments into a single math_scene snapshot", () => {
    const e = new PlaybookEmitter();
    e.beginStep(1, "scene");
    e.addCurveParametric("cos(t)", "sin(t)", 0, 6.28, "圆", "primary");
    e.addPoint(1, 0, "起点", "accent");
    e.addArrow(1, 0, 0, 1, "v");
    e.commitStep();
    const snap = e.finalize().steps[0].snapshot as Record<string, unknown>;
    expect(snap.kind).toBe("math_scene");
    expect((snap.curves as unknown[]).length).toBe(1);
    expect((snap.points as unknown[]).length).toBe(1);
    expect((snap.segments as unknown[]).length).toBe(1);
  });

  it("falls back to math_formula when only formula is set", () => {
    const e = new PlaybookEmitter();
    e.beginStep(1, "pure formula");
    e.addFormula("e^{i\\pi} + 1 = 0");
    e.commitStep();
    const snap = e.finalize().steps[0].snapshot as Record<string, unknown>;
    expect(snap.kind).toBe("math_formula");
    expect(snap.formula_latex).toContain("e^{i");
  });

  it("uses algorithm_bars when token labels are all numeric", () => {
    const e = new PlaybookEmitter();
    e.beginStep(1, "array");
    e.addArrayTokens(["3", "1", "4", "1", "5"]);
    e.commitStep();
    const step = e.finalize().steps[0];
    const snap = step.snapshot as Record<string, unknown>;
    expect(snap.kind).toBe("algorithm_bars");
    expect(snap.array_values).toEqual(["3", "1", "4", "1", "5"]);
    expect(snap.numeric_values).toEqual([3, 1, 4, 1, 5]);
    expect(snap.active_indices).toEqual([]);
    expect(snap.swap_indices).toEqual([]);
    expect(snap.sorted_indices).toEqual([]);
    expect(snap.pointers).toEqual({});
    expect(snap).not.toHaveProperty("tokens");
    expect(step.layers[0].body).toEqual(snap);
  });

  it("uses algorithm_array when labels contain non-numeric tokens", () => {
    const e = new PlaybookEmitter();
    e.beginStep(1, "array of strings");
    e.addArrayTokens(["foo", "bar"]);
    e.commitStep();
    const snap = e.finalize().steps[0].snapshot as Record<string, unknown>;
    expect(snap.kind).toBe("algorithm_array");
    expect(snap.array_values).toEqual(["foo", "bar"]);
    expect(snap.active_indices).toEqual([]);
    expect(snap.swap_indices).toEqual([]);
    expect(snap.sorted_indices).toEqual([]);
    expect(snap.pointers).toEqual({});
    expect(snap).not.toHaveProperty("tokens");
  });

  it("maps token emphasis into array active and sorted indices", () => {
    const e = new PlaybookEmitter();
    e.beginStep(1, "array emphasis");
    e.addArrayTokens(["A", "B", "C"], { 0: "primary", 2: "accent" });
    e.commitStep();
    const snap = e.finalize().steps[0].snapshot as Record<string, unknown>;
    expect(snap.kind).toBe("algorithm_array");
    expect(snap.active_indices).toEqual([0]);
    expect(snap.sorted_indices).toEqual([2]);
  });

  it("propagates the planned domain", () => {
    const e = new PlaybookEmitter();
    e.setOutline("physics", ["a", "b"]);
    e.beginStep(1, "x");
    e.commitStep();
    expect(e.finalize().domain).toBe("physics");
  });

  it("sets total_frames based on number of committed steps", () => {
    const e = new PlaybookEmitter();
    for (let i = 1; i <= 3; i++) {
      e.beginStep(i, `step ${i}`);
      e.commitStep();
    }
    const out = e.finalize();
    expect(out.total_frames).toBe(3 * 120); // DEFAULT_STEP_FRAMES = 120
    expect(out.fps).toBe(30);
  });
});

describe("PlaybookEmitter — parameter controls", () => {
  it("dedupes parameter_controls by id", () => {
    const e = new PlaybookEmitter();
    e.addParameterControl({ id: "a", label: "x", value: "1" });
    e.addParameterControl({ id: "a", label: "y", value: "2" });
    e.beginStep(1, "s");
    e.commitStep();
    const out = e.finalize();
    expect(out.parameter_controls).toHaveLength(1);
    expect(out.parameter_controls[0].value).toBe("2");
  });
});
