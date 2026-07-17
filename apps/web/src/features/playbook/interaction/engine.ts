import { compileExpr } from "../../../shared/lib/mathExpr";
import type {
  GraphSceneSnapshot,
  MathPlotSnapshot,
  MetaStep,
  PlaybookScript,
} from "../engine/types";
import {
  InteractionEngineError,
  type BfsInteractionBinding,
  type BfsInteractionCommand,
  type BfsInteractionReplay,
  type DerivativeInteractionBinding,
  type DerivativeInteractionCommand,
  type InteractionAdapterManifest,
  type InteractionBinding,
  type InteractionCommand,
  type InteractionManifest,
  type InteractionResult,
} from "./types";

const DERIVATIVE_ADAPTER = "math.derivative-tangent" as const;
const BFS_ADAPTER = "algorithm.bfs" as const;

function bindingId(stepId: string, role: InteractionBinding["target_role"]): string {
  return `step:${stepId}:${role}`;
}

function sourceCurve(snapshot: MathPlotSnapshot) {
  return snapshot.curves.find((curve) =>
    curve.semantic_role !== "tangent" && curve.semantic_role !== "normal"
  );
}

function hasFiniteParams(snapshot: MathPlotSnapshot): boolean {
  return Object.values(snapshot.params ?? {}).every(Number.isFinite);
}

function uniqueMathPlot(step: MetaStep): MathPlotSnapshot | null {
  if (step.snapshot.kind !== "math_plot") return null;
  if (step.layers != null && step.layers.length > 0) {
    const matches = step.layers.filter((layer) => layer.body.kind === "math_plot");
    if (matches.length !== 1 || step.layers[0]?.body.kind !== "math_plot") return null;
  }
  return step.snapshot;
}

function uniqueGraphScene(step: MetaStep): GraphSceneSnapshot | null {
  if (!step.layers?.length) {
    return step.snapshot.kind === "graph_scene" ? step.snapshot : null;
  }
  const matches = step.layers.filter((layer) => layer.body.kind === "graph_scene");
  return matches.length === 1 ? matches[0].body as GraphSceneSnapshot : null;
}

function mathBindings(script: PlaybookScript): DerivativeInteractionBinding[] {
  if (script.domain !== "math") return [];
  return script.steps.flatMap((step) => {
    const snapshot = uniqueMathPlot(step);
    if (
      !snapshot ||
      snapshot.marker_x == null ||
      !Number.isFinite(snapshot.marker_x) ||
      !Number.isFinite(snapshot.x_min) ||
      !Number.isFinite(snapshot.x_max) ||
      snapshot.x_min >= snapshot.x_max ||
      snapshot.marker_x < snapshot.x_min ||
      snapshot.marker_x > snapshot.x_max ||
      !sourceCurve(snapshot) ||
      !snapshot.curves.some((curve) => curve.semantic_role === "tangent") ||
      !hasFiniteParams(snapshot)
    ) return [];

    try {
      estimateDerivative(snapshot, snapshot.marker_x);
    } catch {
      return [];
    }

    return [{
      id: bindingId(step.step_id, "marker-x"),
      adapter_id: DERIVATIVE_ADAPTER,
      step_id: step.step_id,
      target_role: "marker-x",
      action: "set-value",
      label: "切点 x",
      min: snapshot.x_min,
      max: snapshot.x_max,
      value: snapshot.marker_x,
    }];
  });
}

function validGraph(snapshot: GraphSceneSnapshot): boolean {
  if (snapshot.nodes.length === 0) return false;
  const ids = new Set(snapshot.nodes.map((node) => node.id));
  if (ids.size !== snapshot.nodes.length || [...ids].some((id) => !id)) return false;
  return snapshot.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target));
}

