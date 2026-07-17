from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass
from typing import TypeVar

from app.application.dto.interaction_dto import (
    BfsInteractionEvent,
    DerivativeInteractionEvent,
    InteractionEvent,
)
from app.domain.models.playbook import (
    GraphSceneSnapshot,
    MathPlotCurve,
    MathPlotSnapshot,
    MetaStep,
    PlaybookScript,
)
from app.domain.services.safe_math_expr import (
    SafeMathExpressionError,
    compile_safe_math_expression,
)


class InteractionApplyError(ValueError):
    """Raised when normalized interaction events cannot be replayed safely."""


_MAX_GRAPH_NODES = 500
_MAX_GRAPH_EDGES = 2_000
_SnapshotT = TypeVar("_SnapshotT", MathPlotSnapshot, GraphSceneSnapshot)


@dataclass(frozen=True)
class InteractionApplyResult:
    playbook: PlaybookScript
    summaries: list[str]

    @property
    def summary(self) -> str:
        if len(self.summaries) == 1:
            return self.summaries[0]
        return f"Applied {len(self.summaries)} learner interactions."


def apply_interaction_events(
    playbook: PlaybookScript,
    events: list[InteractionEvent],
) -> InteractionApplyResult:
    if not events:
        raise InteractionApplyError("At least one interaction event is required")
    current = playbook.model_copy(deep=True)
    summaries: list[str] = []
    for event in events:
        if isinstance(event, DerivativeInteractionEvent):
            summaries.append(_apply_derivative(current, event))
        elif isinstance(event, BfsInteractionEvent):
            summaries.append(_apply_bfs(current, event))
        else:  # pragma: no cover - the DTO discriminator rejects this first
            raise InteractionApplyError("Unsupported interaction adapter")
    return InteractionApplyResult(playbook=current, summaries=summaries)


def _single_step(playbook: PlaybookScript, step_id: str) -> MetaStep:
    matches = [step for step in playbook.steps if step.step_id == step_id]
    if len(matches) != 1:
        raise InteractionApplyError("Interaction step must resolve to exactly one scene")
    return matches[0]


def _interaction_snapshot(
    step: MetaStep,
    snapshot_type: type[_SnapshotT],
    kind: str,
) -> _SnapshotT | None:
    if not step.layers:
        return step.snapshot if isinstance(step.snapshot, snapshot_type) else None
    matching = [layer.body for layer in step.layers if layer.body.kind == kind]
    if len(matching) != 1:
        raise InteractionApplyError(
            f"Interaction target must resolve to exactly one {kind} layer"
        )
    snapshot = matching[0]
    return snapshot if isinstance(snapshot, snapshot_type) else None


def _replace_snapshot(
    step: MetaStep,
    snapshot: MathPlotSnapshot | GraphSceneSnapshot,
) -> None:
    step.snapshot = snapshot
    if not step.layers:
        return
    matching = [
        index for index, layer in enumerate(step.layers) if layer.body.kind == snapshot.kind
    ]
    if len(matching) != 1:
        raise InteractionApplyError(
            f"Interaction target must resolve to exactly one {snapshot.kind} layer"
        )
    step.layers[matching[0]].body = snapshot.model_copy(deep=True)


def _topic_value(playbook: PlaybookScript) -> str:
    return getattr(playbook.domain, "value", str(playbook.domain))


