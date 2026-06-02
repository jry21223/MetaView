import { describe, expect, it } from "vitest";
import {
  makeMathSceneStep,
  trianglePlusSquarePlusAnnotationScene,
  trianglePlusSquarePlusFormulaScene,
  trianglePlusSquareScene,
  triangleScene,
  vectorFieldScene,
} from "./fixtures";

describe("math-scene-plan fixtures", () => {
  it("exports the triangle progression fixtures", () => {
    expect(triangleScene.kind).toBe("math_scene");
    expect(triangleScene.points).toHaveLength(3);
    expect(triangleScene.segments).toHaveLength(3);

    expect(trianglePlusSquareScene.points).toHaveLength(6);
    expect(trianglePlusSquareScene.segments).toHaveLength(7);

    expect(trianglePlusSquarePlusAnnotationScene.annotations).toHaveLength(1);
    expect(trianglePlusSquarePlusAnnotationScene.formula_latex).toBe("A=s^2");
  });

  it("keeps the previous formula fixture name as an alias", () => {
    expect(trianglePlusSquarePlusFormulaScene).toBe(
      trianglePlusSquarePlusAnnotationScene,
    );
  });

  it("exports a vector field scene fixture", () => {
    expect(vectorFieldScene.vector_field).toEqual({
      expression_px: "-y",
      expression_py: "x",
      step: 0.5,
      label: "F",
    });
    expect(vectorFieldScene.annotations?.[0]?.text).toContain("F(x,y)");
  });

  it("creates a valid math scene step with override support", () => {
    const step = makeMathSceneStep(vectorFieldScene, {
      step_id: "field-step",
      end_frame: 60,
      title: "Vector field",
    });

    expect(step).toMatchObject({
      step_id: "field-step",
      end_frame: 60,
      title: "Vector field",
      voiceover_text: "",
      snapshot: vectorFieldScene,
      tokens: [],
    });
  });
});
