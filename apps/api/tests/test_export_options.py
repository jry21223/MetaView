"""Tests for issue #14 — quality / fps / format options on export."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.application.dto.export_dto import ExportRequest
from app.config import get_settings
from app.domain.models.export_job import ExportOptions
from app.main import create_app


def test_default_options_match_historical_behaviour() -> None:
    opts = ExportOptions()
    assert opts.quality == "1080p"
    assert opts.fps == 30
    assert opts.format == "mp4"
    assert opts.theme == "light"


def test_export_request_accepts_explicit_options() -> None:
    req = ExportRequest.model_validate(
        {
            "run_id": "r1",
            "version_id": "v1",
            "with_audio": False,
            "options": {
                "quality": "2k",
                "fps": 60,
                "format": "webm",
                "theme": "dark",
            },
        }
    )
    assert req.version_id == "v1"
    assert req.options is not None
    assert req.options.quality == "2k"
    assert req.options.fps == 60
    assert req.options.format == "webm"
    assert req.options.theme == "dark"


def test_export_request_omitting_options_keeps_field_none() -> None:
    req = ExportRequest.model_validate({"run_id": "r1", "with_audio": False})
    assert req.options is None


@pytest.mark.parametrize("bad_fps", [10, 120, -1])
def test_fps_out_of_range_rejected(bad_fps: int) -> None:
    with pytest.raises(Exception):  # noqa: B017
        ExportOptions(fps=bad_fps)


@pytest.mark.parametrize("bad_quality", ["480p", "4k", ""])
def test_unsupported_quality_rejected(bad_quality: str) -> None:
    with pytest.raises(Exception):  # noqa: B017
        ExportOptions.model_validate({"quality": bad_quality})


@pytest.mark.parametrize("bad_format", ["mov", "avi", ""])
def test_unsupported_format_rejected(bad_format: str) -> None:
    with pytest.raises(Exception):  # noqa: B017
        ExportOptions.model_validate({"format": bad_format})


def test_ops_export_accepts_client_tts_provider_config(monkeypatch) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_APP_EDITION", "ops")
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    app = create_app()

    with TestClient(app) as client:
        resp = client.post(
            "/api/v1/exports",
            json={
                "run_id": "missing-run",
                "with_audio": True,
                "tts": {"voice": "alloy", "api_key": "sk-client"},
            },
        )

    get_settings.cache_clear()
    # The request passes the edition/provider validation and reaches the run
    # lookup; the missing run is unrelated to the client TTS configuration.
    assert resp.status_code == 404
    assert "missing-run" in resp.json()["detail"]


def test_default_tempo_is_realtime() -> None:
    assert ExportOptions().tempo == 1.0


@pytest.mark.parametrize("bad_tempo", [0.0, 0.1, 4.5, -2.0])
def test_tempo_out_of_range_rejected(bad_tempo: float) -> None:
    with pytest.raises(Exception):  # noqa: B017
        ExportOptions(tempo=bad_tempo)


def test_apply_tempo_halves_the_timeline_monotonically() -> None:
    from app.application.use_cases.export_video import _apply_tempo

    playbook = {
        "total_frames": 900,
        "steps": [
            {"step_id": "a", "end_frame": 300},
            {"step_id": "b", "end_frame": 301},
            {"step_id": "c", "end_frame": 900},
        ],
    }
    scaled = _apply_tempo(playbook, 2.0)

    assert [s["end_frame"] for s in scaled["steps"]] == [150, 151, 450]
    assert scaled["total_frames"] == 450
    # The input dict is not mutated.
    assert playbook["steps"][0]["end_frame"] == 300


def test_apply_tempo_one_is_identity() -> None:
    from app.application.use_cases.export_video import _apply_tempo

    playbook = {
        "total_frames": 120,
        "steps": [{"step_id": "a", "end_frame": 50}, {"step_id": "b", "end_frame": 120}],
    }
    scaled = _apply_tempo(playbook, 1.0)
    assert [s["end_frame"] for s in scaled["steps"]] == [50, 120]
    assert scaled["total_frames"] == 120


def test_export_request_accepts_a_template_case() -> None:
    req = ExportRequest.model_validate(
        {"template_case_id": "integral-area", "with_audio": False}
    )
    assert req.template_case_id == "integral-area"
    assert req.run_id is None


def _client_and_templates(tmp_path):
    from app.presentation import router_exports

    app = create_app()
    settings = get_settings()
    original = settings.export_template_playbooks_dir
    templates = tmp_path / "template-previews"
    templates.mkdir()
    settings.export_template_playbooks_dir = str(templates)
    return TestClient(app), templates, settings, original, router_exports


def test_submit_export_rejects_ambiguous_and_unknown_sources(tmp_path) -> None:
    client, templates, settings, original, _ = _client_and_templates(tmp_path)
    prefix = settings.api_prefix
    try:
        # Neither source, and both sources, are equally invalid.
        for payload in (
            {"with_audio": False},
            {"run_id": "r1", "template_case_id": "integral-area", "with_audio": False},
        ):
            resp = client.post(f"{prefix}/exports", json=payload)
            assert resp.status_code == 400, resp.text
            assert "exactly one" in resp.json()["detail"]

        # A case this deployment does not ship is a 404, not a queued job.
        resp = client.post(
            f"{prefix}/exports",
            json={"template_case_id": "not-a-case", "with_audio": False},
        )
        assert resp.status_code == 404

        # Path traversal never resolves outside the curated directory.
        resp = client.post(
            f"{prefix}/exports",
            json={"template_case_id": "../secret", "with_audio": False},
        )
        assert resp.status_code == 400

        # version_id is a run-only concept.
        (templates / "integral-area.playbook.json").write_text("{}", encoding="utf-8")
        resp = client.post(
            f"{prefix}/exports",
            json={
                "template_case_id": "integral-area",
                "version_id": "v1",
                "with_audio": False,
            },
        )
        assert resp.status_code == 400
    finally:
        settings.export_template_playbooks_dir = original