function bfsBindings(script: PlaybookScript): BfsInteractionBinding[] {
  if (script.domain !== "algorithm" || script.algorithm_id?.toLowerCase() !== "bfs") return [];
  return script.steps.flatMap((step) => {
    const snapshot = uniqueGraphScene(step);
    if (!snapshot || !validGraph(snapshot)) return [];
    const selected = snapshot.current_node_id &&
      snapshot.nodes.some((node) => node.id === snapshot.current_node_id)
      ? snapshot.current_node_id
      : snapshot.nodes[0].id;
    return [{
      id: bindingId(step.step_id, "start-node"),
      adapter_id: BFS_ADAPTER,
      step_id: step.step_id,
      target_role: "start-node",
      action: "select",
      label: "BFS 起点",
      value: selected,
      options: snapshot.nodes.map((node) => ({ id: node.id, label: node.label ?? node.id })),
    }];
  });
}

export function deriveInteractionManifest(script: PlaybookScript): InteractionManifest {
  const adapters: InteractionAdapterManifest[] = [];
  const derivative = mathBindings(script);
  const bfs = bfsBindings(script);
  if (derivative.length) {
    adapters.push({ adapter_id: DERIVATIVE_ADAPTER, experimental: true, bindings: derivative });
  }
  if (bfs.length) {
    adapters.push({ adapter_id: BFS_ADAPTER, experimental: true, bindings: bfs });
  }
  return { version: "1", adapters };
}

function requireBinding(script: PlaybookScript, command: InteractionCommand): InteractionBinding {
  const binding = deriveInteractionManifest(script).adapters
    .find((adapter) => adapter.adapter_id === command.adapter_id)
    ?.bindings.find((candidate) =>
      candidate.id === command.target_id &&
      candidate.step_id === command.step_id &&
      candidate.adapter_id === command.adapter_id &&
      candidate.action === command.action
    );
  if (!binding) {
    throw new InteractionEngineError("Interaction target is not declared by the manifest");
  }
  return binding;
}

function concise(value: number): string {
  return Number(value.toPrecision(12)).toString();
}

interface DerivativeEstimate {
  y: number;
  slope: number;
}

function estimateDerivative(
  snapshot: MathPlotSnapshot,
  markerX: number,
): DerivativeEstimate {
  const lead = sourceCurve(snapshot);
  if (!lead) throw new InteractionEngineError("Derivative interaction requires a source curve");

  let fn: ReturnType<typeof compileExpr>;
  try {
    fn = compileExpr(lead.expression);
  } catch {
    throw new InteractionEngineError("Derivative interaction requires a valid source expression");
  }

  const span = snapshot.x_max - snapshot.x_min;
  const scale = Math.max(1, Math.abs(markerX));
  const h = Math.max(1e-6, Math.min(Math.abs(span) * 1e-4, scale * 1e-3));
  if (markerX - h < snapshot.x_min || markerX + h > snapshot.x_max) {
    throw new InteractionEngineError("Derivative pilot requires a two-sided interior point");
  }

  const scope = snapshot.params ?? {};
  const evaluate = (x: number): number => {
    const value = fn({ ...scope, x });
    if (!Number.isFinite(value)) {
      throw new InteractionEngineError("Derivative is not finite at this point");
    }
    return value;
  };

  const y = evaluate(markerX);
  const estimates = [h, h / 2, h / 4, h / 8].map((delta) => {
    const left = (y - evaluate(markerX - delta)) / delta;
    const right = (evaluate(markerX + delta) - y) / delta;
    const central = (left + right) / 2;
    if (![left, right, central].every(Number.isFinite)) {
      throw new InteractionEngineError("Derivative is not finite at this point");
    }
    return { left, right, central };
  });

  const finest = estimates[estimates.length - 1];
  const previous = estimates[estimates.length - 2];
  const sideTolerance =
    1e-5 + 5e-3 * Math.max(1, Math.abs(finest.left), Math.abs(finest.right));
  if (Math.abs(finest.left - finest.right) > sideTolerance) {
    throw new InteractionEngineError("The selected point is not differentiable");
  }
  const convergenceTolerance =
    1e-6 + 2e-3 * Math.max(1, Math.abs(finest.central), Math.abs(previous.central));
  if (Math.abs(finest.central - previous.central) > convergenceTolerance) {
    throw new InteractionEngineError("The derivative estimate does not converge");
  }

  return { y, slope: finest.central };
}

