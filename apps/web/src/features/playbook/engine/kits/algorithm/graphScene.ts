import type { GraphSceneEdge, GraphSceneNode, GraphSceneSnapshot } from "../../types";

/**
 * The graph_scene projection contract.
 *
 * Cases author node coordinates in compact scene units (roughly ±3); the
 * renderer multiplies them into the 900×440 viewBox. Those numbers used to
 * live only inside `AdvancedMathRenderers.tsx`, with the cases and their
 * tests re-deriving the stage bounds by hand (`(450 - 32) / 120`). They live
 * here now so the renderer, the cases and the tests all measure one stage.
 */
export const GRAPH_SCENE_VIEWBOX = { width: 900, height: 440 } as const;

export interface GraphProjection {
  centerX: number;
  centerY: number;
  xScale: number;
  yScale: number;
}

/** Compact scene unit → viewBox pixel, for a graph that owns the whole stage. */
export const GRAPH_SCENE_PROJECTION: GraphProjection = {
  centerX: GRAPH_SCENE_VIEWBOX.width / 2,
  centerY: GRAPH_SCENE_VIEWBOX.height / 2,
  xScale: 120,
  yScale: 82,
};

/** Tighter projection used when the algorithm state panel takes the right of the stage. */
export const GRAPH_STATE_PANEL_PROJECTION: GraphProjection = {
  centerX: 312,
  centerY: 258,
  xScale: 78,
  yScale: 66,
};

/** Ring the renderer falls back to for nodes that carry no explicit coordinates. */
export const GRAPH_FALLBACK_RING = {
  centerX: 450,
  centerY: 245,
  radiusX: 260,
  radiusY: 170,
} as const;

export const GRAPH_NODE_RADIUS = 29;
export const GRAPH_NODE_RADIUS_ACTIVE = 32;

/** Coordinates within this bound on both axes read as compact scene units. */
export const GRAPH_COMPACT_COORD_LIMIT = 12;

/** True when every positioned node uses compact scene units rather than raw pixels. */
export function shouldProjectCompactGraphCoords(nodes: GraphSceneSnapshot["nodes"]): boolean {
  const positioned = nodes.filter((node) => typeof node.x === "number" && typeof node.y === "number");
  if (!positioned.length) return false;
  return positioned.every(
    (node) =>
      Math.abs(node.x as number) <= GRAPH_COMPACT_COORD_LIMIT &&
      Math.abs(node.y as number) <= GRAPH_COMPACT_COORD_LIMIT,
  );
}

export function projectGraphPoint(
  x: number,
  y: number,
  compact: boolean,
  projection: GraphProjection = GRAPH_SCENE_PROJECTION,
): { x: number; y: number } {
  if (!compact) return { x, y };
  return {
    x: projection.centerX + x * projection.xScale,
    y: projection.centerY + y * projection.yScale,
  };
}

/**
 * Largest compact coordinate whose node circle still fits inside the viewBox.
 * A case that places a node beyond this has it clipped at the stage edge.
 */
export function graphStageBounds(
  radius: number = GRAPH_NODE_RADIUS_ACTIVE,
  projection: GraphProjection = GRAPH_SCENE_PROJECTION,
): { maxX: number; maxY: number } {
  return {
    maxX: (projection.centerX - radius) / projection.xScale,
    maxY: (projection.centerY - radius) / projection.yScale,
  };
}

/** Whether a node drawn at these compact coordinates stays fully on stage. */
export function isOnStage(
  node: { x?: number | null; y?: number | null },
  radius: number = GRAPH_NODE_RADIUS_ACTIVE,
  projection: GraphProjection = GRAPH_SCENE_PROJECTION,
): boolean {
  if (typeof node.x !== "number" || typeof node.y !== "number") return true;
  const bounds = graphStageBounds(radius, projection);
  return Math.abs(node.x) <= bounds.maxX && Math.abs(node.y) <= bounds.maxY;
}

/** Compact coordinates are written with 3 decimals so snapshots stay byte-stable. */
export function graphCoord(value: number): number {
  return Number(value.toFixed(3));
}

/**
 * A graph_scene snapshot with the fields every algorithm case has to repeat.
 * Only `nodes`, `edges` and `caption` are ever required; the rest default to
 * "nothing highlighted", which is what an undirected, unweighted intro step is.
 */
