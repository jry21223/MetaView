import { describe, expect, it } from "vitest";
import type { DirectorScript, MetaStep, PlaybookScript } from "../types";
import { buildDirectorFramePlan } from "./framePlan";

function formulaStep(): MetaStep {
  return {
    step_id: "s1",
    end_frame: 60,
    title: "Formula",
    voiceover_text: "Step formula.",
    tokens: [],
    snapshot: {
      kind: "math_formula",
      formula_latex: "a^2+b^2=c^2",
    },
  };
}

function mathSceneStep(): MetaStep {
  return {
    step_id: "s2",
    end_frame: 120,
    title: "Scene",
    voiceover_text: "Step scene.",
    tokens: [],
    snapshot: {
      kind: "math_scene",
      x_min: -1,
      x_max: 4,
      y_min: -1,
      y_max: 3,
      x_label: "x",
      y_label: "y",
      points: [{ x: 1, y: 1, label: "A" }],
      segments: [],
      regions: [],
      curves: [],
      annotations: [],
    },
  };
}

function script(step: MetaStep): PlaybookScript {
  return {
    fps: 30,
    total_frames: step.end_frame,
    domain: "math",
    title: "Director",
    summary: "Director fixture",
    parameter_controls: [],
    steps: [step],
  };
}

function director(source: DirectorScript["source"]): DirectorScript {
  return {
    schema_version: "1.0.0",
    source,
    run_id: "run-1",
    beats: [
      {
        beat_id: "beat_01",
        step_id: "s1",
        start_frame: 0,
        end_frame: 60,
        intent: "focus",
        shot_type: "close",
        camera_motion: "push_in",
        pacing: "normal",
        voiceover_text: "Director narration.",
        emphasis_terms: [],
      },
    ],
  };
}

describe("buildDirectorFramePlan", () => {
  it("produces a mathScene plan and no stage transform for math_scene steps", () => {
    const step = mathSceneStep();
    const plan = buildDirectorFramePlan({
      director: director("rule"),
      script: script(step),
      frame: 30,
      step,
      prevStep: null,
      stepProgress: 0.5,
    });

    expect(plan.debug.adapter).toBe("math_scene");
    expect(plan.stage.transform).toBeUndefined();
    expect(plan.mathScene?.renderPlan.points).toHaveLength(1);
  });

  it("uses the stage adapter for formula steps", () => {
    const step = formulaStep();
    const plan = buildDirectorFramePlan({
      director: director("rule"),
      script: script(step),
      frame: 30,
      step,
      prevStep: null,
      stepProgress: 0.5,
    });

    expect(plan.debug.adapter).toBe("stage");
    expect(plan.stage.transform).toBe("scale(1.0400)");
    expect(plan.stage.pacing).toBe("normal");
    expect(plan.mathScene).toBeNull();
  });

  it("respects rule and manual voiceover precedence", () => {
    const step = formulaStep();
    expect(
      buildDirectorFramePlan({
        director: director("rule"),
        script: script(step),
        frame: 30,
        step,
        prevStep: null,
        stepProgress: 0.5,
      }).voiceoverText,
    ).toBe("Step formula.");

    expect(
      buildDirectorFramePlan({
        director: director("manual"),
        script: script(step),
        frame: 30,
        step,
        prevStep: null,
        stepProgress: 0.5,
      }).voiceoverText,
    ).toBe("Director narration.");
  });
});