def _apply_derivative(
    playbook: PlaybookScript,
    event: DerivativeInteractionEvent,
) -> str:
    if _topic_value(playbook) != "math":
        raise InteractionApplyError("Derivative interaction requires a math playbook")
    step = _single_step(playbook, event.step_id)
    snapshot = _interaction_snapshot(step, MathPlotSnapshot, "math_plot")
    if snapshot is None:
        raise InteractionApplyError("Derivative interaction requires a math plot scene")
    if (
        snapshot.marker_x is None
        or not math.isfinite(snapshot.marker_x)
        or not math.isfinite(snapshot.x_min)
        or not math.isfinite(snapshot.x_max)
        or snapshot.x_min >= snapshot.x_max
        or not snapshot.x_min <= snapshot.marker_x <= snapshot.x_max
        or any(not math.isfinite(value) for value in snapshot.params.values())
    ):
        raise InteractionApplyError("Derivative interaction manifest is not valid")

    source = next(
        (
            curve
            for curve in snapshot.curves
            if curve.semantic_role not in {"tangent", "normal"}
        ),
        None,
    )
    tangent_index = next(
        (
            index
            for index, curve in enumerate(snapshot.curves)
            if curve.semantic_role == "tangent"
        ),
        None,
    )
    if source is None or tangent_index is None:
        raise InteractionApplyError("Derivative interaction requires source and tangent curves")

    # Validate the original manifest point before accepting the normalized event.
    _estimate_derivative(snapshot, source.expression, snapshot.marker_x)
    marker_x = float(event.value)
    if marker_x < snapshot.x_min or marker_x > snapshot.x_max:
        raise InteractionApplyError("Marker x is outside the declared plot bounds")
    y, slope = _estimate_derivative(snapshot, source.expression, marker_x)

    next_snapshot = snapshot.model_copy(deep=True)
    next_snapshot.marker_x = marker_x
    next_snapshot.curves[tangent_index] = MathPlotCurve(
        expression=(
            f"({_concise(slope)}) * (x - ({_concise(marker_x)})) + ({_concise(y)})"
        ),
        label=f"tangent @ x={_concise(marker_x)}",
        emphasis="accent",
        semantic_role="tangent",
    )
    _replace_snapshot(step, next_snapshot)
    return (
        f"Moved the tangent point to x={_concise(marker_x)} "
        "and recomputed the local slope."
    )


def _estimate_derivative(
    snapshot: MathPlotSnapshot,
    expression: str,
    marker_x: float,
) -> tuple[float, float]:
    try:
        fn = compile_safe_math_expression(expression)
    except SafeMathExpressionError as exc:
        raise InteractionApplyError("Derivative source expression is not valid") from exc

    span = snapshot.x_max - snapshot.x_min
    scale = max(1.0, abs(marker_x))
    h = max(1e-6, min(abs(span) * 1e-4, scale * 1e-3))
    if marker_x - h < snapshot.x_min or marker_x + h > snapshot.x_max:
        raise InteractionApplyError("Derivative pilot requires a two-sided interior point")

    def evaluate(value: float) -> float:
        scope = {name: float(param) for name, param in snapshot.params.items()}
        # Match the frontend's `{...params, x}` semantics: the plotted coordinate
        # always wins over a stored parameter with the reserved name `x`.
        scope["x"] = value
        try:
            result = fn(scope)
        except SafeMathExpressionError as exc:
            raise InteractionApplyError("Derivative is not finite at this point") from exc
        if not math.isfinite(result):
            raise InteractionApplyError("Derivative is not finite at this point")
        return result

    y = evaluate(marker_x)
    estimates: list[tuple[float, float, float]] = []
    for delta in (h, h / 2, h / 4, h / 8):
        left = (y - evaluate(marker_x - delta)) / delta
        right = (evaluate(marker_x + delta) - y) / delta
        central = (left + right) / 2
        if not all(math.isfinite(value) for value in (left, right, central)):
            raise InteractionApplyError("Derivative is not finite at this point")
        estimates.append((left, right, central))

    finest = estimates[-1]
    previous = estimates[-2]
    side_tolerance = 1e-5 + 5e-3 * max(1.0, abs(finest[0]), abs(finest[1]))
    if abs(finest[0] - finest[1]) > side_tolerance:
        raise InteractionApplyError("The selected point is not differentiable")
    convergence_tolerance = 1e-6 + 2e-3 * max(
        1.0,
        abs(finest[2]),
        abs(previous[2]),
    )
    if abs(finest[2] - previous[2]) > convergence_tolerance:
        raise InteractionApplyError("The derivative estimate does not converge")
    return y, finest[2]