function updateMathSnapshot(snapshot: MathPlotSnapshot, markerX: number): MathPlotSnapshot {
  if (!Number.isFinite(markerX) || markerX < snapshot.x_min || markerX > snapshot.x_max) {
    throw new InteractionEngineError("Marker x is outside the declared plot bounds");
  }
  const { y, slope } = estimateDerivative(snapshot, markerX);
  const tangent = {
    expression: `(${concise(slope)}) * (x - (${concise(markerX)})) + (${concise(y)})`,
    label: `tangent @ x=${concise(markerX)}`,
    emphasis: "accent",
    semantic_role: "tangent",
  };
  const tangentIndex = snapshot.curves.findIndex((curve) => curve.semantic_role === "tangent");
  if (tangentIndex < 0) {
    throw new InteractionEngineError("Derivative interaction requires a declared tangent curve");
  }
  const curves = [...snapshot.curves];
  curves[tangentIndex] = tangent;
  return { ...snapshot, marker_x: markerX, curves };
}

interface BfsState {
  current: string;
  visited: string[];
  queue: string[];
  activeEdgeIds: string[];
}

export function formatBfsCodeVariables(
  current: string,
  queue: readonly string[],
  visited: readonly string[],
): Record<"current" | "queue" | "visited", string> {
  return {
    current,
    queue: `[${queue.join(", ")}]`,
    visited: `{${visited.join(", ")}}`,
  };
}

interface BfsNeighbor {
  nodeId: string;
  edgeId: string | null;
}

function bfsTrace(graph: GraphSceneSnapshot, startId: string): BfsState[] {
  const nodeIds = graph.nodes.map((node) => node.id);
  if (!nodeIds.includes(startId)) {
    throw new InteractionEngineError("Selected BFS start node does not exist");
  }
  if (!validGraph(graph)) {
    throw new InteractionEngineError("BFS graph is not valid");
  }

  const order = new Map(nodeIds.map((id, index) => [id, index]));
  const adjacency = new Map(nodeIds.map((id) => [id, [] as BfsNeighbor[]]));
  graph.edges.forEach((edge) => {
    adjacency.get(edge.source)?.push({ nodeId: edge.target, edgeId: edge.id ?? null });
    if (!graph.directed) {
      adjacency.get(edge.target)?.push({ nodeId: edge.source, edgeId: edge.id ?? null });
    }
  });
  for (const neighbors of adjacency.values()) {
    neighbors.sort((a, b) => (order.get(a.nodeId) ?? 0) - (order.get(b.nodeId) ?? 0));
  }

  const queue: Array<{ nodeId: string; viaEdgeId: string | null }> = [{
    nodeId: startId,
    viaEdgeId: null,
  }];
  const queued = new Set([startId]);
  const visited: string[] = [];
  const seen = new Set<string>();
  const trace: BfsState[] = [];

  while (queue.length) {
    const entry = queue.shift();
    if (!entry) break;
    queued.delete(entry.nodeId);
    if (seen.has(entry.nodeId)) continue;
    seen.add(entry.nodeId);
    visited.push(entry.nodeId);

    for (const neighbor of adjacency.get(entry.nodeId) ?? []) {
      if (!seen.has(neighbor.nodeId) && !queued.has(neighbor.nodeId)) {
        queue.push({ nodeId: neighbor.nodeId, viaEdgeId: neighbor.edgeId });
        queued.add(neighbor.nodeId);
      }
    }
    trace.push({
      current: entry.nodeId,
      visited: [...visited],
      queue: queue.map((item) => item.nodeId),
      activeEdgeIds: entry.viaEdgeId ? [entry.viaEdgeId] : [],
    });
  }
  return trace;
}

function replaySnapshot(
  graph: GraphSceneSnapshot,
  state: BfsState,
): GraphSceneSnapshot {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      emphasis: undefined,
      asset_id: undefined,
    })),
    edges: graph.edges.map((edge) => ({
      ...edge,
      emphasis: undefined,
      asset_id: undefined,
    })),
    current_node_id: state.current,
    active_node_ids: [state.current],
    active_edge_ids: state.activeEdgeIds,
    visited_node_ids: state.visited,
    queue_node_ids: state.queue,
    frontier_node_ids: state.queue,
  };
}

