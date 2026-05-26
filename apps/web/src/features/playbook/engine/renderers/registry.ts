import type { SnapshotKind } from "../types";
import type { RendererComponent } from "./types";
import { AlgorithmRenderer } from "./AlgorithmRenderer";
import { BarBlockRenderer } from "./BarBlockRenderer";
import { BinaryTreeRenderer } from "./BinaryTreeRenderer";
import { KaTeXOverlayRenderer } from "./KaTeXOverlayRenderer";
import { MathFormulaRenderer } from "./MathFormulaRenderer";
import { MathPlotRenderer } from "./MathPlotRenderer";
import { MathSceneRenderer } from "./MathSceneRenderer";
import { MotionSceneRenderer } from "./MotionSceneRenderer";
import { NarrationCardRenderer } from "./NarrationCardRenderer";

const registry = new Map<SnapshotKind, RendererComponent>([
  ["algorithm_array", AlgorithmRenderer],
  ["algorithm_bars", BarBlockRenderer],
  ["algorithm_tree", BinaryTreeRenderer],
  ["math_plot", MathPlotRenderer],
  ["math_formula", MathFormulaRenderer],
  ["math_scene", MathSceneRenderer],
  ["motion_scene", MotionSceneRenderer],
  ["katex_overlay", KaTeXOverlayRenderer],
  ["narration_card", NarrationCardRenderer],
]);

export const rendererRegistry = registry;
