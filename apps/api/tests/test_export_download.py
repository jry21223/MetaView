from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.domain.models.export_job import ExportJob, ExportJobStatus
from app.infrastructure.persistence.in_memory_export_repository import (
    InMemoryExportJobRepository,
)
from app.main import create_app
from app.presentation.dependencies import get_export_repo


@pytest.fixture
def client_and_repo() -> tuple[TestClient, InMemoryExportJobRepository]:
    repo = InMemoryExportJobRepository()
    app = create_app()
    app.state.limiter.enabled = False
    app.dependency_overrides[get_export_repo] = lambda: repo
    return TestClient(app), repo


@pytest.mark.parametrize(
    ("suffix", "media_type"),
    [
        (".mp4", "video/mp4"),
        (".webm", "video/webm"),
        (".gif", "image/gif"),
    ],
)
async def test_download_export_uses_output_file_format(
    client_and_repo: tuple[TestClient, InMemoryExportJobRepository],
    tmp_path: Path,
    suffix: str,
    media_type: str,
) -> None:
    client, repo = client_and_repo
    output = tmp_path / f"video{suffix}"
    output.write_bytes(b"fake video")
    await repo.create(
        ExportJob(
            job_id=f"job{suffix}",
            run_id="run-abcdef1234",
            status=ExportJobStatus.COMPLETED,
            progress=1,
            output_path=str(output),
            created_at=datetime.now(timezone.utc).isoformat(),
        )
    )

    resp = client.get(f"/api/v1/exports/job{suffix}/download")

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith(media_type)
    assert f'filename="metaview-run-abcd{suffix}"' in resp.headers["content-disposition"]
    assert resp.content == b"fake video"
