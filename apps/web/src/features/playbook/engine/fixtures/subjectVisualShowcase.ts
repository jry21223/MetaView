import type { PlaybookScript, SnapshotKind } from "../types";
import { getSubjectVisualFixture, type SubjectVisualFixtureId } from "./subjectVisualFixtures";

export interface SubjectVisualShowcaseEntry {
  id: SubjectVisualFixtureId;
  domain: PlaybookScript["domain"];
  title: string;
  summary: string;
  packId: string;
  rendererKind: SnapshotKind;
  showInlineCode: boolean;
  requiredMarkers: string[];
  script: PlaybookScript;
}

type SubjectVisualShowcaseMeta = Omit<SubjectVisualShowcaseEntry, "domain" | "script"> & {
  domain: PlaybookScript["domain"];
};

export const SUBJECT_VISUAL_SHOWCASE_IDS: readonly SubjectVisualFixtureId[] = [
  "east_asia_monsoon",
  "projectile_motion",
  "cell_structure",
  "dna_replication",
  "molecule_2d_water",
  "molecule_2d_methane",
  "reaction_synthesis_water",
  "derivative_tangent",
  "bfs_graph",
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
      'data-asset-id="force-vector-arrow"',
      'data-semantic-role="motion_trail"',
    ],
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
      'data-asset-id="cell-outline"',
      'data-asset-id="nucleus"',
      'data-asset-id="mitochondrion"',
    ],
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
      'data-asset-id="dna-helix"',
      'data-asset-id="replication-fork"',
      'data-asset-id="core-flow-arrow"',
    ],
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
      'data-molecule-id="water"',
      'data-asset-id="water-molecule-preset"',
      'data-structured-molecule="true"',
    ],
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
      'data-molecule-id="methane"',
      'data-smiles="C"',
      'data-asset-id="methane-molecule-preset"',
      'data-structured-molecule="true"',
    ],
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
      'data-reaction-id="reaction_synthesis_water"',
      'data-asset-id="reaction-arrow"',
      'data-asset-id="electron-flow"',
      'data-semantic-role="reactant"',
      'data-semantic-role="product"',
    ],
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
  },
];

const subjectVisualShowcaseEntries: readonly SubjectVisualShowcaseEntry[] = SUBJECT_VISUAL_SHOWCASE_META.map((meta) => ({
  ...meta,
  script: getSubjectVisualFixture(meta.id),
}));

export function listSubjectVisualShowcaseEntries(): readonly SubjectVisualShowcaseEntry[] {
  return subjectVisualShowcaseEntries;
}

export function getSubjectVisualShowcaseEntry(
  id: SubjectVisualFixtureId | string,
): SubjectVisualShowcaseEntry | undefined {
  return subjectVisualShowcaseEntries.find((entry) => entry.id === id);
}
