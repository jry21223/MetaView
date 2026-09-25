/**
 * `chemistry_scene` — the snapshot contract for chemistry lessons that need
 * more than one flat reaction card: pseudo-3D molecules whose bonds break and
 * form between steps, particle views (macro ↔ micro), apparatus (galvanic
 * cell, titration rig), charts and energy profiles, laid out side by side on
 * one 16:9-ish stage.
 *
 * Coordinates: every panel `rect` lives in stage units, a fixed
 * `CHEM_STAGE_WIDTH` × `CHEM_STAGE_HEIGHT` canvas that matches the player's
 * visual track (about 2.19 : 1, the same ratio the math plot uses). Inside a
 * panel each kind keeps its own natural units: molecules in ångström, particle
 * positions as 0–1 fractions of the container, charts in data units.
 *
 * Text fields typed `ChemMarkup` accept a small formula markup — `_` for a
 * subscript and `^` for a superscript, braces to group: `CH_3COOH`,
 * `Zn^{2+}`, `^{18}O`, `e^-`. Unicode sub/superscripts are accepted too and
 * normalised to the same tspans (see `chemMarkup.ts`).
 */

export const CHEM_STAGE_WIDTH = 1000;
export const CHEM_STAGE_HEIGHT = 456;

/** Formula-capable text; see `parseChemMarkup`. */
export type ChemMarkup = string;

/** Stage-space rectangle. */
export interface ChemRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Semantic emphasis. Maps onto the canvas tokens: primary → `--canvas-primary`,
 * secondary → `--canvas-secondary`, focus → `--canvas-focus`, muted → ink-3,
 * ink → plain ink.
 */
export type ChemTone = "primary" | "secondary" | "focus" | "muted" | "ink";

/** A solution colour: a named indicator/ion hue and how strong it is (0–1). */
export interface ChemTint {
  hue: "none" | "blue" | "green" | "pink" | "red" | "orange" | "yellow";
  strength: number;
}

// ---------------------------------------------------------------------------
// molecules — pseudo-3D ball-and-stick / space-filling

export interface ChemAtom {
  id: string;
  /** Element symbol, e.g. "C", "O", "Zn". */
  element: string;
  /** Mass number when the isotope matters for the lesson (18 for ¹⁸O). */
  isotope?: number | null;
  /** Model coordinates in ångström. +y is up, +z points at the viewer. */
  x: number;
  y: number;
  z: number;
  /** Formal charge; drawn as a ⊕ / ⊖ badge. */
  charge?: number | null;
  tone?: ChemTone | null;
}

/** `partial` draws a dashed bond: a transition-state or half-formed bond. */
export type ChemBondState = "stable" | "partial";

export interface ChemBond {
  id: string;
  from: string;
  to: string;
  order: 1 | 2 | 3;
  state?: ChemBondState | null;
  tone?: ChemTone | null;
}

export type ChemArrowEnd = { atom: string } | { bond: string };

/** Curly arrow: an electron pair moving from a bond or lone pair to a target. */
export interface ChemCurvedArrow {
  id: string;
  from: ChemArrowEnd;
  to: ChemArrowEnd;
  /** Which side to bow and how much (−1…1); default 0.6. */
  bend?: number | null;
  tone?: ChemTone | null;
}

/** A name set under (or above) a group of atoms: "乙酸", "水". */
export interface ChemGroupLabel {
  id: string;
  atom_ids: string[];
  label: ChemMarkup;
  placement?: "below" | "above" | null;
  tone?: ChemTone | null;
}

export interface ChemMoleculesPanel {
  type: "molecules";
  id: string;
  rect: ChemRect;
  /** Atoms in panels sharing a system id are conserved from step to step. */
  system_id?: string | null;
  title?: ChemMarkup | null;
  style?: "ball_stick" | "space_fill" | null;
  /** Camera orientation in degrees: yaw about +y, then pitch about +x. */
  view?: { yaw: number; pitch: number } | null;
  /** Stage units per ångström. Fixed per scene so steps do not zoom. */
  scale: number;
  /** Model point placed at the panel centre (default: bounding-box centre). */
  center?: { x: number; y: number; z: number } | null;
  atoms: ChemAtom[];
  bonds: ChemBond[];
  arrows?: ChemCurvedArrow[] | null;
  groups?: ChemGroupLabel[] | null;
  /** A reaction arrow between model x positions (Å), drawn at model height y. */
  reaction_arrow?: { from_x: number; to_x: number; y: number; reversible?: boolean | null; label?: ChemMarkup | null } | null;
  /** Atoms that enter the system in this step (element → count). */
  inflow?: Record<string, number> | null;
}

