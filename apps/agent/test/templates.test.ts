/**
 * L2 template tests — verify each template emits the expected number of
 * steps and that the resulting snapshots stay free of vector_field.
 */

import { describe, expect, it } from "vitest";
import { PlaybookEmitter } from "../src/state/playbookEmitter.js";
import { makeTemplateTools } from "../src/tools/templates.js";

interface ToolHandle {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoke: (args: any) => Promise<any>;
}

function getTool(name: string, emitter: PlaybookEmitter): ToolHandle {
  const tools = makeTemplateTools({ emitter });
  const t = tools.find((tool) => tool.name === name);
  if (!t) throw new Error(`tool ${name} not found`);
  return {
    name: t.name,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    invoke: async (args: any) => {
      const result = await t.execute(`test_${name}`, args);
      return result.details;
    },
  };
}

describe("template_array_swap", () => {
  it("emits 3 committed steps", async () => {
    const emitter = new PlaybookEmitter();
    const t = getTool("template_array_swap", emitter);
    const result = await t.invoke({
      values: ["3", "1", "4", "1", "5"],
      i: 0,
      j: 2,
      start_step_index: 1,
    });
    expect(result.step_indices).toEqual([1, 2, 3]);
    expect(emitter.stepCount()).toBe(3);
    const out = emitter.finalize();
    for (const step of out.steps) {
      const snap = step.snapshot as Record<string, unknown>;
      expect(snap).not.toHaveProperty("vector_field");
    }
  });

  it("swaps values between i and j by the last step", async () => {
    const emitter = new PlaybookEmitter();
    const t = getTool("template_array_swap", emitter);
    await t.invoke({
      values: ["A", "B", "C"],
      i: 0,
      j: 2,
      start_step_index: 1,
    });
    const lastStep = emitter.finalize().steps[2];
    const tokens = (lastStep.tokens as Array<{ label: string }>).map((tok) => tok.label);
    expect(tokens).toEqual(["C", "B", "A"]);
  });
});

describe("template_array_compare", () => {
  it("emits 2 steps and embeds the result phrase in narration", async () => {
    const emitter = new PlaybookEmitter();
    const t = getTool("template_array_compare", emitter);
    await t.invoke({
      values: ["5", "2"],
      i: 0,
      j: 1,
      result: "gt",
      start_step_index: 5,
    });
    expect(emitter.stepCount()).toBe(2);
    const out = emitter.finalize();
    expect(out.steps[1].voiceover_text).toMatch(/需要交换/);
  });
});

describe("template_tangent_at", () => {
  it("emits a single function-kind step with the curve and the formula", async () => {
    const emitter = new PlaybookEmitter();
    const t = getTool("template_tangent_at", emitter);
    await t.invoke({
      base_expression: "x**2",
      derivative_expression: "2*x",
      x0: 1.5,
      x_min: -3,
      x_max: 3,
      start_step_index: 1,
    });
    const out = emitter.finalize();
    expect(out.steps).toHaveLength(1);
    const snap = out.steps[0].snapshot as Record<string, unknown>;
    expect(snap.kind).toBe("math_plot");
    expect((snap.curves as unknown[]).length).toBe(1);
    expect(snap.formula_latex).toContain("2*x");
  });
});

describe("template_function_transform", () => {
  it("adds a parameter_control for the transform parameter", async () => {
    const emitter = new PlaybookEmitter();
    const t = getTool("template_function_transform", emitter);
    await t.invoke({
      base_expression: "sin(x)",
      transformed_expression: "sin(x - a)",
      transform_kind: "shift_x",
      param_id: "a",
      param_initial: 0,
      param_label: "平移 a",
      x_min: -6,
      x_max: 6,
      start_step_index: 1,
    });
    const out = emitter.finalize();
    expect(out.parameter_controls).toHaveLength(1);
    expect(out.parameter_controls[0].id).toBe("a");
  });
});

describe("template_riemann_sum", () => {
  it("emits 3 steps", async () => {
    const emitter = new PlaybookEmitter();
    const t = getTool("template_riemann_sum", emitter);
    await t.invoke({
      expression: "x**2",
      a: 0,
      b: 2,
      start_step_index: 1,
    });
    expect(emitter.stepCount()).toBe(3);
  });
});

