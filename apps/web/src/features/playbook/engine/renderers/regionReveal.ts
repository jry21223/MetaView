import { clamp01 } from "../foundation";

/**
 * Animate the polygon vertices outward from their centroid as ``progress``
 * sweeps 0→1, giving regions the same "grows over time" semantics as curves
 * (which advance their drawn domain by ``progress``). Previously RegionsLayer
 * just faded fillOpacity, leaving the polygon outline visible at progress=0
 * and out of sync with curve reveal. Issue #53.
 */
export function revealRegionVertices(
  vertices: ReadonlyArray<readonly [number, number]>,
  progress: number,
): Array<[number, number]> {
  const t = clamp01(progress);
  if (vertices.length === 0) return [];
  let cx = 0;
  let cy = 0;
  for (const [x, y] of vertices) {
    cx += x;
    cy += y;
  }
  cx /= vertices.length;
  cy /= vertices.length;
  return vertices.map(([x, y]) => [cx + (x - cx) * t, cy + (y - cy) * t]);
}
