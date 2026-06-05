from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).parents[3]


def test_api_dockerfile_does_not_copy_local_data_directory() -> None:
    dockerfile = (REPO_ROOT / "apps/api/Dockerfile").read_text()

    assert "COPY data ./data" not in dockerfile
    assert "RUN mkdir -p ./data" in dockerfile


def test_dockerignore_excludes_generated_local_state() -> None:
    entries = {
        line.strip()
        for line in (REPO_ROOT / ".dockerignore").read_text().splitlines()
        if line.strip() and not line.startswith("#")
    }

    assert "data" in entries
    assert "eval/reports" in entries
    assert "eval/videos" in entries
    assert "eval/shots" in entries
