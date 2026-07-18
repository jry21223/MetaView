from __future__ import annotations

import copy
from pathlib import Path
from typing import Any, Callable

import pytest

from app.domain.models.playbook import PlaybookScript
from app.domain.services.scene_blueprint_compiler import compile_scene_blueprint_to_playbook
from eval.benchmark_v2 import (
    GoldCaseExpectation,
    _semantic_roles,
    load_benchmark_v2_suite,
    score_benchmark_v2,
)

ROOT = Path(__file__).resolve().parents[3]
FIXTURE_DIR = ROOT / "eval" / "fixtures"
EXPECTED_IDS = {
    "math-derivative-tangent",
    "algorithm-bfs-tree",
    "code-recursion-factorial",
    "physics-projectile",
}
DIMENSION_WEIGHTS = {
    "contract_schema": 15.0,
    "knowledge_correctness": 25.0,
    "pedagogical_structure": 20.0,
    "visual_requirement_coverage": 15.0,
    "code_sync": 5.0,
    "narration_visual_consistency": 10.0,
    "timing_export_readiness": 10.0,
}
CASE_BLUEPRINTS = {
    "math-derivative-tangent": ("math", "derivative_tangent"),
    "algorithm-bfs-tree": ("algorithm", "bfs_graph"),
    "code-recursion-factorial": ("code", "recursion_stack"),
    "physics-projectile": ("physics", "projectile_motion"),
}


@pytest.fixture(scope="module")
def expectations() -> dict[str, GoldCaseExpectation]:
    suite = load_benchmark_v2_suite()
    return {case.id: case for case in suite.cases}


def _positive_playbook(case_id: str) -> PlaybookScript:
    subject, scene_type = CASE_BLUEPRINTS[case_id]
    playbook = compile_scene_blueprint_to_playbook(
        {
            "id": case_id,
            "subject": subject,
            "sceneType": scene_type,
            "title": case_id,
            "visualIntent": ["show core visual state", "answer the prompt"],
        }
    )
    payload = playbook.model_dump(mode="json", by_alias=True)
    if case_id == "algorithm-bfs-tree":
        _apply_bfs_progression(payload)
    elif case_id == "code-recursion-factorial":
        _apply_recursion_progression(payload)
    return PlaybookScript.model_validate(payload)


def _step_snapshots(step: dict[str, Any]) -> list[dict[str, Any]]:
    return [step["snapshot"], *(layer["body"] for layer in step.get("layers") or [])]


def _apply_bfs_progression(payload: dict[str, Any]) -> None:
    states = [
        ("S", ["S"], ["A"]),
        ("A", ["S", "A"], ["B", "C"]),
        ("B", ["S", "A", "B"], ["C", "D"]),
        ("C", ["S", "A", "B", "C"], ["D"]),
        ("D", ["S", "A", "B", "C", "D"], []),
    ]
    for index, step in enumerate(payload["steps"]):
        current, visited, queue = states[min(index, len(states) - 1)]
        for snapshot in _step_snapshots(step):
            if snapshot.get("kind") != "graph_scene":
                continue
            snapshot["current_node_id"] = current
            snapshot["active_node_ids"] = [current]
            snapshot["visited_node_ids"] = visited
            snapshot["queue_node_ids"] = queue
            snapshot["frontier_node_ids"] = queue
        _sync_code_highlight_to_snapshot(step)


def _apply_recursion_progression(payload: dict[str, Any]) -> None:
    stages = [
        [(4, "active", None)],
        [(4, "waiting", None), (3, "active", None)],
        [(4, "waiting", None), (3, "waiting", None), (2, "active", None)],
        [
            (4, "waiting", None),
            (3, "waiting", None),
            (2, "waiting", None),
            (1, "active", "1"),
        ],
        [(4, "waiting", None), (3, "waiting", None), (2, "returned", "2")],
        [(4, "waiting", None), (3, "returned", "6")],
        [(4, "returned", "24")],
        [(4, "returned", "24")],
    ]
    lines = [
        "def factorial(n):",
        "    if n == 1:",
        "        return 1",
        "    return n * factorial(n - 1)",
    ]
    for index, step in enumerate(payload["steps"]):
        stage = stages[min(index, len(stages) - 1)]
        frames = []
        for depth, (n, state, returned) in enumerate(stage):
            variables = {"n": str(n)}
            if returned is not None:
                variables["return_value"] = returned
            frames.append(
                {
                    "id": f"factorial-{n}",
                    "label": f"factorial({n})",
                    "depth": depth,
                    "state": state,
                    "asset_id": "call-frame" if depth == 0 else "stack-frame",
                    "variables": variables,
                }
            )
        current = frames[-1]["id"]
        active_line = 1 if index == 3 else 3
        for snapshot in _step_snapshots(step):
            if snapshot.get("kind") != "call_stack_scene":
                continue
            snapshot["frames"] = copy.deepcopy(frames)
            snapshot["current_frame_id"] = current
            snapshot["code_trace"] = {
                "language": "python",
                "lines": lines,
                "active_lines": [active_line],
                "active_line": active_line,
                "asset_id": "active-line",
            }
        _sync_code_highlight_to_snapshot(step)
    conclusion = "factorial(4) = 24: pending values multiply while return values unwind the stack."
    payload["summary"] = conclusion
    payload["steps"][-1]["voiceover_text"] = conclusion


