import type { ChemArrowEnd, ChemMoleculesPanel } from "../sceneTypes";
import { projectMoleculesPanel, rotateYawPitch, type ProjectedAtom } from "../projection";
import {
  CHEM_FONT,
  circleShape,
  emptyGeometry,
  makeText,
  polylineShapes,
  type PanelGeometry,
} from "./common";

/** Bond cylinder half-width per ångström of scale. */
export const BOND_RADIUS_ANGSTROM = 0.075;
/** How far a bond end tucks under its sphere, as a fraction of the radius. */
const BOND_TUCK = 0.55;

export interface BondSegment {
  id: string;
  from: ProjectedAtom;
  to: ProjectedAtom;
  /** Parallel strokes: offsets perpendicular to the bond, in stage units. */
  offsets: number[];
  width: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  depth: number;
}

export function bondSegments(panel: ChemMoleculesPanel, atoms: ProjectedAtom[]): BondSegment[] {
  const byId = new Map(atoms.map((atom) => [atom.id, atom]));
  const width = Math.max(2.4, panel.scale * BOND_RADIUS_ANGSTROM * 2);
  const segments: BondSegment[] = [];
  for (const bond of panel.bonds) {
    const from = byId.get(bond.from);
    const to = byId.get(bond.to);
    if (!from || !to) continue;
    const dx = to.sx - from.sx;
    const dy = to.sy - from.sy;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const gap = width * 1.15;
    const offsets = bond.order === 1 ? [0] : bond.order === 2 ? [-gap / 2 - 0.5, gap / 2 + 0.5] : [-gap, 0, gap];
    segments.push({
      id: bond.id,
      from,
      to,
      offsets,
      width: bond.order === 1 ? width : width * 0.72,
      x1: from.sx + ux * from.r * BOND_TUCK,
      y1: from.sy + uy * from.r * BOND_TUCK,
      x2: to.sx - ux * to.r * BOND_TUCK,
      y2: to.sy - uy * to.r * BOND_TUCK,
      depth: Math.min(from.depth, to.depth) - 0.01,
    });
  }
  return segments;
}

export interface ArrowCurve {
  id: string;
  points: Array<[number, number]>;
  /** Quadratic Bézier control data for drawing. */
  start: [number, number];
  control: [number, number];
  end: [number, number];
}

function endPoint(end: ChemArrowEnd, atoms: Map<string, ProjectedAtom>, segments: Map<string, BondSegment>): [number, number] | null {
  if ("atom" in end) {
    const atom = atoms.get(end.atom);
    return atom ? [atom.sx, atom.sy] : null;
  }
  const bond = segments.get(end.bond);
  return bond ? [(bond.from.sx + bond.to.sx) / 2, (bond.from.sy + bond.to.sy) / 2] : null;
}

type Pt = [number, number];

function sampleQuadratic(start: Pt, control: Pt, end: Pt): Pt[] {
  const points: Pt[] = [];
  for (let k = 0; k <= 16; k += 1) {
    const t = k / 16;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    points.push([a * start[0] + b * control[0] + c * end[0], a * start[1] + b * control[1] + c * end[1]]);
  }
  return points;
}

/** Arrow between two separate centres: a bowed chord that stops on the target's surface. */
function chordCurve(start0: Pt, end0: Pt, bend: number, sourceAtom?: ProjectedAtom, targetAtom?: ProjectedAtom) {
  const dx = end0[0] - start0[0];
  const dy = end0[1] - start0[1];
  const length = Math.hypot(dx, dy) || 1;
  const trim = targetAtom ? targetAtom.r + 5 : 6;
  const lead = sourceAtom ? sourceAtom.r * 0.6 : 0;
  const start: Pt = [start0[0] + (dx / length) * lead, start0[1] + (dy / length) * lead];
  const end: Pt = [end0[0] - (dx / length) * trim, end0[1] - (dy / length) * trim];
  const control: Pt = [
    (start[0] + end[0]) / 2 + (-dy / length) * bend * length * 0.5,
    (start[1] + end[1]) / 2 + (dx / length) * bend * length * 0.5,
  ];
  return { start, control, end };
}

const FLANK = (70 * Math.PI) / 180;

