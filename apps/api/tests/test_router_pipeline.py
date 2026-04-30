from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.infrastructure.persistence.db_init import init_db
from app.infrastructure.persistence.sqlite_run_repository import SqliteRunRepository
from app.main import create_app
from app.presentation.dependencies import get_llm_provider, get_run_repo

_VALID_CIR = json.dumps({
    "version": "0.1.0",
    "title": "Test",
    "domain": "algorithm",
    "summary": "Test summary.",
    "steps": [
        {
            "id": "step_01",
            "title": "Step 1",
            "narration": "Test narration.",
            "visual_kind": "array",
            "tokens": [{"id": "t0", "label": "A", "value": None, "emphasis": "primary"}],
            "annotations": [],
        }
    ],
})


class _MockLLM:
    async def complete(self, system: str, user: str) -> str:
        return _VALID_CIR


@pytest.fixture
def client(tmp_path):
    db = str(tmp_path / "test.db")
    init_db(db)
    repo = SqliteRunRepository(db)

    app = create_app()
    app.dependency_overrides[get_run_repo] = lambda: repo
    app.dependency_overrides[get_llm_provider] = lambda: _MockLLM()

    with TestClient(app) as c:
        yield c


def test_post_pipeline_returns_202_with_run_id(client) -> None:
    resp = client.post("/api/v1/pipeline", json={"prompt": "可视化二分查找"})
    assert resp.status_code == 202
    data = resp.json()
    assert "run_id" in data
    assert data["status"] == "queued"


def test_get_run_returns_404_for_unknown_id(client) -> None:
    resp = client.get("/api/v1/runs/nonexistent-id")
    assert resp.status_code == 404


def test_get_run_returns_run_after_creation(client) -> None:
    post_resp = client.post("/api/v1/pipeline", json={"prompt": "可视化冒泡排序"})
    run_id = post_resp.json()["run_id"]

    get_resp = client.get(f"/api/v1/runs/{run_id}")
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data["run_id"] == run_id


def test_list_runs_returns_array(client) -> None:
    client.post("/api/v1/pipeline", json={"prompt": "test 1"})
    client.post("/api/v1/pipeline", json={"prompt": "test 2"})

    resp = client.get("/api/v1/runs")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    assert len(resp.json()) >= 2


def test_post_pipeline_rejects_empty_prompt(client) -> None:
    resp = client.post("/api/v1/pipeline", json={"prompt": ""})
    assert resp.status_code == 422