def _apply_bfs(playbook: PlaybookScript, event: BfsInteractionEvent) -> str:
    if (playbook.algorithm_id or "").lower() != "bfs":
        raise InteractionApplyError("BFS interaction requires a BFS playbook")
    step = _single_step(playbook, event.step_id)
    graph = _interaction_snapshot(step, GraphSceneSnapshot, "graph_scene")
    if graph is None:
        raise InteractionApplyError("BFS interaction requires a graph scene")
    node_ids = [node.id for node in graph.nodes]
    node_set = set(node_ids)
    if (
        not node_ids
        or len(node_set) != len(node_ids)
        or any(not node_id for node_id in node_ids)
    ):
        raise InteractionApplyError("BFS graph node ids are not valid")
    if any(edge.source not in node_set or edge.target not in node_set for edge in graph.edges):
        raise InteractionApplyError("BFS graph edges must reference declared nodes")
    if len(node_ids) > _MAX_GRAPH_NODES or len(graph.edges) > _MAX_GRAPH_EDGES:
        raise InteractionApplyError("BFS graph exceeds the interaction pilot limits")
    if event.value not in node_set:
        raise InteractionApplyError("Selected BFS start node does not exist")

    order = {node_id: index for index, node_id in enumerate(node_ids)}
    adjacency: dict[str, list[tuple[str, str | None]]] = {
        node_id: [] for node_id in node_ids
    }
    for edge in graph.edges:
        adjacency[edge.source].append((edge.target, edge.id))
        if not graph.directed:
            adjacency[edge.target].append((edge.source, edge.id))
    for neighbors in adjacency.values():
        neighbors.sort(key=lambda item: order[item[0]])

    queue: deque[tuple[str, str | None]] = deque([(event.value, None)])
    queued = {event.value}
    seen: set[str] = set()
    visited: list[str] = []
    first_state: tuple[str, list[str], list[str], list[str]] | None = None
    visit_order: list[str] = []
    while queue:
        current, via_edge_id = queue.popleft()
        queued.discard(current)
        if current in seen:
            continue
        seen.add(current)
        visited.append(current)
        visit_order.append(current)
        for neighbor, edge_id in adjacency[current]:
            if neighbor not in seen and neighbor not in queued:
                queue.append((neighbor, edge_id))
                queued.add(neighbor)
        if first_state is None:
            first_state = (
                current,
                list(visited),
                [node_id for node_id, _ in queue],
                [via_edge_id] if via_edge_id else [],
            )

    assert first_state is not None
    current, first_visited, first_queue, active_edges = first_state
    next_graph = graph.model_copy(deep=True)
    next_graph.nodes = [
        node.model_copy(update={"emphasis": "secondary", "asset_id": None})
        for node in graph.nodes
    ]
    next_graph.edges = [
        edge.model_copy(update={"emphasis": "secondary", "asset_id": None})
        for edge in graph.edges
    ]
    next_graph.current_node_id = current
    next_graph.active_node_ids = [current]
    next_graph.active_edge_ids = active_edges
    next_graph.visited_node_ids = first_visited
    next_graph.queue_node_ids = first_queue
    next_graph.frontier_node_ids = first_queue
    _replace_snapshot(step, next_graph)
    if step.code_highlight is not None:
        variables = dict(step.code_highlight.variables)
        variables.update(
            {
                "current": current,
                "queue": f"[{', '.join(first_queue)}]",
                "visited": f"{{{', '.join(first_visited)}}}",
            }
        )
        step.code_highlight = step.code_highlight.model_copy(
            update={"variables": variables}
        )
    return (
        f"Prepared BFS replay from node {event.value}; "
        f"visit order: {' → '.join(visit_order)}."
    )


def _concise(value: float) -> str:
    if value == 0:
        return "0"
    return format(value, ".12g")
