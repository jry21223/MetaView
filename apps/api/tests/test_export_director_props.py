from __future__ import annotations

import asyncio
import contextlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

from app.application.dto.pipeline_dto import PipelineRequest
from app.application.use_cases.export_video import ExportVideoUseCase
from app.application.use_cases.run_pipeline import RunPipelineUseCase
from app.domain.models.coverage import CoverageDecision
from app.domain.models.director import DirectorBeat, DirectorScript
from app.domain.models.export_job import (
    ExportAssetReport,
    ExportJob,
    ExportOptions,
    TtsConfig,
)
from app.domain.models.lesson_plan import LessonPlan, SceneIntent
from app.domain.models.pipeline_run import PipelineRunStatus
from app.domain.models.quality_report import QualityReport
from app.domain.models.review import (
    PlaybookReviewIssue,
    PlaybookReviewStatus,
    PlaybookReviewVerdict,
)
from app.infrastructure.persistence.db_init import init_db
from app.infrastructure.persistence.in_memory_export_repository import (
    InMemoryExportJobRepository,
)
from app.infrastructure.persistence.sqlite_director_repository import (
    SqliteRunDirectorRepository,
)
from app.infrastructure.persistence.sqlite_run_repository import SqliteRunRepository
from tests.coverage_test_utils import ComposableCoverageResolver
from tests.test_run_pipeline import MockLLMSuccess


class RecordingExportVideoUseCase(ExportVideoUseCase):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.input_props: dict[str, Any] | None = None

    async def _run_remotion_render(
        self,
        job_id: str,
        props_path: Path,
        output_path: Path,
        options: ExportOptions,
    ) -> None:
        self.input_props = json.loads(props_path.read_text(encoding="utf-8"))
        output_path.write_bytes(b"fake video")


class FailingDirectorRepository:
    async def get(self, run_id: str):
        raise RuntimeError(f"director db unavailable for {run_id}")


class RejectingDirectorRepository:
    async def upsert(self, director: Any, updated_at: str) -> None:  # noqa: ARG002
        raise RuntimeError("director database unavailable")


class StubAudioExportVideoUseCase(RecordingExportVideoUseCase):
    async def _generate_step_audio(
        self,
        playbook: dict[str, Any],
        tts: TtsConfig,
        audio_dir: Path,
    ) -> list[str]:
        return [
            str(audio_dir / "step_000.mp3"),
            str(audio_dir / "step_001.mp3"),
            str(audio_dir / "step_002.mp3"),
        ]


@pytest.mark.asyncio
async def test_export_input_props_includes_active_director_when_available(tmp_path) -> None:
    db = str(tmp_path / "export.db")
    init_db(db)
    run_repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    export_repo = InMemoryExportJobRepository()
    await _seed_run(run_repo, "run-1")
    await director_repo.upsert(_director("run-1"), "2026-06-05T00:00:00+00:00")
    await export_repo.create(_job("job-1", "run-1"))
    use_case = RecordingExportVideoUseCase(
        export_repo,
        run_repo,
        director_repo,
        web_app_dir=tmp_path,
        artifacts_dir=tmp_path / "artifacts",
    )

    await use_case.execute("job-1", "run-1", with_audio=False, tts=None)

    assert use_case.input_props is not None
    assert use_case.input_props["script"]["title"] == "Export fixture"
    assert use_case.input_props["director"]["run_id"] == "run-1"
    assert use_case.input_props["director"]["beats"][0]["camera_motion"] == "push_in"
    assert use_case.input_props["theme"] == "light"
    job = await export_repo.get("job-1")
    assert job is not None
    assert job.output_path is not None


@pytest.mark.asyncio
async def test_export_input_props_preserves_requested_dark_theme(tmp_path) -> None:
    db = str(tmp_path / "export-dark.db")
    init_db(db)
    run_repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    export_repo = InMemoryExportJobRepository()
    await _seed_run(run_repo, "run-dark")
    await export_repo.create(_job("job-dark", "run-dark"))
    use_case = RecordingExportVideoUseCase(
        export_repo,
        run_repo,
        director_repo,
        web_app_dir=tmp_path,
        artifacts_dir=tmp_path / "artifacts",
    )

    await use_case.execute(
        "job-dark",
        "run-dark",
        with_audio=False,
        tts=None,
        options=ExportOptions(theme="dark"),
    )

    assert use_case.input_props is not None
    assert use_case.input_props["theme"] == "dark"


@pytest.mark.asyncio
async def test_export_omits_director_when_missing_without_persistence_failure(tmp_path) -> None:
    db = str(tmp_path / "export-missing.db")
    init_db(db)
    run_repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    export_repo = InMemoryExportJobRepository()
    await _seed_run(run_repo, "run-2")
    await export_repo.create(_job("job-2", "run-2"))
    use_case = RecordingExportVideoUseCase(
        export_repo,
        run_repo,
        director_repo,
        web_app_dir=tmp_path,
        artifacts_dir=tmp_path / "artifacts",
    )

    await use_case.execute("job-2", "run-2", with_audio=False, tts=None)

    # No persisted director and no recorded persistence failure: keep the
    # historical no-director behaviour instead of silently injecting a rule
    # director (#235 review).
    assert use_case.input_props is not None
    assert "director" not in use_case.input_props


