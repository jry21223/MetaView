import type { ChemParticle, ChemParticlesPanel } from "../sceneTypes";
import { speciesDefinition } from "../chemSpecies";
import { rotateYawPitch } from "../projection";
import type { Box } from "../labelLayout";
import { CHEM_FONT, emptyGeometry, makeText, rectShape, textBox, type PanelGeometry } from "./common";

/**
 * Particle glyph atom radii (Å). Between ball-and-stick and space-filling:
 * spheres touch, so a beaker of NH₃ reads as molecules, not as a scatter of
 * dots — and even hydrogen stays a legible size.
 */
const GLYPH_RADIUS: Readonly<Record<string, number>> = {
  H: 0.56, C: 0.68, N: 0.68, O: 0.66, S: 0.8, Cl: 0.85, Na: 0.8, K: 0.9, I: 0.95, Zn: 0.8, Cu: 0.8, Fe: 0.8,
};

export const DEFAULT_PARTICLE_SCALE = 16;
/** Glyphs are tilted a little so 3D species (NH₃, SO₄²⁻) keep their shape. */
const GLYPH_VIEW = { yaw: 24, pitch: 18 };
const TITLE_ZONE = 24;
const LEGEND_ZONE = 30;
const LEGEND_ROW = 20;
const LEGEND_GAP = 16;
export const ELECTRON_RADIUS = 8;
/** Peak thermal displacement in stage units at motion = 1. */
export const MOTION_AMPLITUDE = 7;

export function glyphAtomRadius(element: string): number {
  return GLYPH_RADIUS[element] ?? 0.75;
}

export interface GlyphAtom {
  element: string;
  dx: number;
  dy: number;
  r: number;
  depth: number;
}

export interface ParticleGlyph {
  atoms: GlyphAtom[];
  bonds: Array<[number, number, 1 | 2 | 3]>;
  charge: number;
  electron: boolean;
  /** Radius of a circle enclosing the whole glyph. */
  bound: number;
}

/** A species drawn at `scale` units/Å and turned by `angle` degrees in-plane. */
export function particleGlyph(species: string, scale: number, angle = 0): ParticleGlyph {
  const definition = speciesDefinition(species);
  if (definition.electron) {
    return { atoms: [], bonds: [], charge: -1, electron: true, bound: ELECTRON_RADIUS + 2 };
  }
  const theta = (angle * Math.PI) / 180;
  const atoms = definition.atoms.map((atom) => {
    const p = rotateYawPitch(atom, GLYPH_VIEW.yaw, GLYPH_VIEW.pitch);
    const x = p.x * Math.cos(theta) - p.y * Math.sin(theta);
    const y = p.x * Math.sin(theta) + p.y * Math.cos(theta);
    return { element: atom.element, dx: x * scale, dy: -y * scale, r: glyphAtomRadius(atom.element) * scale, depth: p.z };
  });
  const bound = Math.max(...atoms.map((atom) => Math.hypot(atom.dx, atom.dy) + atom.r)) + (definition.charge ? 4 : 0);
  return { atoms, bonds: definition.bonds, charge: definition.charge, electron: false, bound };
}

export interface ParticleFrame {
  /** Whole container, walls included. */
  container: Box;
  /** Interior the particle fractions map onto (already compressed). */
  interior: Box;
  slab: Box | null;
  legendY: number;
}

export function particleFrame(panel: ChemParticlesPanel): ParticleFrame {
  const titleZone = panel.title ? TITLE_ZONE : 0;
  const rows = legendLayout(panel).rows;
  const legendZone = rows > 0 ? LEGEND_ZONE + (rows - 1) * LEGEND_ROW : 0;
  const full: Box = {
    x: panel.rect.x + 4,
    y: panel.rect.y + titleZone + 4,
    w: panel.rect.w - 8,
    h: panel.rect.h - titleZone - legendZone - 8,
  };
  const fraction = Math.max(0.2, Math.min(1, panel.width_fraction ?? 1));
  const interior: Box = { ...full, w: full.w * fraction };
  let slab: Box | null = null;
  if (panel.slab) {
    const depth = interior.w * panel.slab.depth;
    slab = panel.slab.side === "left"
      ? { x: interior.x, y: interior.y, w: depth, h: interior.h }
      : { x: interior.x + interior.w - depth, y: interior.y, w: depth, h: interior.h };
  }
  return { container: { x: interior.x - 3, y: interior.y - 3, w: interior.w + 6, h: interior.h + 6 }, interior, slab, legendY: panel.rect.y + panel.rect.h - legendZone + 21 };
}

/**
 * Stage position of a particle. With a `margin` (the glyph's reach) the
 * centre is kept that far inside the interior, so a glyph is never cut by
 * its container's clip — authors place particles by eye, this keeps them in.
 */
export function particlePosition(frame: ParticleFrame, particle: Pick<ChemParticle, "x" | "y">, margin = 0): { x: number; y: number } {
  const { interior } = frame;
  const x = interior.x + particle.x * interior.w;
  const y = interior.y + particle.y * interior.h;
  if (margin <= 0) return { x, y };
  const mx = Math.min(margin, interior.w / 2);
  const my = Math.min(margin, interior.h / 2);
  return {
    x: Math.max(interior.x + mx, Math.min(interior.x + interior.w - mx, x)),
    y: Math.max(interior.y + my, Math.min(interior.y + interior.h - my, y)),
  };
}

/** How far a particle's drawing reaches from its centre (glyph plus jiggle). */
export function particleReach(panel: ChemParticlesPanel, particle: Pick<ChemParticle, "species" | "angle" | "fixed">): number {
  const glyph = particleGlyph(particle.species, panel.scale ?? DEFAULT_PARTICLE_SCALE, particle.angle ?? 0);
  return glyph.bound + (particle.fixed ? 1 : (panel.motion ?? 0.5) * MOTION_AMPLITUDE + 1);
}

