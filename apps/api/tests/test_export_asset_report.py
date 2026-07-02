from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.application.dto.pipeline_dto import PipelineRunResponse
from app.domain.models.export_job import ExportAssetReport, ExportJob, ExportJobStatus
from app.domain.models.pipeline_run import PipelineRunStatus
from app.infrastructure.persistence.in_memory_export_repository import (
    InMemoryExportJobRepository,
)
from app.main import create_app
from app.presentation import router_exports
from app.presentation.dependencies import get_export_repo, get_run_director_repo, get_run_repo


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


def test_submit_export_without_asset_report_returns_warning_metadata(monkeypatch) -> None:
    repo = InMemoryExportJobRepository()
    app = create_app()
    app.state.limiter.enabled = False
    app.dependency_overrides[get_export_repo] = lambda: repo
    app.dependency_overrides[get_run_repo] = lambda: _FakeRunRepo()
    app.dependency_overrides[get_run_director_repo] = lambda: _FakeDirectorRepo()

    class NoopExportVideoUseCase:
        def __init__(self, *args, **kwargs) -> None:  # noqa: ANN002, ANN003
            pass

        async def execute(self, *args, **kwargs) -> None:  # noqa: ANN002, ANN003
            return None

    monkeypatch.setattr(router_exports, "ExportVideoUseCase", NoopExportVideoUseCase)

    with TestClient(app) as client:
        resp = client.post(
            "/api/v1/exports",
            json={"run_id": "run-with-playbook", "with_audio": False},
        )

    assert resp.status_code == 202
    body = resp.json()
    assert body["asset_report_url"] is None
    assert body["asset_report_warning"] == (
        "asset_report metadata was not provided; export will not include an asset attribution sidecar"
    )


def test_asset_report_serializes_commercial_export_policy() -> None:
    report = ExportAssetReport.model_validate(
        {
            "generated_by": "visual_quality_gate",
            "entries": [],
            "attribution_required": ["physics-basic/cc-by-diagram"],
            "license_risk": ["geography-basic/unknown-map", "physics-basic/cc-by-sa-diagram"],
            "commercial_export": {
                "allowed": False,
                "blockers": ["geography-basic/unknown-map"],
                "review_required": ["physics-basic/cc-by-sa-diagram"],
                "attribution_required": ["physics-basic/cc-by-diagram"],
            },
        }
    )

    assert report.model_dump(mode="json")["commercial_export"] == {
        "allowed": False,
        "blockers": ["geography-basic/unknown-map"],
        "review_required": ["physics-basic/cc-by-sa-diagram"],
        "attribution_required": ["physics-basic/cc-by-diagram"],
    }


class _FakeRunRepo:
    async def get(self, run_id: str, user_id: str | None = None) -> PipelineRunResponse | None:
        if run_id != "run-with-playbook":
            return None
        return PipelineRunResponse.model_validate(
            {
                "run_id": run_id,
                "status": PipelineRunStatus.SUCCEEDED,
                "prompt": "fixture",
                "created_at": "2026-07-02T00:00:00+00:00",
                "playbook": {
                    "schema_version": "1.0.0",
                    "fps": 30,
                    "total_frames": 60,
                    "domain": "math",
                    "title": "Fixture",
                    "summary": "Fixture",
                    "steps": [
                        {
                            "step_id": "s1",
                            "end_frame": 60,
                            "title": "Formula",
                            "voiceover_text": "",
                            "snapshot": {
                                "kind": "math_formula",
                                "formula_latex": "x^2",
                            },
                            "tokens": [],
                        }
                    ],
                    "parameter_controls": [],
                },
            }
        )


class _FakeDirectorRepo:
    async def get(self, run_id: str):  # noqa: ANN201
        return None


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
