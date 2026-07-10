from __future__ import annotations

from copy import deepcopy

import pytest

from app.domain.models.playbook import PlaybookScript
from app.domain.models.review import PlaybookReviewStatus
from app.domain.services.playbook_quality import quality_gate_playbook
from app.domain.services.playbook_review import review_playbook_script


def _array_step(index: int) -> dict:
    active = (index - 1) % 3
    snapshot = {
        "kind": "algorithm_array",
        "array_values": ["1", "3", "5"],
        "active_indices": [active],
        "swap_indices": [],
        "sorted_indices": [],
        "pointers": {"cursor": active},
    }
    return {
        "step_id": f"step_{index:02d}",
        "end_frame": index * 180,
        "title": f"Binary search interval {index}",
        "voiceover_text": f"Inspect the binary search array interval {index}.",
        "snapshot": deepcopy(snapshot),
        "layers": [{"body": deepcopy(snapshot)}],
    }


def _valid_playbook() -> PlaybookScript:
    steps = [_array_step(index) for index in range(1, 9)]
    steps[0]["code_highlight"] = {
        "language": "python",
        "lines": ["left = 0", "right = len(a) - 1"],
        "active_lines": [0],
        "active_line": 0,
    }
    return PlaybookScript.model_validate(
        {
            "fps": 30,
            "total_frames": 1440,
            "domain": "algorithm",
            "title": "Binary search",
            "summary": "Show a search interval.",
            "steps": steps,
            "parameter_controls": [],
        }
    )


def _bfs_playbook(*, skip_f_checkpoint: bool = False, include_code_sync: bool = True) -> PlaybookScript:
    nodes = [{"id": node, "label": node} for node in "ABCDEFG"]
    edges = [
        {"id": "A-B", "source": "A", "target": "B"},
        {"id": "A-C", "source": "A", "target": "C"},
        {"id": "B-D", "source": "B", "target": "D"},
        {"id": "B-E", "source": "B", "target": "E"},
        {"id": "C-F", "source": "C", "target": "F"},
        {"id": "C-G", "source": "C", "target": "G"},
    ]
    states = [
        ("A", [], ["A"]),
        ("A", ["A"], ["B", "C"]),
        ("B", ["A", "B"], ["C", "D", "E"]),
        ("C", ["A", "B", "C"], ["D", "E", "F", "G"]),
        ("D", ["A", "B", "C", "D"], ["E", "F", "G"]),
        ("E", ["A", "B", "C", "D", "E"], ["F", "G"]),
        (
            "G" if skip_f_checkpoint else "F",
            ["A", "B", "C", "D", "E", "F", "G"] if skip_f_checkpoint else ["A", "B", "C", "D", "E", "F"],
            [] if skip_f_checkpoint else ["G"],
        ),
        *([] if skip_f_checkpoint else [("G", ["A", "B", "C", "D", "E", "F", "G"], [])]),
        (None, ["A", "B", "C", "D", "E", "F", "G"], []),
    ]
    steps = []
    for index, (current, visited, queue) in enumerate(states, start=1):
        snapshot = {
            "kind": "graph_scene",
            "pack_id": "algorithm-code-basic",
            "asset_id": "bfs-graph-preset",
            "nodes": nodes,
            "edges": edges,
            "current_node_id": current,
            "active_node_ids": [current] if current else [],
            "visited_node_ids": visited,
            "queue_node_ids": queue,
            "frontier_node_ids": queue,
            "caption": f"BFS current {current or 'done'} queue {queue}",
        }
        code_highlight = None
        if include_code_sync:
            code_highlight = {
                "language": "pseudocode",
                "lines": ["current = queue.dequeue()", "process(current)"],
                "active_lines": [0],
                "active_line": 0,
                "variables": {
                    "current": current or "done",
                    "queue": f"[{', '.join(queue)}]",
                    "visited": f"{{{', '.join(visited)}}}",
                },
            }
        steps.append(
            {
                "step_id": f"bfs-{index}",
                "end_frame": index * 240,
                "title": f"BFS checkpoint {index}",
                "voiceover_text": (
                    f"BFS checkpoint {index} shows current {current or 'done'} and the FIFO queue."
                ),
                "snapshot": deepcopy(snapshot),
                "layers": [{"body": deepcopy(snapshot)}],
                "code_highlight": code_highlight,
            }
        )
    steps[-1]["voiceover_text"] = "BFS visits nodes layer by layer with a FIFO queue."
    return PlaybookScript.model_validate(
        {
            "fps": 30,
            "total_frames": steps[-1]["end_frame"],
            "domain": "algorithm",
            "title": "BFS tree traversal",
            "summary": "BFS visits every node layer by layer with a FIFO queue.",
            "algorithm_id": "breadth_first_search",
            "initial_data": {"scene_blueprint": ["bfs_graph"]},
            "steps": steps,
            "parameter_controls": [],
        }
    )


