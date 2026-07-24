from __future__ import annotations

import json
from typing import Any

import pytest

from app.application.dto.pipeline_dto import PipelineRequest
from tests.test_run_pipeline_agent_mode import (
    RunPipelineUseCase,
    _playbook_copy,
    _RaisingLLM,
    _RecordingRepo,
    _SequenceAgent,
)

PROMPT = """2019 Beijing Gaokao Humanities Mathematics, Problem 19 (14 points).

The ellipse C: x^2/a^2 + y^2/b^2 = 1 has right focus (1,0) and passes through A(0,1).
(I) Find the equation of ellipse C.
(II) Let O be the origin. The line l: y = kx + t, where t is not equal to plus or
minus 1, intersects C at two distinct points P and Q. Line AP meets the x-axis at
M, and line AQ meets the x-axis at N. If |OM|*|ON| = 2, prove that l always passes
through a fixed point.

Create a classroom-ready visual lesson in Simplified Chinese. Keep part (I) brief.
Focus on part (II), show how the product condition determines the intercept, and
visualize the moving line. End by naming the fixed point explicitly."""


def _moving_line_playbook(
    expression: str,
    *,
    controls: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    playbook = _playbook_copy()
    playbook["domain"] = "math"
    playbook["title"] = "Fixed-point line family"
    playbook["summary"] = "Prove a moving line passes through a fixed point."
    playbook["parameter_controls"] = controls or []
    for step in playbook["steps"]:
        snapshot = {
            "kind": "math_plot",
            "curves": [{"expression": expression, "label": "moving line"}],
            "x_min": -5,
            "x_max": 5,
            "x_label": "x",
            "y_label": "y",
        }
        step["title"] = "Moving line"
        step["voiceover_text"] = (
            "The condition fixes t=0 while k remains free, so the moving line "
            "always passes through the fixed point (0,0)."
        )
        step["narration_template"] = [step["voiceover_text"]]
        step["snapshot"] = snapshot
        step["layers"] = [{"body": json.loads(json.dumps(snapshot))}]
        step["code_highlight"] = None
    return playbook


@pytest.mark.asyncio
async def test_pipeline_repairs_a_hardcoded_moving_parameter_before_success() -> None:
    blocked = _moving_line_playbook("0.5*x")
    repaired = _moving_line_playbook(
        "k*x",
        controls=[{"id": "k", "label": "Slope k", "value": "0.5"}],
    )
    agent = _SequenceAgent([blocked, repaired])
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(
        repo,
        _RaisingLLM(),
        agent_provider=agent,
        generation_mode="agent",
        reviewer_mode="off",
    )

    await use_case.execute(
        "run-math-parameter-repair",
        PipelineRequest(prompt=PROMPT, domain="math"),
    )

    assert len(agent.calls) == 2
    assert "math.parameter_hardcoded" in agent.calls[1]["prompt"]
    last = repo.updates[-1]
    assert last["status"].value == "succeeded"
    persisted = json.loads(last["playbook_json"])
    assert persisted["parameter_controls"][0]["id"] == "k"
    assert persisted["steps"][0]["snapshot"]["curves"][0]["expression"] == "k*x"


@pytest.mark.asyncio
async def test_pipeline_fails_closed_when_parameter_repair_is_exhausted() -> None:
    blocked = _moving_line_playbook("0.5*x")
    agent = _SequenceAgent([blocked, blocked, blocked])
    repo = _RecordingRepo()
    use_case = RunPipelineUseCase(
        repo,
        _RaisingLLM(),
        agent_provider=agent,
        generation_mode="agent",
        reviewer_mode="off",
    )

    await use_case.execute(
        "run-math-parameter-exhausted",
        PipelineRequest(prompt=PROMPT, domain="math"),
    )

    assert len(agent.calls) == 3
    last = repo.updates[-1]
    assert last["status"].value == "failed"
    assert "playbook_json" not in last
    review = json.loads(last["review_json"])
    assert "math.parameter_hardcoded" in {
        issue["code"] for issue in review["issues"]
    }