@pytest.mark.asyncio
async def test_export_rebuilds_director_after_run_persistence_failure(tmp_path) -> None:
    db = str(tmp_path / "export-after-run-failure.db")
    init_db(db)
    run_repo = SqliteRunRepository(db)
    export_repo = InMemoryExportJobRepository()
    pipeline = RunPipelineUseCase(
        run_repo,
        MockLLMSuccess(),
        director_repo=RejectingDirectorRepository(),
        coverage_resolver=ComposableCoverageResolver(),
    )
    await run_repo.create("run-persist-fail", "test prompt", "2026-06-05T00:00:00+00:00")
    await pipeline.execute(
        "run-persist-fail", PipelineRequest(prompt="test prompt", domain="algorithm")
    )
    run = await run_repo.get("run-persist-fail")
    assert run is not None
    assert run.status == PipelineRunStatus.SUCCEEDED
    assert run.playbook is not None
    assert run.quality_report is not None
    assert "director.persistence_failed" in {
        issue.code for issue in run.quality_report.issues
    }

    await export_repo.create(_job("job-persist-fail", "run-persist-fail"))
    use_case = RecordingExportVideoUseCase(
        export_repo,
        run_repo,
        SqliteRunDirectorRepository(db),
        web_app_dir=tmp_path,
        artifacts_dir=tmp_path / "artifacts",
    )
    await use_case.execute(
        "job-persist-fail", "run-persist-fail", with_audio=False, tts=None
    )

    assert use_case.input_props is not None
    assert use_case.input_props["director"]["run_id"] == "run-persist-fail"
    job = await export_repo.get("job-persist-fail")
    assert job is not None and job.status == "completed"


@pytest.mark.asyncio
async def test_export_blocks_when_persisted_director_cannot_be_loaded(tmp_path) -> None:
    db = str(tmp_path / "export-director-failure.db")
    init_db(db)
    run_repo = SqliteRunRepository(db)
    export_repo = InMemoryExportJobRepository()
    await _seed_run(run_repo, "run-director-failure")
    await export_repo.create(_job("job-director-failure", "run-director-failure"))
    use_case = RecordingExportVideoUseCase(
        export_repo,
        run_repo,
        FailingDirectorRepository(),  # type: ignore[arg-type]
        web_app_dir=tmp_path,
        artifacts_dir=tmp_path / "artifacts",
    )

    await use_case.execute(
        "job-director-failure",
        "run-director-failure",
        with_audio=False,
        tts=None,
    )

    job = await export_repo.get("job-director-failure")
    run = await run_repo.get("run-director-failure")
    assert job is not None and job.status == "failed"
    assert "persisted DirectorScript" in (job.error or "")
    assert run is not None and run.quality_report is not None
    assert run.quality_report.status == "blocked"
    assert "director.persistence_failed" in {issue.code for issue in run.quality_report.issues}


@pytest.mark.asyncio
async def test_export_blocks_and_reports_corrupt_persisted_director(tmp_path) -> None:
    db = str(tmp_path / "export-corrupt-director.db")
    init_db(db)
    run_repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    export_repo = InMemoryExportJobRepository()
    await _seed_run(run_repo, "run-corrupt-director")
    with sqlite3.connect(db) as conn:
        conn.execute(
            "INSERT INTO pipeline_run_directors"
            " (run_id, director_json, source, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (
                "run-corrupt-director",
                '{"run_id": ""}',
                "rule",
                "2026-06-05T00:00:00+00:00",
                "2026-06-05T00:00:00+00:00",
            ),
        )
    await export_repo.create(_job("job-corrupt-director", "run-corrupt-director"))
    use_case = RecordingExportVideoUseCase(
        export_repo,
        run_repo,
        director_repo,
        web_app_dir=tmp_path,
        artifacts_dir=tmp_path / "artifacts",
    )

    await use_case.execute(
        "job-corrupt-director",
        "run-corrupt-director",
        with_audio=False,
        tts=None,
    )

    job = await export_repo.get("job-corrupt-director")
    run = await run_repo.get("run-corrupt-director")
    assert job is not None and job.status == "failed"
    assert "persisted DirectorScript" in (job.error or "")
    assert use_case.input_props is None
    assert run is not None and run.quality_report is not None
    assert run.quality_report.status == "blocked"
    assert "director.persistence_failed" in {issue.code for issue in run.quality_report.issues}


@pytest.mark.asyncio
async def test_export_writes_asset_report_sidecar_when_job_has_report(tmp_path) -> None:
    db = str(tmp_path / "export-asset-report.db")
    init_db(db)
    run_repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    export_repo = InMemoryExportJobRepository()
    await _seed_run(run_repo, "run-report")
    await export_repo.create(
        _job("job-report", "run-report").model_copy(update={"asset_report": _asset_report()})
    )
    use_case = RecordingExportVideoUseCase(
        export_repo,
        run_repo,
        director_repo,
        web_app_dir=tmp_path,
        artifacts_dir=tmp_path / "artifacts",
    )

    await use_case.execute("job-report", "run-report", with_audio=False, tts=None)

    job = await export_repo.get("job-report")
    assert job is not None
    assert job.asset_report_path is not None
    report_path = Path(job.asset_report_path)
    assert report_path.exists()
    report = json.loads(report_path.read_text(encoding="utf-8"))
    assert report == {
        "job_id": "job-report",
        "run_id": "run-report",
        "asset_report": _asset_report().model_dump(mode="json"),
    }