export function graphSceneSnapshot(args: {
  nodes: readonly GraphSceneNode[];
  edges: readonly GraphSceneEdge[];
  caption: string;
  packId?: string;
  assetId?: string;
  directed?: boolean;
  weighted?: boolean;
  currentNodeId?: string | null;
  activeNodeIds?: readonly string[];
  activeEdgeIds?: readonly string[];
  visitedNodeIds?: readonly string[];
  queueNodeIds?: readonly string[];
  frontierNodeIds?: readonly string[];
}): GraphSceneSnapshot {
  return {
    kind: "graph_scene",
    ...(args.packId === undefined ? {} : { pack_id: args.packId }),
    ...(args.assetId === undefined ? {} : { asset_id: args.assetId }),
    nodes: args.nodes as GraphSceneNode[],
    edges: args.edges as GraphSceneEdge[],
    directed: args.directed ?? false,
    weighted: args.weighted ?? false,
    current_node_id: args.currentNodeId ?? null,
    active_node_ids: [...(args.activeNodeIds ?? [])],
    active_edge_ids: [...(args.activeEdgeIds ?? [])],
    visited_node_ids: [...(args.visitedNodeIds ?? [])],
    queue_node_ids: [...(args.queueNodeIds ?? [])],
    frontier_node_ids: [...(args.frontierNodeIds ?? [])],
    caption: args.caption,
  };
}

/**
 * Horizontal half-width a row layout may use. Inside `graphStageBounds().maxX`
 * (≈3.48) with room for the node circle and its label.
 */
export const GRAPH_ROW_HALF_WIDTH = 3.2;

export interface RowLayoutItem {
  id: string;
  label: string;
}

/** Evenly spaced nodes on one horizontal line — a list, a queue, a tape. */
export function rowLayout(
  items: readonly RowLayoutItem[],
  options: { y: number; halfWidth?: number } = { y: 0 },
): GraphSceneNode[] {
  const halfWidth = options.halfWidth ?? GRAPH_ROW_HALF_WIDTH;
  const pitch = items.length > 1 ? (halfWidth * 2) / (items.length - 1) : 0;
  return items.map((item, slot) => ({
    id: item.id,
    label: item.label,
    x: graphCoord(-halfWidth + slot * pitch),
    y: options.y,
  }));
}

export interface InorderTreeItem {
  id: string;
  label: string;
  depth: number;
}

/**
 * Binary-tree layout that reads as a BST: the in-order rank sets x (so left
 * subtrees really do sit left of their parent) and the depth sets y.
 */
export function inorderTreeLayout(
  ordered: readonly InorderTreeItem[],
  options: { xPitch: number; yTop: number; yPitch: number },
): GraphSceneNode[] {
  const center = (ordered.length - 1) / 2;
  return ordered.map((item, rank) => ({
    id: item.id,
    label: item.label,
    x: graphCoord((rank - center) * options.xPitch),
    y: graphCoord(options.yTop + item.depth * options.yPitch),
  }));
}

export function pointerMarkerId(name: string): string {
  return `ptr-${name}`;
}

export interface GraphPointerMarker {
  /** Label drawn in the marker, e.g. `prev` / `curr` / `next`. */
  name: string;
  /** Node the arrow points at; a marker with no target is skipped. */
  target?: string | null;
  /** Accent the arrow — used for the pointer the step is actually moving. */
  accent?: boolean;
}

/**
 * Named pointers drawn as labelled markers above the row, each with an arrow
 * down to the node it references — so the pointers are visible on stage, not
 * only in the caption. A marker whose target is missing from `nodes` is
 * skipped rather than drawn at the origin.
 */
export function pointerMarkers(
  nodes: readonly GraphSceneNode[],
  markers: readonly GraphPointerMarker[],
  rowY: number,
): { nodes: GraphSceneNode[]; edges: GraphSceneEdge[] } {
  const markerNodes: GraphSceneNode[] = [];
  const markerEdges: GraphSceneEdge[] = [];
  for (const marker of markers) {
    const targetId = marker.target;
    if (!targetId) continue;
    const target = nodes.find((node) => node.id === targetId);
    if (!target) continue;
    const id = pointerMarkerId(marker.name);
    markerNodes.push({ id, label: marker.name, x: target.x, y: rowY });
    markerEdges.push({
      id: `${id}-edge`,
      source: id,
      target: targetId,
      emphasis: marker.accent ? "accent" : undefined,
    });
  }
  return { nodes: markerNodes, edges: markerEdges };
}
