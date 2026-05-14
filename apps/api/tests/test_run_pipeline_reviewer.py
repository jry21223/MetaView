from __future__ import annotations

import json

import pytest

from app.application.dto.pipeline_dto import PipelineRequest
from app.application.use_cases.run_pipeline import RunPipelineUseCase
from app.domain.models.pipeline_run import PipelineRunStatus
from app.infrastructure.persistence.db_init import init_db
from app.infrastructure.persistence.sqlite_run_repository import SqliteRunRepository


def _combined(cir: dict) -> str:
    return json.dumps({"cir": cir}, ensure_ascii=False)


def _valid_scene_cir() -> dict:
    return {
        "version": "0.1.0",
        "title": "向量场",
        "domain": "math",
        "summary": "演示向量场。",
        "steps": [
            {
                "id": "s1",
                "title": "画出向量场",
                "narration": "向量场像每个点上的小箭头。",
                "visual_kind": "scene",
                "tokens": [],
                "scene": {
                    "x_min": -2,
                    "x_max": 2,
                    "y_min": -2,
                    "y_max": 2,
                    "vector_field": {
                        "expression_px": "-y",
                        "expression_py": "x",
                        "step": 1,
                    },
                },
                "annotations": [],
            }
        ],
    }


class SequenceLLM:
    def __init__(self, responses: list[str]) -> None:
        self.responses = responses
        self.calls: list[tuple[str, str]] = []

    async def complete(self, system: str, user: str) -> str:
        self.calls.append((system, user))
        index = min(len(self.calls) - 1, len(self.responses) - 1)
        return self.responses[index]


@pytest.fixture
def repo(tmp_path):
    db = str(tmp_path / "test.db")
    init_db(db)
    return SqliteRunRepository(db)


@pytest.mark.asyncio
async def test_bad_shape_reviewer_fixes_and_persists_review(repo) -> None:
    bad = _combined(
        {
            "version": "0.1.0",
            "title": "曲线",
            "domain": "math",
            "summary": "演示曲线。",
            "steps": [
                {
                    "id": "s1",
                    "title": "画函数",
                    "narration": "先画出 f(x)。",
                    "visual_kind": "function",
                    "tokens": [],
                    "plot": {"curves": []},
                    "annotations": [],
                }
            ],
        }
    )
    fixed = _combined(
        {
            "version": "0.1.0",
            "title": "曲线",
            "domain": "math",
            "summary": "演示曲线。",
            "steps": [
                {
                    "id": "s1",
                    "title": "画函数",
                    "narration": "先画出 f(x)。",
                    "visual_kind": "function",
                    "tokens": [],
                    "plot": {"curves": [{"expression": "x", "label": "f"}]},
                    "annotations": [],
                }
            ],
        }
    )
    generator = SequenceLLM([bad])
    reviewer = SequenceLLM([
        json.dumps(
            {
                "action": "correct",
                "issues": [],
                "corrected": json.loads(fixed),
                "fix_instructions": None,
            }
        )
    ])
    use_case = RunPipelineUseCase(
        repo,
        generator,
        reviewer_llm=reviewer,
        max_repair_attempts=1,
    )
    await repo.create("run-1", "画函数", "2024-01-01T00:00:00+00:00")

    await use_case.execute("run-1", PipelineRequest(prompt="画函数", domain="math"))

    result = await repo.get("run-1")
    assert result is not None
    assert result.status == PipelineRunStatus.SUCCEEDED
    assert result.playbook is not None
    assert result.review is not None
    assert result.review.attempts == 1
    assert result.review.status == "repaired"


@pytest.mark.asyncio
async def test_formula_vector_field_critic_returns_corrected_scene(repo) -> None:
    bad = _combined(
        {
            "version": "0.1.0",
            "title": "向量场",
            "domain": "math",
            "summary": "演示向量场。",
            "steps": [
                {
                    "id": "s1",
                    "title": "向量场是什么",
                    "narration": "向量场就是每个点都有一个方向。",
                    "visual_kind": "formula",
                    "tokens": [],
                    "plot": {"formula_latex": "F=(-y,x)"},
                    "annotations": ["F 是向量场"],
                }
            ],
        }
    )
    fixed = _combined(_valid_scene_cir())
    generator = SequenceLLM([bad])
    reviewer = SequenceLLM([
        json.dumps(
            {
                "action": "correct",
                "issues": [],
                "corrected": json.loads(fixed),
                "fix_instructions": None,
            }
        )
    ])
    use_case = RunPipelineUseCase(
        repo,
        generator,
        reviewer_llm=reviewer,
        max_repair_attempts=1,
    )
    await repo.create("run-2", "解释向量场", "2024-01-01T00:00:00+00:00")

    await use_case.execute("run-2", PipelineRequest(prompt="解释向量场", domain="math"))

    result = await repo.get("run-2")
    assert result is not None
    assert result.status == PipelineRunStatus.SUCCEEDED
    assert result.playbook is not None
    assert result.playbook.steps[0].snapshot.kind == "math_scene"
    assert result.review is not None
    assert result.review.attempts == 1


@pytest.mark.asyncio
async def test_reach_max_repair_attempts_fails_with_humanized_error(repo) -> None:
    bad = _combined(
        {
            "version": "0.1.0",
            "title": "向量场",
            "domain": "math",
            "summary": "演示向量场。",
            "steps": [
                {
                    "id": "s1",
                    "title": "向量场是什么",
                    "narration": "向量场就是每个点都有一个方向。",
                    "visual_kind": "formula",
                    "tokens": [],
                    "plot": {"formula_latex": "F=(-y,x)"},
                    "annotations": ["F 是向量场"],
                }
            ],
        }
    )
    generator = SequenceLLM([bad, bad])
    use_case = RunPipelineUseCase(repo, generator, max_repair_attempts=1)
    await repo.create("run-3", "解释向量场", "2024-01-01T00:00:00+00:00")

    await use_case.execute("run-3", PipelineRequest(prompt="解释向量场", domain="math"))

    result = await repo.get("run-3")
    assert result is not None
    assert result.status == PipelineRunStatus.FAILED
    assert result.error is not None
    assert "math_geometry_requires_scene" in result.error
    assert result.review is not None
    assert result.review.status == "failed"
    assert result.review.attempts == 1


@pytest.mark.asyncio
async def test_reviewer_mode_off_fails_fast_without_repair(repo) -> None:
    bad = _combined(
        {
            "version": "0.1.0",
            "title": "曲线",
            "domain": "math",
            "summary": "演示曲线。",
            "steps": [
                {
                    "id": "s1",
                    "title": "画函数",
                    "narration": "先画出 f(x)。",
                    "visual_kind": "function",
                    "tokens": [],
                    "plot": {"curves": []},
                    "annotations": [],
                }
            ],
        }
    )
    generator = SequenceLLM([bad])
    use_case = RunPipelineUseCase(
        repo,
        generator,
        max_repair_attempts=2,
        reviewer_mode="off",
    )
    await repo.create("run-4", "画函数", "2024-01-01T00:00:00+00:00")

    await use_case.execute("run-4", PipelineRequest(prompt="画函数", domain="math"))

    result = await repo.get("run-4")
    assert result is not None
    assert result.status == PipelineRunStatus.FAILED
    assert len(generator.calls) == 1
    assert result.review is not None
    assert result.review.attempts == 0
    assert result.review.status == "failed"
