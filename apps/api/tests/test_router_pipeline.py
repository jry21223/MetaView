from __future__ import annotations

import asyncio
import json
import sqlite3
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.domain.models.pipeline_run import PipelineRunStatus
from app.infrastructure.persistence.db_init import init_db
from app.infrastructure.persistence.sqlite_account_repository import SqliteAccountRepository
from app.infrastructure.persistence.sqlite_director_repository import (
    SqliteRunDirectorRepository,
)
from app.infrastructure.persistence.sqlite_run_repository import SqliteRunRepository
from app.main import create_app
from app.presentation.dependencies import (
    get_agent_provider,
    get_llm_provider,
    get_reviewer_llm_provider,
    get_run_director_repo,
    get_run_repo,
)

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


class _FailingLLM:
    async def complete(self, system: str, user: str) -> str:
        raise RuntimeError("provider failed")


class _Agent:
    def __init__(self, playbook: dict[str, Any]) -> None:
        self.playbook = playbook

    async def generate(
        self,
        prompt: str,
        provider_config: dict[str, Any] | None = None,
        route_decision: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return self.playbook


def _agent_step(index: int) -> dict[str, Any]:
    active = (index - 1) % 3
    snapshot = {
        "kind": "algorithm_array",
        "array_values": ["1", "3", "5"],
        "active_indices": [active],
        "swap_indices": [],
        "sorted_indices": [],
        "pointers": {"cursor": active},
    }
    return {
        "step_id": f"step_{index:02d}",
        "title": f"Array step {index}",
        "end_frame": index * 60,
        "narration_template": [f"Inspect the array step {index} and state the result."],
        "voiceover_text": f"Inspect the array step {index} and state the result.",
        "tokens": [],
        "code_highlight": None,
        "snapshot": snapshot,
        "layers": [{"body": json.loads(json.dumps(snapshot))}],
    }


def _valid_agent_playbook() -> dict[str, Any]:
    return {
        "fps": 30,
        "total_frames": 480,
        "domain": "algorithm",
        "title": "Agent Array",
        "summary": "Inspect the array and state the result.",
        "steps": [_agent_step(index) for index in range(1, 9)],
        "parameter_controls": [],
    }


@pytest.fixture
def client(tmp_path):
    db = str(tmp_path / "test.db")
    init_db(db)
    repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)

    app = create_app()
    # Existing router tests fire several POSTs back-to-back; disable per-IP
    # rate limiting so they don't bump into the production threshold.
    app.state.limiter.enabled = False
    app.dependency_overrides[get_run_repo] = lambda: repo
    app.dependency_overrides[get_run_director_repo] = lambda: director_repo
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
    director_repo = SqliteRunDirectorRepository(db)
    session = _session_with_balance(db, 20)
    monkeypatch.setenv("METAVIEW_APP_EDITION", "ops")
    monkeypatch.setenv("METAVIEW_HISTORY_DB_PATH", db)
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    app = create_app()
    app.dependency_overrides[get_run_repo] = lambda: repo
    app.dependency_overrides[get_run_director_repo] = lambda: director_repo
    app.dependency_overrides[get_llm_provider] = lambda: _MockLLM()

    with TestClient(app) as c:
        resp = c.post(
            "/api/v1/pipeline",
            json={"prompt": "test", "provider_api_key": "sk-user"},
            headers={"Cookie": f"mv_session={session.token}"},
        )

    get_settings.cache_clear()
    assert resp.status_code == 400
    assert "平台托管模型" in resp.json()["detail"]


def test_ops_pipeline_requires_wechat_session(monkeypatch, tmp_path) -> None:
    get_settings.cache_clear()
    db = str(tmp_path / "ops-login-required.db")
    init_db(db)
    repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    guest = _session_with_balance(db, 20, login_provider="guest")
    monkeypatch.setenv("METAVIEW_APP_EDITION", "ops")
    monkeypatch.setenv("METAVIEW_HISTORY_DB_PATH", db)
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    app = create_app()
    app.dependency_overrides[get_run_repo] = lambda: repo
    app.dependency_overrides[get_run_director_repo] = lambda: director_repo
    app.dependency_overrides[get_llm_provider] = lambda: _MockLLM()

    with TestClient(app) as client:
        missing = client.post("/api/v1/pipeline", json={"prompt": "ops run"})
        guest_resp = client.post(
            "/api/v1/pipeline",
            json={"prompt": "ops run"},
            headers={"Cookie": f"mv_session={guest.token}"},
        )

    get_settings.cache_clear()
    assert missing.status_code == 401
    assert guest_resp.status_code == 401
    assert _run(repo.list()) == []