@pytest.mark.asyncio
async def test_export_rechecks_quality_and_blocks_missing_asset(tmp_path) -> None:
    db = str(tmp_path / "export-quality.db")
    init_db(db)
    run_repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    export_repo = InMemoryExportJobRepository()
    await run_repo.create("run-invalid", "plot x", "2026-06-05T00:00:00+00:00")
    invalid = _playbook()
    invalid["domain"] = "math"
    snapshot = {
        "kind": "math_plot",
        "pack_id": "math-basic",
        "asset_id": "missing-export-asset",
        "curves": [{"expression": "x", "label": "f"}],
    }
    invalid["steps"][0]["snapshot"] = snapshot
    invalid["steps"][0]["layers"] = [{"body": snapshot}]
    await run_repo.update(
        "run-invalid",
        status=PipelineRunStatus.SUCCEEDED,
        playbook_json=json.dumps(invalid),
    )
    await export_repo.create(_job("job-invalid", "run-invalid"))
    use_case = RecordingExportVideoUseCase(
        export_repo,
        run_repo,
        director_repo,
        web_app_dir=tmp_path,
        artifacts_dir=tmp_path / "artifacts",
    )

    await use_case.execute("job-invalid", "run-invalid", with_audio=False, tts=None)

    job = await export_repo.get("job-invalid")
    run = await run_repo.get("run-invalid")
    assert job is not None and job.status.value == "failed"
    assert "asset.missing" in (job.error or "")
    assert run is not None and run.quality_report is not None
    assert run.quality_report.status == "blocked"
    assert {issue.code for issue in run.quality_report.issues} >= {
        "asset.missing",
        "export.not_ready",
    }


@pytest.mark.asyncio
async def test_export_recheck_enforces_persisted_experimental_boundary(tmp_path) -> None:
    db = str(tmp_path / "export-experimental.db")
    init_db(db)
    run_repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    export_repo = InMemoryExportJobRepository()
    await _seed_run(run_repo, "run-experimental")
    decision = CoverageDecision(
        mode="experimental",
        domain="algorithm",
        confidence=0.55,
        matched_skill_ids=[],
        available_tool_ids=["playbook.schema.validate"],
        missing_capabilities=["capability:controlled_composition:algorithm"],
        fallback_policy="text_only",
        reason="No verified visual execution path covers the original run.",
    )
    await run_repo.update_coverage_decision(
        "run-experimental",
        decision.model_dump_json(),
    )
    await export_repo.create(_job("job-experimental", "run-experimental"))
    use_case = RecordingExportVideoUseCase(
        export_repo,
        run_repo,
        director_repo,
        web_app_dir=tmp_path,
        artifacts_dir=tmp_path / "artifacts",
    )

    await use_case.execute(
        "job-experimental",
        "run-experimental",
        with_audio=False,
        tts=None,
    )

    job = await export_repo.get("job-experimental")
    run = await run_repo.get("run-experimental")
    assert job is not None and job.status.value == "failed"
    assert "capability.text_only_required" in (job.error or "")
    assert run is not None and run.quality_report is not None
    assert run.quality_report.status == "blocked"
    assert run.quality_report.coverage_mode == "experimental"
    assert "capability.text_only_required" in {
        issue.code for issue in run.quality_report.issues
    }


@pytest.mark.asyncio
async def test_export_recheck_preserves_persisted_lesson_plan_requirements(tmp_path) -> None:
    db = str(tmp_path / "export-lesson-plan.db")
    init_db(db)
    run_repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    export_repo = InMemoryExportJobRepository()
    await _seed_run(run_repo, "run-lesson-plan")
    await run_repo.update_lesson_plan(
        "run-lesson-plan",
        _strict_stack_lesson_plan().model_dump_json(),
    )
    await export_repo.create(_job("job-lesson-plan", "run-lesson-plan"))
    use_case = RecordingExportVideoUseCase(
        export_repo,
        run_repo,
        director_repo,
        web_app_dir=tmp_path,
        artifacts_dir=tmp_path / "artifacts",
    )

    await use_case.execute(
        "job-lesson-plan",
        "run-lesson-plan",
        with_audio=False,
        tts=None,
    )

    job = await export_repo.get("job-lesson-plan")
    run = await run_repo.get("run-lesson-plan")
    assert job is not None and job.status.value == "failed"
    assert "lesson_plan.visual_role_missing" in (job.error or "")
    assert run is not None and run.quality_report is not None
    assert "lesson_plan.visual_role_missing" in {
        issue.code for issue in run.quality_report.issues
    }


