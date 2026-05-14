import type { SnapshotKind } from "../types";
import type { RendererComponent } from "./types";
import { AlgorithmRenderer } from "./AlgorithmRenderer";
import { BarBlockRenderer } from "./BarBlockRenderer";
import { BinaryTreeRenderer } from "./BinaryTreeRenderer";
import { MathFormulaRenderer } from "./MathFormulaRenderer";
import { MathPlotRenderer } from "./MathPlotRenderer";
import { MathSceneRenderer } from "./MathSceneRenderer";

const registry = new Map<SnapshotKind, RendererComponent>([
  ["algorithm_array", AlgorithmRenderer],
  ["algorithm_bars", BarBlockRenderer],
  ["algorithm_tree", BinaryTreeRenderer],
  ["math_plot", MathPlotRenderer],
  ["math_formula", MathFormulaRenderer],
  ["math_scene", MathSceneRenderer],
]);

export const rendererRegistry = registry;