// ---------------------------------------------------------------------------
// particles — the micro view of a beaker, reactor or electrode surface

export interface ChemParticle {
  id: string;
  /** Key into the species library (`chemSpecies.ts`): "H2", "NH3", "Cu2+"… */
  species: string;
  /** Position as a 0–1 fraction of the container interior. */
  x: number;
  y: number;
  /** In-plane orientation in degrees. */
  angle?: number | null;
  tone?: ChemTone | null;
  /** Particles of the previous step this one was formed from (animated merge). */
  from?: string[] | null;
  /** Lattice atoms and adsorbed species do not jiggle. */
  fixed?: boolean | null;
}

export interface ChemParticlesPanel {
  type: "particles";
  id: string;
  rect: ChemRect;
  system_id?: string | null;
  title?: ChemMarkup | null;
  container?: "box" | "beaker" | "open" | null;
  /** Container width as a fraction of the panel (compression), default 1. */
  width_fraction?: number | null;
  /** A metal slab occupying one side of the container (electrode surface). */
  slab?: { side: "left" | "right"; material: string; depth: number; label?: ChemMarkup | null } | null;
  particles: ChemParticle[];
  /** Thermal jiggle, 0 (still) … 1 (lively); default 0.5. */
  motion?: number | null;
  /** Stage units per ångström for particle glyphs; default 12. */
  scale?: number | null;
  /** Show a species legend with live counts under the container. */
  legend?: boolean | null;
  /** Where newly added particles with no `from` slide in from. */
  entry?: "top" | "left" | "right" | null;
  inflow?: Record<string, number> | null;
}

// ---------------------------------------------------------------------------
// galvanic cell — macro apparatus

export interface ChemHalfCell {
  /** Electrode element symbol: "Zn", "Cu", "Fe". */
  electrode: string;
  electrode_label: ChemMarkup;
  solution: ChemMarkup;
  tint: ChemTint;
  /** 0–1: how much of the electrode has dissolved. */
  wear?: number | null;
  /** 0–1: how thick a fresh deposit has grown. */
  deposit?: number | null;
  /** Deposit metal when it differs from the electrode (Cu on a Zn strip). */
  deposit_element?: string | null;
  role?: "negative" | "positive" | null;
}

export type ChemIonRoute =
  | "left_out"
  | "left_in"
  | "right_out"
  | "right_in"
  | "bridge_to_left"
  | "bridge_to_right";

export interface ChemIonFlow {
  id: string;
  species: string;
  route: ChemIonRoute;
}

export interface ChemGalvanicPanel {
  type: "galvanic_cell";
  id: string;
  rect: ChemRect;
  title?: ChemMarkup | null;
  mode: "single_beaker" | "two_beakers";
  left: ChemHalfCell;
  right?: ChemHalfCell | null;
  salt_bridge?: { cation: string; anion: string; migrating: boolean } | null;
  meter?: { kind: "ammeter" | "voltmeter"; reading: ChemMarkup; deflection: number } | null;
  electron_flow?: "left_to_right" | "right_to_left" | "none" | null;
  ion_flows?: ChemIonFlow[] | null;
}

// ---------------------------------------------------------------------------
// titration rig — burette over a conical flask

export interface ChemTitrationPanel {
  type: "titration";
  id: string;
  rect: ChemRect;
  title?: ChemMarkup | null;
  titrant: ChemMarkup;
  analyte: ChemMarkup;
  capacity_ml: number;
  dispensed_ml: number;
  flask_tint: ChemTint;
  dripping: boolean;
  ph?: number | null;
  indicator?: ChemMarkup | null;
}

// ---------------------------------------------------------------------------
// chart — pH curves, concentration–time curves, energy distributions

export interface ChemAxis {
  min: number;
  max: number;
  label: ChemMarkup;
  ticks?: number[] | null;
}

export interface ChemSeries {
  id: string;
  points: Array<[number, number]>;
  label?: ChemMarkup | null;
  tone?: ChemTone | null;
  /** Colour the line by an element hue instead of a tone ("N", "H"…). */
  element?: string | null;
  dashed?: boolean | null;
}