function withSnapshot(step: MetaStep, snapshot: MathPlotSnapshot | GraphSceneSnapshot): MetaStep {
  const matchingLayers = step.layers
    ?.map((layer, index) => layer.body.kind === snapshot.kind ? index : -1)
    .filter((index) => index >= 0) ?? [];
  if (step.layers?.length && matchingLayers.length !== 1) {
    throw new InteractionEngineError(
      `Interaction requires exactly one ${snapshot.kind} layer`,
    );
  }
  const targetLayerIndex = matchingLayers[0];
  const layers = step.layers?.map((layer, index) =>
    index === targetLayerIndex ? { ...layer, body: snapshot } : layer
  );
  return { ...step, snapshot, ...(layers ? { layers } : {}) };
}

function withBfsCodeState(step: MetaStep, state: BfsState): MetaStep {
  if (!step.code_highlight) return step;
  return {
    ...step,
    code_highlight: {
      ...step.code_highlight,
      variables: {
        ...step.code_highlight.variables,
        ...formatBfsCodeVariables(state.current, state.queue, state.visited),
      },
    },
  };
}

function applyDerivative(
  script: PlaybookScript,
  command: DerivativeInteractionCommand,
  binding: DerivativeInteractionBinding,
): { script: PlaybookScript; summary: string } {
  if (
    !Number.isFinite(command.value) ||
    command.value < binding.min ||
    command.value > binding.max
  ) {
    throw new InteractionEngineError("Marker x is outside the manifest bounds");
  }

  let updated = false;
  const steps = script.steps.map((step) => {
    if (step.step_id !== command.step_id) return step;
    const snapshot = uniqueMathPlot(step);
    if (!snapshot) return step;
    updated = true;
    return withSnapshot(step, updateMathSnapshot(snapshot, command.value));
  });
  if (!updated) throw new InteractionEngineError("Derivative step no longer exists");
  return {
    script: { ...script, steps },
    summary: `Moved the tangent point to x=${concise(command.value)} and recomputed the local slope.`,
  };
}

function applyBfs(
  script: PlaybookScript,
  command: BfsInteractionCommand,
): { script: PlaybookScript; summary: string; replay: BfsInteractionReplay } {
  if (!command.value) {
    throw new InteractionEngineError("BFS start node must be a stable node id");
  }
  const anchorIndex = script.steps.findIndex((step) => step.step_id === command.step_id);
  const anchor = script.steps[anchorIndex];
  const graph = anchor ? uniqueGraphScene(anchor) : null;
  if (!anchor || !graph) {
    throw new InteractionEngineError("BFS graph step no longer exists");
  }

  const trace = bfsTrace(graph, command.value);
  const frames = trace.map((state, index) => ({
    index,
    current_node_id: state.current,
    visited_node_ids: state.visited,
    queue_node_ids: state.queue,
    snapshot: replaySnapshot(graph, state),
  }));
  const steps = [...script.steps];
  steps[anchorIndex] = withBfsCodeState(
    withSnapshot(anchor, frames[0].snapshot),
    trace[0],
  );
  const visitOrder = trace.map((state) => state.current);

  return {
    script: { ...script, steps },
    replay: {
      adapter_id: BFS_ADAPTER,
      step_id: command.step_id,
      start_node_id: command.value,
      visit_order: visitOrder,
      frames,
    },
    summary: `Prepared BFS replay from node ${command.value}; visit order: ${visitOrder.join(" → ")}.`,
  };
}

export function applyInteraction(
  script: PlaybookScript,
  command: InteractionCommand,
  sequence = 1,
): InteractionResult {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new InteractionEngineError("Interaction event sequence must be a positive integer");
  }
  const binding = requireBinding(script, command);
  if (command.adapter_id === DERIVATIVE_ADAPTER) {
    if (binding.adapter_id !== DERIVATIVE_ADAPTER) {
      throw new InteractionEngineError("Interaction binding type does not match the command");
    }
    const applied = applyDerivative(script, command, binding);
    return { ...applied, event: { ...command, sequence } };
  }
  if (binding.adapter_id !== BFS_ADAPTER) {
    throw new InteractionEngineError("Interaction binding type does not match the command");
  }
  const applied = applyBfs(script, command);
  return { ...applied, event: { ...command, sequence } };
}
