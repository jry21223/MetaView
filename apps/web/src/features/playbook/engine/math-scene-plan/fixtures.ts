import type { MathSceneSnapshot, MetaStep } from "../types";

export const triangleScene: MathSceneSnapshot = {
  kind: "math_scene",
  x_min: -1,
  x_max: 7,
  y_min: -1,
  y_max: 4,
  x_label: "x",
  y_label: "y",
  points: [
    { x: 0, y: 0, label: "A", emphasis: "primary" },
    { x: 2, y: 3, label: "B", emphasis: "primary" },
    { x: 4, y: 0, label: "C", emphasis: "primary" },
  ],
  segments: [
    { x0: 0, y0: 0, x1: 2, y1: 3, label: "AB" },
    { x0: 2, y0: 3, x1: 4, y1: 0, label: "BC" },
    { x0: 4, y0: 0, x1: 0, y1: 0, label: "CA" },
  ],
  regions: [],
  curves: [],
  annotations: [],
};

export const trianglePlusSquareScene: MathSceneSnapshot = {
  ...triangleScene,
  points: [
    ...(triangleScene.points ?? []),
    { x: 6, y: 0, label: "D", emphasis: "accent" },
    { x: 6, y: 2, label: "E", emphasis: "accent" },
    { x: 4, y: 2, label: "F", emphasis: "accent" },
  ],
  segments: [
    ...(triangleScene.segments ?? []),
    { x0: 4, y0: 0, x1: 6, y1: 0, label: "CD" },
    { x0: 6, y0: 0, x1: 6, y1: 2, label: "DE" },
    { x0: 6, y0: 2, x1: 4, y1: 2, label: "EF" },
    { x0: 4, y0: 2, x1: 4, y1: 0, label: "FC" },
  ],
};

export const trianglePlusSquarePlusAnnotationScene: MathSceneSnapshot = {
  ...trianglePlusSquareScene,
  annotations: [
    ...(trianglePlusSquareScene.annotations ?? []),
    { x: 5, y: 2.5, text: "$A=s^2$", align: "ne" },
  ],
  formula_latex: "A=s^2",
};

export const trianglePlusSquarePlusFormulaScene =
  trianglePlusSquarePlusAnnotationScene;

export const vectorFieldScene: MathSceneSnapshot = {
  kind: "math_scene",
  x_min: -3,
  x_max: 3,
  y_min: -3,
  y_max: 3,
  x_label: "x",
  y_label: "y",
  points: [],
  segments: [],
  regions: [],
  curves: [],
  annotations: [{ x: 1.8, y: 2.4, text: "$F(x,y)=(-y,x)$", align: "ne" }],
  vector_field: {
    expression_px: "-y",
    expression_py: "x",
    step: 0.5,
    label: "F",
  },
};

export function makeMathSceneStep(
  snapshot: MathSceneSnapshot = triangleScene,
  overrides: Partial<MetaStep<MathSceneSnapshot>> = {},
): MetaStep<MathSceneSnapshot> {
  return {
    step_id: "math-scene-step",
    end_frame: 30,
    title: "Math scene",
    voiceover_text: "",
    snapshot,
    tokens: [],
    ...overrides,
  };
}
