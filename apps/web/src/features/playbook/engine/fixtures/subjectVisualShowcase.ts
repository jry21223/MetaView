import type { PlaybookScript, SnapshotKind } from "../types";
import { getSceneContractCoverage } from "../assets/visualQualityGate";
import {
  DEFAULT_SHOWCASE_IMAGE_QUALITY_THRESHOLDS,
  type ShowcaseImageQualityThresholds,
} from "./showcaseImageQuality";
import { getSubjectVisualFixture, type SubjectVisualFixtureId } from "./subjectVisualFixtures";
import type { ShowcaseSceneContractCoverage } from "./showcaseBaselineReport";
import {
  resolveMoleculeContract,
  WATER_SYNTHESIS_REACTION_CONTRACT,
} from "../kits/chemistry/chemistryContracts";

const WATER_CONTRACT = resolveMoleculeContract("water")!;
const METHANE_CONTRACT = resolveMoleculeContract("methane")!;
const GLUCOSE_CONTRACT = resolveMoleculeContract("glucose")!;

export interface SubjectVisualShowcaseEntry {
  id: SubjectVisualFixtureId;
  domain: PlaybookScript["domain"];
  title: string;
  summary: string;
  packId: string;
  rendererKind: SnapshotKind;
  showInlineCode: boolean;
  requiredMarkers: string[];
  imageQuality: ShowcaseImageQualityThresholds;
  contractCoverage: ShowcaseSceneContractCoverage;
  script: PlaybookScript;
}

type SubjectVisualShowcaseMeta = Omit<SubjectVisualShowcaseEntry, "domain" | "script" | "contractCoverage"> & {
  domain: PlaybookScript["domain"];
};

