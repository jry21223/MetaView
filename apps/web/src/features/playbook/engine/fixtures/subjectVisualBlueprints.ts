import type { SceneBlueprint } from "../compiler/sceneBlueprintCompiler";
import { resolveMoleculeContract } from "../kits/chemistry/chemistryContracts";

const GLUCOSE_CONTRACT = resolveMoleculeContract("glucose")!;
const METHANE_CONTRACT = resolveMoleculeContract("methane")!;

export type SubjectVisualFixtureId =
  | "binary_search"
  | "bfs_graph"
  | "carbon_dioxide_molecule"
  | "cell_structure"
  | "cell_structure_custom"
  | "cubic_tangent"
  | "dna_replication"
  | "derivative_tangent"
  | "east_asia_monsoon"
  | "molecule_2d_methane"
  | "molecule_2d_glucose"
  | "molecule_2d_water"
  | "projectile_motion"
  | "reaction_synthesis_water"
  | "recursion_stack";

export const SUBJECT_VISUAL_BLUEPRINT_IDS: readonly SubjectVisualFixtureId[] = [
  "east_asia_monsoon",
  "projectile_motion",
  "cell_structure",
  "cell_structure_custom",
  "dna_replication",
  "molecule_2d_water",
  "molecule_2d_methane",
  "molecule_2d_glucose",
  "carbon_dioxide_molecule",
  "reaction_synthesis_water",
  "derivative_tangent",
  "cubic_tangent",
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
    emphasisPoints: ["active call frame", "pending branch", "return line"],
    stackFrames: [
      {
        id: "fib-5",
        label: "fib(5)",
        depth: 0,
        state: "waiting",
        variables: { n: "5", wait: "left+right" },
      },
      {
        id: "fib-4",
        label: "fib(4)",
        depth: 1,
        state: "active",
        variables: { n: "4", branch: "left" },
      },
      {
        id: "fib-3",
        label: "fib(3)",
        depth: 1,
        state: "waiting",
        variables: { n: "3", branch: "right" },
      },
    ],
    currentFrameId: "fib-4",
    codeTrace: {
      language: "python",
      lines: [
        "def fib(n):",
        "    if n <= 1:",
        "        return n",
        "    return fib(n - 1) + fib(n - 2)",
      ],
      activeLines: [3],
      activeLine: 3,
    },
    caption: "Structured recursion stack traces the active Fibonacci branch while sibling calls wait.",
  },
  cell_structure: {
    id: "cell_structure",
    subject: "biology",
    sceneType: "cell_structure",
    title: "Cell structure",
    visualIntent: ["show_cell_structure", "label_core_organelles"],
    emphasisPoints: ["nucleus", "mitochondrion", "cell membrane"],
  },
  cell_structure_custom: {
    id: "cell_structure_custom",
    subject: "biology",
    sceneType: "cell_structure",
    title: "Custom cell layout",
    visualIntent: ["show_cell_structure", "use_structured_layout"],
    emphasisPoints: ["custom nucleus position", "custom mitochondrion callout"],
    cellType: "plant",
    structures: [
      { id: "cell-wall", semanticRole: "cell", label: "cell wall", x: 48, y: 52, width: 72, height: 54 },
      { id: "nucleus", semanticRole: "nucleus", label: "nucleus", x: 38, y: 44, width: 18, height: 16 },
      { id: "mitochondrion-right", semanticRole: "mitochondrion", label: "mitochondrion", x: 65, y: 60, width: 14, height: 9 },
    ],
    callouts: [
      { id: "nucleus-note", targetId: "nucleus", label: "gene control", side: "left" },
      { id: "energy-note", targetId: "mitochondrion-right", label: "energy", side: "right" },
    ],
    caption: "Structured biology layout keeps external cell structure positions and callouts.",
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
  cubic_tangent: {
    id: "cubic_tangent",
    subject: "math",
    sceneType: "math_plot",
    title: "Cubic tangent",
    visualIntent: ["show_function_curve", "highlight_tangent_slope", "use_structured_layout"],
    emphasisPoints: ["cubic curve", "tangent slope", "marker"],
    assetId: "derivative-tangent-preset",
    curves: [
      { expression: "x^3", label: "f(x)=x^3", emphasis: "primary", semanticRole: "curve" },
      { expression: "3*x - 2", label: "tangent slope = 3", emphasis: "accent", semanticRole: "tangent" },
    ],
    params: { a: 3 },
    xMin: -2,
    xMax: 2,
    yMin: -4,
    yMax: 4,
    markerX: 1,
    shadeFrom: 0.9,
    shadeTo: 1.1,
    xLabel: "x",
    yLabel: "f(x)",
    formulaLatex: "f'(1)=3",
    caption: "The cubic tangent slope at x=1 is 3.",
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
    smiles: METHANE_CONTRACT.smiles,
  },
  molecule_2d_glucose: {
    id: "molecule_2d_glucose",
    subject: "chemistry",
    sceneType: "molecule_2d_glucose",
    title: "Glucose molecule",
    visualIntent: ["render_structured_molecule", "use_smiles_asset"],
    emphasisPoints: ["glucose ring", "hydroxyl groups", "C6H12O6"],
    smiles: GLUCOSE_CONTRACT.smiles,
  },
  carbon_dioxide_molecule: {
    id: "carbon_dioxide_molecule",
    subject: "chemistry",
    sceneType: "molecule_2d_scene",
    title: "Carbon dioxide molecule",
    visualIntent: ["render_structured_molecule", "use_structured_layout"],
    emphasisPoints: ["carbon", "oxygen", "double bonds", "linear geometry"],
    moleculeId: "carbon_dioxide",
    smiles: "O=C=O",
    atoms: [
      { id: "o1", element: "O", x: 30, y: 50, label: "oxygen" },
      { id: "c", element: "C", x: 50, y: 50, label: "carbon" },
      { id: "o2", element: "O", x: 70, y: 50, label: "oxygen" },
    ],
    bonds: [
      { id: "o1-c", from: "o1", to: "c", order: 2 },
      { id: "c-o2", from: "c", to: "o2", order: 2 },
    ],
    callouts: [
      { id: "linear", targetId: "c", label: "linear", side: "top" },
    ],
    formulaLatex: "CO_2",
    caption: "Structured atom and bond input defines a linear carbon dioxide molecule.",
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
