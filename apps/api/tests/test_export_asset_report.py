from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.domain.models.export_job import ExportAssetReport, ExportJob, ExportJobStatus
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


async def test_completed_export_exposes_downloadable_asset_report(
    client_and_repo: tuple[TestClient, InMemoryExportJobRepository],
    tmp_path: Path,
) -> None:
    client, repo = client_and_repo
    output = tmp_path / "video.mp4"
    output.write_bytes(b"fake video")
    report_path = tmp_path / "asset-report.json"
    payload = {
        "job_id": "job-report",
        "run_id": "run-report",
        "asset_report": _asset_report().model_dump(mode="json"),
    }
    report_path.write_text(json.dumps(payload), encoding="utf-8")
    await repo.create(
        ExportJob(
            job_id="job-report",
            run_id="run-report",
            status=ExportJobStatus.COMPLETED,
            progress=1,
            output_path=str(output),
            asset_report=_asset_report(),
            asset_report_path=str(report_path),
            created_at=datetime.now(timezone.utc).isoformat(),
        )
    )

    status_resp = client.get("/api/v1/exports/job-report")

    assert status_resp.status_code == 200
    assert status_resp.json()["asset_report_url"] == "/api/v1/exports/job-report/asset-report"

    report_resp = client.get("/api/v1/exports/job-report/asset-report")

    assert report_resp.status_code == 200
    assert report_resp.headers["content-type"].startswith("application/json")
    assert report_resp.json() == payload
    assert 'filename="metaview-run-repo-asset-report.json"' in report_resp.headers["content-disposition"]


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
