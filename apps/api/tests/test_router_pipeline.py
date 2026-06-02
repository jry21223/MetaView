from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
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
    # Existing router tests fire several POSTs back-to-back; disable per-IP
    # rate limiting so they don't bump into the production threshold.
    app.state.limiter.enabled = False
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


def test_delete_run_removes_created_run(client) -> None:
    post_resp = client.post("/api/v1/pipeline", json={"prompt": "删除这一条"})
    run_id = post_resp.json()["run_id"]

    delete_resp = client.delete(f"/api/v1/runs/{run_id}")

    assert delete_resp.status_code == 204
    assert client.get(f"/api/v1/runs/{run_id}").status_code == 404


def test_delete_unknown_run_returns_404(client) -> None:
    resp = client.delete("/api/v1/runs/nonexistent-id")

    assert resp.status_code == 404


def test_deleted_run_is_absent_from_list(client) -> None:
    post_resp = client.post("/api/v1/pipeline", json={"prompt": "列表里也删掉"})
    run_id = post_resp.json()["run_id"]

    assert client.delete(f"/api/v1/runs/{run_id}").status_code == 204

    resp = client.get("/api/v1/runs")
    assert resp.status_code == 200
    assert all(run["run_id"] != run_id for run in resp.json())


def test_post_pipeline_rejects_empty_prompt(client) -> None:
    resp = client.post("/api/v1/pipeline", json={"prompt": ""})
    assert resp.status_code == 422


def test_post_pipeline_returns_prompt_in_response(client) -> None:
    prompt = "可视化归并排序"
    resp = client.post("/api/v1/pipeline", json={"prompt": prompt})
    assert resp.status_code == 202
    assert resp.json()["prompt"] == prompt


def test_ops_edition_rejects_client_provider_override(monkeypatch, tmp_path) -> None:
    get_settings.cache_clear()
    db = str(tmp_path / "ops.db")
    init_db(db)
    repo = SqliteRunRepository(db)
    monkeypatch.setenv("METAVIEW_APP_EDITION", "ops")
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    app = create_app()
    app.dependency_overrides[get_run_repo] = lambda: repo
    app.dependency_overrides[get_llm_provider] = lambda: _MockLLM()

    with TestClient(app) as c:
        resp = c.post(
            "/api/v1/pipeline",
            json={"prompt": "test", "provider_api_key": "sk-user"},
        )

    get_settings.cache_clear()
    assert resp.status_code == 400
    assert "平台托管模型" in resp.json()["detail"]


def test_get_run_returns_prompt(client) -> None:
    prompt = "可视化冒泡排序"
    post_resp = client.post("/api/v1/pipeline", json={"prompt": prompt})
    run_id = post_resp.json()["run_id"]

    get_resp = client.get(f"/api/v1/runs/{run_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["prompt"] == prompt


def test_list_runs_includes_prompt(client) -> None:
    prompt = "解释快速排序算法"
    client.post("/api/v1/pipeline", json={"prompt": prompt})

    resp = client.get("/api/v1/runs")
    assert resp.status_code == 200
    runs = resp.json()
    assert any(r["prompt"] == prompt for r in runs)


def test_init_db_migrates_legacy_request_id_schema(tmp_path) -> None:
    db = str(tmp_path / "legacy.db")
    import sqlite3

    with sqlite3.connect(db) as conn:
        conn.execute("""
            CREATE TABLE pipeline_runs (
                request_id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                prompt TEXT NOT NULL,
                status TEXT,
                error_message TEXT,
                review_json TEXT
            )
        """)
        conn.execute(
            "INSERT INTO pipeline_runs"
            " (request_id, created_at, prompt, status, error_message, review_json)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            ("legacy-1", "2026-05-24T00:00:00+00:00", "旧记录", "failed", "boom", None),
        )

    init_db(db)

    with sqlite3.connect(db) as conn:
        cols = {row[1] for row in conn.execute("PRAGMA table_info(pipeline_runs)")}
        row = conn.execute("SELECT * FROM pipeline_runs WHERE run_id='legacy-1'").fetchone()

    assert "run_id" in cols
    assert row is not None