def test_ops_runs_require_wechat_session(monkeypatch, tmp_path) -> None:
    get_settings.cache_clear()
    db = str(tmp_path / "ops-runs-login-required.db")
    init_db(db)
    repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    guest = _session_with_balance(db, 20, login_provider="guest")
    monkeypatch.setenv("METAVIEW_APP_EDITION", "ops")
    monkeypatch.setenv("METAVIEW_HISTORY_DB_PATH", db)
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    app = create_app()
    app.dependency_overrides[get_run_repo] = lambda: repo
    app.dependency_overrides[get_run_director_repo] = lambda: director_repo

    with TestClient(app) as client:
        missing = client.get("/api/v1/runs")
        guest_resp = client.get(
            "/api/v1/runs",
            headers={"Cookie": f"mv_session={guest.token}"},
        )

    get_settings.cache_clear()
    assert missing.status_code == 401
    assert guest_resp.status_code == 401


def test_ops_pipeline_scopes_runs_and_consumes_balance(monkeypatch, tmp_path) -> None:
    get_settings.cache_clear()
    db = str(tmp_path / "ops-scope.db")
    init_db(db)
    repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    session_a = _session_with_balance(db, 20)
    session_b = _session_with_balance(db, 20)
    monkeypatch.setenv("METAVIEW_APP_EDITION", "ops")
    monkeypatch.setenv("METAVIEW_HISTORY_DB_PATH", db)
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    monkeypatch.setenv("METAVIEW_GENERATION_COST_CENTS", "10")
    app = create_app()
    app.dependency_overrides[get_run_repo] = lambda: repo
    app.dependency_overrides[get_run_director_repo] = lambda: director_repo
    app.dependency_overrides[get_llm_provider] = lambda: _MockLLM()

    with TestClient(app) as client_a:
        created = client_a.post(
            "/api/v1/pipeline",
            json={"prompt": "ops run"},
            headers={"Cookie": f"mv_session={session_a.token}"},
        )
        run_id = created.json()["run_id"]
        own_get = client_a.get(
            f"/api/v1/runs/{run_id}",
            headers={"Cookie": f"mv_session={session_a.token}"},
        )
        own_list = client_a.get(
            "/api/v1/runs",
            headers={"Cookie": f"mv_session={session_a.token}"},
        )

    with TestClient(app) as client_b:
        other_get = client_b.get(
            f"/api/v1/runs/{run_id}",
            headers={"Cookie": f"mv_session={session_b.token}"},
        )
        other_delete = client_b.delete(
            f"/api/v1/runs/{run_id}",
            headers={"Cookie": f"mv_session={session_b.token}"},
        )

    get_settings.cache_clear()
    assert created.status_code == 202
    assert own_get.status_code == 200
    assert any(item["run_id"] == run_id for item in own_list.json())
    assert other_get.status_code == 404
    assert other_delete.status_code == 404
    assert _balance(db, session_a.account.user_id) == 10
    assert _ledger_count(db, session_a.account.user_id, "consume") == 1


def test_ops_pipeline_rejects_insufficient_balance(monkeypatch, tmp_path) -> None:
    get_settings.cache_clear()
    db = str(tmp_path / "ops-insufficient.db")
    init_db(db)
    repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    session = _session_with_balance(db, 0)
    monkeypatch.setenv("METAVIEW_APP_EDITION", "ops")
    monkeypatch.setenv("METAVIEW_HISTORY_DB_PATH", db)
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    monkeypatch.setenv("METAVIEW_GENERATION_COST_CENTS", "10")
    app = create_app()
    app.dependency_overrides[get_run_repo] = lambda: repo
    app.dependency_overrides[get_run_director_repo] = lambda: director_repo
    app.dependency_overrides[get_llm_provider] = lambda: _MockLLM()

    with TestClient(app) as client:
        resp = client.post(
            "/api/v1/pipeline",
            json={"prompt": "ops run"},
            headers={"Cookie": f"mv_session={session.token}"},
        )

    get_settings.cache_clear()
    assert resp.status_code == 402
    assert "余额不足" in resp.json()["detail"]
    assert _run(repo.list()) == []


def test_ops_pipeline_refunds_balance_when_generation_fails(monkeypatch, tmp_path) -> None:
    get_settings.cache_clear()
    db = str(tmp_path / "ops-refund.db")
    init_db(db)
    repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    session = _session_with_balance(db, 20)
    monkeypatch.setenv("METAVIEW_APP_EDITION", "ops")
    monkeypatch.setenv("METAVIEW_HISTORY_DB_PATH", db)
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    monkeypatch.setenv("METAVIEW_GENERATION_COST_CENTS", "10")
    app = create_app()
    app.dependency_overrides[get_run_repo] = lambda: repo
    app.dependency_overrides[get_run_director_repo] = lambda: director_repo
    app.dependency_overrides[get_llm_provider] = lambda: _FailingLLM()

    with TestClient(app) as client:
        resp = client.post(
            "/api/v1/pipeline",
            json={"prompt": "ops run"},
            headers={"Cookie": f"mv_session={session.token}"},
        )

    get_settings.cache_clear()
    run = _run(repo.get(resp.json()["run_id"], user_id=session.account.user_id))
    assert resp.status_code == 202
    assert run is not None
    assert run.status == PipelineRunStatus.FAILED
    assert _balance(db, session.account.user_id) == 20
    assert _ledger_count(db, session.account.user_id, "consume") == 1
    assert _ledger_count(db, session.account.user_id, "refund") == 1