def test_playbook_self_check_returns_clean_for_renderer_ready_script() -> None:
    verdict = review_playbook_script(_valid_playbook(), prompt="Explain binary search.")

    assert verdict.status == PlaybookReviewStatus.CLEAN
    assert verdict.issues == []


@pytest.mark.parametrize(
    ("snapshot", "title", "voiceover", "prompt"),
    [
        (
            {
                "kind": "call_stack_scene",
                "frames": [
                    {
                        "id": "factorial-3",
                        "label": "factorial(3)",
                        "depth": 0,
                        "state": "active",
                        "variables": {"n": "3"},
                    }
                ],
                "code_trace": {
                    "language": "python",
                    "lines": ["def factorial(n):", "    return n * factorial(n - 1)"],
                    "active_lines": [1],
                    "active_line": 1,
                },
                "current_frame_id": "factorial-3",
                "caption": "Factorial call stack",
            },
            "Factorial call stack",
            "The factorial call stack shows the active frame and its return value.",
            "Explain the factorial call stack.",
        ),
        (
            {
                "kind": "code_trace_scene",
                "language": "python",
                "lines": ["mid = (left + right) // 2", "if target < values[mid]:"],
                "active_lines": [0],
                "active_line": 0,
                "array_values": ["1", "3", "5", "7"],
                "active_indices": [1],
                "search_range": [0, 3],
                "pointers": [
                    {"id": "mid", "label": "mid", "index": 1},
                ],
                "variables": {"target": "5"},
                "caption": "Binary search code trace",
            },
            "Binary search code trace",
            "The binary search code trace shows the active line and search pointers.",
            "Explain the binary search code trace.",
        ),
    ],
    ids=["call_stack_scene", "code_trace_scene"],
)
def test_playbook_self_check_accepts_recursion_and_code_trace_scenes(
    snapshot: dict,
    title: str,
    voiceover: str,
    prompt: str,
) -> None:
    payload = _valid_playbook().model_dump(mode="json")
    payload["title"] = title
    payload["summary"] = voiceover
    for step in payload["steps"]:
        step["title"] = title
        step["voiceover_text"] = voiceover
        step["snapshot"] = deepcopy(snapshot)
        step["layers"] = [{"body": deepcopy(snapshot)}]
        if snapshot["kind"] == "call_stack_scene":
            trace = snapshot["code_trace"]
            step["code_highlight"] = {
                "language": trace["language"],
                "lines": trace["lines"],
                "active_lines": trace["active_lines"],
                "active_line": trace["active_line"],
                "variables": {"n": "3"},
            }
    playbook = PlaybookScript.model_validate(payload)

    verdict = review_playbook_script(playbook, prompt=prompt)

    assert verdict.status == PlaybookReviewStatus.CLEAN
    assert verdict.issues == []


def test_playbook_self_check_blocks_one_step_agent_playbook_as_too_shallow() -> None:
    payload = _valid_playbook().model_dump(mode="json")
    payload["steps"] = payload["steps"][:1]
    payload["total_frames"] = payload["steps"][-1]["end_frame"]
    playbook = PlaybookScript.model_validate(payload)

    verdict = review_playbook_script(playbook, prompt="Explain binary search.")

    assert verdict.status == PlaybookReviewStatus.BLOCKED
    assert any(issue.code == "step.too_shallow" for issue in verdict.issues)


def test_playbook_self_check_accepts_eight_step_agent_playbook() -> None:
    verdict = review_playbook_script(_valid_playbook(), prompt="Explain binary search.")

    assert verdict.status == PlaybookReviewStatus.CLEAN


