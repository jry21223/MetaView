from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest

from app.application.use_cases.export_video import ExportVideoUseCase
from app.domain.models.director import DirectorBeat, DirectorScript
from app.domain.models.export_job import ExportJob, ExportOptions
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


async def _seed_run(repo: SqliteRunRepository, run_id: str) -> None:
    await repo.create(run_id, "prompt", "2026-06-05T00:00:00+00:00")
    await repo.update(
        run_id,
        status=PipelineRunStatus.SUCCEEDED,
        playbook_json=json.dumps(_playbook(), ensure_ascii=False),
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


def _job(job_id: str, run_id: str) -> ExportJob:
    return ExportJob(
        job_id=job_id,
        run_id=run_id,
        created_at=datetime.now(timezone.utc).isoformat(),
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
