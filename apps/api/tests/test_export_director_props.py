from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

from app.application.use_cases.export_video import ExportVideoUseCase
from app.domain.models.coverage import CoverageDecision
from app.domain.models.director import DirectorBeat, DirectorScript
from app.domain.models.export_job import ExportAssetReport, ExportJob, ExportOptions
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
async def test_export_input_props_omits_director_when_missing(tmp_path) -> None:
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

    assert use_case.input_props is not None
    assert "director" not in use_case.input_props


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


async def _seed_run(repo: SqliteRunRepository, run_id: str) -> None:
    await repo.create(run_id, "prompt", "2026-06-05T00:00:00+00:00")
    await repo.update(
        run_id,
        status=PipelineRunStatus.SUCCEEDED,
        playbook_json=json.dumps(_playbook(), ensure_ascii=False),
    )


def _director(run_id: str) -> DirectorScript:
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
                camera_motion="push_in",
                pacing="normal",
                voiceover_text="Director narration.",
            )
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
