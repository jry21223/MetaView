import { describe, expect, it } from "vitest";
import type { DirectorBeat, MetaStep } from "../../types";
import { selectDirectorAdapter } from "./registry";

function beat(): DirectorBeat {
  return {
    beat_id: "beat_01",
    step_id: "s1",
    start_frame: 0,
    end_frame: 60,
    intent: "focus",
    shot_type: "medium",
    camera_motion: "push_in",
    pacing: "normal",
    emphasis_terms: [],
  };
}

function mathSceneStep(): MetaStep {
  return {
    step_id: "s1",
    end_frame: 60,
    title: "Scene",
    voiceover_text: "Explain scene.",
    tokens: [],
    snapshot: {
      kind: "math_scene",
      x_min: -1,
      x_max: 4,
      y_min: -1,
      y_max: 3,
      x_label: "x",
      y_label: "y",
      points: [{ x: 0, y: 0 }],
      segments: [],
      regions: [],
      curves: [],
      annotations: [],
    },
  };
}

function formulaStep(): MetaStep {
  return {
    step_id: "s2",
    end_frame: 60,
    title: "Formula",
    voiceover_text: "Explain formula.",
    tokens: [],
    snapshot: {
      kind: "math_formula",
      formula_latex: "E=mc^2",
    },
  };
}

describe("DirectorAdapterRegistry", () => {
  it("selects MathSceneDirectorAdapter for math_scene snapshots", () => {
    const adapter = selectDirectorAdapter(mathSceneStep());
    const result = adapter.build({
      beat: beat(),
      localProgress: 0.5,
      step: mathSceneStep(),
      prevStep: null,
      stepProgress: 0.5,
    });

    expect(result.adapter).toBe("math_scene");
    expect(result.stageTransform).toBeUndefined();
    expect(result.mathScene?.renderPlan.points).toHaveLength(1);
  });

  it("falls back to StageDirectorAdapter for non math_scene snapshots", () => {
    const adapter = selectDirectorAdapter(formulaStep());
    const result = adapter.build({
      beat: beat(),
      localProgress: 0.5,
      step: formulaStep(),
      prevStep: null,
      stepProgress: 0.5,
    });

    expect(result.adapter).toBe("stage");
    expect(result.stageTransform).toBe("scale(1.0400)");
    expect(result.mathScene).toBeNull();
  });
});