@pytest.mark.asyncio
async def test_export_recheck_preserves_existing_quality_warnings(tmp_path) -> None:
    db = str(tmp_path / "export-warning.db")
    init_db(db)
    run_repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    export_repo = InMemoryExportJobRepository()
    await _seed_run(run_repo, "run-warning")
    warning = QualityReport.from_review_verdict(
        PlaybookReviewVerdict(
            status=PlaybookReviewStatus.WARNINGS,
            summary="Knowledge warning",
            issues=[
                PlaybookReviewIssue(
                    code="knowledge.source_unverified",
                    severity="warning",
                    path="steps[0]",
                    message="Knowledge source was not independently verified.",
                )
            ],
            actions=["reviewer:status:warnings"],
        ),
        generator_path="agent",
        coverage_mode="experimental",
    )
    await run_repo.update_quality_report("run-warning", warning.model_dump_json())
    decision = CoverageDecision(
        mode="specialized",
        domain="algorithm",
        confidence=0.9,
        matched_skill_ids=["algorithm_graph_core"],
        available_tool_ids=["skill.algorithm_graph_core.solve"],
        missing_capabilities=[],
        fallback_policy="use_skill",
        reason="A deterministic algorithm SkillPack covers the original run.",
    )
    await run_repo.update_coverage_decision("run-warning", decision.model_dump_json())
    await export_repo.create(_job("job-warning", "run-warning"))
    use_case = RecordingExportVideoUseCase(
        export_repo,
        run_repo,
        director_repo,
        web_app_dir=tmp_path,
        artifacts_dir=tmp_path / "artifacts",
    )

    await use_case.execute("job-warning", "run-warning", with_audio=False, tts=None)

    run = await run_repo.get("run-warning")
    assert run is not None and run.quality_report is not None
    assert run.quality_report.status == "warnings"
    assert run.quality_report.coverage_mode == "specialized"
    assert run.coverage_decision == decision
    assert {issue.code for issue in run.quality_report.issues} >= {"knowledge.source_unverified"}
    assert "reviewer:status:warnings" in run.quality_report.actions
    assert any(action.startswith("export:readiness:") for action in run.quality_report.actions)


@pytest.mark.asyncio
async def test_export_recheck_drops_stale_blocking_issues(tmp_path) -> None:
    db = str(tmp_path / "export-stale-block.db")
    init_db(db)
    run_repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    export_repo = InMemoryExportJobRepository()
    await _seed_run(run_repo, "run-stale")
    stale = QualityReport.from_review_verdict(
        PlaybookReviewVerdict(
            status=PlaybookReviewStatus.BLOCKED,
            summary="Old export failure",
            issues=[
                PlaybookReviewIssue(
                    code="export.not_ready",
                    severity="error",
                    path="playbook",
                    message="A previous version was not export ready.",
                    requires_repair=False,
                )
            ],
        ),
        generator_path="agent",
        coverage_mode="experimental",
    )
    await run_repo.update_quality_report("run-stale", stale.model_dump_json())
    await export_repo.create(_job("job-stale", "run-stale"))
    use_case = RecordingExportVideoUseCase(
        export_repo,
        run_repo,
        director_repo,
        web_app_dir=tmp_path,
        artifacts_dir=tmp_path / "artifacts",
    )

    await use_case.execute("job-stale", "run-stale", with_audio=False, tts=None)

    job = await export_repo.get("job-stale")
    run = await run_repo.get("run-stale")
    assert job is not None and job.status == "completed"
    assert run is not None and run.quality_report is not None
    assert "export.not_ready" not in {issue.code for issue in run.quality_report.issues}


@pytest.mark.asyncio
async def test_export_recheck_drops_stale_frame_warning_keeps_other_warnings(
    tmp_path,
    monkeypatch,
) -> None:
    """Merging the export recheck into a prior report drops frame-count warnings
    the final timeline no longer produces, while keeping stretch-independent
    warnings (#245)."""

    db = str(tmp_path / "export-stale-frame-warning.db")
    init_db(db)
    run_repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    export_repo = InMemoryExportJobRepository()
    await _seed_run(run_repo, "run-stale-frame")
    prior = QualityReport.from_review_verdict(
        PlaybookReviewVerdict(
            status=PlaybookReviewStatus.WARNINGS,
            summary="Pre-stretch run gate warnings",
            issues=[
                PlaybookReviewIssue(
                    code="timeline.voiceover_too_short",
                    severity="warning",
                    path="steps[0].end_frame",
                    message=(
                        "Step duration (60 frames) appears shorter than the "
                        "estimated narration requirement (168 frames)."
                    ),
                ),
                PlaybookReviewIssue(
                    code="knowledge.source_unverified",
                    severity="warning",
                    path="steps[0]",
                    message="Knowledge source was not independently verified.",
                ),
            ],
            actions=["reviewer:status:warnings"],
        ),
        generator_path="agent",
        coverage_mode="specialized",
    )
    await run_repo.update_quality_report("run-stale-frame", prior.model_dump_json())
    await export_repo.create(_job("job-stale-frame", "run-stale-frame"))
    # 6s of audio = 180 frames at 30fps, well past the 168-frame estimate, so
    # the post-stretch recheck no longer flags the tight voiceover.
    monkeypatch.setattr(
        "app.application.use_cases.export_video._probe_audio_duration_seconds",
        lambda path: 6.0,
    )
    use_case = StubAudioExportVideoUseCase(
        export_repo,
        run_repo,
        director_repo,
        web_app_dir=tmp_path,
        artifacts_dir=tmp_path / "artifacts",
    )

    await use_case.execute(
        "job-stale-frame",
        "run-stale-frame",
        with_audio=True,
        tts=TtsConfig(api_key="test"),
    )

    job = await export_repo.get("job-stale-frame")
    run = await run_repo.get("run-stale-frame")
    assert job is not None and job.status == "completed"
    assert run is not None and run.quality_report is not None
    codes = {issue.code for issue in run.quality_report.issues}
    assert "timeline.voiceover_too_short" not in codes
    assert "knowledge.source_unverified" in codes
    assert run.quality_report.status == "warnings"
    assert any(
        action.startswith("export:readiness:") for action in run.quality_report.actions
    )


