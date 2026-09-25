/**
 * Step-to-step motion for chemistry scenes, as pure functions of the frame.
 *
 * Between two steps a panel with the same id morphs: atoms glide to their new
 * coordinates, bonds that disappear crack open from the middle and fade,
 * bonds that appear grow from both atoms toward the middle (Chemiation's
 * break/form idiom), particles merge into what they formed. The clock is a
 * fixed entrance budget from the step start — narration length never
 * stretches a bond breaking — and everything is deterministic, so a paused
 * frame, an exported video frame and a test see the same state.
 */

import type {
  ChemAtom,
  ChemBond,
  ChemMoleculesPanel,
  ChemParticle,
  ChemParticlesPanel,
} from "./sceneTypes";

/** Frames before the morph starts and how long it runs (30 fps). */
export const TRANSITION_DELAY_FRAMES = 6;
export const TRANSITION_FRAMES = 42;
/** Labels and arrows wait for the geometry to settle, then fade in. */
export const LABEL_FADE_START = TRANSITION_DELAY_FRAMES + TRANSITION_FRAMES - 8;
export const LABEL_FADE_FRAMES = 12;

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Cubic Hermite smoothstep, t²(3 − 2t). */
export function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function morphProgress(localFrame: number): number {
  return smoothstep((localFrame - TRANSITION_DELAY_FRAMES) / TRANSITION_FRAMES);
}

export function labelOpacity(localFrame: number): number {
  return clamp01((localFrame - LABEL_FADE_START) / LABEL_FADE_FRAMES);
}