function imageQuality(
  minBytes: number,
  minUniqueColors: number,
  minContentPixelRatio: number,
  minContentWidthRatio: number,
  minContentHeightRatio: number,
): ShowcaseImageQualityThresholds {
  return {
    ...DEFAULT_SHOWCASE_IMAGE_QUALITY_THRESHOLDS,
    minBytes,
    minUniqueColors,
    minContentPixelRatio,
    minContentWidthRatio,
    minContentHeightRatio,
  };
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function summarizeContractCoverage(script: PlaybookScript): ShowcaseSceneContractCoverage {
  const coverage = getSceneContractCoverage(script);
  if (coverage.length === 0) {
    return {
      status: "not_applicable",
      contractIds: [],
      requiredAssetIds: [],
      renderedAssetIds: [],
      missingAssetIds: [],
    };
  }

  const missingAssetIds = uniqueSorted(coverage.flatMap((entry) => entry.missingAssetIds));
  return {
    status: missingAssetIds.length > 0 ? "missing" : "matched",
    contractIds: uniqueSorted(coverage.map((entry) => entry.contractId)),
    requiredAssetIds: uniqueSorted(coverage.flatMap((entry) => entry.requiredAssetIds)),
    renderedAssetIds: uniqueSorted(coverage.flatMap((entry) => entry.renderedAssetIds)),
    missingAssetIds,
  };
}

export const SUBJECT_VISUAL_SHOWCASE_IDS: readonly SubjectVisualFixtureId[] = [
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

const SUBJECT_VISUAL_SHOWCASE_META: readonly SubjectVisualShowcaseMeta[] = [
  {
    id: "east_asia_monsoon",
    domain: "geography",
    title: "East Asia monsoon",
    summary: "GeoMap renderer consumes Natural Earth map layers plus monsoon flow assets.",
    packId: "geography-earth-basic",
    rendererKind: "geo_map_scene",
    showInlineCode: false,
    requiredMarkers: [
      "geo-map-scene",
      'data-asset-id="east-asia-land-110m"',
      'data-natural-earth-layer="admin_0_countries"',
      'data-asset-id="monsoon-wind-arrow"',
    ],
    imageQuality: imageQuality(220000, 300, 0.3, 0.5, 0.8),
  },
  {
    id: "projectile_motion",
    domain: "physics",
    title: "Projectile motion",
    summary: "Physics force renderer consumes projectile and vector assets with trail markers.",
    packId: "physics-basic",
    rendererKind: "physics_force_scene",
    showInlineCode: false,
    requiredMarkers: [
      "physics-force-scene",
      'data-asset-id="projectile-body-dot"',
      'data-asset-id="core-light-lab-grid"',
      'data-asset-id="force-vector-arrow"',
      'data-asset-id="core-formula-tag"',
      'data-semantic-role="motion_trail"',
    ],
    imageQuality: imageQuality(40000, 80, 0.035, 0.68, 0.72),
  },
  {
    id: "cell_structure",
    domain: "biology",
    title: "Cell structure",
    summary: "Biology renderer consumes internal organelle assets and callout metadata.",
    packId: "biology-basic",
    rendererKind: "bio_cell_scene",
    showInlineCode: false,
    requiredMarkers: [
      "bio-cell-scene",
      'data-asset-id="core-light-lab-grid"',
      'data-asset-id="cell-outline"',
      'data-asset-id="nucleus"',
      'data-asset-id="mitochondrion"',
    ],
    imageQuality: imageQuality(210000, 250, 0.055, 0.58, 0.7),
  },
  {
    id: "cell_structure_custom",
    domain: "biology",
    title: "Custom cell layout",
    summary: "Biology renderer consumes structured external cell positions and callouts.",
    packId: "biology-basic",
    rendererKind: "bio_cell_scene",
    showInlineCode: false,
    requiredMarkers: [
      "bio-cell-scene",
      'data-cell-type="plant"',
      'data-asset-id="core-light-lab-grid"',
      'data-structure-id="cell-wall"',
      'data-structure-id="mitochondrion-right"',
      'data-target-id="mitochondrion-right"',
      'data-asset-id="cell-outline"',
      'data-asset-id="mitochondrion"',
    ],
    imageQuality: imageQuality(210000, 250, 0.06, 0.64, 0.7),
  },
  {
    id: "dna_replication",
    domain: "biology",
    title: "DNA replication",
    summary: "Biology process renderer consumes DNA and replication-fork assets with flow markers.",
    packId: "biology-basic",
    rendererKind: "bio_process_scene",
    showInlineCode: false,
    requiredMarkers: [
      "bio-process-scene",
      'data-process-id="dna_replication"',
      'data-asset-id="core-light-lab-grid"',
      'data-asset-id="dna-helix"',
      'data-asset-id="replication-fork"',
      'data-asset-id="core-flow-arrow"',
    ],
    imageQuality: imageQuality(170000, 180, 0.035, 0.54, 0.7),
  },
  {
    id: "molecule_2d_water",
    domain: "chemistry",
    title: "Water molecule",
    summary: "Chemistry renderer consumes structured atom, bond, and molecule preset metadata.",
    packId: "chemistry-basic",
    rendererKind: "molecule_2d_scene",
    showInlineCode: false,
    requiredMarkers: [
      "molecule-2d-scene",
      `data-molecule-id="${WATER_CONTRACT.moleculeId}"`,
      `data-asset-id="${WATER_CONTRACT.assetId}"`,
      'data-asset-id="core-light-lab-grid"',
      'data-asset-id="core-formula-tag"',
      'data-structured-molecule="true"',
      WATER_CONTRACT.formula,
    ],
    imageQuality: imageQuality(190000, 130, 0.025, 0.7, 0.7),
  },
  {
    id: "molecule_2d_methane",
    domain: "chemistry",
    title: "Methane molecule",
    summary: "Chemistry renderer consumes a SMILES-addressable structured molecule preset.",
    packId: "chemistry-basic",
    rendererKind: "molecule_2d_scene",
    showInlineCode: false,
    requiredMarkers: [
      "molecule-2d-scene",
      `data-molecule-id="${METHANE_CONTRACT.moleculeId}"`,
      `data-smiles="${METHANE_CONTRACT.smiles}"`,
      `data-asset-id="${METHANE_CONTRACT.assetId}"`,
      'data-asset-id="core-light-lab-grid"',
      'data-asset-id="core-formula-tag"',
      'data-structured-molecule="true"',
      METHANE_CONTRACT.formula,
    ],
    imageQuality: imageQuality(190000, 150, 0.03, 0.74, 0.7),
  },
  {
    id: "molecule_2d_glucose",
    domain: "chemistry",
    title: "Glucose molecule",
    summary: "Chemistry renderer consumes a glucose SMILES asset and structured ring layout.",
    packId: "chemistry-basic",
    rendererKind: "molecule_2d_scene",
    showInlineCode: false,
    requiredMarkers: [
      "molecule-2d-scene",
      `data-molecule-id="${GLUCOSE_CONTRACT.moleculeId}"`,
      `data-smiles="${GLUCOSE_CONTRACT.smiles}"`,
      `data-asset-id="${GLUCOSE_CONTRACT.assetId}"`,
      'data-asset-id="core-light-lab-grid"',
      'data-asset-id="core-formula-tag"',
      'data-structured-molecule="true"',
      'data-element="C"',
      'data-element="O"',
      GLUCOSE_CONTRACT.formula,
    ],
    imageQuality: imageQuality(210000, 150, 0.055, 0.72, 0.72),
  },
  {
    id: "carbon_dioxide_molecule",
    domain: "chemistry",
    title: "Carbon dioxide molecule",
    summary: "Chemistry renderer consumes structured atom and double-bond layout input.",
    packId: "chemistry-basic",
    rendererKind: "molecule_2d_scene",
    showInlineCode: false,
    requiredMarkers: [
      "molecule-2d-scene",
      'data-molecule-id="carbon_dioxide"',
      'data-smiles="O=C=O"',
      'data-asset-id="core-light-lab-grid"',
      'data-bond-id="o1-c"',
      'data-bond-order="2"',
      'data-element="C"',
      'data-element="O"',
      'data-asset-id="core-formula-tag"',
      'data-structured-molecule="true"',
    ],
    imageQuality: imageQuality(185000, 110, 0.025, 0.6, 0.7),
  },
  {
    id: "reaction_synthesis_water",
    domain: "chemistry",
    title: "Water synthesis reaction",
    summary: "Chemistry reaction renderer consumes reaction-arrow and electron-flow assets.",
    packId: "chemistry-basic",
    rendererKind: "reaction_scene",
    showInlineCode: false,
    requiredMarkers: [
      "reaction-scene",
      `data-reaction-id="${WATER_SYNTHESIS_REACTION_CONTRACT.reactionId}"`,
      `data-asset-id="${WATER_SYNTHESIS_REACTION_CONTRACT.arrowAssetId}"`,
      `data-asset-id="${WATER_SYNTHESIS_REACTION_CONTRACT.electronFlowAssetId}"`,
      'data-asset-id="core-light-lab-grid"',
      'data-asset-id="core-formula-tag"',
      'data-semantic-role="reactant"',
      'data-semantic-role="product"',
    ],
    imageQuality: imageQuality(170000, 150, 0.05, 0.58, 0.7),
  },
  {
    id: "derivative_tangent",
    domain: "math",
    title: "Derivative tangent",
    summary: "Math plot renderer consumes a derivative tangent preset with formula and plot markers.",
    packId: "math-basic",
    rendererKind: "math_plot",
    showInlineCode: false,
    requiredMarkers: [
      "math-plot-renderer",
      'data-pack-id="math-basic"',
      'data-plot-asset-id="derivative-tangent-preset"',
      'data-semantic-role="tangent"',
    ],
    imageQuality: imageQuality(35000, 60, 0.018, 0.88, 0.85),
  },
  {
    id: "cubic_tangent",
    domain: "math",
    title: "Cubic tangent",
    summary: "Math plot renderer consumes structured curve, bounds, marker, and formula input.",
    packId: "math-basic",
    rendererKind: "math_plot",
    showInlineCode: false,
    requiredMarkers: [
      "math-plot-renderer",
      'data-pack-id="math-basic"',
      'data-plot-asset-id="derivative-tangent-preset"',
      'data-semantic-role="tangent"',
      'data-semantic-role="formula"',
      "Cubic tangent",
    ],
    imageQuality: imageQuality(35000, 45, 0.016, 0.88, 0.85),
  },
  {
    id: "bfs_graph",
    domain: "algorithm",
    title: "BFS graph",
    summary: "Graph renderer consumes algorithm node, queue, and active edge assets with a code track.",
    packId: "algorithm-code-basic",
    rendererKind: "graph_scene",
    showInlineCode: true,
    requiredMarkers: [
      "graph-scene-renderer",
      'data-pack-id="algorithm-code-basic"',
      'data-graph-asset-id="bfs-graph-preset"',
      'data-node-state="queue"',
      'data-edge-state="active"',
      "BFS",
    ],
    imageQuality: imageQuality(33000, 50, 0.014, 0.7, 0.8),
  },
  {
    id: "recursion_stack",
    domain: "algorithm",
    title: "Recursion stack",
    summary: "Call stack renderer consumes recursion frame and active code-line assets.",
    packId: "algorithm-code-basic",
    rendererKind: "call_stack_scene",
    showInlineCode: true,
    requiredMarkers: [
      "call-stack-scene",
      'data-pack-id="algorithm-code-basic"',
      'data-stack-asset-id="recursion-stack-preset"',
      'data-asset-id="call-frame"',
      'data-asset-id="stack-frame"',
      'data-asset-id="active-line"',
      'data-asset-id="core-timeline-arrow"',
      'data-frame-state="active"',
      "factorial(4)",
    ],
    imageQuality: imageQuality(48000, 90, 0.06, 0.8, 0.8),
  },
  {
    id: "binary_search",
    domain: "algorithm",
    title: "Binary search",
    summary: "Code trace renderer consumes binary-search preset, active line, and pointer assets.",
    packId: "algorithm-code-basic",
    rendererKind: "code_trace_scene",
    showInlineCode: true,
    requiredMarkers: [
      "code-trace-scene",
      'data-pack-id="algorithm-code-basic"',
      'data-trace-asset-id="binary-search-trace-preset"',
      'data-asset-id="core-flow-arrow"',
      'data-asset-id="active-line"',
      'data-asset-id="pointer-marker"',
      'data-pointer-id="mid"',
      'data-array-cell-state="active"',
      "binarySearch",
    ],
    imageQuality: imageQuality(65000, 150, 0.09, 0.82, 0.8),
  },
];

const subjectVisualShowcaseEntries: readonly SubjectVisualShowcaseEntry[] = SUBJECT_VISUAL_SHOWCASE_META.map((meta) => {
  const script = getSubjectVisualFixture(meta.id);
  return {
    ...meta,
    script,
    contractCoverage: summarizeContractCoverage(script),
  };
});

export function listSubjectVisualShowcaseEntries(): readonly SubjectVisualShowcaseEntry[] {
  return subjectVisualShowcaseEntries;
}

export function getSubjectVisualShowcaseEntry(
  id: SubjectVisualFixtureId | string,
): SubjectVisualShowcaseEntry | undefined {
  return subjectVisualShowcaseEntries.find((entry) => entry.id === id);
}
