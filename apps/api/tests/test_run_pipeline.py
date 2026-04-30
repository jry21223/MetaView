from __future__ import annotations

import json

import pytest

from app.application.dto.pipeline_dto import PipelineRequest
from app.application.use_cases.run_pipeline import RunPipelineUseCase, _strip_markdown_fences
from app.domain.models.pipeline_run import PipelineRunStatus
from app.infrastructure.persistence.db_init import init_db
from app.infrastructure.persistence.sqlite_run_repository import SqliteRunRepository

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


@pytest.fixture
def repo(tmp_path):
    db = str(tmp_path / "test.db")
    init_db(db)
    return SqliteRunRepository(db)


@pytest.mark.asyncio
async def test_successful_pipeline_run(repo) -> None:
    use_case = RunPipelineUseCase(repo, MockLLMSuccess())
    repo.create("run-1", "test prompt", "2024-01-01T00:00:00+00:00")
    await use_case.execute("run-1", PipelineRequest(prompt="test prompt"))

    result = repo.get("run-1")
    assert result is not None
    assert result.status == PipelineRunStatus.SUCCEEDED
    assert result.playbook is not None
    assert result.playbook.title == "Binary Search"
    assert result.error is None


@pytest.mark.asyncio
async def test_failed_pipeline_run_on_invalid_json(repo) -> None:
    use_case = RunPipelineUseCase(repo, MockLLMFailure())
    repo.create("run-2", "test prompt", "2024-01-01T00:00:00+00:00")
    await use_case.execute("run-2", PipelineRequest(prompt="test prompt"))

    result = repo.get("run-2")
    assert result is not None
    assert result.status == PipelineRunStatus.FAILED
    assert result.playbook is None
    assert result.error is not None


@pytest.mark.asyncio
async def test_markdown_fences_stripped_before_parsing(repo) -> None:
    use_case = RunPipelineUseCase(repo, MockLLMWithFences())
    repo.create("run-3", "test prompt", "2024-01-01T00:00:00+00:00")
    await use_case.execute("run-3", PipelineRequest(prompt="test prompt"))

    result = repo.get("run-3")
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