/** Stable pseudo-random number in [0, 1) from a string. */
export function hash01(key: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Thermal jiggle: a smooth Lissajous wobble unique to each particle id. */
export function thermalOffset(id: string, frame: number, amplitude: number): { dx: number; dy: number; turn: number } {
  if (amplitude <= 0) return { dx: 0, dy: 0, turn: 0 };
  const t = frame / 30;
  const fx = 0.23 + 0.3 * hash01(id, 1);
  const fy = 0.19 + 0.3 * hash01(id, 2);
  const px = hash01(id, 3) * Math.PI * 2;
  const py = hash01(id, 4) * Math.PI * 2;
  return {
    dx: amplitude * Math.sin(2 * Math.PI * fx * t + px),
    dy: amplitude * Math.sin(2 * Math.PI * fy * t + py),
    turn: 9 * Math.sin(2 * Math.PI * (fx * 0.7) * t + py),
  };
}

// ---------------------------------------------------------------------------
// molecules

export type BondPhase = "stable" | "forming" | "breaking";

export interface BondDrawState {
  bond: ChemBond;
  phase: BondPhase;
  /** 0–1 progress of the forming/breaking animation. */
  progress: number;
  /** Order to draw; order changes cross over at the midpoint of the morph. */
  order: 1 | 2 | 3;
}

function pairKey(bond: Pick<ChemBond, "from" | "to">): string {
  return bond.from < bond.to ? `${bond.from}|${bond.to}` : `${bond.to}|${bond.from}`;
}

export interface MoleculeMorph {
  panel: ChemMoleculesPanel;
  bonds: BondDrawState[];
  /** Per-atom opacity (atoms entering or leaving the panel fade). */
  atomOpacity: Map<string, number>;
  /** Previous charge per atom, faded out while the new one fades in. */
  previousCharge: Map<string, number | null>;
}

/**
 * The molecule panel as it looks at morph progress `t` coming from `prev`.
 * Without a previous panel the current one is returned unchanged.
 */
export function morphMolecules(prev: ChemMoleculesPanel | null, current: ChemMoleculesPanel, t: number): MoleculeMorph {
  if (!prev || t >= 1) {
    return {
      panel: current,
      bonds: current.bonds.map((bond) => ({ bond, phase: "stable", progress: 1, order: bond.order })),
      atomOpacity: new Map(current.atoms.map((atom) => [atom.id, 1])),
      previousCharge: new Map(),
    };
  }
  const prevAtoms = new Map(prev.atoms.map((atom) => [atom.id, atom]));
  const currentIds = new Set(current.atoms.map((atom) => atom.id));
  const atoms: ChemAtom[] = current.atoms.map((atom) => {
    const from = prevAtoms.get(atom.id);
    if (!from) return atom;
    return { ...atom, x: lerp(from.x, atom.x, t), y: lerp(from.y, atom.y, t), z: lerp(from.z, atom.z, t) };
  });
  const atomOpacity = new Map<string, number>(current.atoms.map((atom) => [atom.id, prevAtoms.has(atom.id) ? 1 : t]));
  for (const atom of prev.atoms) {
    if (!currentIds.has(atom.id)) {
      atoms.push(atom);
      atomOpacity.set(atom.id, 1 - t);
    }
  }
  const previousCharge = new Map<string, number | null>();
  for (const atom of current.atoms) {
    const from = prevAtoms.get(atom.id);
    if (from && (from.charge ?? 0) !== (atom.charge ?? 0)) previousCharge.set(atom.id, from.charge ?? null);
  }
  const prevBonds = new Map(prev.bonds.map((bond) => [pairKey(bond), bond]));
  const currentBonds = new Map(current.bonds.map((bond) => [pairKey(bond), bond]));
  const bonds: BondDrawState[] = [];
  for (const [key, bond] of currentBonds) {
    const before = prevBonds.get(key);
    if (!before) {
      bonds.push({ bond, phase: "forming", progress: t, order: bond.order });
    } else {
      bonds.push({ bond, phase: "stable", progress: 1, order: t < 0.5 ? before.order : bond.order });
    }
  }
  for (const [key, bond] of prevBonds) {
    if (!currentBonds.has(key)) bonds.push({ bond, phase: "breaking", progress: t, order: bond.order });
  }
  const view = prev.view && current.view
    ? { yaw: lerp(prev.view.yaw, current.view.yaw, t), pitch: lerp(prev.view.pitch, current.view.pitch, t) }
    : current.view;
  const center = prev.center && current.center
    ? { x: lerp(prev.center.x, current.center.x, t), y: lerp(prev.center.y, current.center.y, t), z: lerp(prev.center.z, current.center.z, t) }
    : current.center;
  return {
    panel: { ...current, atoms, view, center, scale: lerp(prev.scale, current.scale, t) },
    bonds,
    atomOpacity,
    previousCharge,
  };
}

// ---------------------------------------------------------------------------
// particles

export interface ParticleDrawState {
  id: string;
  species: string;
  /** Position as container fractions (before thermal jiggle). */
  x: number;
  y: number;
  angle: number;
  opacity: number;
  fixed: boolean;
  tone: ChemParticle["tone"];
  /** Species it is turning from (e.g. a lattice Zn becoming Zn²⁺). */
  fromSpecies: string | null;
}

function entryPoint(panel: ChemParticlesPanel, particle: ChemParticle): { x: number; y: number } {
  switch (panel.entry) {
    case "top":
      return { x: particle.x, y: -0.12 };
    case "left":
      return { x: -0.1, y: particle.y };
    case "right":
      return { x: 1.1, y: particle.y };
    default:
      return { x: particle.x, y: particle.y };
  }
}

export function morphParticles(prev: ChemParticlesPanel | null, current: ChemParticlesPanel, t: number): ParticleDrawState[] {
  const state = (particle: ChemParticle, x: number, y: number, opacity: number, fromSpecies: string | null): ParticleDrawState => ({
    id: particle.id,
    species: particle.species,
    x,
    y,
    angle: particle.angle ?? 0,
    opacity,
    fixed: Boolean(particle.fixed),
    tone: particle.tone,
    fromSpecies,
  });
  if (!prev || t >= 1) return current.particles.map((particle) => state(particle, particle.x, particle.y, 1, null));
  const prevById = new Map(prev.particles.map((particle) => [particle.id, particle]));
  const currentIds = new Set(current.particles.map((particle) => particle.id));
  const mergeTarget = new Map<string, ChemParticle>();
  for (const particle of current.particles) {
    for (const source of particle.from ?? []) mergeTarget.set(source, particle);
  }
  const drawn: ParticleDrawState[] = [];
  for (const particle of current.particles) {
    const before = prevById.get(particle.id);
    if (before) {
      const changed = before.species !== particle.species;
      drawn.push(state(particle, lerp(before.x, particle.x, t), lerp(before.y, particle.y, t), 1, changed ? before.species : null));
      continue;
    }
    const sources = (particle.from ?? []).map((id) => prevById.get(id)).filter((item): item is ChemParticle => Boolean(item));
    if (sources.length > 0) {
      const cx = sources.reduce((sum, item) => sum + item.x, 0) / sources.length;
      const cy = sources.reduce((sum, item) => sum + item.y, 0) / sources.length;
      // The product appears where its sources met, then drifts to its place.
      const appear = clamp01((t - 0.45) / 0.3);
      const travel = clamp01((t - 0.45) / 0.55);
      drawn.push(state(particle, lerp(cx, particle.x, travel), lerp(cy, particle.y, travel), appear, null));
      continue;
    }
    const start = entryPoint(current, particle);
    const fadeIn = current.entry ? 1 : t;
    drawn.push(state(particle, lerp(start.x, particle.x, t), lerp(start.y, particle.y, t), fadeIn, null));
  }
  for (const particle of prev.particles) {
    if (currentIds.has(particle.id)) continue;
    const target = mergeTarget.get(particle.id);
    if (target) {
      const partners = (target.from ?? []).map((id) => prevById.get(id)).filter((item): item is ChemParticle => Boolean(item));
      const cx = partners.reduce((sum, item) => sum + item.x, 0) / partners.length;
      const cy = partners.reduce((sum, item) => sum + item.y, 0) / partners.length;
      const approach = clamp01(t / 0.5);
      drawn.push(state(particle, lerp(particle.x, cx, approach), lerp(particle.y, cy, approach), 1 - clamp01((t - 0.4) / 0.2), null));
    } else {
      drawn.push(state(particle, particle.x, particle.y, 1 - t, null));
    }
  }
  return drawn;
}
