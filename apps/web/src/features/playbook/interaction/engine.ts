import { compileExpr } from "../../../shared/lib/mathExpr";
import type {
  GraphSceneSnapshot,
  MathPlotSnapshot,
  MetaStep,
  PlaybookScript,
} from "../engine/types";
import {
  InteractionEngineError,
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

function mathBindings(script: PlaybookScript): InteractionBinding[] {
  return script.steps.flatMap((step) => {
    const snapshot = step.snapshot;
    if (
      snapshot.kind !== "math_plot" ||
      snapshot.marker_x == null ||
      snapshot.curves.length === 0 ||
      !Number.isFinite(snapshot.x_min) ||
      !Number.isFinite(snapshot.x_max) ||
      snapshot.x_min >= snapshot.x_max
    ) return [];
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

function bfsBindings(script: PlaybookScript): InteractionBinding[] {
  if (script.algorithm_id?.toLowerCase() !== "bfs") return [];
  return script.steps.flatMap((step) => {
    const snapshot = step.snapshot;
    if (snapshot.kind !== "graph_scene" || snapshot.nodes.length === 0) return [];
    const ids = new Set(snapshot.nodes.map((node) => node.id));
    if (ids.size !== snapshot.nodes.length || [...ids].some((id) => !id)) return [];
    return [{
      id: bindingId(step.step_id, "start-node"),
      adapter_id: BFS_ADAPTER,
      step_id: step.step_id,
      target_role: "start-node",
      action: "select",
      label: "BFS 起点",
      value: snapshot.current_node_id ?? snapshot.nodes[0].id,
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
      candidate.action === command.action
    );
  if (!binding) {
    throw new InteractionEngineError("Interaction target is not declared by the manifest");
  }
  return binding;
}

function finiteNumber(value: number | string, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new InteractionEngineError(`${label} must be a finite number`);
  }
  return parsed;
}

function concise(value: number): string {
  return Number(value.toPrecision(12)).toString();
}

function updateMathSnapshot(snapshot: MathPlotSnapshot, markerX: number): MathPlotSnapshot {
  if (markerX < snapshot.x_min || markerX > snapshot.x_max) {
    throw new InteractionEngineError("Marker x is outside the declared plot bounds");
  }
  const lead = snapshot.curves.find((curve) =>
    curve.semantic_role !== "tangent" && curve.semantic_role !== "normal"
  );
  if (!lead) throw new InteractionEngineError("Derivative interaction requires a source curve");

  let fn: ReturnType<typeof compileExpr>;
  try {
    fn = compileExpr(lead.expression);
  } catch {
    throw new InteractionEngineError("Derivative interaction requires a valid source expression");
  }

  const scope = snapshot.params ?? {};
  const h = Math.max(Math.abs(snapshot.x_max - snapshot.x_min) * 1e-5, 1e-6);
  const left = Math.max(snapshot.x_min, markerX - h);
  const right = Math.min(snapshot.x_max, markerX + h);
  if (right <= left) throw new InteractionEngineError("Derivative cannot be sampled at this point");

  let y: number;
  let slope: number;
  try {
    y = fn({ ...scope, x: markerX });
    slope = (fn({ ...scope, x: right }) - fn({ ...scope, x: left })) / (right - left);
  } catch {
    throw new InteractionEngineError("Derivative cannot be evaluated at this point");
  }
  if (!Number.isFinite(y) || !Number.isFinite(slope)) {
    throw new InteractionEngineError("Derivative is not finite at this point");
  }

  const tangent = {
    expression: `(${concise(slope)}) * (x - (${concise(markerX)})) + (${concise(y)})`,
    label: `tangent @ x=${concise(markerX)}`,
    emphasis: "accent",
    semantic_role: "tangent",
  };
  const tangentIndex = snapshot.curves.findIndex((curve) => curve.semantic_role === "tangent");
  const curves = [...snapshot.curves];
  if (tangentIndex >= 0) curves[tangentIndex] = tangent;
  else curves.push(tangent);
  return { ...snapshot, marker_x: markerX, curves };
}

interface BfsState {
  current: string;
  visited: string[];
  queue: string[];
}

function bfsTrace(graph: GraphSceneSnapshot, startId: string): BfsState[] {
  const nodeIds = graph.nodes.map((node) => node.id);
  if (!nodeIds.includes(startId)) {
    throw new InteractionEngineError("Selected BFS start node does not exist");
  }
  const order = new Map(nodeIds.map((id, index) => [id, index]));
  const adjacency = new Map(nodeIds.map((id) => [id, [] as string[]]));
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) {
      throw new InteractionEngineError("BFS graph contains an edge with an unknown node");
    }
    adjacency.get(edge.source)?.push(edge.target);
    if (!graph.directed) adjacency.get(edge.target)?.push(edge.source);
  }
  for (const neighbors of adjacency.values()) {
    neighbors.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  }

  const queue = [startId];
  const queued = new Set(queue);
  const visited: string[] = [];
  const seen = new Set<string>();
  const trace: BfsState[] = [];
  while (queue.length) {
    const current = queue.shift() as string;
    queued.delete(current);
    if (seen.has(current)) continue;
    seen.add(current);
    visited.push(current);
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!seen.has(neighbor) && !queued.has(neighbor)) {
        queue.push(neighbor);
        queued.add(neighbor);
      }
    }
    trace.push({ current, visited: [...visited], queue: [...queue] });
  }
  return trace;
}

function withSnapshot(step: MetaStep, snapshot: MathPlotSnapshot | GraphSceneSnapshot): MetaStep {
  const layers = step.layers?.map((layer, index) =>
    index === 0 && layer.body.kind === snapshot.kind ? { ...layer, body: snapshot } : layer
  );
  return { ...step, snapshot, ...(layers ? { layers } : {}) };
}

function applyDerivative(
  script: PlaybookScript,
  command: InteractionCommand,
  binding: InteractionBinding,
): { script: PlaybookScript; summary: string } {
  const markerX = finiteNumber(command.value, "Marker x");
  if (binding.min == null || binding.max == null || markerX < binding.min || markerX > binding.max) {
    throw new InteractionEngineError("Marker x is outside the manifest bounds");
  }
  let updated = false;
  const steps = script.steps.map((step) => {
    if (step.step_id !== command.step_id || step.snapshot.kind !== "math_plot") return step;
    updated = true;
    return withSnapshot(step, updateMathSnapshot(step.snapshot, markerX));
  });
  if (!updated) throw new InteractionEngineError("Derivative step no longer exists");
  return {
    script: { ...script, steps },
    summary: `Moved the tangent point to x=${concise(markerX)} and recomputed the local slope.`,
  };
}

function applyBfs(
  script: PlaybookScript,
  command: InteractionCommand,
): { script: PlaybookScript; summary: string } {
  if (typeof command.value !== "string" || !command.value) {
    throw new InteractionEngineError("BFS start node must be a stable node id");
  }
  const anchor = script.steps.find((step) => step.step_id === command.step_id);
  if (!anchor || anchor.snapshot.kind !== "graph_scene") {
    throw new InteractionEngineError("BFS graph step no longer exists");
  }
  const trace = bfsTrace(anchor.snapshot, command.value);
  let graphIndex = 0;
  const steps = script.steps.map((step) => {
    if (step.snapshot.kind !== "graph_scene") return step;
    const state = trace[Math.min(graphIndex, trace.length - 1)];
    graphIndex += 1;
    const snapshot: GraphSceneSnapshot = {
      ...step.snapshot,
      current_node_id: state.current,
      active_node_ids: [state.current],
      visited_node_ids: state.visited,
      queue_node_ids: state.queue,
      frontier_node_ids: state.queue,
    };
    return withSnapshot(step, snapshot);
  });
  return {
    script: { ...script, steps },
    summary: `Replayed BFS from node ${command.value}; visit order: ${trace
      .map((state) => state.current).join(" → ")}.`,
  };
}

export function applyInteraction(
  script: PlaybookScript,
  command: InteractionCommand,
  sequence = 1,
): InteractionResult {
  const binding = requireBinding(script, command);
  const applied = command.adapter_id === DERIVATIVE_ADAPTER
    ? applyDerivative(script, command, binding)
    : applyBfs(script, command);
  return { ...applied, event: { ...command, sequence } };
}