/** Containers keep free particles fully inside; lattice atoms may sit at the wall. */
export function containedMargin(panel: ChemParticlesPanel, particle: Pick<ChemParticle, "species" | "angle" | "fixed">): number {
  if ((panel.container ?? "box") === "open" || particle.fixed) return 0;
  return particleReach(panel, particle);
}

export interface LegendItem {
  species: string;
  count: number;
  dotX: number;
  text: ReturnType<typeof makeText>;
}

interface LegendPlan {
  rows: number;
  entries: Array<{ species: string; count: number; label: string; width: number; row: number }>;
  rowWidths: number[];
}

/** Species counts wrapped into rows that fit the panel width. */
function legendLayout(panel: ChemParticlesPanel): LegendPlan {
  if (!panel.legend) return { rows: 0, entries: [], rowWidths: [] };
  const counts = new Map<string, number>();
  for (const particle of panel.particles) counts.set(particle.species, (counts.get(particle.species) ?? 0) + 1);
  const entries: LegendPlan["entries"] = [];
  const rowWidths: number[] = [0];
  for (const [species, count] of counts) {
    const label = `${speciesDefinition(species).label} ×${count}`;
    const width = textBox(label, 0, 0, CHEM_FONT.small, "start").w + 14;
    const row = rowWidths.length - 1;
    const needed = rowWidths[row] === 0 ? width : rowWidths[row] + LEGEND_GAP + width;
    if (needed > panel.rect.w - 8 && rowWidths[row] > 0) {
      rowWidths.push(width);
      entries.push({ species, count, label, width, row: row + 1 });
    } else {
      rowWidths[row] = needed;
      entries.push({ species, count, label, width, row });
    }
  }
  return { rows: rowWidths.length, entries, rowWidths };
}

export function particleLegend(panel: ChemParticlesPanel, frame: ParticleFrame): LegendItem[] {
  const plan = legendLayout(panel);
  const cursors = plan.rowWidths.map((width) => panel.rect.x + (panel.rect.w - width) / 2);
  return plan.entries.map((entry) => {
    const x = cursors[entry.row];
    cursors[entry.row] += entry.width + LEGEND_GAP;
    const y = frame.legendY + entry.row * LEGEND_ROW;
    return {
      species: entry.species,
      count: entry.count,
      dotX: x + 5,
      text: makeText(`${panel.id}:legend:${entry.species}`, entry.label, x + 14, y, { fontSize: CHEM_FONT.small, tone: "muted" }),
    };
  });
}

export function particlesGeometry(panel: ChemParticlesPanel): PanelGeometry {
  const geometry = emptyGeometry();
  const frame = particleFrame(panel);
  const scale = panel.scale ?? DEFAULT_PARTICLE_SCALE;
  const container = panel.container ?? "box";
  // Particles (with their thermal reach) and the walls are the obstacles, so a
  // label may sit in the empty part of a container but never on a particle.
  const clip = frame.interior;
  for (const particle of panel.particles) {
    const at = particlePosition(frame, particle, containedMargin(panel, particle));
    const reach = particleReach(panel, particle);
    if (container === "open") {
      geometry.shapes.push({ kind: "circle", id: `${panel.id}:p:${particle.id}`, cx: at.x, cy: at.y, r: reach });
      continue;
    }
    // Inside a container the glyph is clipped to the interior, so its
    // footprint is its reach box cut down to the interior.
    const x0 = Math.max(clip.x, at.x - reach);
    const y0 = Math.max(clip.y, at.y - reach);
    const x1 = Math.min(clip.x + clip.w, at.x + reach);
    const y1 = Math.min(clip.y + clip.h, at.y + reach);
    if (x1 > x0 && y1 > y0) geometry.shapes.push(rectShape(`${panel.id}:p:${particle.id}`, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }));
  }
  if (container !== "open") {
    const box = frame.container;
    const wall = 5;
    geometry.shapes.push(
      rectShape(`${panel.id}:wall:top`, { x: box.x, y: box.y, w: box.w, h: wall }),
      rectShape(`${panel.id}:wall:bottom`, { x: box.x, y: box.y + box.h - wall, w: box.w, h: wall }),
      rectShape(`${panel.id}:wall:left`, { x: box.x, y: box.y, w: wall, h: box.h }),
      rectShape(`${panel.id}:wall:right`, { x: box.x + box.w - wall, y: box.y, w: wall, h: box.h }),
    );
    if (frame.slab) geometry.shapes.push(rectShape(`${panel.id}:slab`, frame.slab));
  }
  for (const particle of panel.particles) {
    const at = particlePosition(frame, particle, containedMargin(panel, particle));
    geometry.anchors[particle.id] = { x: at.x, y: at.y, r: particleGlyph(particle.species, scale, particle.angle ?? 0).bound };
  }
  geometry.anchors.container = { x: frame.container.x + frame.container.w / 2, y: frame.container.y, r: 0 };
  if (frame.slab) {
    geometry.anchors.slab = { x: frame.slab.x + frame.slab.w / 2, y: frame.slab.y + frame.slab.h / 2, r: 0 };
  }
  if (panel.title) {
    geometry.texts.push(makeText(`${panel.id}:title`, panel.title, panel.rect.x + 4, panel.rect.y + 16, {
      fontSize: CHEM_FONT.panelTitle,
      weight: 600,
      tone: "muted",
    }));
  }
  for (const item of particleLegend(panel, frame)) geometry.texts.push(item.text);
  return geometry;
}
