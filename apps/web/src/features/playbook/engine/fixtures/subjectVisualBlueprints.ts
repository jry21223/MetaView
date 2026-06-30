import type { SceneBlueprint } from "../compiler/sceneBlueprintCompiler";

export type SubjectVisualFixtureId =
  | "bfs_graph"
  | "cell_structure"
  | "derivative_tangent"
  | "east_asia_monsoon"
  | "molecule_2d_water"
  | "projectile_motion";

export const SUBJECT_VISUAL_BLUEPRINT_IDS: readonly SubjectVisualFixtureId[] = [
  "east_asia_monsoon",
  "projectile_motion",
  "cell_structure",
  "molecule_2d_water",
  "derivative_tangent",
  "bfs_graph",
];

export const subjectVisualBlueprints: Record<SubjectVisualFixtureId, SceneBlueprint> = {
  bfs_graph: {
    id: "bfs_graph",
    subject: "algorithm",
    sceneType: "bfs_graph",
    title: "BFS graph",
    visualIntent: ["show_graph_traversal", "show_queue_state", "highlight_active_edge"],
    emphasisPoints: ["current node", "queue", "visited set"],
  },
  cell_structure: {
    id: "cell_structure",
    subject: "biology",
    sceneType: "cell_structure",
    title: "Cell structure",
    visualIntent: ["show_cell_structure", "label_core_organelles"],
    emphasisPoints: ["nucleus", "mitochondrion", "cell membrane"],
  },
  derivative_tangent: {
    id: "derivative_tangent",
    subject: "math",
    sceneType: "derivative_tangent",
    title: "Derivative tangent",
    visualIntent: ["show_function_curve", "highlight_tangent_slope"],
    emphasisPoints: ["formula", "curve", "tangent"],
  },
  east_asia_monsoon: {
    id: "east_asia_monsoon",
    subject: "geography",
    sceneType: "east_asia_monsoon",
    title: "East Asia monsoon",
    visualIntent: ["seasonal_wind_reversal", "land_sea_thermal_contrast", "moisture_transport"],
    emphasisPoints: ["land low", "ocean high", "summer monsoon"],
  },
  molecule_2d_water: {
    id: "molecule_2d_water",
    subject: "chemistry",
    sceneType: "molecule_2d_water",
    title: "Water molecule",
    visualIntent: ["render_structured_molecule", "show_polar_bonds"],
    emphasisPoints: ["oxygen", "hydrogen", "bent geometry"],
  },
  projectile_motion: {
    id: "projectile_motion",
    subject: "physics",
    sceneType: "projectile_motion",
    title: "Projectile motion",
    visualIntent: ["projectile_motion", "velocity_decomposition", "gravity_acceleration"],
    emphasisPoints: ["vx constant", "vy increases", "g downward"],
  },
};

export function getSubjectVisualBlueprint(id: SubjectVisualFixtureId): SceneBlueprint {
  return subjectVisualBlueprints[id];
}
