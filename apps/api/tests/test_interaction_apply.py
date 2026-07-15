from __future__ import annotations

import pytest

from app.application.dto.interaction_dto import ApplyInteractionVersionRequest
from app.domain.models.playbook import (
    CodeHighlightOverlay,
    GraphSceneSnapshot,
    MathPlotSnapshot,
    PlaybookScript,
)
from app.domain.services.interaction_apply import (
    InteractionApplyError,
    apply_interaction_events,
)
from app.domain.skills.algebra_core.parser import parse_expression


def test_derivative_event_recomputes_tangent_without_mutating_source() -> None:
    base = _math_playbook()
    request = ApplyInteractionVersionRequest.model_validate(
        {
            "manifest_version": "1",
            "events": [
                {
                    "adapter_id": "math.derivative-tangent",
                    "step_id": "plot",
                    "target_id": "step:plot:marker-x",
                    "action": "set-value",
                    "value": 3,
                    "sequence": 1,
                }
            ],
        }
    )

    result = apply_interaction_events(base, request.events)

    snapshot = result.playbook.steps[0].snapshot
    assert isinstance(snapshot, MathPlotSnapshot)
    assert snapshot.marker_x == 3
    assert isinstance(base.steps[0].snapshot, MathPlotSnapshot)
    assert base.steps[0].snapshot.marker_x == 1
    tangent = next(curve for curve in snapshot.curves if curve.semantic_role == "tangent")
    expression, _ = parse_expression(tangent.expression)
    assert float(expression.subs({"x": 3})) == pytest.approx(9)
    assert float(expression.subs({"x": 4}) - expression.subs({"x": 3})) == pytest.approx(6)
    assert result.playbook.steps[0].layers[0].body == snapshot
    assert result.playbook.total_frames == base.total_frames
    assert result.summary.startswith("Moved the tangent point")


def test_derivative_event_rejects_boundary_cusp_and_ambiguous_layers() -> None:
    boundary = _math_playbook(expression="sqrt(x)", marker_x=0, x_min=0)
    with pytest.raises(InteractionApplyError, match="two-sided"):
        apply_interaction_events(boundary, _derivative_request(0).events)

    cusp = _math_playbook(expression="abs(x)", marker_x=0)
    with pytest.raises(InteractionApplyError, match="not differentiable"):
        apply_interaction_events(cusp, _derivative_request(0).events)

    ambiguous = _math_playbook()
    ambiguous.steps[0].layers.append(ambiguous.steps[0].layers[0].model_copy(deep=True))
    with pytest.raises(InteractionApplyError, match="exactly one math_plot layer"):
        apply_interaction_events(ambiguous, _derivative_request(2).events)


def test_derivative_event_matches_frontend_param_and_layer_semantics() -> None:
    params_shadow_x = _math_playbook()
    layer_snapshot = params_shadow_x.steps[0].layers[0].body
    assert isinstance(layer_snapshot, MathPlotSnapshot)
    layer_snapshot.params = {"x": 10}

    result = apply_interaction_events(params_shadow_x, _derivative_request(3).events)

    tangent = next(
        curve
        for curve in result.playbook.steps[0].snapshot.curves  # type: ignore[union-attr]
        if curve.semantic_role == "tangent"
    )
    expression, _ = parse_expression(tangent.expression)
    assert float(expression.subs({"x": 3})) == pytest.approx(9)
    assert float(expression.subs({"x": 4}) - expression.subs({"x": 3})) == pytest.approx(6)

    layered = _math_playbook().model_dump(mode="json")
    math_layer = layered["steps"][0]["layers"][0]
    layered["steps"][0]["snapshot"] = {
        "kind": "math_formula",
        "formula_latex": "stale fallback",
    }
    layered["steps"][0]["layers"] = [
        {"body": {"kind": "math_formula", "formula_latex": "overlay"}},
        math_layer,
    ]

    applied = apply_interaction_events(
        PlaybookScript.model_validate(layered),
        _derivative_request(2).events,
    ).playbook.steps[0]
    assert isinstance(applied.snapshot, MathPlotSnapshot)
    assert applied.snapshot.marker_x == 2
    assert applied.layers[0].body.kind == "math_formula"
    assert isinstance(applied.layers[1].body, MathPlotSnapshot)
    assert applied.layers[1].body.marker_x == 2


def test_bfs_event_applies_first_frame_and_preserves_unrelated_scenes() -> None:
    base = _bfs_playbook()
    base.steps[0].code_highlight = CodeHighlightOverlay(
        language="python",
        lines=["while queue:"],
        active_lines=[0],
        active_line=0,
        variables={"current": "A", "queue": "[B]", "visited": "{A}"},
    )
    request = ApplyInteractionVersionRequest.model_validate(
        {
            "manifest_version": "1",
            "events": [
                {
                    "adapter_id": "algorithm.bfs",
                    "step_id": "graph",
                    "target_id": "step:graph:start-node",
                    "action": "select",
                    "value": "C",
                    "sequence": 1,
                }
            ],
        }
    )

    result = apply_interaction_events(base, request.events)

    graph = result.playbook.steps[0].snapshot
    assert isinstance(graph, GraphSceneSnapshot)
    assert graph.current_node_id == "C"
    assert graph.visited_node_ids == ["C"]
    assert graph.queue_node_ids == ["A"]
    assert result.summary.endswith("C → A → B → D.")
    assert result.playbook.steps[1] == base.steps[1]
    assert result.playbook.steps[0].code_highlight is not None
    assert result.playbook.steps[0].code_highlight.variables == {
        "current": "C",
        "queue": "[A]",
        "visited": "{C}",
    }
    assert isinstance(base.steps[0].snapshot, GraphSceneSnapshot)
    assert base.steps[0].snapshot.current_node_id is None