def test_playbook_self_check_blocks_fifteen_step_agent_playbook() -> None:
    payload = _valid_playbook().model_dump(mode="json")
    payload["steps"] = [_array_step(index) for index in range(1, 16)]
    payload["total_frames"] = payload["steps"][-1]["end_frame"]
    playbook = PlaybookScript.model_validate(payload)

    verdict = review_playbook_script(playbook, prompt="Explain binary search.")

    assert verdict.status == PlaybookReviewStatus.BLOCKED
    assert any(issue.code == "step.too_shallow" for issue in verdict.issues)


def test_playbook_self_check_blocks_non_monotonic_and_overlong_timeline() -> None:
    payload = _valid_playbook().model_dump(mode="json")
    payload["total_frames"] = 100
    payload["steps"][0]["end_frame"] = 110
    payload["steps"][1]["end_frame"] = 105
    playbook = PlaybookScript.model_validate(payload)

    verdict = review_playbook_script(playbook, prompt="Explain binary search.")

    assert verdict.status == PlaybookReviewStatus.BLOCKED
    codes = {issue.code for issue in verdict.issues}
    assert "timeline.non_monotonic" in codes
    assert "timeline.exceeds_total_frames" in codes


def test_playbook_self_check_blocks_empty_voiceover_and_snapshot_payload() -> None:
    payload = _valid_playbook().model_dump(mode="json")
    payload["domain"] = "math"
    payload["steps"][0]["title"] = "Plot"
    payload["steps"][0]["voiceover_text"] = " "
    payload["steps"][0]["snapshot"] = {"kind": "math_plot", "curves": []}
    payload["steps"][0]["layers"] = [{"body": {"kind": "math_plot", "curves": []}}]
    playbook = PlaybookScript.model_validate(payload)

    verdict = review_playbook_script(playbook, prompt="Plot f(x).")

    assert verdict.status == PlaybookReviewStatus.BLOCKED
    errors = {issue.code for issue in verdict.issues if issue.severity == "error"}
    assert "step.empty_voiceover" in errors
    assert "snapshot.empty_payload" in errors
    assert all(issue.requires_repair for issue in verdict.issues if issue.severity == "error")


def test_playbook_self_check_reports_code_line_out_of_range() -> None:
    payload = _valid_playbook().model_dump(mode="json")
    payload["steps"][0]["code_highlight"]["active_lines"] = [4]
    payload["steps"][0]["code_highlight"]["active_line"] = 4
    playbook = PlaybookScript.model_validate(payload)

    verdict = review_playbook_script(playbook, prompt="Explain binary search.")

    assert verdict.status == PlaybookReviewStatus.BLOCKED
    assert any(issue.code == "code.line_out_of_range" for issue in verdict.issues)


def test_playbook_self_check_reports_algorithm_index_out_of_range() -> None:
    payload = deepcopy(_valid_playbook().model_dump(mode="json"))
    payload["steps"][1]["snapshot"]["active_indices"] = [7]
    payload["steps"][1]["layers"][0]["body"]["active_indices"] = [7]
    playbook = PlaybookScript.model_validate(payload)

    verdict = review_playbook_script(playbook, prompt="Explain binary search.")

    assert verdict.status == PlaybookReviewStatus.BLOCKED
    assert any(issue.code == "algorithm.invalid_state_transition" for issue in verdict.issues)


def test_playbook_self_check_blocks_empty_layers() -> None:
    payload = _valid_playbook().model_dump(mode="json")
    payload["steps"][0]["layers"] = []
    playbook = PlaybookScript.model_validate(payload)

    verdict = review_playbook_script(playbook, prompt="Explain binary search.")

    assert verdict.status == PlaybookReviewStatus.BLOCKED
    assert any(issue.code == "renderer.contract_risk" for issue in verdict.issues)


def test_playbook_self_check_blocks_primary_layer_kind_mismatch() -> None:
    payload = _valid_playbook().model_dump(mode="json")
    payload["domain"] = "math"
    math_plot = {
        "kind": "math_plot",
        "curves": [{"expression": "x^2", "label": "f"}],
    }
    payload["steps"][0]["snapshot"] = math_plot
    payload["steps"][0]["layers"][0]["body"] = {
        "kind": "math_formula",
        "formula_latex": "f(x)=x^2",
    }
    playbook = PlaybookScript.model_validate(payload)

    verdict = review_playbook_script(playbook, prompt="Plot f(x)=x^2.")

    assert verdict.status == PlaybookReviewStatus.BLOCKED
    assert any(issue.code == "renderer.contract_risk" for issue in verdict.issues)