def _sync_code_highlight_to_snapshot(step: dict[str, Any]) -> None:
    snapshot = step["snapshot"]
    if snapshot.get("kind") == "graph_scene":
        current = str(
            snapshot.get("current_node_id")
            or next(iter(snapshot.get("active_node_ids") or []), "done")
        )
        queue = list(
            dict.fromkeys(
                [
                    *(str(item) for item in snapshot.get("queue_node_ids") or []),
                    *(str(item) for item in snapshot.get("frontier_node_ids") or []),
                ]
            )
        )
        visited = [str(item) for item in snapshot.get("visited_node_ids") or []]
        step["code_highlight"] = {
            "language": "pseudocode",
            "lines": ["current = queue.dequeue()", "process(current)"],
            "active_lines": [0],
            "active_line": 0,
            "variables": {
                "current": current,
                "queue": f"[{', '.join(queue)}]",
                "visited": f"{{{', '.join(visited)}}}",
            },
        }
    if snapshot.get("kind") == "call_stack_scene":
        trace = snapshot.get("code_trace") or {}
        current_frame = next(
            (
                frame
                for frame in snapshot.get("frames") or []
                if frame.get("id") == snapshot.get("current_frame_id")
            ),
            None,
        )
        step["code_highlight"] = {
            "language": trace.get("language", "python"),
            "lines": trace.get("lines") or ["return"],
            "active_lines": trace.get("active_lines") or [0],
            "active_line": trace.get("active_line", 0),
            "variables": copy.deepcopy((current_frame or {}).get("variables") or {}),
        }


def _snapshot_dicts(payload: dict[str, Any]) -> list[dict[str, Any]]:
    snapshots: list[dict[str, Any]] = []
    for step in payload["steps"]:
        snapshots.append(step["snapshot"])
        snapshots.extend(layer["body"] for layer in step.get("layers") or [])
    return snapshots


def _raw_after(
    playbook: PlaybookScript,
    mutate: Callable[[dict[str, Any]], None],
) -> str:
    payload = copy.deepcopy(playbook.model_dump(mode="json", by_alias=True))
    mutate(payload)
    return PlaybookScript.model_validate(payload).model_dump_json(by_alias=True)


def _remove_core_visual(case_id: str, payload: dict[str, Any]) -> None:
    for snapshot in _snapshot_dicts(payload):
        if case_id == "math-derivative-tangent" and snapshot["kind"] == "math_plot":
            snapshot["curves"] = [
                curve for curve in snapshot["curves"] if curve.get("semantic_role") != "tangent"
            ]
        elif case_id == "algorithm-bfs-tree" and snapshot["kind"] == "graph_scene":
            snapshot["queue_node_ids"] = []
            snapshot["frontier_node_ids"] = []
        elif case_id == "code-recursion-factorial" and snapshot["kind"] == "call_stack_scene":
            snapshot["frames"] = []
            snapshot["current_frame_id"] = None
        elif case_id == "physics-projectile" and snapshot["kind"] == "physics_force_scene":
            snapshot["trajectory"] = []


def _write_wrong_conclusion(case_id: str, payload: dict[str, Any]) -> None:
    wrong = {
        "math-derivative-tangent": "The derivative tangent slope is 3; f'(1)=3.",
        "algorithm-bfs-tree": "DFS depth-first traversal replaces the BFS queue order.",
        "code-recursion-factorial": "factorial(4) = 12 after the frames return.",
        "physics-projectile": "Gravity accelerates horizontal velocity; vertical velocity is constant.",
    }[case_id]
    payload["summary"] = wrong
    final = payload["steps"][-1]
    final["voiceover_text"] = wrong
    for snapshot in [final["snapshot"], *(layer["body"] for layer in final.get("layers") or [])]:
        if "caption" in snapshot:
            snapshot["caption"] = wrong
        if case_id == "math-derivative-tangent":
            snapshot["formula_latex"] = "f'(1)=3"
            for curve in snapshot.get("curves") or []:
                if curve.get("semantic_role") == "tangent":
                    curve["label"] = "tangent slope = 3"


