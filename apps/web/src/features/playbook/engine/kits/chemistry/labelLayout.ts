/**
 * Collision-free label placement for chemistry scenes.
 *
 * Every shape a panel draws is published as an obstacle (sphere, box, or a
 * sampled curve); every flexible label is a request pinned to an anchor.
 * Candidates are tried around the anchor — preferred side first, then the
 * other sides and diagonals, at growing distances — and the first one that
 * stays inside the bounds and touches no obstacle and no earlier label wins.
 * If nothing is clean, the least-overlapping candidate is used and reported,
 * so a test can fail loudly instead of a label silently hiding behind a shape
 * (the DNA-replication "子代 DNA A" failure this module exists to prevent).
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Obstacle =
  | { kind: "rect"; id: string; box: Box }
  | { kind: "circle"; id: string; cx: number; cy: number; r: number };

export type LabelSide = "above" | "below" | "left" | "right";

export interface LabelRequest {
  id: string;
  anchor: { x: number; y: number };
  /** Label box size including its padding. */
  w: number;
  h: number;
  prefer?: LabelSide | null;
  /** Keep this far from the anchor at minimum (e.g. an atom's radius). */
  clearance?: number;
  /** Keep the label inside this box (defaults to the placer-wide bounds). */
  bounds?: Box;
}

export interface PlacedLabel {
  id: string;
  box: Box;
  anchor: { x: number; y: number };
  /** Point on the box edge a leader line should reach. */
  leaderEnd: { x: number; y: number };
  /** Total overlap area with obstacles and other labels; 0 when clean. */
  overlap: number;
  side: LabelSide | "diagonal";
}

export function boxesOverlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Approximate overlap of a circle and a box: penetration depth × chord. */
export function circleBoxOverlap(cx: number, cy: number, r: number, box: Box): number {
  const nearestX = Math.max(box.x, Math.min(cx, box.x + box.w));
  const nearestY = Math.max(box.y, Math.min(cy, box.y + box.h));
  const distance = Math.hypot(cx - nearestX, cy - nearestY);
  if (distance >= r) return 0;
  return (r - distance) * Math.min(2 * r, Math.max(box.w, box.h));
}

export function obstacleOverlap(obstacle: Obstacle, box: Box): number {
  return obstacle.kind === "rect"
    ? boxesOverlapArea(obstacle.box, box)
    : circleBoxOverlap(obstacle.cx, obstacle.cy, obstacle.r, box);
}

export function boxInside(inner: Box, outer: Box, tolerance = 0.5): boolean {
  return inner.x >= outer.x - tolerance
    && inner.y >= outer.y - tolerance
    && inner.x + inner.w <= outer.x + outer.w + tolerance
    && inner.y + inner.h <= outer.y + outer.h + tolerance;
}

const SIDE_VECTORS: Record<LabelSide, [number, number]> = {
  above: [0, -1],
  below: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
const DIAGONALS: Array<[number, number]> = [[1, -1], [-1, -1], [1, 1], [-1, 1]];
const DISTANCES = [10, 20, 34, 50, 70, 96, 126];
/** Perpendicular slides tried at each distance, in label heights (or half-widths). */
const SLIDES = [0, -1, 1, -2, 2];

function candidateBox(request: LabelRequest, dx: number, dy: number, gap: number): Box {
  const { anchor, w, h } = request;
  const clearance = (request.clearance ?? 0) + gap;
  // Place the box so its nearest edge sits `clearance` away along (dx, dy).
  const cx = anchor.x + dx * (clearance + w / 2);
  const cy = anchor.y + dy * (clearance + h / 2);
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function leaderEnd(box: Box, anchor: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.max(box.x, Math.min(anchor.x, box.x + box.w)),
    y: Math.max(box.y, Math.min(anchor.y, box.y + box.h)),
  };
}

function orderedDirections(prefer: LabelSide | null | undefined): Array<{ v: [number, number]; side: LabelSide | "diagonal" }> {
  const sides: LabelSide[] = ["above", "right", "below", "left"];
  const first = prefer ? [prefer, ...sides.filter((side) => side !== prefer)] : sides;
  return [
    ...first.map((side) => ({ v: SIDE_VECTORS[side], side })),
    ...DIAGONALS.map((v) => ({ v: [v[0] * Math.SQRT1_2, v[1] * Math.SQRT1_2] as [number, number], side: "diagonal" as const })),
  ];
}

function overlapScore(box: Box, obstacles: readonly Obstacle[], placed: readonly Box[]): number {
  let score = 0;
  for (const obstacle of obstacles) score += obstacleOverlap(obstacle, box);
  for (const other of placed) score += 2 * boxesOverlapArea(other, box);
  return score;
}

/**
 * Place labels one by one; earlier requests win contested space, so pass the
 * most important labels first.
 */
export function placeLabels(
  requests: readonly LabelRequest[],
  obstacles: readonly Obstacle[],
  bounds: Box,
  reserved: readonly Box[] = [],
): PlacedLabel[] {
  const placedBoxes: Box[] = [...reserved];
  const placed: PlacedLabel[] = [];
  for (const request of requests) {
    const limit = request.bounds ?? bounds;
    let best: { box: Box; overlap: number; side: PlacedLabel["side"]; rank: number } | null = null;
    let rank = 0;
    outer: for (const gap of DISTANCES) {
      for (const direction of orderedDirections(request.prefer)) {
        // Slide along the side as well: a label beside an atom may sit a
        // little higher or lower (or further left/right) and still read as
        // belonging to it.
        for (const slide of SLIDES) {
          rank += 1;
          const base = candidateBox(request, direction.v[0], direction.v[1], gap);
          const along = direction.v[0] !== 0 && direction.v[1] === 0 ? { x: 0, y: slide * request.h } : { x: slide * request.w * 0.5, y: 0 };
          const box = { ...base, x: base.x + along.x, y: base.y + along.y };
          if (!boxInside(box, limit)) continue;
          const overlap = overlapScore(box, obstacles, placedBoxes);
          if (!best || overlap < best.overlap) best = { box, overlap, side: direction.side, rank };
          if (overlap === 0) break outer;
        }
      }
    }
    if (!best) {
      // Nothing fits inside the bounds: clamp the preferred candidate in.
      const direction = orderedDirections(request.prefer)[0];
      const raw = candidateBox(request, direction.v[0], direction.v[1], DISTANCES[0]);
      const box = {
        ...raw,
        x: Math.max(limit.x, Math.min(raw.x, limit.x + limit.w - raw.w)),
        y: Math.max(limit.y, Math.min(raw.y, limit.y + limit.h - raw.h)),
      };
      best = { box, overlap: overlapScore(box, obstacles, placedBoxes), side: direction.side, rank };
    }
    placedBoxes.push(best.box);
    placed.push({
      id: request.id,
      box: best.box,
      anchor: request.anchor,
      leaderEnd: leaderEnd(best.box, request.anchor),
      overlap: best.overlap,
      side: best.side,
    });
  }
  return placed;
}