def test_playbook_self_check_accepts_primary_layer_that_mirrors_snapshot() -> None:
    payload = _valid_playbook().model_dump(mode="json")
    math_plot = {
        "kind": "math_plot",
        "curves": [{"expression": "x^2", "label": "f"}],
    }
    payload["domain"] = "math"
    payload["steps"][0]["snapshot"] = math_plot
    payload["steps"][0]["layers"][0]["body"] = deepcopy(math_plot)
    playbook = PlaybookScript.model_validate(payload)

    verdict = review_playbook_script(playbook, prompt="Explain binary search.")

    assert verdict.status == PlaybookReviewStatus.CLEAN


def test_playbook_self_check_blocks_subject_visual_algorithm_array_fallback() -> None:
    payload = _valid_playbook().model_dump(mode="json")
    payload["domain"] = "geography"
    payload["title"] = "East Asia monsoon"
    payload["summary"] = "Explain East Asia monsoon with a map."
    for step in payload["steps"]:
        step["title"] = "East Asia monsoon array fallback"
        step["voiceover_text"] = "Use the East Asia monsoon map, not an array fallback."
    playbook = PlaybookScript.model_validate(payload)

    verdict = review_playbook_script(playbook, prompt="Explain the East Asia monsoon.")

    assert verdict.status == PlaybookReviewStatus.BLOCKED
    fallback_issues = [
        issue for issue in verdict.issues if issue.code == "snapshot.domain_fallback"
    ]
    assert fallback_issues
    assert fallback_issues[0].suggestion is not None
    assert "SceneBlueprint" in fallback_issues[0].suggestion


def test_playbook_self_check_accepts_scene_blueprint_subject_renderer_kind() -> None:
    payload = _valid_playbook().model_dump(mode="json")
    payload["domain"] = "geography"
    payload["title"] = "East Asia monsoon"
    payload["summary"] = "Explain East Asia monsoon with a map."
    snapshot = {
        "kind": "geo_map_scene",
        "pack_id": "geography-earth-basic",
        "map_region": "east_asia",
        "layers": [
            {
                "id": "land",
                "semantic_role": "map_layer",
                "asset_id": "east-asia-land-110m",
            }
        ],
        "flows": [
            {
                "id": "summer",
                "semantic_role": "monsoon_flow",
                "asset_id": "monsoon-wind-arrow",
                "from": [78, 68],
                "to": [42, 38],
            }
        ],
        "pressure_centers": [
            {"id": "land-low", "kind": "low", "x": 38, "y": 35, "label": "land low"}
        ],
        "particle_preset": "moisture_particles",
        "caption": "East Asia monsoon map.",
    }
    for step in payload["steps"]:
        step["title"] = "East Asia monsoon map"
        step["voiceover_text"] = "The East Asia monsoon map shows land and ocean pressure."
        step["snapshot"] = deepcopy(snapshot)
        step["layers"] = [{"body": deepcopy(snapshot)}]
    playbook = PlaybookScript.model_validate(payload)

    verdict = review_playbook_script(playbook, prompt="Explain the East Asia monsoon.")

    assert verdict.status == PlaybookReviewStatus.CLEAN


def test_canonical_gate_blocks_unresolved_asset() -> None:
    payload = _valid_playbook().model_dump(mode="json")
    payload["domain"] = "math"
    snapshot = {
        "kind": "math_plot",
        "pack_id": "math-basic",
        "asset_id": "missing-asset",
        "curves": [{"expression": "x", "label": "f"}],
    }
    payload["steps"][0]["snapshot"] = snapshot
    payload["steps"][0]["layers"] = [{"body": deepcopy(snapshot)}]
    playbook = PlaybookScript.model_validate(payload)

    report = quality_gate_playbook(
        playbook,
        "Explain the function",
        generator_path="skill_pack",
    )

    assert report.status == "repairable"
    assert {issue.code for issue in report.issues} >= {"asset.missing"}
    assert report.scores["asset_license"] < 1.0
    assert report.scores["export_readiness"] < 1.0