/**
 * An arrow between a bond and one of its own atoms (the C=O π pair moving
 * onto O, an O–H pair falling back onto O, a lone pair re-forming C=O) is
 * shorter than the atom is wide, so a straight chord would vanish under the
 * sphere. It is drawn the textbook way instead: it loops out beside the bond
 * and lands on (or leaves from) the atom's flank, on whichever side of the
 * bond has more free space.
 */
function ownBondCurve(atom: ProjectedAtom, bond: BondSegment, others: ProjectedAtom[], atomIsTarget: boolean) {
  const mid: Pt = [(bond.from.sx + bond.to.sx) / 2, (bond.from.sy + bond.to.sy) / 2];
  const m = Math.hypot(mid[0] - atom.sx, mid[1] - atom.sy) || 1;
  const ux = (mid[0] - atom.sx) / m;
  const uy = (mid[1] - atom.sy) / m;
  const build = (side: number) => {
    const px = -uy * side;
    const py = ux * side;
    const flankR = atomIsTarget ? atom.r + 5 : atom.r + 2;
    const flank: Pt = [
      atom.sx + flankR * (Math.cos(FLANK) * ux + Math.sin(FLANK) * px),
      atom.sy + flankR * (Math.cos(FLANK) * uy + Math.sin(FLANK) * py),
    ];
    const beside: Pt = [mid[0] + px * 6, mid[1] + py * 6];
    const control: Pt = [atom.sx + ux * m * 0.8 + px * (atom.r + 24), atom.sy + uy * m * 0.8 + py * (atom.r + 24)];
    const clearance = Math.min(Infinity, ...others.map((other) => Math.hypot(other.sx - control[0], other.sy - control[1]) - other.r));
    return { curve: atomIsTarget ? { start: beside, control, end: flank } : { start: flank, control, end: beside }, clearance };
  };
  const left = build(1);
  const right = build(-1);
  return (right.clearance > left.clearance ? right : left).curve;
}

export function arrowCurves(panel: ChemMoleculesPanel, atoms: ProjectedAtom[], segments: BondSegment[]): ArrowCurve[] {
  const atomMap = new Map(atoms.map((atom) => [atom.id, atom]));
  const bondMap = new Map(segments.map((segment) => [segment.id, segment]));
  const curves: ArrowCurve[] = [];
  for (const arrow of panel.arrows ?? []) {
    const rawStart = endPoint(arrow.from, atomMap, bondMap);
    const rawEnd = endPoint(arrow.to, atomMap, bondMap);
    if (!rawStart || !rawEnd) continue;
    const sourceAtom = "atom" in arrow.from ? atomMap.get(arrow.from.atom) : undefined;
    const targetAtom = "atom" in arrow.to ? atomMap.get(arrow.to.atom) : undefined;
    const bond = "bond" in arrow.from ? bondMap.get(arrow.from.bond) : "bond" in arrow.to ? bondMap.get(arrow.to.bond) : undefined;
    const atom = targetAtom ?? sourceAtom;
    const ownBond = bond && atom && (bond.from.id === atom.id || bond.to.id === atom.id);
    const others = ownBond ? atoms.filter((other) => other.id !== bond.from.id && other.id !== bond.to.id) : [];
    const { start, control, end } = ownBond
      ? ownBondCurve(atom, bond, others, atom === targetAtom)
      : chordCurve(rawStart, rawEnd, arrow.bend ?? 0.6, sourceAtom, targetAtom);
    curves.push({ id: arrow.id, points: sampleQuadratic(start, control, end), start, control, end });
  }
  return curves;
}

/** Charge badges sit on the upper right of a sphere and widen its footprint. */
export function chargeBadge(atom: ProjectedAtom): { cx: number; cy: number; r: number } {
  const r = Math.max(7, atom.r * 0.42);
  return { cx: atom.sx + atom.r * 0.78, cy: atom.sy - atom.r * 0.78, r };
}

