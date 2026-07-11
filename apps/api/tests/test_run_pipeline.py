from __future__ import annotations

import asyncio
import json
from functools import partial

import pytest

from app.application.dto.pipeline_dto import PipelineRequest
from app.application.services.lesson_planner import build_rule_based_lesson_plan
from app.application.use_cases.run_pipeline import (
    RunPipelineUseCase as _RunPipelineUseCase,
)
from app.application.use_cases.run_pipeline import (
    _strip_markdown_fences,
)
from app.domain.models.pipeline_run import PipelineRunStatus
from app.infrastructure.persistence.db_init import init_db
from app.infrastructure.persistence.sqlite_director_repository import (
    SqliteRunDirectorRepository,
)
from app.infrastructure.persistence.sqlite_run_repository import SqliteRunRepository
from tests.coverage_test_utils import ComposableCoverageResolver

RunPipelineUseCase = partial(
    _RunPipelineUseCase,
    coverage_resolver=ComposableCoverageResolver(),
)

_VALID_CIR = json.dumps({
    "version": "0.1.0",
    "title": "Binary Search",
    "domain": "algorithm",
    "summary": "Step-by-step binary search visualization.",
    "steps": [
        {
            "id": "step_01",
            "title": "Initial Array",
            "narration": "We start with a sorted array.",
            "visual_kind": "array",
            "tokens": [
                {"id": "t0", "label": "1", "value": "1", "emphasis": "secondary"},
                {"id": "t1", "label": "5", "value": "5", "emphasis": "primary"},
                {"id": "t2", "label": "9", "value": "9", "emphasis": "secondary"},
            ],
            "annotations": [],
        }
    ],
})


class MockLLMSuccess:
    async def complete(self, system: str, user: str) -> str:
        return _VALID_CIR


class MockLLMFailure:
    async def complete(self, system: str, user: str) -> str:
        return "this is not json at all"


class MockLLMWithFences:
    async def complete(self, system: str, user: str) -> str:
        return f"```json\n{_VALID_CIR}\n```"


class MockLLMSlow:
    async def complete(self, system: str, user: str) -> str:
        await asyncio.sleep(1)
        return _VALID_CIR


class SlowLessonPlanner:
    async def plan(self, **kwargs):
        await asyncio.sleep(0.08)
        return build_rule_based_lesson_plan(
            prompt=kwargs["prompt"],
            domain=kwargs.get("domain"),
        )


class FailingDirectorRepository:
    async def upsert(self, director, updated_at: str) -> None:  # noqa: ARG002
        raise RuntimeError("director database unavailable")


@pytest.fixture
def repo(tmp_path):
    db = str(tmp_path / "test.db")
    init_db(db)
    return SqliteRunRepository(db)


@pytest.fixture
def repos(tmp_path):
    db = str(tmp_path / "director-test.db")
    init_db(db)
    return SqliteRunRepository(db), SqliteRunDirectorRepository(db)


@pytest.mark.asyncio
async def test_successful_pipeline_run(repo) -> None:
    use_case = RunPipelineUseCase(repo, MockLLMSuccess())
    await repo.create("run-1", "test prompt", "2024-01-01T00:00:00+00:00")
    await use_case.execute(
        "run-1", PipelineRequest(prompt="test prompt", domain="algorithm")
    )

    result = await repo.get("run-1")
    assert result is not None
    assert result.status == PipelineRunStatus.SUCCEEDED
    assert result.playbook is not None
    assert result.playbook.title == "Binary Search"
    assert result.error is None
    assert result.quality_report is not None
    assert result.quality_report.status == "warnings"
    assert {issue.code for issue in result.quality_report.issues} == {
        "timeline.voiceover_too_short"
    }
    assert result.quality_report.generator_path == "generic_cir"
    assert result.lesson_plan is not None
    assert result.lesson_plan.schema_version == "1.0.0"
    assert result.lesson_plan.domain == "algorithm"


@pytest.mark.asyncio
async def test_successful_pipeline_run_persists_active_director(repos) -> None:
    run_repo, director_repo = repos
    use_case = RunPipelineUseCase(run_repo, MockLLMSuccess(), director_repo=director_repo)
    await run_repo.create("run-director", "test prompt", "2024-01-01T00:00:00+00:00")

    await use_case.execute(
        "run-director", PipelineRequest(prompt="test prompt", domain="algorithm")
    )

    director = await director_repo.get("run-director")
    assert director is not None
    assert director.run_id == "run-director"
    assert director.beats[0].step_id == "step_01"
    assert director.beats[0].camera_motion == "push_in"