describe("template_force_diagram", () => {
  it("emits arrows for each force at the origin", async () => {
    const emitter = new PlaybookEmitter();
    const t = getTool("template_force_diagram", emitter);
    await t.invoke({
      forces: [
        { name: "重力", magnitude: 10, angle_deg: -90 },
        { name: "支持力", magnitude: 10, angle_deg: 90 },
        { name: "摩擦力", magnitude: 3, angle_deg: 180 },
      ],
      start_step_index: 1,
    });
    const snap = emitter.finalize().steps[0].snapshot as Record<string, unknown>;
    expect(snap.kind).toBe("math_scene");
    const segs = snap.segments as Array<{ x0: number; y0: number }>;
    expect(segs).toHaveLength(3);
    for (const s of segs) {
      expect(s.x0).toBe(0);
      expect(s.y0).toBe(0);
    }
    expect(snap).not.toHaveProperty("vector_field");
  });
});

describe("template_projectile_trajectory", () => {
  it("emits 4 sequential steps with the same parametric trajectory", async () => {
    const emitter = new PlaybookEmitter();
    const t = getTool("template_projectile_trajectory", emitter);
    await t.invoke({
      v0: 20,
      angle_deg: 45,
      g: 9.8,
      start_step_index: 1,
    });
    expect(emitter.stepCount()).toBe(4);
    const out = emitter.finalize();
    for (const step of out.steps) {
      const snap = step.snapshot as Record<string, unknown>;
      expect(snap.kind).toBe("math_scene");
      const curves = snap.curves as unknown[];
      expect(curves.length).toBe(1);
    }
  });
});

describe("template_shm", () => {
  it("emits 3 distinct curves", async () => {
    const emitter = new PlaybookEmitter();
    const t = getTool("template_shm", emitter);
    await t.invoke({
      amplitude: 1,
      omega: 2,
      start_step_index: 1,
    });
    expect(emitter.stepCount()).toBe(3);
    const out = emitter.finalize();
    const expressions = out.steps.map((s) => {
      const snap = s.snapshot as Record<string, unknown>;
      const curves = snap.curves as Array<{ expression: string }>;
      return curves[0].expression;
    });
    // Position, velocity, energy — three different expressions.
    expect(new Set(expressions).size).toBe(3);
  });
});

describe("template_code_step", () => {
  it("emits a single step whose narration references the highlighted line", async () => {
    const emitter = new PlaybookEmitter();
    const t = getTool("template_code_step", emitter);
    await t.invoke({
      source: "def fib(n):\n    return fib(n-1) + fib(n-2)\n",
      line_index: 1,
      variables: { n: "5" },
      start_step_index: 1,
    });
    const out = emitter.finalize();
    expect(out.steps).toHaveLength(1);
    expect(out.steps[0].voiceover_text).toMatch(/return fib/);
  });
});

describe("templates never emit vector_field on any snapshot", () => {
  it("scans every template's output", async () => {
    const tools = makeTemplateTools({ emitter: new PlaybookEmitter() });
    expect(tools.length).toBeGreaterThanOrEqual(10);
    // Spot-check a representative sample with valid inputs.
    const cases: Array<[string, Record<string, unknown>]> = [
      ["template_array_swap", { values: ["1", "2"], i: 0, j: 1, start_step_index: 1 }],
      ["template_pointer_step", { values: ["1", "2", "3"], prev_index: 0, next_index: 1, start_step_index: 1 }],
      [
        "template_parametric_trace",
        { expression_x: "cos(t)", expression_y: "sin(t)", t_min: 0, t_max: 6.28, n_markers: 4, start_step_index: 1 },
      ],
    ];
    for (const [name, args] of cases) {
      const emitter = new PlaybookEmitter();
      const t = getTool(name, emitter);
      await t.invoke(args);
      const out = emitter.finalize();
      for (const step of out.steps) {
        const snap = step.snapshot as Record<string, unknown> | undefined;
        if (snap) expect(snap).not.toHaveProperty("vector_field");
      }
    }
  });
});
