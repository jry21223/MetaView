from __future__ import annotations

import json
from functools import partial

import pytest

from app.application.dto.pipeline_dto import PipelineRequest
from app.application.use_cases.run_pipeline import RunPipelineUseCase as _RunPipelineUseCase
from app.domain.models.pipeline_run import PipelineRunStatus
from app.domain.models.run_span import RunStage
from app.infrastructure.persistence.db_init import init_db
from app.infrastructure.persistence.sqlite_run_repository import SqliteRunRepository
from app.infrastructure.persistence.sqlite_span_repository import SqliteRunSpanRepository
from tests.coverage_test_utils import ComposableCoverageResolver

RunPipelineUseCase = partial(
    _RunPipelineUseCase,
    coverage_resolver=ComposableCoverageResolver(default_domain="math"),
)


def _combined(cir: dict, execution_map: dict | None = None) -> str:
    payload: dict = {"cir": cir}
    if execution_map is not None:
        payload["execution_map"] = execution_map
    return json.dumps(payload, ensure_ascii=False)


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
    reviewer = SequenceLLM(
        [
            json.dumps(
                {
                    "action": "correct",
                    "issues": [],
                    "corrected": json.loads(fixed),
                    "fix_instructions": None,
                }
            )
        ]
    )
    span_repo = SqliteRunSpanRepository(repo._db_path)
    use_case = RunPipelineUseCase(
        repo,
        generator,
        reviewer_llm=reviewer,
        max_repair_attempts=1,
        span_repo=span_repo,
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
    spans = await span_repo.list_for_run("run-1")
    reviewer_span = next(span for span in spans if span.stage == RunStage.REVIEWER)
    assert reviewer_span.status == "ok"
    assert reviewer_span.model_turns == 1
    assert reviewer_span.metadata == {
        "review_kind": "cir",
        "review_action": "correct",
        "review_issue_codes": [],
    }


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
    reviewer = SequenceLLM(
        [
            json.dumps(
                {
                    "action": "correct",
                    "issues": [],
                    "corrected": json.loads(fixed),
                    "fix_instructions": None,
                }
            )
        ]
    )
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


@pytest.mark.asyncio
async def test_execution_map_error_fails_when_reviewer_mode_off(repo) -> None:
    cir = {
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
    execution_map = {
        "duration_s": 2,
        "checkpoints": [
            {
                "id": "cp1",
                "step_index": 0,
                "step_id": "missing",
                "visual_kind": "function",
                "title": "bad",
                "summary": "bad",
                "start_s": 0,
                "end_s": 2,
            }
        ],
    }
    generator = SequenceLLM([_combined(cir, execution_map)])
    use_case = RunPipelineUseCase(
        repo,
        generator,
        max_repair_attempts=2,
        reviewer_mode="off",
    )
    await repo.create("run-5", "画函数", "2024-01-01T00:00:00+00:00")

    await use_case.execute("run-5", PipelineRequest(prompt="画函数", domain="math"))

    result = await repo.get("run-5")
    assert result is not None
    assert result.status == PipelineRunStatus.FAILED
    assert result.error is not None
    assert "execution_map_orphan_checkpoint" in result.error
    assert result.review is not None
    assert result.review.status == "failed"


@pytest.mark.asyncio
async def test_canonical_gate_blocks_invalid_state_from_execution_map_warnings(repo) -> None:
    cir = {
        "version": "0.1.0",
        "title": "数组",
        "domain": "algorithm",
        "summary": "演示数组。",
        "steps": [
            {
                "id": "s1",
                "title": "看数组",
                "narration": "观察当前数组。",
                "visual_kind": "array",
                "tokens": [
                    {"id": "t0", "label": "3", "value": "3", "emphasis": "primary"},
                    {"id": "t1", "label": "1", "value": "1", "emphasis": "secondary"},
                ],
                "annotations": [],
            }
        ],
    }
    execution_map = {
        "duration_s": 2,
        "algorithm_code": ["line 0"],
        "checkpoints": [
            {
                "id": "cp1",
                "step_index": 0,
                "step_id": "s1",
                "visual_kind": "array",
                "title": "warn",
                "summary": "warn",
                "start_s": 0,
                "end_s": 2,
                "focus_tokens": ["missing"],
                "array_focus_indices": [9],
                "code_lines": [3],
            }
        ],
    }
    generator = SequenceLLM([_combined(cir, execution_map)])
    use_case = RunPipelineUseCase(repo, generator)
    await repo.create("run-6", "看数组", "2024-01-01T00:00:00+00:00")

    await use_case.execute("run-6", PipelineRequest(prompt="看数组", domain="algorithm"))

    result = await repo.get("run-6")
    assert result is not None
    assert result.status == PipelineRunStatus.FAILED
    assert result.playbook is None
    assert result.review is not None
    assert result.review.status == "warnings"
    assert {issue.code for issue in result.review.issues} >= {
        "execution_map_unknown_focus_token",
        "execution_map_array_index_out_of_range",
        "execution_map_code_line_out_of_range",
    }
    assert result.quality_report is not None
    assert result.quality_report.status == "blocked"
    assert {issue.code for issue in result.quality_report.issues} >= {
        "algorithm.invalid_state_transition",
        "quality.repair_exhausted",
    }


@pytest.mark.asyncio
async def test_canonical_gate_repairs_with_generator_when_reviewer_is_off(repo) -> None:
    cir = {
        "version": "0.1.0",
        "title": "数组",
        "domain": "algorithm",
        "summary": "演示数组。",
        "steps": [
            {
                "id": "s1",
                "title": "看数组",
                "narration": "观察当前数组。",
                "visual_kind": "array",
                "tokens": [
                    {"id": "t0", "label": "3", "value": "3", "emphasis": "primary"},
                    {"id": "t1", "label": "1", "value": "1", "emphasis": "secondary"},
                ],
                "annotations": [],
            }
        ],
    }
    invalid_map = {
        "duration_s": 2,
        "algorithm_code": ["line 0"],
        "checkpoints": [
            {
                "id": "cp1",
                "step_index": 0,
                "step_id": "s1",
                "visual_kind": "array",
                "title": "bad",
                "summary": "bad",
                "start_s": 0,
                "end_s": 2,
                "array_focus_indices": [9],
            }
        ],
    }
    fixed_map = {
        **invalid_map,
        "checkpoints": [
            {
                **invalid_map["checkpoints"][0],
                "title": "fixed",
                "summary": "fixed",
                "array_focus_indices": [0],
            }
        ],
    }
    generator = SequenceLLM([_combined(cir, invalid_map), _combined(cir, fixed_map)])
    span_repo = SqliteRunSpanRepository(repo._db_path)
    use_case = RunPipelineUseCase(
        repo,
        generator,
        reviewer_mode="off",
        span_repo=span_repo,
    )
    await repo.create("run-quality-repair", "看数组", "2024-01-01T00:00:00+00:00")

    await use_case.execute(
        "run-quality-repair",
        PipelineRequest(prompt="看数组", domain="algorithm"),
    )

    result = await repo.get("run-quality-repair")
    assert result is not None
    assert result.status == PipelineRunStatus.SUCCEEDED
    assert len(generator.calls) == 2
    assert result.quality_report is not None
    assert result.quality_report.status in {"clean", "warnings"}
    assert result.quality_report.attempts == 1
    assert "quality:repair_attempt:1" in result.quality_report.actions
    spans = await span_repo.list_for_run("run-quality-repair")
    quality_gates = [span for span in spans if span.stage == RunStage.QUALITY_GATE]
    quality_gates.sort(key=lambda span: span.attempt_index)
    assert [span.attempt_index for span in quality_gates] == [0, 1]
    assert [span.status for span in quality_gates] == ["error", "ok"]
    assert len({span.parent_span_id for span in quality_gates}) == 1
    repair_span = next(span for span in spans if span.stage == RunStage.QUALITY_REPAIR)
    repair_generation = next(
        span
        for span in spans
        if span.stage == RunStage.GENERATION_SINGLE and span.parent_span_id == repair_span.span_id
    )
    assert repair_span.attempt_index == 0
    assert repair_span.metadata["repair_reason"] == "canonical_quality"
    assert "algorithm.invalid_state_transition" in repair_span.metadata["issue_codes"]
    assert repair_generation.metadata["reason"] == "canonical_quality"
