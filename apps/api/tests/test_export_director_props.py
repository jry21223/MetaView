from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

from app.application.use_cases.export_video import ExportVideoUseCase
from app.domain.models.director import DirectorBeat, DirectorScript
from app.domain.models.export_job import ExportAssetReport, ExportJob, ExportOptions
from app.domain.models.pipeline_run import PipelineRunStatus
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
    job = await export_repo.get("job-1")
    assert job is not None
    assert job.output_path is not None


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