/** Stage endpoints of a panel's reaction arrow (projected like an atom at z = 0). */
export function reactionArrowSegment(panel: ChemMoleculesPanel): { x1: number; y1: number; x2: number; y2: number } | null {
  const arrow = panel.reaction_arrow;
  if (!arrow) return null;
  const center = panel.center ?? { x: 0, y: 0, z: 0 };
  const cx = panel.rect.x + panel.rect.w / 2;
  const cy = panel.rect.y + panel.rect.h / 2;
  const project = (x: number) => {
    const p = rotateYawPitch({ x: x - center.x, y: arrow.y - center.y, z: -center.z }, panel.view?.yaw ?? 0, panel.view?.pitch ?? 0);
    return { x: cx + p.x * panel.scale, y: cy - p.y * panel.scale };
  };
  const a = project(arrow.from_x);
  const b = project(arrow.to_x);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

export function moleculesGeometry(panel: ChemMoleculesPanel): PanelGeometry {
  const geometry = emptyGeometry();
  const atoms = projectMoleculesPanel(panel);
  const segments = bondSegments(panel, atoms);
  for (const atom of atoms) {
    geometry.shapes.push(circleShape(`${panel.id}:atom:${atom.id}`, atom.sx, atom.sy, atom.r + 2));
    if (atom.atom.charge) {
      const badge = chargeBadge(atom);
      geometry.shapes.push(circleShape(`${panel.id}:charge:${atom.id}`, badge.cx, badge.cy, badge.r + 1));
    }
    geometry.anchors[atom.id] = { x: atom.sx, y: atom.sy, r: atom.r };
  }
  const ballStick = (panel.style ?? "ball_stick") === "ball_stick";
  for (const segment of segments) {
    if (ballStick) {
      geometry.shapes.push(...polylineShapes(`${panel.id}:bond:${segment.id}`, [[segment.x1, segment.y1], [segment.x2, segment.y2]], segment.width * 1.4, 6));
    }
    // Space-filling hides bonds inside the spheres, but a bond is still a
    // place a callout can point at.
    geometry.anchors[`bond:${segment.id}`] = {
      x: (segment.from.sx + segment.to.sx) / 2,
      y: (segment.from.sy + segment.to.sy) / 2,
      r: ballStick ? segment.width : Math.min(segment.from.r, segment.to.r) * 0.6,
    };
  }
  for (const curve of arrowCurves(panel, atoms, segments)) {
    geometry.shapes.push(...polylineShapes(`${panel.id}:arrow:${curve.id}`, curve.points, 4, 8));
    const mid = curve.points[8];
    geometry.anchors[`arrow:${curve.id}`] = { x: mid[0], y: mid[1], r: 4 };
  }
  const arrow = reactionArrowSegment(panel);
  if (arrow) {
    geometry.shapes.push(...polylineShapes(`${panel.id}:reaction-arrow`, [[arrow.x1, arrow.y1], [arrow.x2, arrow.y2]], 8, 8));
    geometry.anchors["reaction-arrow"] = { x: (arrow.x1 + arrow.x2) / 2, y: (arrow.y1 + arrow.y2) / 2, r: 8 };
    if (panel.reaction_arrow?.label) {
      geometry.requests.push({
        id: `${panel.id}:reaction-arrow`,
        text: panel.reaction_arrow.label,
        anchor: { x: (arrow.x1 + arrow.x2) / 2, y: Math.min(arrow.y1, arrow.y2), r: 8 },
        prefer: "above",
        fontSize: CHEM_FONT.small,
        tone: "muted",
        bounds: panel.rect,
        leader: false,
      });
    }
  }
  const byId = new Map(atoms.map((atom) => [atom.id, atom]));
  for (const group of panel.groups ?? []) {
    const members = group.atom_ids.map((id) => byId.get(id)).filter((atom): atom is ProjectedAtom => Boolean(atom));
    if (members.length === 0) continue;
    const left = Math.min(...members.map((atom) => atom.sx - atom.r));
    const right = Math.max(...members.map((atom) => atom.sx + atom.r));
    const top = Math.min(...members.map((atom) => atom.sy - atom.r));
    const bottom = Math.max(...members.map((atom) => atom.sy + atom.r));
    const above = group.placement === "above";
    const anchor = { x: (left + right) / 2, y: above ? top : bottom, r: 2 };
    geometry.anchors[`group:${group.id}`] = anchor;
    geometry.requests.push({
      id: `${panel.id}:group:${group.id}`,
      text: group.label,
      anchor,
      prefer: above ? "above" : "below",
      fontSize: CHEM_FONT.label,
      tone: group.tone ?? "ink",
      bounds: panel.rect,
      leader: false,
    });
  }
  if (panel.title) {
    geometry.texts.push(makeText(`${panel.id}:title`, panel.title, panel.rect.x + 4, panel.rect.y + 16, {
      fontSize: CHEM_FONT.panelTitle,
      weight: 600,
      tone: "muted",
    }));
  }
  return geometry;
}