def test_canonical_gate_blocks_asset_from_a_different_pack() -> None:
    payload = _valid_playbook().model_dump(mode="json")
    payload["domain"] = "math"
    snapshot = {
        "kind": "math_plot",
        "pack_id": "math-basic",
        "asset_id": "east-asia-land-110m",
        "curves": [{"expression": "x", "label": "f"}],
    }
    payload["steps"][0]["snapshot"] = snapshot
    payload["steps"][0]["layers"] = [{"body": deepcopy(snapshot)}]
    playbook = PlaybookScript.model_validate(payload)

    report = quality_gate_playbook(
        playbook,
        "Explain the function",
        generator_path="skill_pack",
    )

    assert report.status == "repairable"
    assert {issue.code for issue in report.issues} >= {"asset.missing"}
    assert report.scores["asset_license"] < 1.0
    assert report.scores["export_readiness"] < 1.0


def test_canonical_gate_requires_algorithm_state_for_bfs_prompt() -> None:
    payload = _valid_playbook().model_dump(mode="json")
    for step in payload["steps"]:
        snapshot = step["snapshot"]
        snapshot["active_indices"] = []
        snapshot["swap_indices"] = []
        snapshot["sorted_indices"] = []
        snapshot["pointers"] = {}
        step["layers"] = [{"body": deepcopy(snapshot)}]
    playbook = PlaybookScript.model_validate(payload)

    report = quality_gate_playbook(
        playbook,
        "Explain BFS traversal and its queue state",
        generator_path="agent",
    )

    assert report.status == "repairable"
    assert {issue.code for issue in report.issues} >= {"algorithm.state_missing"}


def test_canonical_gate_requires_algorithm_scene_for_bfs_prompt() -> None:
    payload = _valid_playbook().model_dump(mode="json")
    snapshot = {"kind": "narration_card", "text": "Breadth first search"}
    for step in payload["steps"]:
        step["snapshot"] = deepcopy(snapshot)
        step["layers"] = [{"body": deepcopy(snapshot)}]
    playbook = PlaybookScript.model_validate(payload)

    report = quality_gate_playbook(
        playbook,
        "Explain BFS traversal and its queue state",
        generator_path="agent",
    )

    assert report.status == "repairable"
    assert {issue.code for issue in report.issues} >= {"algorithm.state_missing"}


def test_canonical_gate_rejects_skipped_bfs_checkpoint() -> None:
    report = quality_gate_playbook(
        _bfs_playbook(skip_f_checkpoint=True),
        "Explain BFS traversal and show every FIFO queue checkpoint",
        generator_path="agent",
    )

    assert report.status == "repairable"
    assert "algorithm.invalid_state_transition" in {issue.code for issue in report.issues}


def test_canonical_gate_accepts_complete_bfs_checkpoints() -> None:
    report = quality_gate_playbook(
        _bfs_playbook(),
        "Explain the complete BFS visit order for every node",
        generator_path="agent",
    )

    assert report.status == "clean", [(issue.code, issue.path) for issue in report.issues]


def test_canonical_gate_requires_bfs_code_sync() -> None:
    report = quality_gate_playbook(
        _bfs_playbook(include_code_sync=False),
        "Explain BFS traversal and its FIFO queue",
        generator_path="agent",
    )

    assert report.status == "repairable"
    assert "code.sync_missing" in {issue.code for issue in report.issues}


def test_canonical_gate_rejects_code_sync_state_mismatch() -> None:
    payload = _bfs_playbook().model_dump(mode="json")
    payload["steps"][2]["code_highlight"]["variables"]["queue"] = "[wrong]"
    playbook = PlaybookScript.model_validate(payload)

    report = quality_gate_playbook(
        playbook,
        "Explain BFS traversal and its FIFO queue",
        generator_path="agent",
    )

    assert report.status == "repairable"
    assert "code.state_mismatch" in {issue.code for issue in report.issues}


def test_canonical_gate_rejects_missing_bfs_code_sync_variables() -> None:
    payload = _bfs_playbook().model_dump(mode="json")
    for step in payload["steps"]:
        step["code_highlight"]["variables"] = {}
    playbook = PlaybookScript.model_validate(payload)

    report = quality_gate_playbook(
        playbook,
        "Explain BFS traversal and its FIFO queue",
        generator_path="agent",
    )

    assert report.status == "repairable"
    assert "code.state_mismatch" in {issue.code for issue in report.issues}


