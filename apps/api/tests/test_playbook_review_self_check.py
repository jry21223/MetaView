from __future__ import annotations

from copy import deepcopy

from app.domain.models.playbook import PlaybookScript
from app.domain.models.review import PlaybookReviewStatus
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
        "end_frame": index * 60,
        "title": f"Array interval {index}",
        "voiceover_text": f"Inspect the sorted array interval {index}.",
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
            "total_frames": 480,
            "domain": "algorithm",
            "title": "Binary search",
            "summary": "Show a search interval.",
            "steps": steps,
            "parameter_controls": [],
        }
    )


def test_playbook_self_check_returns_clean_for_renderer_ready_script() -> None:
    verdict = review_playbook_script(_valid_playbook(), prompt="Explain binary search.")

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