@pytest.mark.asyncio
async def test_director_persistence_failure_blocks_run_completion(repo) -> None:
    use_case = RunPipelineUseCase(
        repo,
        MockLLMSuccess(),
        director_repo=FailingDirectorRepository(),
    )
    await repo.create("run-director-fail", "test prompt", "2024-01-01T00:00:00+00:00")

    await use_case.execute(
        "run-director-fail", PipelineRequest(prompt="test prompt", domain="algorithm")
    )

    result = await repo.get("run-director-fail")
    assert result is not None
    assert result.status == PipelineRunStatus.FAILED
    assert result.quality_report is not None
    assert result.quality_report.status == "blocked"
    assert {issue.code for issue in result.quality_report.issues} >= {
        "director.persistence_failed"
    }


@pytest.mark.asyncio
async def test_failed_pipeline_run_on_invalid_json(repo) -> None:
    use_case = RunPipelineUseCase(repo, MockLLMFailure())
    await repo.create("run-2", "test prompt", "2024-01-01T00:00:00+00:00")
    await use_case.execute(
        "run-2", PipelineRequest(prompt="test prompt", domain="algorithm")
    )

    result = await repo.get("run-2")
    assert result is not None
    assert result.status == PipelineRunStatus.FAILED
    assert result.playbook is None
    assert result.lesson_plan is not None
    assert result.error is not None
    assert result.quality_report is not None
    assert result.quality_report.status == "blocked"
    assert {issue.code for issue in result.quality_report.issues} >= {
        "parse.invalid_json"
    }


@pytest.mark.asyncio
async def test_pipeline_timeout_includes_lesson_planning(repo) -> None:
    use_case = RunPipelineUseCase(
        repo,
        MockLLMSuccess(),
        lesson_planner=SlowLessonPlanner(),
        pipeline_timeout_s=0.01,
    )
    await repo.create("run-plan-timeout", "test prompt", "2024-01-01T00:00:00+00:00")

    await use_case.execute(
        "run-plan-timeout", PipelineRequest(prompt="test prompt", domain="algorithm")
    )

    result = await repo.get("run-plan-timeout")
    assert result is not None
    assert result.status == PipelineRunStatus.FAILED
    assert result.lesson_plan is None
    assert result.quality_report is not None
    assert {issue.code for issue in result.quality_report.issues} == {"pipeline.timeout"}


@pytest.mark.asyncio
async def test_markdown_fences_stripped_before_parsing(repo) -> None:
    use_case = RunPipelineUseCase(repo, MockLLMWithFences())
    await repo.create("run-3", "test prompt", "2024-01-01T00:00:00+00:00")
    await use_case.execute(
        "run-3", PipelineRequest(prompt="test prompt", domain="algorithm")
    )

    result = await repo.get("run-3")
    assert result is not None
    assert result.status == PipelineRunStatus.SUCCEEDED


def test_strip_markdown_fences_clean_json() -> None:
    raw = '{"key": "value"}'
    assert _strip_markdown_fences(raw) == raw


def test_strip_markdown_fences_with_json_tag() -> None:
    raw = '```json\n{"key": "value"}\n```'
    assert _strip_markdown_fences(raw) == '{"key": "value"}'


def test_strip_markdown_fences_without_tag() -> None:
    raw = '```\n{"key": "value"}\n```'
    assert _strip_markdown_fences(raw) == '{"key": "value"}'


@pytest.mark.asyncio
async def test_pipeline_total_timeout_marks_run_failed(repo) -> None:
    use_case = RunPipelineUseCase(repo, MockLLMSlow(), pipeline_timeout_s=0.01)
    await repo.create("run-timeout", "test prompt", "2024-01-01T00:00:00+00:00")

    await use_case.execute(
        "run-timeout", PipelineRequest(prompt="test prompt", domain="algorithm")
    )

    result = await repo.get("run-timeout")
    assert result is not None
    assert result.status == PipelineRunStatus.FAILED
    assert result.error == "Pipeline timed out after 0.0s"
    assert result.quality_report is not None
    assert result.quality_report.status == "blocked"
    assert {issue.code for issue in result.quality_report.issues} == {
        "pipeline.timeout"
    }
