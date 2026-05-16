"""Tests for issue #14 — quality / fps / format options on export."""

from __future__ import annotations

import pytest

from app.application.dto.export_dto import ExportRequest
from app.domain.models.export_job import ExportOptions


def test_default_options_match_historical_behaviour() -> None:
    opts = ExportOptions()
    assert opts.quality == "1080p"
    assert opts.fps == 30
    assert opts.format == "mp4"


def test_export_request_accepts_explicit_options() -> None:
    req = ExportRequest.model_validate(
        {
            "run_id": "r1",
            "with_audio": False,
            "options": {"quality": "2k", "fps": 60, "format": "webm"},
        }
    )
    assert req.options is not None
    assert req.options.quality == "2k"
    assert req.options.fps == 60
    assert req.options.format == "webm"


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
