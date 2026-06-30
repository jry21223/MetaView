import type { SceneBlueprint } from "../compiler/sceneBlueprintCompiler";

export type SubjectVisualFixtureId =
  | "binary_search"
  | "bfs_graph"
  | "cell_structure"
  | "dna_replication"
  | "derivative_tangent"
  | "east_asia_monsoon"
  | "molecule_2d_methane"
  | "molecule_2d_water"
  | "projectile_motion"
  | "reaction_synthesis_water"
  | "recursion_stack";

export const SUBJECT_VISUAL_BLUEPRINT_IDS: readonly SubjectVisualFixtureId[] = [
  "east_asia_monsoon",
  "projectile_motion",
  "cell_structure",
  "dna_replication",
  "molecule_2d_water",
  "molecule_2d_methane",
  "reaction_synthesis_water",
  "derivative_tangent",
  "bfs_graph",
  "recursion_stack",
  "binary_search",
];

export const subjectVisualBlueprints: Record<SubjectVisualFixtureId, SceneBlueprint> = {
  binary_search: {
    id: "binary_search",
    subject: "algorithm",
    sceneType: "binary_search",
    title: "Binary search",
    visualIntent: ["show_search_window", "highlight_midpoint", "trace_branch"],
    emphasisPoints: ["low pointer", "mid pointer", "high pointer"],
  },
  bfs_graph: {
    id: "bfs_graph",
    subject: "algorithm",
    sceneType: "bfs_graph",
    title: "BFS graph",
    visualIntent: ["show_graph_traversal", "show_queue_state", "highlight_active_edge"],
    emphasisPoints: ["current node", "queue", "visited set"],
  },
  recursion_stack: {
    id: "recursion_stack",
    subject: "algorithm",
    sceneType: "recursion_stack",
    title: "Recursion stack",
    visualIntent: ["show_call_stack", "highlight_active_line", "trace_pending_return"],
    emphasisPoints: ["active call frame", "pending multiplication", "base case path"],
  },
  cell_structure: {
    id: "cell_structure",
    subject: "biology",
    sceneType: "cell_structure",
    title: "Cell structure",
    visualIntent: ["show_cell_structure", "label_core_organelles"],
    emphasisPoints: ["nucleus", "mitochondrion", "cell membrane"],
  },
  dna_replication: {
    id: "dna_replication",
    subject: "biology",
    sceneType: "dna_replication",
    title: "DNA replication",
    visualIntent: ["show_process_steps", "show_complementary_base_pairing"],
    emphasisPoints: ["template DNA", "replication fork", "new strands"],
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
  molecule_2d_methane: {
    id: "molecule_2d_methane",
    subject: "chemistry",
    sceneType: "molecule_2d_methane",
    title: "Methane molecule",
    visualIntent: ["render_structured_molecule", "show_tetrahedral_geometry"],
    emphasisPoints: ["carbon", "hydrogen", "tetrahedral geometry"],
    smiles: "C",
  },
  reaction_synthesis_water: {
    id: "reaction_synthesis_water",
    subject: "chemistry",
    sceneType: "reaction_synthesis_water",
    title: "Water synthesis reaction",
    visualIntent: ["show_balanced_reaction", "show_electron_flow"],
    emphasisPoints: ["reactants", "products", "atom conservation"],
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