def _strict_stack_lesson_plan() -> LessonPlan:
    return LessonPlan(
        schema_version="1.0.0",
        domain="algorithm",
        title="递归调用栈",
        learning_objectives=["追踪 factorial(4) 的压栈与回溯。"],
        prerequisites=[],
        misconceptions=[],
        expected_conclusion="factorial(4)=24",
        lesson_arc="state_transition",
        scenes=[
            SceneIntent(
                scene_id="stack_trace",
                teaching_goal="展示调用栈状态和返回值传播。",
                strategy="state_transition",
                required_fact_ids=[],
                required_visual_roles=["stack_frame", "active_frame", "return_value"],
                preferred_scene_type="recursion_stack",
                narration_goal="同步说明压栈和回溯。",
            )
        ],
    )


@pytest.mark.asyncio
async def test_export_input_props_uses_version_director_when_requested(tmp_path) -> None:
    db = str(tmp_path / "export-version.db")
    init_db(db)
    run_repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    export_repo = InMemoryExportJobRepository()
    await _seed_run(run_repo, "run-3")
    await director_repo.upsert(_director("run-3"), "2026-06-05T00:00:00+00:00")
    version_director = _director("run-3", camera_motion="pan_right")
    await run_repo.append_version(
        "run-3",
        version_id="version-1",
        playbook_json=json.dumps(
            {**_playbook(), "title": "Version export fixture"},
            ensure_ascii=False,
        ),
        source="followup",
        followup_id=None,
        parent_version_id=None,
        summary="director patch",
        created_at="2026-06-05T00:01:00+00:00",
        director_json=version_director.model_dump_json(),
    )
    await export_repo.create(_job("job-3", "run-3"))
    use_case = RecordingExportVideoUseCase(
        export_repo,
        run_repo,
        director_repo,
        web_app_dir=tmp_path,
        artifacts_dir=tmp_path / "artifacts",
    )

    await use_case.execute(
        "job-3",
        "run-3",
        with_audio=False,
        tts=None,
        version_id="version-1",
    )

    assert use_case.input_props is not None
    assert use_case.input_props["script"]["title"] == "Version export fixture"
    assert use_case.input_props["director"]["beats"][0]["camera_motion"] == "pan_right"


@pytest.mark.asyncio
async def test_export_rebuilds_missing_version_director_instead_of_using_current(
    tmp_path,
) -> None:
    db = str(tmp_path / "export-legacy-version.db")
    init_db(db)
    run_repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    export_repo = InMemoryExportJobRepository()
    await _seed_run(run_repo, "run-legacy")
    await director_repo.upsert(
        _director("run-legacy", camera_motion="pan_right"),
        "2026-06-05T00:00:00+00:00",
    )
    await run_repo.append_version(
        "run-legacy",
        version_id="legacy-version",
        playbook_json=json.dumps(
            {**_playbook(), "title": "Legacy version fixture"},
            ensure_ascii=False,
        ),
        source="followup",
        followup_id=None,
        parent_version_id=None,
        summary="legacy version without director",
        created_at="2026-06-05T00:01:00+00:00",
        director_json=None,
    )
    await export_repo.create(_job("job-legacy", "run-legacy"))
    use_case = RecordingExportVideoUseCase(
        export_repo,
        run_repo,
        director_repo,
        web_app_dir=tmp_path,
        artifacts_dir=tmp_path / "artifacts",
    )

    await use_case.execute(
        "job-legacy",
        "run-legacy",
        with_audio=False,
        tts=None,
        version_id="legacy-version",
    )

    assert use_case.input_props is not None
    assert use_case.input_props["director"]["beats"][0]["camera_motion"] == "push_in"


@pytest.mark.asyncio
async def test_export_with_audio_remaps_director_beats_to_stretched_boundaries(
    tmp_path,
    monkeypatch,
) -> None:
    db = str(tmp_path / "export-stretch.db")
    init_db(db)
    run_repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    export_repo = InMemoryExportJobRepository()
    await _seed_run(
        run_repo,
        "run-stretch",
        playbook_json=json.dumps(_stretch_playbook(), ensure_ascii=False),
    )
    await director_repo.upsert(
        _stretch_director("run-stretch"),
        "2026-06-05T00:00:00+00:00",
    )
    await export_repo.create(_job("job-stretch", "run-stretch"))
    # Every generated mp3 lasts 2s (60 frames at 30fps), so each step is
    # stretched from 30 to 60 frames: 30/60/90 -> 60/120/180.
    monkeypatch.setattr(
        "app.application.use_cases.export_video._probe_audio_duration_seconds",
        lambda path: 2.0,
    )
    use_case = StubAudioExportVideoUseCase(
        export_repo,
        run_repo,
        director_repo,
        web_app_dir=tmp_path,
        artifacts_dir=tmp_path / "artifacts",
    )

    await use_case.execute(
        "job-stretch",
        "run-stretch",
        with_audio=True,
        tts=TtsConfig(api_key="test"),
    )

    assert use_case.input_props is not None
    steps = use_case.input_props["script"]["steps"]
    beats = use_case.input_props["director"]["beats"]
    assert [step["end_frame"] for step in steps] == [60, 120, 180]
    # Beat frames match the stretched step boundaries exactly.
    assert [beat["start_frame"] for beat in beats] == [0, 60, 120]
    assert [beat["end_frame"] for beat in beats] == [60, 120, 180]
    assert [beat["step_id"] for beat in beats] == ["s1", "s2", "s3"]
    # Hand-edited semantics survive the frame remap.
    assert beats[1]["camera_motion"] == "hold"
    assert beats[2]["intent"] == "summary"
    assert beats[0]["emphasis_terms"] == ["数组"]


