from __future__ import annotations

from copy import deepcopy

from app.domain.models.playbook import PlaybookScript
from app.domain.models.review import PlaybookReviewStatus
from app.domain.services.playbook_review import review_playbook_script


def _valid_playbook() -> PlaybookScript:
    return PlaybookScript.model_validate(
        {
            "fps": 30,
            "total_frames": 120,
            "domain": "algorithm",
            "title": "Binary search",
            "summary": "Show a search interval.",
            "steps": [
                {
                    "step_id": "step_01",
                    "end_frame": 60,
                    "title": "Initial interval",
                    "voiceover_text": "Start by looking at the whole sorted array.",
                    "snapshot": {
                        "kind": "algorithm_array",
                        "array_values": ["1", "3", "5"],
                        "active_indices": [0, 1, 2],
                        "swap_indices": [],
                        "sorted_indices": [],
                        "pointers": {"left": 0, "right": 2},
                    },
                    "layers": [
                        {
                            "body": {
                                "kind": "algorithm_array",
                                "array_values": ["1", "3", "5"],
                                "active_indices": [0, 1, 2],
                                "swap_indices": [],
                                "sorted_indices": [],
                                "pointers": {"left": 0, "right": 2},
                            }
                        }
                    ],
                    "code_highlight": {
                        "language": "python",
                        "lines": ["left = 0", "right = len(a) - 1"],
                        "active_lines": [0],
                        "active_line": 0,
                    },
                },
                {
                    "step_id": "step_02",
                    "end_frame": 120,
                    "title": "Choose middle",
                    "voiceover_text": "Compare the target with the middle value.",
                    "snapshot": {
                        "kind": "algorithm_array",
                        "array_values": ["1", "3", "5"],
                        "active_indices": [1],
                        "swap_indices": [],
                        "sorted_indices": [],
                        "pointers": {"mid": 1},
                    },
                    "layers": [
                        {
                            "body": {
                                "kind": "algorithm_array",
                                "array_values": ["1", "3", "5"],
                                "active_indices": [1],
                                "swap_indices": [],
                                "sorted_indices": [],
                                "pointers": {"mid": 1},
                            }
                        }
                    ],
                },
            ],
            "parameter_controls": [],
        }
    )


def test_playbook_self_check_returns_clean_for_renderer_ready_script() -> None:
    verdict = review_playbook_script(_valid_playbook(), prompt="Explain binary search.")

    assert verdict.status == PlaybookReviewStatus.CLEAN
    assert verdict.issues == []


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
    payload["steps"] = [
        {
            "step_id": "step_01",
            "end_frame": 120,
            "title": "Plot",
            "voiceover_text": " ",
            "snapshot": {"kind": "math_plot", "curves": []},
            "layers": [{"body": {"kind": "math_plot", "curves": []}}],
        }
    ]
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