def test_canonical_gate_rejects_recursive_code_sync_variable_mismatch() -> None:
    payload = _valid_playbook().model_dump(mode="json")
    payload["domain"] = "code"
    snapshot = {
        "kind": "call_stack_scene",
        "frames": [
            {
                "id": "factorial-4",
                "label": "factorial(4)",
                "state": "active",
                "variables": {"n": "4"},
            }
        ],
        "current_frame_id": "factorial-4",
        "code_trace": {
            "language": "python",
            "lines": ["def factorial(n):", "    return n * factorial(n - 1)"],
            "active_lines": [1],
            "active_line": 1,
        },
    }
    for step in payload["steps"]:
        step["title"] = "Trace recursive factorial"
        step["voiceover_text"] = "Trace factorial recursion and the active n value."
        step["snapshot"] = deepcopy(snapshot)
        step["layers"] = [{"body": deepcopy(snapshot)}]
        step["code_highlight"] = {
            "language": "python",
            "lines": snapshot["code_trace"]["lines"],
            "active_lines": [1],
            "active_line": 1,
            "variables": {"n": "999"},
        }
    payload["summary"] = "Trace factorial recursion and the active n value."
    playbook = PlaybookScript.model_validate(payload)

    report = quality_gate_playbook(
        playbook,
        "Explain the factorial recursive call stack",
        generator_path="agent",
    )

    assert report.status == "repairable"
    assert "code.state_mismatch" in {issue.code for issue in report.issues}


def test_canonical_gate_applies_recursion_contract_to_algorithm_domain() -> None:
    payload = _valid_playbook().model_dump(mode="json")
    payload["domain"] = "algorithm"
    snapshot = {
        "kind": "call_stack_scene",
        "frames": [
            {
                "id": "factorial-4",
                "label": "factorial(4)",
                "state": "active",
                "variables": {"n": "4"},
            }
        ],
        "current_frame_id": "factorial-4",
    }
    for step in payload["steps"]:
        step["title"] = "Trace recursive factorial"
        step["voiceover_text"] = "Trace the factorial recursive call and active frame."
        step["snapshot"] = deepcopy(snapshot)
        step["layers"] = [{"body": deepcopy(snapshot)}]
        step["code_highlight"] = None
    payload["summary"] = "Trace the factorial recursive call stack."
    playbook = PlaybookScript.model_validate(payload)

    report = quality_gate_playbook(
        playbook,
        "Trace factorial(4) recursion and show the call stack",
        generator_path="agent",
    )

    assert report.status == "repairable"
    assert "code.sync_missing" in {issue.code for issue in report.issues}


def test_canonical_gate_blocks_formula_only_plot_request() -> None:
    payload = _valid_playbook().model_dump(mode="json")
    payload["domain"] = "math"
    snapshot = {"kind": "math_formula", "formula_latex": "f(x)=x^2"}
    for step in payload["steps"]:
        step["snapshot"] = deepcopy(snapshot)
        step["layers"] = [{"body": deepcopy(snapshot)}]
    playbook = PlaybookScript.model_validate(payload)

    report = quality_gate_playbook(
        playbook,
        "Plot the curve and show its tangent",
        generator_path="agent",
    )

    assert report.status == "repairable"
    assert {issue.code for issue in report.issues} >= {"math.low_visual_richness"}


def test_canonical_gate_requires_final_step_to_answer_explicit_question() -> None:
    playbook = _valid_playbook()

    report = quality_gate_playbook(
        playbook,
        "Calculate the orbital velocity",
        generator_path="generic_cir",
    )

    assert report.status == "repairable"
    assert {issue.code for issue in report.issues} >= {"step.does_not_answer_prompt"}


def test_canonical_gate_does_not_treat_summary_or_generic_chinese_final_as_answer() -> None:
    payload = _valid_playbook().model_dump(mode="json")
    prompt = "用二叉树演示广度优先遍历的访问顺序，逐层点亮节点。"
    payload["summary"] = prompt
    payload["steps"][-1]["title"] = "课程结束"
    payload["steps"][-1]["voiceover_text"] = "这就是最后的结果。"
    playbook = PlaybookScript.model_validate(payload)

    report = quality_gate_playbook(
        playbook,
        prompt,
        generator_path="agent",
    )

    assert report.status == "repairable"
    assert {issue.code for issue in report.issues} >= {"step.does_not_answer_prompt"}


def test_canonical_gate_rejects_empty_playbook() -> None:
    payload = _valid_playbook().model_dump(mode="json")
    payload["steps"] = []
    payload["total_frames"] = 1
    playbook = PlaybookScript.model_validate(payload)

    report = quality_gate_playbook(
        playbook,
        "Explain binary search",
        generator_path="generic_cir",
    )

    assert report.status == "repairable"
    assert "scene.required_contract_missing" in {issue.code for issue in report.issues}