@pytest.mark.asyncio
async def test_export_recheck_uses_stretched_timeline_when_audio_exceeds_estimate(
    tmp_path,
    monkeypatch,
) -> None:
    """Frame-based recheck conclusions follow the stretched timeline (#240).

    The 60-frame step is shorter than the ~168-frame char-rate estimate, so a
    pre-stretch recheck would warn timeline.voiceover_too_short. The 6s audio
    stretches the step to 180 frames, which satisfies the estimate, so the
    final report must not carry the stale warning.
    """

    db = str(tmp_path / "export-recheck-stretched.db")
    init_db(db)
    run_repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    export_repo = InMemoryExportJobRepository()
    await _seed_run(run_repo, "run-recheck-stretched")
    await export_repo.create(_job("job-recheck-stretched", "run-recheck-stretched"))
    # 6s of audio = 180 frames at 30fps, well past the 168-frame estimate.
    monkeypatch.setattr(
        "app.application.use_cases.export_video._probe_audio_duration_seconds",
        lambda path: 6.0,
    )
    use_case = StubAudioExportVideoUseCase(
        export_repo,
        run_repo,
        director_repo,
        web_app_dir=tmp_path,
        artifacts_dir=tmp_path / "artifacts",
    )

    await use_case.execute(
        "job-recheck-stretched",
        "run-recheck-stretched",
        with_audio=True,
        tts=TtsConfig(api_key="test"),
    )

    job = await export_repo.get("job-recheck-stretched")
    run = await run_repo.get("run-recheck-stretched")
    assert job is not None and job.status == "completed"
    assert use_case.input_props is not None
    assert use_case.input_props["script"]["steps"][0]["end_frame"] == 180
    assert use_case.input_props["script"]["total_frames"] == 180
    assert run is not None and run.quality_report is not None
    codes = {issue.code for issue in run.quality_report.issues}
    assert "timeline.voiceover_too_short" not in codes
    assert "export.not_ready" not in codes


@pytest.mark.asyncio
async def test_export_recheck_keeps_warning_when_audio_shorter_than_animation(
    tmp_path,
    monkeypatch,
) -> None:
    """Short audio does not stretch the step, so the frame-based warning from
    the original timeline survives the post-stretch recheck (#240)."""

    db = str(tmp_path / "export-recheck-short-audio.db")
    init_db(db)
    run_repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    export_repo = InMemoryExportJobRepository()
    await _seed_run(run_repo, "run-recheck-short-audio")
    await export_repo.create(_job("job-recheck-short-audio", "run-recheck-short-audio"))
    # 0.5s of audio = 15 frames, below the 60-frame animation duration.
    monkeypatch.setattr(
        "app.application.use_cases.export_video._probe_audio_duration_seconds",
        lambda path: 0.5,
    )
    use_case = StubAudioExportVideoUseCase(
        export_repo,
        run_repo,
        director_repo,
        web_app_dir=tmp_path,
        artifacts_dir=tmp_path / "artifacts",
    )

    await use_case.execute(
        "job-recheck-short-audio",
        "run-recheck-short-audio",
        with_audio=True,
        tts=TtsConfig(api_key="test"),
    )

    job = await export_repo.get("job-recheck-short-audio")
    run = await run_repo.get("run-recheck-short-audio")
    assert job is not None and job.status == "completed"
    assert use_case.input_props is not None
    assert use_case.input_props["script"]["steps"][0]["end_frame"] == 60
    assert run is not None and run.quality_report is not None
    assert "timeline.voiceover_too_short" in {
        issue.code for issue in run.quality_report.issues
    }


async def _seed_run(
    repo: SqliteRunRepository,
    run_id: str,
    *,
    playbook_json: str | None = None,
) -> None:
    await repo.create(run_id, "prompt", "2026-06-05T00:00:00+00:00")
    await repo.update(
        run_id,
        status=PipelineRunStatus.SUCCEEDED,
        playbook_json=playbook_json or json.dumps(_playbook(), ensure_ascii=False),
    )


def _director(run_id: str, *, camera_motion: str = "push_in") -> DirectorScript:
    return DirectorScript(
        run_id=run_id,
        beats=[
            DirectorBeat(
                beat_id="beat_01",
                step_id="s1",
                start_frame=0,
                end_frame=60,
                intent="hook",
                shot_type="medium",
                camera_motion=camera_motion,
                pacing="normal",
                voiceover_text="Director narration.",
            )
        ],
    )


def _stretch_director(run_id: str) -> DirectorScript:
    """Hand-edited director: one beat per step, frames from the pre-stretch timeline."""

    return DirectorScript(
        run_id=run_id,
        source="manual",
        beats=[
            DirectorBeat(
                beat_id="beat_01",
                step_id="s1",
                start_frame=0,
                end_frame=30,
                intent="hook",
                shot_type="medium",
                camera_motion="push_in",
                pacing="normal",
                emphasis_terms=["数组"],
            ),
            DirectorBeat(
                beat_id="beat_02",
                step_id="s2",
                start_frame=30,
                end_frame=60,
                intent="focus",
                shot_type="close",
                camera_motion="hold",
                pacing="normal",
                emphasis_terms=["交换"],
            ),
            DirectorBeat(
                beat_id="beat_03",
                step_id="s3",
                start_frame=60,
                end_frame=90,
                intent="summary",
                shot_type="wide",
                camera_motion="pull_out",
                pacing="slow",
                emphasis_terms=["结论"],
            ),
        ],
    )