def test_bfs_event_rejects_undeclared_node_and_non_bfs_lesson() -> None:
    playbook = _bfs_playbook()
    with pytest.raises(InteractionApplyError, match="does not exist"):
        apply_interaction_events(playbook, _bfs_request("missing").events)

    playbook.algorithm_id = "dfs"
    with pytest.raises(InteractionApplyError, match="requires a BFS"):
        apply_interaction_events(playbook, _bfs_request("A").events)


def test_apply_request_rejects_unknown_patch_fields_and_sequence_gaps() -> None:
    event = {
        "adapter_id": "algorithm.bfs",
        "step_id": "graph",
        "target_id": "step:graph:start-node",
        "action": "select",
        "value": "A",
        "sequence": 1,
    }
    with pytest.raises(ValueError, match="Extra inputs are not permitted"):
        ApplyInteractionVersionRequest.model_validate(
            {
                "manifest_version": "1",
                "events": [event],
                "patch": [{"op": "replace", "path": "/title", "value": "bad"}],
            }
        )

    with pytest.raises(ValueError, match="start at 1"):
        ApplyInteractionVersionRequest.model_validate(
            {
                "manifest_version": "1",
                "events": [{**event, "sequence": 2}],
            }
        )

    with pytest.raises(ValueError, match="contiguous"):
        ApplyInteractionVersionRequest.model_validate(
            {
                "manifest_version": "1",
                "events": [event, {**event, "value": "B", "sequence": 3}],
            }
        )

    with pytest.raises(ValueError, match="Extra inputs are not permitted"):
        ApplyInteractionVersionRequest.model_validate(
            {
                "manifest_version": "1",
                "events": [{**event, "path": "/steps/0"}],
            }
        )


def _derivative_request(value: float) -> ApplyInteractionVersionRequest:
    return ApplyInteractionVersionRequest.model_validate(
        {
            "manifest_version": "1",
            "events": [
                {
                    "adapter_id": "math.derivative-tangent",
                    "step_id": "plot",
                    "target_id": "step:plot:marker-x",
                    "action": "set-value",
                    "value": value,
                    "sequence": 1,
                }
            ],
        }
    )


def _bfs_request(value: str) -> ApplyInteractionVersionRequest:
    return ApplyInteractionVersionRequest.model_validate(
        {
            "manifest_version": "1",
            "events": [
                {
                    "adapter_id": "algorithm.bfs",
                    "step_id": "graph",
                    "target_id": "step:graph:start-node",
                    "action": "select",
                    "value": value,
                    "sequence": 1,
                }
            ],
        }
    )


def _math_playbook(
    *,
    expression: str = "x^2",
    marker_x: float = 1,
    x_min: float = -5,
) -> PlaybookScript:
    snapshot = {
        "kind": "math_plot",
        "curves": [
            {"expression": expression, "semantic_role": "curve"},
            {
                "expression": "2*x - 1",
                "semantic_role": "tangent",
                "emphasis": "accent",
            },
        ],
        "x_min": x_min,
        "x_max": 5,
        "y_min": -1,
        "y_max": 25,
        "marker_x": marker_x,
    }
    return PlaybookScript.model_validate(
        {
            "fps": 30,
            "total_frames": 30,
            "domain": "math",
            "title": "Derivative",
            "summary": "Move a tangent point.",
            "parameter_controls": [],
            "steps": [
                {
                    "step_id": "plot",
                    "end_frame": 30,
                    "title": "Tangent",
                    "voiceover_text": "",
                    "snapshot": snapshot,
                    "layers": [{"body": snapshot}],
                    "tokens": [],
                }
            ],
        }
    )


def _bfs_playbook() -> PlaybookScript:
    graph = {
        "kind": "graph_scene",
        "nodes": [{"id": node} for node in ("A", "B", "C", "D")],
        "edges": [
            {"id": "AB", "source": "A", "target": "B"},
            {"id": "AC", "source": "A", "target": "C"},
            {"id": "BD", "source": "B", "target": "D"},
        ],
        "directed": False,
    }
    unrelated = {
        "kind": "graph_scene",
        "nodes": [{"id": "X"}, {"id": "Y"}],
        "edges": [{"source": "X", "target": "Y"}],
    }
    return PlaybookScript.model_validate(
        {
            "fps": 30,
            "total_frames": 60,
            "domain": "algorithm",
            "algorithm_id": "bfs",
            "title": "BFS",
            "summary": "Choose a start node.",
            "parameter_controls": [],
            "steps": [
                {
                    "step_id": "graph",
                    "end_frame": 30,
                    "title": "Graph",
                    "voiceover_text": "",
                    "snapshot": graph,
                    "layers": [{"body": graph}],
                    "tokens": [],
                },
                {
                    "step_id": "other",
                    "end_frame": 60,
                    "title": "Other",
                    "voiceover_text": "",
                    "snapshot": unrelated,
                    "layers": [{"body": unrelated}],
                    "tokens": [],
                },
            ],
        }
    )