export interface ChemBand {
  id: string;
  axis: "x" | "y";
  from: number;
  to: number;
  label?: ChemMarkup | null;
  tint?: ChemTint | null;
  tone?: ChemTone | null;
}

export interface ChemRule {
  id: string;
  axis: "x" | "y";
  value: number;
  label?: ChemMarkup | null;
  tone?: ChemTone | null;
}

export interface ChemArea {
  id: string;
  series_id: string;
  from_x: number;
  to_x: number;
  tone?: ChemTone | null;
}

export interface ChemMarker {
  id: string;
  x: number;
  y: number;
  label?: ChemMarkup | null;
  tone?: ChemTone | null;
}

export interface ChemChartPanel {
  type: "chart";
  id: string;
  rect: ChemRect;
  title?: ChemMarkup | null;
  x: ChemAxis;
  y: ChemAxis;
  series: ChemSeries[];
  bands?: ChemBand[] | null;
  rules?: ChemRule[] | null;
  areas?: ChemArea[] | null;
  markers?: ChemMarker[] | null;
  /** Series drawn progressively from `from_x` to `to_x` during the step entrance. */
  reveal?: { series_ids: string[]; from_x: number } | null;
}

// ---------------------------------------------------------------------------
// energy profile — reaction coordinate diagram

export interface ChemEnergyLevel {
  id: string;
  /** Position along the reaction coordinate, 0–1. */
  x: number;
  /** Energy in the panel's y units (kJ/mol). */
  e: number;
  kind: "reactant" | "ts" | "intermediate" | "product";
  label?: ChemMarkup | null;
}

export interface ChemEnergyPath {
  id: string;
  label?: ChemMarkup | null;
  tone?: ChemTone | null;
  dashed?: boolean | null;
  levels: ChemEnergyLevel[];
}

export interface ChemEnergyMeasure {
  id: string;
  kind: "ea" | "dh";
  from: string;
  to: string;
  label: ChemMarkup;
  tone?: ChemTone | null;
  /** Reaction-coordinate position of the arrow (default: at `to`, or just past it for ΔH). */
  at?: number | null;
  /** Which side of the arrow its label prefers. */
  side?: "left" | "right" | "above" | null;
}

export interface ChemEnergyPanel {
  type: "energy_profile";
  id: string;
  rect: ChemRect;
  title?: ChemMarkup | null;
  y: ChemAxis;
  x_label?: ChemMarkup | null;
  paths: ChemEnergyPath[];
  measures?: ChemEnergyMeasure[] | null;
  /** A ball riding a path, `t` 0–1 along the reaction coordinate. */
  rider?: { path_id: string; t: number } | null;
}

// ---------------------------------------------------------------------------
// cards — equations, half-reactions, readouts

export interface ChemCard {
  id: string;
  heading?: ChemMarkup | null;
  lines: ChemMarkup[];
  tone?: ChemTone | null;
}

export interface ChemCardsPanel {
  type: "cards";
  id: string;
  rect: ChemRect;
  title?: ChemMarkup | null;
  cards: ChemCard[];
}

export type ChemPanel =
  | ChemMoleculesPanel
  | ChemParticlesPanel
  | ChemGalvanicPanel
  | ChemTitrationPanel
  | ChemChartPanel
  | ChemEnergyPanel
  | ChemCardsPanel;

/**
 * A leader-line label pinned to something a panel draws. `target` is
 * `"<panelId>/<anchorId>"`; each panel publishes its anchors (atom ids,
 * particle ids, marker ids, "left_electrode", "flask"…). The layout engine
 * places the text where it overlaps no drawn shape and no other label.
 */
export interface ChemCallout {
  id: string;
  target: string;
  text: ChemMarkup;
  tone?: ChemTone | null;
  prefer?: "above" | "below" | "left" | "right" | null;
}

export interface ChemistrySceneSnapshot {
  kind: "chemistry_scene";
  /** Stable across the steps of one lesson; panels with equal ids animate between steps. */
  scene_id: string;
  /** Reaction equation shown in the stage header chip. */
  equation?: ChemMarkup | null;
  panels: ChemPanel[];
  callouts?: ChemCallout[] | null;
  /** One short "what to look at" line under the panels. */
  caption?: string | null;
}