def _job(job_id: str, run_id: str) -> ExportJob:
    return ExportJob(
        job_id=job_id,
        run_id=run_id,
        created_at=datetime.now(timezone.utc).isoformat(),
    )


def _asset_report() -> ExportAssetReport:
    return ExportAssetReport.model_validate(
        {
            "generated_by": "visual_quality_gate",
            "entries": [
                {
                    "asset_id": "cc-by-diagram",
                    "pack_id": "physics-basic",
                    "license": "cc-by-4.0",
                    "commercial_use_status": "allowed-with-attribution",
                    "attribution": "Example Creator",
                    "source_url": "https://example.test/asset",
                    "license_url": "https://creativecommons.org/licenses/by/4.0/",
                    "requires_attribution": True,
                    "commercial_use_restricted": False,
                    "share_alike": False,
                    "unknown_license": False,
                    "warning_codes": ["asset_requires_attribution"],
                    "step_ids": ["s1"],
                }
            ],
            "attribution_required": ["physics-basic/cc-by-diagram"],
            "license_risk": [],
        }
    )


def _playbook() -> dict:
    snapshot = {
        "kind": "algorithm_array",
        "array_values": ["1", "2"],
        "active_indices": [],
        "swap_indices": [],
        "sorted_indices": [],
        "pointers": {},
    }
    return {
        "schema_version": "1.0.0",
        "fps": 30,
        "total_frames": 60,
        "domain": "algorithm",
        "title": "Export fixture",
        "summary": "Fixture summary.",
        "steps": [
            {
                "step_id": "s1",
                "end_frame": 60,
                "title": "Step 1",
                "voiceover_text": "Playbook narration.",
                "snapshot": snapshot,
                "layers": [{"timing": {"enter_at": 0, "exit_at": 1}, "body": snapshot}],
                "tokens": [],
            }
        ],
        "parameter_controls": [],
        "initial_data": {},
    }


def _stretch_playbook() -> dict:
    """Three 30-frame steps that audio stretching will push to 60 frames each."""

    snapshot = {
        "kind": "algorithm_array",
        "array_values": ["1", "2"],
        "active_indices": [],
        "swap_indices": [],
        "sorted_indices": [],
        "pointers": {},
    }
    steps = []
    for index, step_id in enumerate(["s1", "s2", "s3"]):
        steps.append(
            {
                "step_id": step_id,
                "end_frame": (index + 1) * 30,
                "title": f"Step {index + 1}",
                "voiceover_text": f"Narration {index + 1}.",
                "snapshot": snapshot,
                "layers": [{"timing": {"enter_at": 0, "exit_at": 1}, "body": snapshot}],
                "tokens": [],
            }
        )
    return {
        "schema_version": "1.0.0",
        "fps": 30,
        "total_frames": 90,
        "domain": "algorithm",
        "title": "Stretch fixture",
        "summary": "Fixture summary.",
        "steps": steps,
        "parameter_controls": [],
        "initial_data": {},
    }


@pytest.mark.asyncio
async def test_tempo_scales_silent_timeline_and_remaps_director(tmp_path) -> None:
    db = str(tmp_path / "export.db")
    init_db(db)
    run_repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    export_repo = InMemoryExportJobRepository()
    await _seed_run(
        run_repo,
        "run-tempo",
        playbook_json=json.dumps(_stretch_playbook(), ensure_ascii=False),
    )
    await director_repo.upsert(_stretch_director("run-tempo"), "2026-06-05T00:00:00+00:00")
    await export_repo.create(_job("job-tempo", "run-tempo"))
    use_case = RecordingExportVideoUseCase(
        export_repo,
        run_repo,
        director_repo,
        web_app_dir=tmp_path,
        artifacts_dir=tmp_path / "artifacts",
    )

    await use_case.execute(
        "job-tempo",
        "run-tempo",
        with_audio=False,
        tts=None,
        options=ExportOptions(tempo=2.0),
    )

    assert use_case.input_props is not None
    steps = use_case.input_props["script"]["steps"]
    beats = use_case.input_props["director"]["beats"]
    # 30/60/90 at double speed: 15/30/45, and total_frames follows.
    assert [step["end_frame"] for step in steps] == [15, 30, 45]
    assert use_case.input_props["script"]["total_frames"] == 45
    # Director beats snap to the scaled step boundaries, like audio stretch.
    assert [beat["start_frame"] for beat in beats] == [0, 15, 30]
    assert [beat["end_frame"] for beat in beats] == [15, 30, 45]


@pytest.mark.asyncio
async def test_tempo_with_audio_fails_the_job(tmp_path) -> None:
    db = str(tmp_path / "export.db")
    init_db(db)
    run_repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    export_repo = InMemoryExportJobRepository()
    await _seed_run(
        run_repo,
        "run-tempo-audio",
        playbook_json=json.dumps(_stretch_playbook(), ensure_ascii=False),
    )
    await director_repo.upsert(
        _stretch_director("run-tempo-audio"), "2026-06-05T00:00:00+00:00"
    )
    await export_repo.create(_job("job-tempo-audio", "run-tempo-audio"))
    use_case = StubAudioExportVideoUseCase(
        export_repo,
        run_repo,
        director_repo,
        web_app_dir=tmp_path,
        artifacts_dir=tmp_path / "artifacts",
    )

    await use_case.execute(
        "job-tempo-audio",
        "run-tempo-audio",
        with_audio=True,
        tts=TtsConfig(api_key="test"),
        options=ExportOptions(tempo=2.0),
    )

    # The narration defines its own pacing; the job fails instead of
    # rendering a video whose audio and timeline disagree.
    assert use_case.input_props is None
    job = await export_repo.get("job-tempo-audio")
    assert job is not None
    assert job.status.value == "failed"
    assert "tempo" in (job.error or "")


