import { resolveAssetForRenderer } from "../../assets/assetResolver";
import type { GraphSceneEdge, GraphSceneNode, GraphSceneSnapshot } from "../../types";

export interface GraphLayoutNodeInput {
  id: string;
  label?: string | null;
  x?: number | null;
  y?: number | null;
}

export interface GraphLayoutEdgeInput {
  id?: string | null;
  source: string;
  target: string;
  label?: string | null;
  weight?: number | null;
}

export interface BfsGraphLayoutInput {
  packId: string;
  nodes?: GraphLayoutNodeInput[] | null;
  edges?: GraphLayoutEdgeInput[] | null;
  currentNodeId?: string | null;
  activeNodeIds?: string[] | null;
  activeEdgeIds?: string[] | null;
  visitedNodeIds?: string[] | null;
  queueNodeIds?: string[] | null;
  frontierNodeIds?: string[] | null;
  caption?: string | null;
}

const DEFAULT_NODES: GraphLayoutNodeInput[] = [
  { id: "S", label: "S", x: -3, y: 0 },
  { id: "A", label: "A", x: -1, y: 0 },
  { id: "B", label: "B", x: 1.1, y: -1.3 },
  { id: "C", label: "C", x: 1.1, y: 1.3 },
  { id: "D", label: "D", x: 3, y: 0 },
];

const DEFAULT_EDGES: GraphLayoutEdgeInput[] = [
  { id: "S-A", source: "S", target: "A" },
  { id: "A-B", source: "A", target: "B" },
  { id: "A-C", source: "A", target: "C" },
  { id: "B-D", source: "B", target: "D" },
  { id: "C-D", source: "C", target: "D" },
];

function resolveAssetId(packId: string, semanticRole: string, fallbacks: string[] = []): string | undefined {
  for (const role of [semanticRole, ...fallbacks]) {
    const asset = resolveAssetForRenderer("graph_scene", role, packId) ?? resolveAssetForRenderer("graph_scene", role);
    if (asset) return asset.id;
  }
  return undefined;
}

function normalizeNodes(nodes: GraphLayoutNodeInput[] | null | undefined): GraphSceneNode[] {
  const source = nodes?.length ? nodes : DEFAULT_NODES;
  const count = Math.max(1, source.length);
  return source.map((node, index) => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    return {
      id: node.id,
      label: node.label ?? node.id,
      x: node.x ?? Math.round(Math.cos(angle) * 30) / 10,
      y: node.y ?? Math.round(Math.sin(angle) * 18) / 10,
    };
  });
}

function normalizeEdges(edges: GraphLayoutEdgeInput[] | null | undefined): GraphSceneEdge[] {
  const source = edges?.length ? edges : DEFAULT_EDGES;
  return source.map((edge) => ({
    id: edge.id ?? `${edge.source}-${edge.target}`,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    weight: edge.weight,
  }));
}

export function compileBfsGraphLayout(input: BfsGraphLayoutInput): GraphSceneSnapshot {
  return {
    kind: "graph_scene",
    pack_id: input.packId,
    asset_id: resolveAssetId(input.packId, "bfs", ["graph_scene", "graph"]),
    nodes: normalizeNodes(input.nodes),
    edges: normalizeEdges(input.edges),
    directed: true,
    current_node_id: input.currentNodeId ?? "A",
    active_node_ids: input.activeNodeIds ?? (input.currentNodeId ? [input.currentNodeId] : ["A"]),
    visited_node_ids: input.visitedNodeIds ?? ["S"],
    queue_node_ids: input.queueNodeIds ?? ["B", "C"],
    frontier_node_ids: input.frontierNodeIds ?? [],
    active_edge_ids: input.activeEdgeIds ?? ["A-B"],
    caption: input.caption ?? "BFS expands the current node and appends unvisited neighbors to the queue.",
  };
}
