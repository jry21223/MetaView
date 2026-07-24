import { describe, expect, it } from "vitest";

import { PlaybookEmitter } from "../src/state/playbookEmitter.js";
import { makeTemplateTools } from "../src/tools/templates.js";

interface ToolHandle {
  name: string;
  invoke: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

function outlinedEmitter(domain = "math"): PlaybookEmitter {
  const emitter = new PlaybookEmitter();
  emitter.setOutline(domain, Array.from({ length: 8 }, (_, index) => `step ${index + 1}`));
  return emitter;
}

function getTool(name: string, emitter: PlaybookEmitter): ToolHandle {
  const tool = makeTemplateTools({ emitter }).find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`missing tool ${name}`);
  return {
    name,
    invoke: async (args) => {
      const result = await tool.execute(`test-${name}`, args);
      return result.details as Record<string, unknown>;
    },
  };
}

function commitDrafts(emitter: PlaybookEmitter): void {
  emitter.commitAllStepDrafts();
}

describe("correct deterministic L2 templates", () => {
  it("tangent template visibly emits curve, point, and tangent", async () => {
    const emitter = outlinedEmitter();
    await getTool("template_tangent_at", emitter).invoke({
      base_expression: "x^2",
      x0: 1,
      x_min: -3,
      x_max: 3,
      start_step_index: 1,
    });
    commitDrafts(emitter);
    const step = emitter.finalize.bind(emitter);
    expect(emitter.stepCount()).toBe(1);
    // Inspect by selecting the committed output after completing the outline.
    for (let index = 2; index <= 8; index += 1) {
      emitter.beginStep(index, `step ${index}`);
      emitter.addFormula(`x_${index}`);
      emitter.setNarration([`第 ${index} 步。`]);
      emitter.commitStep();
    }
    const snapshot = step().steps[0].snapshot as Record<string, unknown>;
    expect(snapshot.kind).toBe("math_scene");
    expect((snapshot.curves as unknown[])).toHaveLength(2);
    expect((snapshot.points as unknown[])).toHaveLength(1);
    expect(JSON.stringify(snapshot)).toContain("tangent");
  });

  it("Riemann rectangle heights come from the input function", async () => {
    const emitter = outlinedEmitter();
    await getTool("template_riemann_sum", emitter).invoke({
      expression: "x^2",
      a: 0,
      b: 2,
      start_step_index: 1,
    });
    commitDrafts(emitter);
    for (let index = 4; index <= 8; index += 1) {
      emitter.beginStep(index, `step ${index}`);
      emitter.addFormula(`x_${index}`);
      emitter.setNarration([`第 ${index} 步。`]);
      emitter.commitStep();
    }
    const output = emitter.finalize();
    const first = output.steps[0].snapshot as Record<string, unknown>;
    const regions = first.regions as Array<{ vertices: Array<[number, number]> }>;
    expect(regions[0].vertices[2][1]).toBe(0);
    expect(regions[1].vertices[2][1]).toBe(1);
  });

  it("parametric trace creates actual on-curve marker points", async () => {
    const emitter = outlinedEmitter();
    await getTool("template_parametric_trace", emitter).invoke({
      expression_x: "cos(t)",
      expression_y: "sin(t)",
      t_min: 0,
      t_max: Math.PI,
      n_markers: 5,
      start_step_index: 1,
    });
    commitDrafts(emitter);
    for (let index = 2; index <= 8; index += 1) {
      emitter.beginStep(index, `step ${index}`);
      emitter.addFormula(`x_${index}`);
      emitter.setNarration([`第 ${index} 步。`]);
      emitter.commitStep();
    }
    const snapshot = emitter.finalize().steps[0].snapshot as Record<string, unknown>;
    expect((snapshot.points as unknown[])).toHaveLength(5);
  });

  it("SHM total energy is constant for non-unit amplitude and omega", async () => {
    const emitter = outlinedEmitter("physics");
    await getTool("template_shm", emitter).invoke({
      amplitude: 3,
      omega: 2,
      phase: 0.4,
      start_step_index: 1,
    });
    commitDrafts(emitter);
    for (let index = 4; index <= 8; index += 1) {
      emitter.beginStep(index, `step ${index}`);
      emitter.addFormula(`x_${index}`);
      emitter.setNarration([`第 ${index} 步。`]);
      emitter.commitStep();
    }
    const energy = emitter.finalize().steps[2].snapshot as Record<string, unknown>;
    const curves = energy.curves as Array<{ expression: string }>;
    expect(curves[0].expression).toBe("18");
  });

  it("code template emits code trace and Code Sync", async () => {
    const emitter = outlinedEmitter("code");
    await getTool("template_code_step", emitter).invoke({
      source: "x = 1\nx += 1",
      language: "python",
      line_index: 1,
      variables: { x: "2" },
      start_step_index: 1,
    });
    commitDrafts(emitter);
    for (let index = 2; index <= 8; index += 1) {
      emitter.beginStep(index, `step ${index}`);
      emitter.addFormula(`x_${index}`);
      emitter.setNarration([`第 ${index} 步。`]);
      emitter.commitStep();
    }
    const step = emitter.finalize().steps[0];
    expect(step.snapshot.kind).toBe("code_trace_scene");
    expect(step.code_highlight?.active_line).toBe(1);
  });

  it("templates return editable drafts instead of silently committing", async () => {
    const emitter = outlinedEmitter("algorithm");
    const result = await getTool("template_array_swap", emitter).invoke({
      values: ["3", "1", "2"],
      i: 0,
      j: 1,
      start_step_index: 1,
    });
    expect(emitter.stepCount()).toBe(0);
    expect(emitter.draftCount()).toBe(3);
    expect(result.draft_ids).toHaveLength(3);
  });
});