@pytest.mark.asyncio
async def test_template_case_exports_without_a_run(tmp_path) -> None:
    db = str(tmp_path / "export.db")
    init_db(db)
    run_repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    export_repo = InMemoryExportJobRepository()
    templates = tmp_path / "template-previews"
    templates.mkdir()
    (templates / "integral-area.playbook.json").write_text(
        json.dumps(_stretch_playbook(), ensure_ascii=False), encoding="utf-8"
    )
    await export_repo.create(_job("job-tpl", "integral-area"))
    use_case = RecordingExportVideoUseCase(
        export_repo,
        run_repo,
        director_repo,
        web_app_dir=tmp_path,
        artifacts_dir=tmp_path / "artifacts",
        template_playbooks_dir=templates,
    )

    await use_case.execute(
        "job-tpl",
        "",
        with_audio=False,
        tts=None,
        template_case_id="integral-area",
    )

    assert use_case.input_props is not None
    # The frozen script renders as-is; curated cases carry no DirectorScript
    # (omitted entirely, as for a run without one) and skip the run-level
    # quality gate.
    assert "director" not in use_case.input_props
    assert [s["end_frame"] for s in use_case.input_props["script"]["steps"]] == [30, 60, 90]
    job = await export_repo.get("job-tpl")
    assert job is not None
    assert job.status.value == "completed"


@pytest.mark.asyncio
async def test_template_export_refuses_unknown_and_traversing_ids(tmp_path) -> None:
    db = str(tmp_path / "export.db")
    init_db(db)
    export_repo = InMemoryExportJobRepository()
    templates = tmp_path / "template-previews"
    templates.mkdir()
    # A playbook that exists but outside the curated directory must stay
    # unreachable however the id is spelled.
    (tmp_path / "secret.playbook.json").write_text(
        json.dumps(_stretch_playbook(), ensure_ascii=False), encoding="utf-8"
    )
    use_case = RecordingExportVideoUseCase(
        export_repo,
        SqliteRunRepository(db),
        SqliteRunDirectorRepository(db),
        web_app_dir=tmp_path,
        artifacts_dir=tmp_path / "artifacts",
        template_playbooks_dir=templates,
    )

    for case_id in ["missing-case", "../secret", "..%2Fsecret"]:
        await export_repo.create(_job(f"job-{case_id}", case_id))
        await use_case.execute(
            f"job-{case_id}",
            "",
            with_audio=False,
            tts=None,
            template_case_id=case_id,
        )
        job = await export_repo.get(f"job-{case_id}")
        assert job is not None
        assert job.status.value == "failed", case_id

    assert use_case.input_props is None


def _captured_remotion_argv(monkeypatch, tmp_path) -> list[str]:
    """Run the real _run_remotion_render far enough to see the argv it builds."""
    captured: dict[str, list[str]] = {}

    async def fake_exec(*cmd: str, **_kwargs: Any):
        captured["cmd"] = list(cmd)
        raise RuntimeError("stop after capturing argv")

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_exec)
    # The CLI is resolved from the web workspace before argv is built, so give
    # the stub web dir a binary to find.
    remotion_bin = tmp_path / "node_modules" / ".bin" / "remotion"
    remotion_bin.parent.mkdir(parents=True, exist_ok=True)
    remotion_bin.touch()
    use_case = ExportVideoUseCase(
        InMemoryExportJobRepository(),
        None,
        None,
        web_app_dir=tmp_path,
        artifacts_dir=tmp_path / "artifacts",
    )
    with contextlib.suppress(Exception):
        asyncio.run(
            use_case._run_remotion_render(
                "job", tmp_path / "props.json", tmp_path / "out.mp4", ExportOptions()
            )
        )
    return captured["cmd"]


def test_remotion_cli_gets_the_preinstalled_browser_when_one_is_configured(
    monkeypatch, tmp_path
) -> None:
    """REMOTION_BROWSER_EXECUTABLE must reach the CLI as a flag.

    It is a Node-API option, so the CLI ignores the env var and insists on
    downloading its own Chromium from remotion.media — which fails outright
    wherever that host is slow, blocked or firewalled, leaving such a
    deployment unable to export at all.
    """
    monkeypatch.setenv("REMOTION_BROWSER_EXECUTABLE", "/opt/chromium/headless_shell")
    cmd = _captured_remotion_argv(monkeypatch, tmp_path)
    assert "--browser-executable" in cmd
    assert cmd[cmd.index("--browser-executable") + 1] == "/opt/chromium/headless_shell"


@pytest.mark.parametrize("value", ["", "   "])
def test_remotion_cli_omits_the_flag_when_no_browser_is_configured(
    monkeypatch, tmp_path, value: str
) -> None:
    monkeypatch.setenv("REMOTION_BROWSER_EXECUTABLE", value)
    assert "--browser-executable" not in _captured_remotion_argv(monkeypatch, tmp_path)
