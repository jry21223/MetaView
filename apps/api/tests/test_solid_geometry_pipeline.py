from __future__ import annotations

import json

import pytest

from app.application.dto.pipeline_dto import PipelineRequest
from app.application.use_cases.run_pipeline import RunPipelineUseCase
from app.domain.models.pipeline_run import PipelineRunStatus


class FailingLLM:
    async def complete(self, system: str, user: str) -> str:
        raise AssertionError("solid geometry prompts should not call the LLM")


class RecordingRepo:
    def __init__(self) -> None:
        self.updates: list[dict] = []

    async def update(
        self,
        run_id: str,
        *,
        status: PipelineRunStatus,
        playbook_json: str | None = None,
        error: str | None = None,
        review_json: str | None = None,
    ) -> None:
        self.updates.append({
            "run_id": run_id,
            "status": status,
            "playbook_json": playbook_json,
            "error": error,
            "review_json": review_json,
        })


@pytest.mark.asyncio
async def test_solid_geometry_pipeline_short_circuits_to_playbook() -> None:
    repo = RecordingRepo()
    use_case = RunPipelineUseCase(repo, FailingLLM())

    await use_case.execute(
        "run-solid",
        PipelineRequest(prompt="正四棱锥 S-ABCD，底面边长为 2，高为 3，求 SA 与底面 ABCD 的线面角"),
    )

    update = repo.updates[-1]
    assert update["status"] == PipelineRunStatus.SUCCEEDED
    assert update["error"] is None
    payload = json.loads(update["playbook_json"])
    assert payload["domain"] == "math"
    assert payload["steps"][0]["snapshot"]["kind"] == "solid_geometry_scene"
    assert payload["steps"][-1]["snapshot"]["formula_latex"]
