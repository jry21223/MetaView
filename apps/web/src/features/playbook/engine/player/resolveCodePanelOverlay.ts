import type {
  CallStackSceneSnapshot,
  CodeHighlightOverlay,
  GraphSceneSnapshot,
  PlaybookScript,
} from "../types";

function findFirstSourceOverlay(script: PlaybookScript): CodeHighlightOverlay | null {
  for (const step of script.steps) {
    if (step.code_highlight && step.code_highlight.lines.length > 0) {
      return step.code_highlight;
    }
  }
  return null;
}

function isBfsGraph(script: PlaybookScript, snapshot: GraphSceneSnapshot): boolean {
  const declared = [
    script.algorithm_id ?? "",
    ...(script.initial_data?.scene_blueprint ?? []),
    snapshot.asset_id ?? "",
  ].map((value) => value.toLowerCase());
  return declared.some(
    (value) =>
      value === "bfs" ||
      value.includes("bfs_graph") ||
      value.includes("breadth_first") ||
      value.includes("bfs-graph"),
  );
}

function graphStateOverlay(
  script: PlaybookScript,
  snapshot: GraphSceneSnapshot,
): CodeHighlightOverlay | null {
  if (!isBfsGraph(script, snapshot)) return null;
  const current = snapshot.current_node_id ?? snapshot.active_node_ids?.[0] ?? "done";
  const queue = [...new Set([...(snapshot.queue_node_ids ?? []), ...(snapshot.frontier_node_ids ?? [])])];
  const visited = snapshot.visited_node_ids ?? [];
  return {
    language: "pseudocode",
    lines: [
      `current = ${current}`,
      `for neighbor in graph[${current}]:`,
      "    queue.enqueue(neighbor)",
    ],
    active_lines: [snapshot.active_edge_ids?.length ? 1 : 0],
    active_line: snapshot.active_edge_ids?.length ? 1 : 0,
    variables: {
      current,
      queue: `[${queue.join(", ")}]`,
      visited: `{${visited.join(", ")}}`,
    },
    operation_label: snapshot.active_edge_ids?.length ? "scan neighbors" : "BFS state",
  };
}

function callStackOverlay(snapshot: CallStackSceneSnapshot): CodeHighlightOverlay | null {
  const trace = snapshot.code_trace;
  if (!trace?.lines.length) return null;
  const current = snapshot.frames.find((frame) => frame.id === snapshot.current_frame_id);
  return {
    language: trace.language,
    lines: trace.lines,
    active_lines: trace.active_lines,
    active_line: trace.active_line,
    variables: current?.variables ?? {},
    operation_label: current?.state ?? "call stack",
  };
}

function snapshotOverlay(script: PlaybookScript, stepIndex: number): CodeHighlightOverlay | null {
  const snapshot = script.steps[stepIndex]?.snapshot;
  if (snapshot?.kind === "graph_scene") return graphStateOverlay(script, snapshot);
  if (snapshot?.kind === "call_stack_scene") return callStackOverlay(snapshot);
  if (snapshot?.kind === "code_trace_scene" && snapshot.lines.length) {
    return {
      language: snapshot.language,
      lines: snapshot.lines,
      active_lines: snapshot.active_lines,
      active_line: snapshot.active_line,
      variables: snapshot.variables ?? {},
    };
  }
  return null;
}

export function resolveCodePanelOverlay(
  script: PlaybookScript,
  stepIndex: number,
): CodeHighlightOverlay | null {
  const step = script.steps[stepIndex];
  if (step?.code_highlight && step.code_highlight.lines.length > 0) {
    return step.code_highlight;
  }
  const derived = snapshotOverlay(script, stepIndex);
  if (derived) return derived;
  // Fallback: borrow first available source, distribute active line proportionally.
  const template = findFirstSourceOverlay(script);
  if (!template) return null;
  const total = Math.max(1, script.steps.length);
  const lineCount = template.lines.length;
  const activeLine = Math.min(
    lineCount - 1,
    Math.floor((stepIndex * lineCount) / total),
  );
  return {
    language: template.language,
    lines: template.lines,
    active_lines: [activeLine],
    active_line: activeLine,
    variables: {},
  };
}