def test_ops_agent_pipeline_fails_when_reviewer_missing(monkeypatch, tmp_path) -> None:
    get_settings.cache_clear()
    db = str(tmp_path / "ops-agent-reviewer.db")
    init_db(db)
    repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    session = _session_with_balance(db, 20)
    monkeypatch.setenv("METAVIEW_APP_EDITION", "ops")
    monkeypatch.setenv("METAVIEW_GENERATION_MODE", "agent")
    monkeypatch.setenv("METAVIEW_REVIEWER_MODE", "on_failure")
    monkeypatch.setenv("METAVIEW_HISTORY_DB_PATH", db)
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    monkeypatch.setenv("METAVIEW_GENERATION_COST_CENTS", "10")
    app = create_app()
    app.dependency_overrides[get_run_repo] = lambda: repo
    app.dependency_overrides[get_run_director_repo] = lambda: director_repo
    app.dependency_overrides[get_llm_provider] = lambda: _MockLLM()
    app.dependency_overrides[get_agent_provider] = lambda: _Agent(_valid_agent_playbook())
    app.dependency_overrides[get_reviewer_llm_provider] = lambda: None

    with TestClient(app) as client:
        resp = client.post(
            "/api/v1/pipeline",
            json={"prompt": "ops agent run"},
            headers={"Cookie": f"mv_session={session.token}"},
        )

    run = _run(repo.get(resp.json()["run_id"], user_id=session.account.user_id))
    get_settings.cache_clear()
    assert resp.status_code == 202
    assert run is not None
    assert run.status == PipelineRunStatus.FAILED
    assert run.playbook is None
    assert run.review is not None
    assert run.review.status == "blocked"
    assert run.review.issues[0].code == "reviewer.unconfigured"
    assert _balance(db, session.account.user_id) == 20
    assert _ledger_count(db, session.account.user_id, "consume") == 1
    assert _ledger_count(db, session.account.user_id, "refund") == 1


def test_get_run_includes_active_director_after_success(client) -> None:
    post_resp = client.post("/api/v1/pipeline", json={"prompt": "可视化栈"})
    run_id = post_resp.json()["run_id"]

    get_resp = client.get(f"/api/v1/runs/{run_id}")

    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data["director"]["run_id"] == run_id
    assert data["director"]["beats"][0]["step_id"] == "step_01"


def test_delete_run_removes_active_director(client) -> None:
    post_resp = client.post("/api/v1/pipeline", json={"prompt": "删除导演脚本"})
    run_id = post_resp.json()["run_id"]
    assert client.get(f"/api/v1/runs/{run_id}").json()["director"] is not None

    delete_resp = client.delete(f"/api/v1/runs/{run_id}")

    assert delete_resp.status_code == 204
    assert client.get(f"/api/v1/runs/{run_id}").status_code == 404


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


def _session_with_balance(
    db: str,
    balance_cents: int,
    *,
    login_provider: str = "wechat",
):
    session = _run(SqliteAccountRepository(db).get_or_create_session(None, session_days=30))
    with sqlite3.connect(db) as conn:
        conn.execute(
            """
            UPDATE accounts
            SET balance_cents = ?,
                login_provider = ?,
                display_name = ?,
                wechat_openid = CASE WHEN ? = 'wechat' THEN ? ELSE NULL END
            WHERE user_id = ?
            """,
            (
                balance_cents,
                login_provider,
                "微信用户" if login_provider == "wechat" else "游客账户",
                login_provider,
                f"openid_{session.account.user_id}",
                session.account.user_id,
            ),
        )
        conn.commit()
    return session


def _balance(db: str, user_id: str) -> int:
    with sqlite3.connect(db) as conn:
        row = conn.execute(
            "SELECT balance_cents FROM accounts WHERE user_id = ?",
            (user_id,),
        ).fetchone()
    assert row is not None
    return int(row[0])


def _ledger_count(db: str, user_id: str, kind: str) -> int:
    with sqlite3.connect(db) as conn:
        row = conn.execute(
            "SELECT COUNT(*) FROM balance_ledger WHERE user_id = ? AND kind = ?",
            (user_id, kind),
        ).fetchone()
    assert row is not None
    return int(row[0])


def _run(coro):
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)