def _inject_forbidden_fallback(payload: dict[str, Any]) -> None:
    fallback = {
        "kind": "narration_card",
        "text": "Generic fallback instead of the required semantic visual.",
        "position": "bottom",
        "emphasis": "primary",
    }
    payload["steps"][0]["snapshot"] = fallback
    payload["steps"][0]["layers"] = [
        {
            "timing": {"enter_at": 0.0, "exit_at": 1.0, "appear_anim": "fade", "z_order": 0},
            "body": fallback,
        }
    ]


def _remove_required_assets(payload: dict[str, Any], required_assets: set[str]) -> None:
    def visit(value: Any) -> None:
        if isinstance(value, dict):
            for key, item in value.items():
                if key.endswith("asset_id") and item in required_assets:
                    value[key] = None
                else:
                    visit(item)
        elif isinstance(value, list):
            for item in value:
                visit(item)

    visit(payload)


def test_benchmark_v2_expectation_schema_is_complete(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    assert set(expectations) == EXPECTED_IDS
    for case in expectations.values():
        assert case.required_snapshot_kinds
        assert case.required_scene_types
        assert case.required_semantic_roles
        assert case.required_text_facts
        assert case.required_state_fields
        assert case.expected_conclusion.statement
        assert case.hard_fail_conditions
    assert expectations["algorithm-bfs-tree"].code_sync.required is True
    assert expectations["code-recursion-factorial"].code_sync.required is True
    assert expectations["math-derivative-tangent"].code_sync.required is False
    assert expectations["physics-projectile"].code_sync.required is False


def test_expectation_schema_allows_semantic_renderer_case_without_assets(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    payload = expectations["math-derivative-tangent"].model_dump(mode="json")
    payload["required_asset_ids"] = []

    parsed = GoldCaseExpectation.model_validate(payload)

    assert parsed.required_asset_ids == []


@pytest.mark.parametrize("case_id", sorted(EXPECTED_IDS))
def test_gold_case_deterministic_positive_passes(
    case_id: str,
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    card = score_benchmark_v2(
        expectations[case_id],
        _positive_playbook(case_id).model_dump_json(by_alias=True),
        external_warning_count=0,
    )

    assert card.passed, card.to_dict()
    assert card.total == 100.0
    assert {dimension.name: dimension.max_score for dimension in card.dimensions} == (
        DIMENSION_WEIGHTS
    )
    code_sync = next(item for item in card.dimensions if item.name == "code_sync")
    assert code_sync.applicable is (case_id in {"algorithm-bfs-tree", "code-recursion-factorial"})


def test_schema_failure_keeps_non_code_case_code_sync_not_applicable(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    card = score_benchmark_v2(expectations["math-derivative-tangent"], "{}")
    code_sync = next(item for item in card.dimensions if item.name == "code_sync")

    assert card.parse_error is not None
    assert code_sync.applicable is False


def test_slope_role_accepts_a_rendered_math_formula_conclusion() -> None:
    roles = _semantic_roles(
        [
            {
                "kind": "math_formula",
                "formula_latex": "f'(1)=2",
                "caption": "The tangent slope is two.",
            }
        ],
        {},
    )

    assert "slope" in roles


@pytest.mark.parametrize("case_id", sorted(EXPECTED_IDS))
def test_gold_case_missing_core_visual_hard_fails(
    case_id: str,
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    playbook = _positive_playbook(case_id)
    raw = _raw_after(playbook, lambda payload: _remove_core_visual(case_id, payload))

    card = score_benchmark_v2(expectations[case_id], raw, external_warning_count=0)

    assert not card.passed
    assert any(
        issue.code in {"missing_required_semantic_role", "missing_required_state_field"}
        for issue in card.hard_failures
    )


def test_bfs_missing_code_sync_hard_fails(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    def mutate(payload: dict[str, Any]) -> None:
        for step in payload["steps"]:
            step["code_highlight"] = None

    raw = _raw_after(_positive_playbook("algorithm-bfs-tree"), mutate)
    card = score_benchmark_v2(expectations["algorithm-bfs-tree"], raw)

    assert not card.passed
    assert "missing_code_sync" in {issue.code for issue in card.hard_failures}
    assert {issue.code for issue in card.hard_failures} & {
        "missing_code_sync",
        "invalid_code_sync",
        "code_sync_state_mismatch",
    } == {"missing_code_sync"}
    code_sync = next(item for item in card.dimensions if item.name == "code_sync")
    assert code_sync.score == 0.0


def test_bfs_code_sync_state_mismatch_hard_fails(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    def mutate(payload: dict[str, Any]) -> None:
        payload["steps"][0]["code_highlight"]["variables"]["queue"] = "[wrong]"

    raw = _raw_after(_positive_playbook("algorithm-bfs-tree"), mutate)
    card = score_benchmark_v2(expectations["algorithm-bfs-tree"], raw)

    assert not card.passed
    assert "code_sync_state_mismatch" in {issue.code for issue in card.hard_failures}


def test_recursion_invalid_code_sync_active_line_hard_fails(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    def mutate(payload: dict[str, Any]) -> None:
        payload["steps"][0]["code_highlight"]["active_lines"] = [999]
        payload["steps"][0]["code_highlight"]["active_line"] = 999

    raw = _raw_after(_positive_playbook("code-recursion-factorial"), mutate)
    card = score_benchmark_v2(expectations["code-recursion-factorial"], raw)

    assert not card.passed
    assert "invalid_code_sync" in {issue.code for issue in card.hard_failures}


def test_bfs_accepts_valid_sibling_visit_order(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    def mutate(payload: dict[str, Any]) -> None:
        states = [
            ("S", ["S"], ["A"]),
            ("A", ["S", "A"], ["C", "B"]),
            ("C", ["S", "A", "C"], ["B", "D"]),
            ("B", ["S", "A", "C", "B"], ["D"]),
            ("D", ["S", "A", "C", "B", "D"], []),
        ]
        for index, step in enumerate(payload["steps"]):
            current, visited, queue = states[min(index, len(states) - 1)]
            for snapshot in _step_snapshots(step):
                if snapshot.get("kind") != "graph_scene":
                    continue
                snapshot["current_node_id"] = current
                snapshot["active_node_ids"] = [current]
                snapshot["visited_node_ids"] = visited
                snapshot["queue_node_ids"] = queue
                snapshot["frontier_node_ids"] = queue
            _sync_code_highlight_to_snapshot(step)

    raw = _raw_after(_positive_playbook("algorithm-bfs-tree"), mutate)
    card = score_benchmark_v2(expectations["algorithm-bfs-tree"], raw)

    assert card.passed, [(issue.code, issue.message) for issue in card.hard_failures]


def test_bfs_ignores_unreachable_decorative_node_for_completion(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    def mutate(payload: dict[str, Any]) -> None:
        for snapshot in _snapshot_dicts(payload):
            if snapshot.get("kind") == "graph_scene":
                snapshot["nodes"].append({"id": "X", "label": "X"})

    raw = _raw_after(_positive_playbook("algorithm-bfs-tree"), mutate)
    card = score_benchmark_v2(expectations["algorithm-bfs-tree"], raw)

    assert card.passed, [(issue.code, issue.message) for issue in card.hard_failures]


def test_recursion_code_sync_requires_visual_n_state(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    def mutate(payload: dict[str, Any]) -> None:
        first = payload["steps"][0]
        for snapshot in _step_snapshots(first):
            if snapshot.get("kind") == "call_stack_scene":
                snapshot["frames"][0]["variables"] = {}
        first["code_highlight"]["variables"] = {"n": "999"}

    raw = _raw_after(_positive_playbook("code-recursion-factorial"), mutate)
    card = score_benchmark_v2(expectations["code-recursion-factorial"], raw)

    assert not card.passed
    assert "code_sync_state_mismatch" in {issue.code for issue in card.hard_failures}


@pytest.mark.parametrize("case_id", sorted(EXPECTED_IDS))
def test_gold_case_wrong_conclusion_hard_fails(
    case_id: str,
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    playbook = _positive_playbook(case_id)
    raw = _raw_after(playbook, lambda payload: _write_wrong_conclusion(case_id, payload))

    card = score_benchmark_v2(expectations[case_id], raw, external_warning_count=0)

    assert not card.passed
    assert {issue.code for issue in card.hard_failures} & {
        "forbidden_text_fact",
        "expected_conclusion_not_met",
    }


def test_derivative_allows_a_secant_with_slope_three_before_tangent_limit(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    def mutate(payload: dict[str, Any]) -> None:
        payload["steps"][2]["voiceover_text"] = (
            "割线经过 P=(1,1) 与 Q=(2,4)，所以割线斜率为 3；继续让 Q 靠近 P。"
        )
        for snapshot in _step_snapshots(payload["steps"][2]):
            if snapshot.get("kind") != "math_plot":
                continue
            snapshot["curves"].append(
                {
                    "expression": "3*x - 2",
                    "label": "割线斜率为 3",
                    "emphasis": "secondary",
                    "semantic_role": "secant",
                }
            )

    raw = _raw_after(_positive_playbook("math-derivative-tangent"), mutate)
    card = score_benchmark_v2(
        expectations["math-derivative-tangent"],
        raw,
        external_warning_count=0,
    )

    assert card.passed, card.to_dict()


@pytest.mark.parametrize("case_id", sorted(EXPECTED_IDS))
def test_gold_case_forbidden_fallback_hard_fails(
    case_id: str,
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    raw = _raw_after(_positive_playbook(case_id), _inject_forbidden_fallback)

    card = score_benchmark_v2(expectations[case_id], raw, external_warning_count=0)

    assert not card.passed
    assert "forbidden_snapshot_kind" in {issue.code for issue in card.hard_failures}


@pytest.mark.parametrize("case_id", sorted(EXPECTED_IDS))
def test_gold_case_missing_required_assets_hard_fails(
    case_id: str,
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    expectation = expectations[case_id]
    if not expectation.required_asset_ids:
        pytest.skip("case uses native geometry and has no required asset ids")
    raw = _raw_after(
        _positive_playbook(case_id),
        lambda payload: _remove_required_assets(payload, set(expectation.required_asset_ids)),
    )

    card = score_benchmark_v2(expectation, raw, external_warning_count=0)

    assert not card.passed
    assert "missing_required_asset" in {issue.code for issue in card.hard_failures}


@pytest.mark.parametrize("case_id", sorted(EXPECTED_IDS))
def test_longer_narration_cannot_hide_missing_visual(
    case_id: str,
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    def mutate(payload: dict[str, Any]) -> None:
        _remove_core_visual(case_id, payload)
        for step in payload["steps"]:
            step["voiceover_text"] += " Detailed narration." * 200

    raw = _raw_after(_positive_playbook(case_id), mutate)
    card = score_benchmark_v2(expectations[case_id], raw, external_warning_count=0)

    assert not card.passed
    assert any(issue.code.startswith("missing_required_") for issue in card.hard_failures)


def test_legacy_structural_score_is_reported_separately_from_v2(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    raw = (FIXTURE_DIR / "math-derivative-tangent.json").read_text(encoding="utf-8")

    card = score_benchmark_v2(expectations["math-derivative-tangent"], raw)

    assert card.legacy_structural_score >= 90.0
    assert not card.passed
    assert card.total < card.legacy_structural_score


def test_maximum_warning_count_is_a_hard_gate(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    expectation = expectations["math-derivative-tangent"]

    card = score_benchmark_v2(
        expectation,
        _positive_playbook(expectation.id).model_dump_json(by_alias=True),
        external_warning_count=1,
    )

    assert not card.passed
    assert "warning_count_exceeded" in {issue.code for issue in card.hard_failures}


def test_derivative_numeric_alias_does_not_accept_slope_twenty(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    def mutate(payload: dict[str, Any]) -> None:
        payload["summary"] = "The derivative tangent slope = 20."
        payload["steps"][-1]["voiceover_text"] = "The derivative tangent slope = 20."
        for snapshot in _snapshot_dicts(payload):
            if snapshot.get("kind") != "math_plot":
                continue
            snapshot["formula_latex"] = "f'(1)=20"
            for curve in snapshot.get("curves") or []:
                if curve.get("semantic_role") == "tangent":
                    curve["expression"] = "20*x - 19"
                    curve["label"] = "tangent slope = 20"

    raw = _raw_after(_positive_playbook("math-derivative-tangent"), mutate)
    card = score_benchmark_v2(expectations["math-derivative-tangent"], raw)

    assert not card.passed
    assert "expected_conclusion_not_met" in {issue.code for issue in card.hard_failures}


def test_derivative_requires_target_x_value(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    def mutate(payload: dict[str, Any]) -> None:
        for snapshot in _snapshot_dicts(payload):
            if snapshot.get("kind") == "math_plot":
                snapshot["marker_x"] = 2.0

    raw = _raw_after(_positive_playbook("math-derivative-tangent"), mutate)
    card = score_benchmark_v2(expectations["math-derivative-tangent"], raw)

    assert not card.passed
    assert "required_state_value_mismatch" in {issue.code for issue in card.hard_failures}


def test_derivative_rejects_incorrect_tangent_expression(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    def mutate(payload: dict[str, Any]) -> None:
        for snapshot in _snapshot_dicts(payload):
            if snapshot.get("kind") != "math_plot":
                continue
            for curve in snapshot.get("curves") or []:
                if curve.get("semantic_role") == "tangent":
                    curve["expression"] = "100*x + 50"

    raw = _raw_after(_positive_playbook("math-derivative-tangent"), mutate)
    card = score_benchmark_v2(expectations["math-derivative-tangent"], raw)

    assert not card.passed
    assert "invalid_semantic_evidence" in {issue.code for issue in card.hard_failures}


def test_bfs_rejects_state_references_to_unknown_nodes(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    def mutate(payload: dict[str, Any]) -> None:
        for snapshot in _snapshot_dicts(payload):
            if snapshot.get("kind") != "graph_scene":
                continue
            snapshot["current_node_id"] = "Z"
            snapshot["active_node_ids"] = ["Z"]
            snapshot["visited_node_ids"] = ["Z"]
            snapshot["queue_node_ids"] = ["Z"]

    raw = _raw_after(_positive_playbook("algorithm-bfs-tree"), mutate)
    card = score_benchmark_v2(expectations["algorithm-bfs-tree"], raw)

    assert not card.passed
    assert "invalid_state_reference" in {issue.code for issue in card.hard_failures}


def test_bfs_rejects_depth_decreasing_visit_order(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    wrong_order = ["S", "B", "A", "C", "D"]

    def mutate(payload: dict[str, Any]) -> None:
        for index, step in enumerate(payload["steps"]):
            count = min(index + 1, len(wrong_order))
            visited = wrong_order[:count]
            current = visited[-1]
            for snapshot in _step_snapshots(step):
                if snapshot.get("kind") != "graph_scene":
                    continue
                snapshot["visited_node_ids"] = visited
                snapshot["current_node_id"] = current
                snapshot["active_node_ids"] = [current]

    raw = _raw_after(_positive_playbook("algorithm-bfs-tree"), mutate)
    card = score_benchmark_v2(expectations["algorithm-bfs-tree"], raw)

    assert not card.passed
    assert "incorrect_state_order" in {issue.code for issue in card.hard_failures}


def test_bfs_requires_visible_state_progression(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    def mutate(payload: dict[str, Any]) -> None:
        first = copy.deepcopy(payload["steps"][0]["snapshot"])
        for step in payload["steps"]:
            step["snapshot"] = copy.deepcopy(first)
            for layer in step.get("layers") or []:
                layer["body"] = copy.deepcopy(first)

    raw = _raw_after(_positive_playbook("algorithm-bfs-tree"), mutate)
    card = score_benchmark_v2(expectations["algorithm-bfs-tree"], raw)

    assert not card.passed
    assert "missing_visual_transition" in {issue.code for issue in card.hard_failures}


def test_bfs_rejects_incorrect_fifo_queue_progression(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    def mutate(payload: dict[str, Any]) -> None:
        for snapshot in _snapshot_dicts(payload):
            if snapshot.get("kind") != "graph_scene":
                continue
            snapshot["queue_node_ids"] = ["S"]
            snapshot["frontier_node_ids"] = ["S"]

    raw = _raw_after(_positive_playbook("algorithm-bfs-tree"), mutate)
    card = score_benchmark_v2(expectations["algorithm-bfs-tree"], raw)

    assert not card.passed
    assert "invalid_state_transition" in {issue.code for issue in card.hard_failures}


def test_bfs_accepts_explicit_dequeue_and_enqueue_microsteps(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    payload = _positive_playbook("algorithm-bfs-tree").model_dump(
        mode="json", by_alias=True
    )
    first = copy.deepcopy(payload["steps"][0])
    start = first["snapshot"]["current_node_id"]
    initial = copy.deepcopy(first)
    dequeued = copy.deepcopy(first)
    for suffix, step, visited, queue in (
        ("initial", initial, [], [start]),
        ("dequeued", dequeued, [start], []),
    ):
        step["step_id"] = f"{step['step_id']}-{suffix}"
        step["title"] = f"{step['title']} ({suffix})"
        for snapshot in _step_snapshots(step):
            snapshot["visited_node_ids"] = visited
            snapshot["queue_node_ids"] = queue
            snapshot["frontier_node_ids"] = queue
        _sync_code_highlight_to_snapshot(step)
    payload["steps"] = [initial, dequeued, *payload["steps"]]
    for index, step in enumerate(payload["steps"], start=1):
        step["end_frame"] = index * 120
    payload["total_frames"] = payload["steps"][-1]["end_frame"]

    card = score_benchmark_v2(
        expectations["algorithm-bfs-tree"],
        PlaybookScript.model_validate(payload).model_dump_json(by_alias=True),
    )

    assert card.passed


def test_bfs_rejects_queue_rewind_after_checkpoint(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    payload = _positive_playbook("algorithm-bfs-tree").model_dump(
        mode="json", by_alias=True
    )
    rewound = copy.deepcopy(payload["steps"][0])
    rewound["step_id"] = f"{rewound['step_id']}-rewound"
    rewound["title"] = f"{rewound['title']} (rewound)"
    for snapshot in _step_snapshots(rewound):
        snapshot["queue_node_ids"] = []
        snapshot["frontier_node_ids"] = []
    payload["steps"].insert(1, rewound)
    for index, step in enumerate(payload["steps"], start=1):
        step["end_frame"] = index * 120
    payload["total_frames"] = payload["steps"][-1]["end_frame"]

    card = score_benchmark_v2(
        expectations["algorithm-bfs-tree"],
        PlaybookScript.model_validate(payload).model_dump_json(by_alias=True),
    )

    assert not card.passed
    assert "invalid_state_transition" in {issue.code for issue in card.hard_failures}


def test_bfs_accepts_incremental_neighbor_enqueue_microsteps(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    payload = _positive_playbook("algorithm-bfs-tree").model_dump(
        mode="json", by_alias=True
    )
    checkpoint = payload["steps"][1]
    after_dequeue = copy.deepcopy(checkpoint)
    first_enqueue = copy.deepcopy(checkpoint)
    for suffix, step, queue in (
        ("after-dequeue", after_dequeue, []),
        ("first-enqueue", first_enqueue, ["B"]),
    ):
        step["step_id"] = f"{step['step_id']}-{suffix}"
        step["title"] = f"{step['title']} ({suffix})"
        for snapshot in _step_snapshots(step):
            snapshot["queue_node_ids"] = queue
            snapshot["frontier_node_ids"] = queue
        _sync_code_highlight_to_snapshot(step)
    payload["steps"][1:1] = [after_dequeue, first_enqueue]
    for index, step in enumerate(payload["steps"], start=1):
        step["end_frame"] = index * 120
    payload["total_frames"] = payload["steps"][-1]["end_frame"]

    card = score_benchmark_v2(
        expectations["algorithm-bfs-tree"],
        PlaybookScript.model_validate(payload).model_dump_json(by_alias=True),
    )

    assert card.passed


def test_recursion_requires_structured_return_propagation(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    def mutate(payload: dict[str, Any]) -> None:
        for snapshot in _snapshot_dicts(payload):
            if snapshot.get("kind") != "call_stack_scene":
                continue
            for frame in snapshot.get("frames") or []:
                frame["state"] = (
                    "active" if frame["id"] == snapshot["current_frame_id"] else "waiting"
                )
                frame["variables"] = {"n": frame.get("variables", {}).get("n", "1")}
            snapshot["code_trace"] = {
                "language": "python",
                "lines": ["pass"],
                "active_lines": [0],
                "active_line": 0,
                "asset_id": "active-line",
            }

    raw = _raw_after(_positive_playbook("code-recursion-factorial"), mutate)
    card = score_benchmark_v2(expectations["code-recursion-factorial"], raw)

    assert not card.passed
    hard_codes = {issue.code for issue in card.hard_failures}
    assert "invalid_semantic_evidence" in hard_codes
    assert "missing_required_semantic_role" in hard_codes


def test_recursion_rejects_incorrect_structured_return_values(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    def mutate(payload: dict[str, Any]) -> None:
        for snapshot in _snapshot_dicts(payload):
            if snapshot.get("kind") != "call_stack_scene":
                continue
            for frame in snapshot.get("frames") or []:
                variables = frame.get("variables") or {}
                if "return_value" in variables:
                    variables["return_value"] = "999"

    raw = _raw_after(_positive_playbook("code-recursion-factorial"), mutate)
    card = score_benchmark_v2(expectations["code-recursion-factorial"], raw)

    assert not card.passed
    assert "invalid_semantic_evidence" in {issue.code for issue in card.hard_failures}


def test_recursion_does_not_treat_child_return_as_current_result(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    def mutate(payload: dict[str, Any]) -> None:
        for step in payload["steps"]:
            snapshot = step["snapshot"]
            if snapshot.get("kind") != "call_stack_scene":
                continue
            current = next(
                frame
                for frame in snapshot["frames"]
                if frame["id"] == snapshot["current_frame_id"]
            )
            variables = current.get("variables") or {}
            if any(key in variables for key in ("return", "return_value", "result")):
                variables["child_return"] = "1"
            _sync_code_highlight_to_snapshot(step)

    raw = _raw_after(_positive_playbook("code-recursion-factorial"), mutate)
    card = score_benchmark_v2(expectations["code-recursion-factorial"], raw)

    assert card.passed, [(issue.code, issue.message) for issue in card.hard_failures]


def test_recursion_accepts_standard_zero_base_case(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    def mutate(payload: dict[str, Any]) -> None:
        payload["steps"].append(copy.deepcopy(payload["steps"][-1]))
        stages = [
            [(4, "active", None)],
            [(4, "waiting", None), (3, "active", None)],
            [(4, "waiting", None), (3, "waiting", None), (2, "active", None)],
            [
                (4, "waiting", None),
                (3, "waiting", None),
                (2, "waiting", None),
                (1, "active", None),
            ],
            [
                (4, "waiting", None),
                (3, "waiting", None),
                (2, "waiting", None),
                (1, "waiting", None),
                (0, "returned", "1"),
            ],
            [
                (4, "waiting", None),
                (3, "waiting", None),
                (2, "waiting", None),
                (1, "returned", "1"),
            ],
            [(4, "waiting", None), (3, "waiting", None), (2, "returned", "2")],
            [(4, "waiting", None), (3, "returned", "6")],
            [(4, "returned", "24")],
        ]
        lines = [
            "def factorial(n):",
            "    if n == 0:",
            "        return 1",
            "    return n * factorial(n - 1)",
        ]
        for index, step in enumerate(payload["steps"]):
            step["step_id"] = f"zero-base-{index}"
            step["title"] = f"Zero-base factorial step {index}"
            step["end_frame"] = (index + 1) * 360
            frames = []
            for depth, (n_value, state, returned) in enumerate(stages[index]):
                variables = {"n": str(n_value)}
                if returned is not None:
                    variables["return_value"] = returned
                frames.append(
                    {
                        "id": f"factorial-{n_value}",
                        "label": f"factorial({n_value})",
                        "depth": depth,
                        "state": state,
                        "asset_id": "call-frame" if depth == 0 else "stack-frame",
                        "variables": variables,
                    }
                )
            for snapshot in _step_snapshots(step):
                if snapshot.get("kind") != "call_stack_scene":
                    continue
                snapshot["frames"] = copy.deepcopy(frames)
                snapshot["current_frame_id"] = frames[-1]["id"]
                snapshot["code_trace"] = {
                    "language": "python",
                    "lines": lines,
                    "active_lines": [2 if index == 4 else 3],
                    "active_line": 2 if index == 4 else 3,
                    "asset_id": "active-line",
                }
            _sync_code_highlight_to_snapshot(step)
        payload["total_frames"] = payload["steps"][-1]["end_frame"]

    raw = _raw_after(_positive_playbook("code-recursion-factorial"), mutate)
    card = score_benchmark_v2(
        expectations["code-recursion-factorial"],
        raw,
        external_warning_count=0,
    )

    assert card.passed, [(issue.code, issue.message) for issue in card.hard_failures]


def test_projectile_rejects_straight_line_trajectory(
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    def mutate(payload: dict[str, Any]) -> None:
        for snapshot in _snapshot_dicts(payload):
            if snapshot.get("kind") == "physics_force_scene":
                snapshot["trajectory"] = [[0.0, 0.0], [1.0, 1.0], [2.0, 2.0]]

    raw = _raw_after(_positive_playbook("physics-projectile"), mutate)
    card = score_benchmark_v2(expectations["physics-projectile"], raw)

    assert not card.passed
    assert "invalid_semantic_evidence" in {issue.code for issue in card.hard_failures}


@pytest.mark.parametrize("gravity_dy", [-24.0, 999.0])
def test_projectile_rejects_wrong_or_unbounded_gravity_vector(
    gravity_dy: float,
    expectations: dict[str, GoldCaseExpectation],
) -> None:
    def mutate(payload: dict[str, Any]) -> None:
        for snapshot in _snapshot_dicts(payload):
            if snapshot.get("kind") != "physics_force_scene":
                continue
            for vector in snapshot.get("vectors") or []:
                if vector.get("id") == "g":
                    vector["dy"] = gravity_dy

    raw = _raw_after(_positive_playbook("physics-projectile"), mutate)
    card = score_benchmark_v2(expectations["physics-projectile"], raw)

    assert not card.passed
    assert "invalid_semantic_evidence" in {issue.code for issue in card.hard_failures}
