import type { SnapshotKind } from "../types";
import type { RendererComponent } from "./types";
import {
  ComplexPlaneSceneRenderer,
  GraphSceneRenderer,
  IterationTraceSceneRenderer,
  ManifoldSceneRenderer,
  MatrixSceneRenderer,
  ModelingSceneRenderer,
  OptimizationSceneRenderer,
  PhasePortraitSceneRenderer,
  StatsChartSceneRenderer,
  TableSceneRenderer,
} from "./AdvancedMathRenderers";
import { BioCellSceneRenderer } from "./BioCellSceneRenderer";
import { BinaryTreeRenderer } from "./BinaryTreeRenderer";
import { DomainArrayRenderer } from "./DomainArrayRenderer";
import { GeoMapSceneRenderer } from "./GeoMapSceneRenderer";
import { KaTeXOverlayRenderer } from "./KaTeXOverlayRenderer";
import { MathFormulaRenderer } from "./MathFormulaRenderer";
import { MathPlotRenderer } from "./MathPlotRenderer";
import { MathSceneRenderer } from "./MathSceneRenderer";
import { MotionSceneRenderer } from "./MotionSceneRenderer";
import { NarrationCardRenderer } from "./NarrationCardRenderer";
import { PhysicsForceSceneRenderer } from "./PhysicsForceSceneRenderer";
import { SolidGeometrySceneRenderer } from "./SolidGeometrySceneRenderer";

const registry = new Map<SnapshotKind, RendererComponent>([
  ["algorithm_array", DomainArrayRenderer],
  ["algorithm_bars", DomainArrayRenderer],
  ["algorithm_tree", BinaryTreeRenderer],
  ["math_plot", MathPlotRenderer],
  ["math_formula", MathFormulaRenderer],
  ["math_scene", MathSceneRenderer],
  ["matrix_scene", MatrixSceneRenderer],
  ["table_scene", TableSceneRenderer],
  ["graph_scene", GraphSceneRenderer],
  ["stats_chart_scene", StatsChartSceneRenderer],
  ["iteration_trace_scene", IterationTraceSceneRenderer],
  ["phase_portrait_scene", PhasePortraitSceneRenderer],
  ["complex_plane_scene", ComplexPlaneSceneRenderer],
  ["optimization_scene", OptimizationSceneRenderer],
  ["modeling_scene", ModelingSceneRenderer],
  ["manifold_scene", ManifoldSceneRenderer],
  ["solid_geometry_scene", SolidGeometrySceneRenderer],
  ["bio_cell_scene", BioCellSceneRenderer],
  ["geo_map_scene", GeoMapSceneRenderer],
  ["physics_force_scene", PhysicsForceSceneRenderer],
  ["motion_scene", MotionSceneRenderer],
  ["katex_overlay", KaTeXOverlayRenderer],
  ["narration_card", NarrationCardRenderer],
]);

export const rendererRegistry = registry;
