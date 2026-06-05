import { describe, expect, it } from "vitest";
import type { MathSceneSnapshot, MetaStep, PlaybookScript } from "../types";
import { compileVisualTimeline, normaliseVisualLayers, visualStepKey } from "./visualContinuity";

function mathStep(overrides: Partial<MetaStep> = {}): MetaStep {
  return {
    step_id: "s",
    end_frame: 60,
    title: "画函数",
    voiceover_text: "观察曲线",
    tokens: [],
    snapshot: {
      kind: "math_plot",
      curves: [{ expression: "x^2", label: "f(x)", emphasis: "primary" }],
      x_min: -2,
      x_max: 2,
      x_label: "x",
      y_label: "y",
    },
    ...overrides,
  };
}

function script(steps: MetaStep[]): PlaybookScript {
  return {
    fps: 30,
    total_frames: steps.at(-1)?.end_frame ?? 1,
    domain: "math",
    title: "连续性测试",
    summary: "",
    parameter_controls: [],
    steps,
  };
}

function sceneSnapshot(overrides: Partial<MathSceneSnapshot> = {}): MathSceneSnapshot {
  return {
    kind: "math_scene",
    x_min: -1,
    x_max: 3,
    y_min: -1,
    y_max: 3,
    x_label: "x",
    y_label: "y",
    points: [],
    segments: [],
    regions: [],
    curves: [],
    annotations: [],
    ...overrides,
  };
}

describe("visualContinuity", () => {
  it("keeps the same key when only step narration metadata changes", () => {
    const a = mathStep({ title: "第一步", voiceover_text: "先看图" });
    const b = mathStep({
      step_id: "s2",
      end_frame: 120,
      title: "第二步",
      voiceover_text: "现在讲意义",
      code_highlight: {
        language: "python",
        lines: ["x = 1"],
        active_lines: [0],
        active_line: 0,
      },
    });
    expect(visualStepKey(a)).toBe(visualStepKey(b));
  });

  it("changes the key when visual plot fields change", () => {
    const base = mathStep();
    const expressionChanged = mathStep({
      snapshot: {
        kind: "math_plot",
        curves: [{ expression: "sin(x)", label: "f(x)", emphasis: "primary" }],
        x_min: -2,
        x_max: 2,
        x_label: "x",
        y_label: "y",
      },
    });
    const rangeChanged = mathStep({
      snapshot: {
        kind: "math_plot",
        curves: [{ expression: "x^2", label: "f(x)", emphasis: "primary" }],
        x_min: -4,
        x_max: 4,
        x_label: "x",
        y_label: "y",
      },
    });
    const paramsChanged = mathStep({
      snapshot: {
        kind: "math_plot",
        curves: [{ expression: "a*x", label: "f(x)", emphasis: "primary" }],
        params: { a: 2 },
        x_min: -2,
        x_max: 2,
        x_label: "x",
        y_label: "y",
      },
    });

    expect(visualStepKey(base)).not.toBe(visualStepKey(expressionChanged));
    expect(visualStepKey(base)).not.toBe(visualStepKey(rangeChanged));
    expect(visualStepKey(base)).not.toBe(visualStepKey(paramsChanged));
  });

  it("continues only across adjacent matching steps", () => {
    const first = mathStep({ step_id: "s1", end_frame: 60 });
    const different = mathStep({
      step_id: "s2",
      end_frame: 120,
      snapshot: {
        kind: "math_plot",
        curves: [{ expression: "sin(x)", label: "g(x)", emphasis: "primary" }],
        x_min: -2,
        x_max: 2,
        x_label: "x",
        y_label: "y",
      },
    });
    const sameAsFirst = mathStep({ step_id: "s3", end_frame: 180 });
    const timeline = compileVisualTimeline(script([first, different, sameAsFirst]));

    expect(timeline.steps[0].isVisualContinuation).toBe(false);
    expect(timeline.steps[1].isVisualContinuation).toBe(false);
    expect(timeline.steps[2].isVisualContinuation).toBe(false);
    expect(timeline.steps[2].visualStartFrame).toBe(120);
  });

  it("reuses visual layer start frames for adjacent matching layer bodies", () => {
    const first = mathStep({
      step_id: "s1",
      end_frame: 60,
      layers: [
        {
          timing: { enter_at: 0, exit_at: 1, appear_anim: "draw", z_order: 0 },
          body: mathStep().snapshot,
        },
      ],
    });
    const second = mathStep({
      step_id: "s2",
      end_frame: 120,
      title: "文案变化",
      layers: [
        {
          timing: { enter_at: 0, exit_at: 1, appear_anim: "draw", z_order: 0 },
          body: mathStep().snapshot,
        },
      ],
    });
    const timeline = compileVisualTimeline(script([first, second]));

    expect(timeline.steps[1].isVisualContinuation).toBe(true);
    expect(timeline.steps[1].layers[0].isVisualContinuation).toBe(true);
    expect(timeline.steps[1].layers[0].visualStartFrame).toBe(0);
    expect(timeline.steps[1].layers[0].visualEndFrame).toBe(60);
  });

  it("merges simultaneous math scene layers with identical timing", () => {
    const first = sceneSnapshot({
      x_min: -2,
      x_max: 2,
      y_min: -1,
      y_max: 2,
      points: [{ x: 0, y: 0, label: "O" }],
      segments: [{ x0: 0, y0: 0, x1: 1, y1: 1, arrow: true }],
      formula_latex: "F=ma",
      caption: "base caption",
    });
    const second = sceneSnapshot({
      x_min: -4,
      x_max: 4,
      y_min: -3,
      y_max: 3,
      regions: [
        {
          vertices: [
            [0, 0],
            [2, 0],
            [2, 1],
          ],
        },
      ],
      curves: [{ expression_y: "x^2", label: "path" }],
      annotations: [{ x: 2, y: 1, text: "$v$" }],
      vector_field: { expression_px: "x", expression_py: "y" },
      formula_latex: "E_k=\\frac12mv^2",
      caption: "overlay caption wins",
    });
    const layers = normaliseVisualLayers(
      mathStep({
        snapshot: first,
        layers: [
          {
            timing: { enter_at: 0, exit_at: 1, appear_anim: "fade", z_order: 0 },
            body: first,
          },
          {
            timing: { enter_at: 0, exit_at: 1, appear_anim: "draw", z_order: 0 },
            body: second,
          },
        ],
      }),
    );

    expect(layers).toHaveLength(1);
    expect(layers[0].body.kind).toBe("math_scene");
    if (layers[0].body.kind !== "math_scene") return;
    expect(layers[0].body.points).toHaveLength(1);
    expect(layers[0].body.segments).toHaveLength(1);
    expect(layers[0].body.regions).toHaveLength(1);
    expect(layers[0].body.curves).toHaveLength(1);
    expect(layers[0].body.annotations).toHaveLength(1);
    expect(layers[0].body.vector_field).toEqual(second.vector_field);
    expect(layers[0].body.formula_latex).toBe(second.formula_latex);
    expect(layers[0].body.caption).toBe(second.caption);
    expect(layers[0].body.x_min).toBe(-4);
    expect(layers[0].body.x_max).toBe(4);
    expect(layers[0].body.y_min).toBe(-3);
    expect(layers[0].body.y_max).toBe(3);
  });
});
