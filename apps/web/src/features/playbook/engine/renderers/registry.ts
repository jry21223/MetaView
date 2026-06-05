import type { SnapshotKind } from "../types";
import type { RendererComponent } from "./types";
import { BinaryTreeRenderer } from "./BinaryTreeRenderer";
import { DomainArrayRenderer } from "./DomainArrayRenderer";
import { KaTeXOverlayRenderer } from "./KaTeXOverlayRenderer";
import { MathFormulaRenderer } from "./MathFormulaRenderer";
import { MathPlotRenderer } from "./MathPlotRenderer";
import { MathSceneRenderer } from "./MathSceneRenderer";
import { MotionSceneRenderer } from "./MotionSceneRenderer";
import { NarrationCardRenderer } from "./NarrationCardRenderer";
import { SolidGeometrySceneRenderer } from "./SolidGeometrySceneRenderer";

const registry = new Map<SnapshotKind, RendererComponent>([
  ["algorithm_array", DomainArrayRenderer],
  ["algorithm_bars", DomainArrayRenderer],
  ["algorithm_tree", BinaryTreeRenderer],
  ["math_plot", MathPlotRenderer],
  ["math_formula", MathFormulaRenderer],
  ["math_scene", MathSceneRenderer],
  ["solid_geometry_scene", SolidGeometrySceneRenderer],
  ["motion_scene", MotionSceneRenderer],
  ["katex_overlay", KaTeXOverlayRenderer],
  ["narration_card", NarrationCardRenderer],
]);

export const rendererRegistry = registry;