def test_canonical_gate_rejects_array_fallback_for_bfs() -> None:
    report = quality_gate_playbook(
        _valid_playbook(),
        "Explain BFS traversal with the visited set and FIFO queue",
        generator_path="generic_cir",
    )

    assert report.status == "repairable"
    assert "algorithm.state_missing" in {issue.code for issue in report.issues}


def test_canonical_gate_requires_call_stack_for_recursion() -> None:
    payload = _valid_playbook().model_dump(mode="json")
    payload["domain"] = "code"
    playbook = PlaybookScript.model_validate(payload)

    report = quality_gate_playbook(
        playbook,
        "Explain recursion and show the call stack",
        generator_path="generic_cir",
    )

    assert report.status == "repairable"
    assert "code.execution_state_missing" in {issue.code for issue in report.issues}


def test_canonical_gate_requires_projectile_semantics() -> None:
    payload = _valid_playbook().model_dump(mode="json")
    payload["domain"] = "physics"
    playbook = PlaybookScript.model_validate(payload)

    report = quality_gate_playbook(
        playbook,
        "Explain projectile horizontal velocity and vertical velocity under gravity",
        generator_path="generic_cir",
    )

    assert report.status == "repairable"
    assert "physics.state_missing" in {issue.code for issue in report.issues}


def test_canonical_gate_reports_voiceover_timing_warning() -> None:
    payload = _valid_playbook().model_dump(mode="json")
    for index, step in enumerate(payload["steps"], start=1):
        step["end_frame"] = index * 30
    payload["total_frames"] = payload["steps"][-1]["end_frame"]
    playbook = PlaybookScript.model_validate(payload)

    report = quality_gate_playbook(
        playbook,
        "Inspect an array",
        generator_path="generic_cir",
    )

    assert report.status == "warnings"
    assert "timeline.voiceover_too_short" in {issue.code for issue in report.issues}


def test_narration_visual_match_recognizes_single_letter_math_variables() -> None:
    payload = _valid_playbook().model_dump(mode="json")
    snapshot = {
        "kind": "math_plot",
        "curves": [
            {"expression": "x^2", "label": "y=x²", "semantic_role": "curve"},
            {
                "expression": "(2+h)*x-(1+h)",
                "label": "经过P与Q的割线",
                "semantic_role": "secant",
            },
        ],
        "params": {"h": 0.5},
        "marker_x": 1,
        "caption": "h控制Q与P的水平距离。",
    }
    payload["steps"][0]["title"] = "让Q用h表示"
    payload["steps"][0]["voiceover_text"] = (
        "把Q的横坐标写成1加h；当h接近0时，Q越来越接近P。"
    )
    payload["steps"][0]["snapshot"] = deepcopy(snapshot)
    payload["steps"][0]["layers"] = [{"body": deepcopy(snapshot)}]

    report = quality_gate_playbook(
        PlaybookScript.model_validate(payload),
        "用图像解释Q趋近P",
        generator_path="agent",
    )

    assert not any(
        issue.code == "snapshot.narration_mismatch"
        and issue.path == "steps[0].voiceover_text"
        for issue in report.issues
    )


def test_narration_visual_match_uses_formula_symbols_without_shared_prose() -> None:
    payload = _valid_playbook().model_dump(mode="json")
    snapshot = {
        "kind": "math_formula",
        "formula_latex": r"m_h=\frac{f(1+h)-f(1)}{h}=2+h",
        "caption": "割线斜率趋近导数。",
    }
    payload["steps"][0]["title"] = "代数化为导数定义"
    payload["steps"][0]["voiceover_text"] = "一般写成差商：m_h=(f(1+h)-f(1))/h=2+h。"
    payload["steps"][0]["snapshot"] = deepcopy(snapshot)
    payload["steps"][0]["layers"] = [{"body": deepcopy(snapshot)}]

    report = quality_gate_playbook(
        PlaybookScript.model_validate(payload),
        "解释导数差商",
        generator_path="agent",
    )

    assert not any(
        issue.code == "snapshot.narration_mismatch"
        and issue.path == "steps[0].voiceover_text"
        for issue in report.issues
    )
