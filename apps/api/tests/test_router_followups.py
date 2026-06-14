from __future__ import annotations

import asyncio
import json
import sqlite3
from collections.abc import Iterator

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
from app.presentation.dependencies import get_llm_provider, get_run_director_repo, get_run_repo


class SequenceLLM:
    def __init__(self, responses: list[str]) -> None:
        self.responses = responses
        self.calls = 0

    async def complete(self, system: str, user: str) -> str:
        self.calls += 1
        if len(self.responses) == 1:
            return self.responses[0]
        return self.responses.pop(0)


@pytest.fixture
def followup_client(
    monkeypatch,
    tmp_path,
) -> Iterator[tuple[TestClient, SqliteRunRepository, SqliteRunDirectorRepository, SequenceLLM]]:
    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_OPENAI_API_KEY", "sk-server")
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    db = str(tmp_path / "followups.db")
    init_db(db)
    repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    llm = SequenceLLM([_llm_payload([
        {"op": "replace", "path": "/summary", "value": "改成更直观的版本。"},
        {"op": "replace", "path": "/steps/0/title", "value": "先观察数组"},
        {"op": "replace", "path": "/steps/1/voiceover_text", "value": "第二步强调交换原因。"},
        {"op": "replace", "path": "/steps/0/layers/0/body/array_values", "value": ["3", "1"]},
    ])])
    app = create_app()
    app.dependency_overrides[get_run_repo] = lambda: repo
    app.dependency_overrides[get_run_director_repo] = lambda: director_repo
    app.dependency_overrides[get_llm_provider] = lambda: llm
    with TestClient(app) as client:
        yield client, repo, director_repo, llm
    get_settings.cache_clear()


def test_followup_applies_patch_persists_history_and_versions(followup_client) -> None:
    client, repo, director_repo, _llm = followup_client
    run_id = _seed_run(repo)

    resp = client.post(f"/api/v1/runs/{run_id}/follow-up", json={"message": "换个角度讲"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["reply"] == "已按要求更新。"
    assert data["change_summary"] == "refactor: update explanation"
    assert data["playbook"]["summary"] == "改成更直观的版本。"
    assert data["playbook"]["steps"][0]["title"] == "先观察数组"
    assert data["playbook"]["steps"][0]["snapshot"]["array_values"] == ["3", "1"]
    assert data["playbook"]["steps"][1]["voiceover_text"] == "第二步强调交换原因。"
    assert data["director"]["beats"][0]["voiceover_text"] is None
    assert data["director"]["beats"][1]["voiceover_text"] is None
    active_director = _run(director_repo.get(run_id))
    assert active_director is not None
    assert active_director.beats[1].voiceover_text is None
    stored = _run(repo.get(run_id))
    assert stored is not None
    assert stored.playbook is not None
    assert stored.playbook.summary == "改成更直观的版本。"

    history = client.get(f"/api/v1/runs/{run_id}/follow-ups").json()
    assert len(history["followups"]) == 1
    assert history["followups"][0]["version_id"] == data["version_id"]
    assert [v["version_number"] for v in history["versions"]] == [0, 1]
    assert history["versions"][0]["summary"] == "initial playbook"
    assert history["versions"][0]["is_head"] is False
    assert history["versions"][1]["summary"] == "refactor: update explanation"
    assert history["versions"][1]["parent_version_id"] == history["versions"][0]["version_id"]
    assert history["versions"][1]["short_id"]
    assert history["versions"][1]["is_head"] is True


def test_followup_can_reply_without_creating_version(monkeypatch, tmp_path) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_OPENAI_API_KEY", "sk-server")
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    db = str(tmp_path / "reply-only.db")
    init_db(db)
    repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    run_id = _seed_run(repo)
    original = _run(repo.get(run_id))
    assert original is not None
    assert original.playbook is not None
    llm = SequenceLLM([_llm_payload([])])
    app = create_app()
    app.dependency_overrides[get_run_repo] = lambda: repo
    app.dependency_overrides[get_run_director_repo] = lambda: director_repo
    app.dependency_overrides[get_llm_provider] = lambda: llm

    with TestClient(app) as client:
        resp = client.post(f"/api/v1/runs/{run_id}/follow-up", json={"message": "这里为什么要交换？"})
        history = client.get(f"/api/v1/runs/{run_id}/follow-ups").json()

    get_settings.cache_clear()
    assert resp.status_code == 200
    data = resp.json()
    assert data["kind"] == "reply"
    assert data["version_id"] is None
    assert data["playbook"] is None
    assert data["director"] is None
    stored = _run(repo.get(run_id))
    assert stored is not None
    assert stored.playbook == original.playbook
    assert history["followups"][0]["version_id"] is None
    assert history["followups"][0]["patch_json"] == "[]"
    assert history["versions"] == []


def test_followup_repairs_invalid_patch_once(monkeypatch, tmp_path) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_OPENAI_API_KEY", "sk-server")
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    db = str(tmp_path / "repair.db")
    init_db(db)
    repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    run_id = _seed_run(repo)
    llm = SequenceLLM([
        _llm_payload([{"op": "replace", "path": "/fps", "value": 24}]),
        _llm_payload([{"op": "replace", "path": "/title", "value": "修复后的标题"}]),
    ])
    app = create_app()
    app.dependency_overrides[get_run_repo] = lambda: repo
    app.dependency_overrides[get_run_director_repo] = lambda: director_repo
    app.dependency_overrides[get_llm_provider] = lambda: llm

    with TestClient(app) as client:
        resp = client.post(f"/api/v1/runs/{run_id}/follow-up", json={"message": "改标题"})

    get_settings.cache_clear()
    assert resp.status_code == 200
    assert llm.calls == 2
    assert resp.json()["playbook"]["title"] == "修复后的标题"


def test_followup_restore_version(followup_client) -> None:
    client, _repo, director_repo, _llm = followup_client
    run_id = _seed_run(_repo)
    client.post(f"/api/v1/runs/{run_id}/follow-up", json={"message": "修改"})
    versions = client.get(f"/api/v1/runs/{run_id}/follow-ups").json()["versions"]
    original_version = versions[0]["version_id"]

    resp = client.post(f"/api/v1/runs/{run_id}/versions/{original_version}/restore")

    assert resp.status_code == 200
    assert resp.json()["playbook"]["summary"] == "Original summary."
    assert resp.json()["playbook"]["steps"][0]["voiceover_text"] == "Step 1 narration."
    assert resp.json()["director"]["beats"][0]["voiceover_text"] is None
    active_director = _run(director_repo.get(run_id))
    assert active_director is not None
    assert active_director.beats[0].voiceover_text is None
    versions_after = client.get(f"/api/v1/runs/{run_id}/follow-ups").json()["versions"]
    assert resp.json()["version_id"] == original_version
    assert len(versions_after) == 2
    assert versions_after[0]["source"] == "initial"
    assert versions_after[0]["is_head"] is True
    assert versions_after[1]["source"] == "followup"
    assert versions_after[1]["is_head"] is False


def test_followup_uses_selected_base_version(monkeypatch, tmp_path) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_OPENAI_API_KEY", "sk-server")
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    db = str(tmp_path / "base-version.db")
    init_db(db)
    repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    run_id = _seed_run(repo)
    llm = SequenceLLM([
        _llm_payload([{"op": "replace", "path": "/summary", "value": "当前 HEAD 摘要。"}]),
        _llm_payload([{"op": "replace", "path": "/title", "value": "从旧版本继续"}]),
    ])
    app = create_app()
    app.dependency_overrides[get_run_repo] = lambda: repo
    app.dependency_overrides[get_run_director_repo] = lambda: director_repo
    app.dependency_overrides[get_llm_provider] = lambda: llm

    with TestClient(app) as client:
        first = client.post(f"/api/v1/runs/{run_id}/follow-up", json={"message": "先改摘要"})
        versions = client.get(f"/api/v1/runs/{run_id}/follow-ups").json()["versions"]
        original_version = versions[0]["version_id"]
        second = client.post(
            f"/api/v1/runs/{run_id}/follow-up",
            json={"message": "从旧版继续改标题", "base_version_id": original_version},
        )
        versions_after = client.get(f"/api/v1/runs/{run_id}/follow-ups").json()["versions"]

    get_settings.cache_clear()
    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["playbook"]["title"] == "从旧版本继续"
    assert second.json()["playbook"]["summary"] == "Original summary."
    assert versions_after[-1]["parent_version_id"] == original_version


def test_followup_coerces_numeric_parameter_contract(monkeypatch, tmp_path) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_OPENAI_API_KEY", "sk-server")
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    db = str(tmp_path / "numeric-params.db")
    init_db(db)
    repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    run_id = _seed_run(repo)
    llm = SequenceLLM([
        _llm_payload([
            {
                "op": "replace",
                "path": "/parameter_controls",
                "value": [
                    {"id": "mass", "label": "质量", "value": 2},
                    {"id": "angle", "label": "角度", "value": 30},
                    {"id": "mu_s", "label": "静摩擦系数", "value": 0.5},
                ],
            },
            {
                "op": "replace",
                "path": "/initial_data",
                "value": {"mass": [2], "angle": [30], "mu_s": [0.5]},
            },
        ])
    ])
    app = create_app()
    app.dependency_overrides[get_run_repo] = lambda: repo
    app.dependency_overrides[get_run_director_repo] = lambda: director_repo
    app.dependency_overrides[get_llm_provider] = lambda: llm

    with TestClient(app) as client:
        resp = client.post(f"/api/v1/runs/{run_id}/follow-up", json={"message": "加参数"})

    get_settings.cache_clear()
    assert resp.status_code == 200
    playbook = resp.json()["playbook"]
    assert [item["value"] for item in playbook["parameter_controls"]] == ["2", "30", "0.5"]
    assert playbook["initial_data"] == {
        "mass": ["2"],
        "angle": ["30"],
        "mu_s": ["0.5"],
    }


def test_followup_ops_rejects_provider_override(monkeypatch, tmp_path) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_APP_EDITION", "ops")
    monkeypatch.setenv("METAVIEW_OPENAI_API_KEY", "sk-server")
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    db = str(tmp_path / "ops.db")
    init_db(db)
    repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    owner = _session_with_balance(db, 20)
    run_id = _seed_run(repo, user_id=owner.account.user_id)
    app = create_app()
    app.dependency_overrides[get_run_repo] = lambda: repo
    app.dependency_overrides[get_run_director_repo] = lambda: director_repo
    app.dependency_overrides[get_llm_provider] = lambda: SequenceLLM([_llm_payload([])])

    with TestClient(app) as client:
        resp = client.post(
            f"/api/v1/runs/{run_id}/follow-up",
            json={"message": "改一下", "provider_api_key": "sk-user"},
            headers={"Cookie": f"mv_session={owner.token}"},
        )

    get_settings.cache_clear()
    assert resp.status_code == 400


def test_followup_ops_requires_wechat_session(monkeypatch, tmp_path) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_APP_EDITION", "ops")
    monkeypatch.setenv("METAVIEW_OPENAI_API_KEY", "sk-server")
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    db = str(tmp_path / "ops-followup-login-required.db")
    init_db(db)
    repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    guest = _session_with_balance(db, 20, login_provider="guest")
    run_id = _seed_run(repo)
    app = create_app()
    app.dependency_overrides[get_run_repo] = lambda: repo
    app.dependency_overrides[get_run_director_repo] = lambda: director_repo
    app.dependency_overrides[get_llm_provider] = lambda: SequenceLLM([_llm_payload([])])

    with TestClient(app) as client:
        missing = client.post(
            f"/api/v1/runs/{run_id}/follow-up",
            json={"message": "改一下"},
        )
        guest_resp = client.post(
            f"/api/v1/runs/{run_id}/follow-up",
            json={"message": "改一下"},
            headers={"Cookie": f"mv_session={guest.token}"},
        )

    get_settings.cache_clear()
    assert missing.status_code == 401
    assert guest_resp.status_code == 401


def test_followup_ops_scopes_run_and_consumes_balance(monkeypatch, tmp_path) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_APP_EDITION", "ops")
    monkeypatch.setenv("METAVIEW_OPENAI_API_KEY", "sk-server")
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    monkeypatch.setenv("METAVIEW_GENERATION_COST_CENTS", "10")
    db = str(tmp_path / "ops-followup.db")
    init_db(db)
    repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    monkeypatch.setenv("METAVIEW_HISTORY_DB_PATH", db)
    owner = _session_with_balance(db, 20)
    other = _session_with_balance(db, 20)
    run_id = _seed_run(repo, user_id=owner.account.user_id)
    app = create_app()
    app.dependency_overrides[get_run_repo] = lambda: repo
    app.dependency_overrides[get_run_director_repo] = lambda: director_repo
    app.dependency_overrides[get_llm_provider] = lambda: SequenceLLM([_llm_payload([])])

    with TestClient(app) as client:
        ok = client.post(
            f"/api/v1/runs/{run_id}/follow-up",
            json={"message": "改一下"},
            headers={"Cookie": f"mv_session={owner.token}"},
        )

    with TestClient(app) as client:
        blocked_followup = client.post(
            f"/api/v1/runs/{run_id}/follow-up",
            json={"message": "越权改一下"},
            headers={"Cookie": f"mv_session={other.token}"},
        )
        blocked_restore = client.post(
            f"/api/v1/runs/{run_id}/versions/{run_id}:v0/restore",
            headers={"Cookie": f"mv_session={other.token}"},
        )

    get_settings.cache_clear()
    assert ok.status_code == 200
    assert blocked_followup.status_code == 404
    assert blocked_restore.status_code == 404
    assert _balance(db, owner.account.user_id) == 10
    assert _ledger_count(db, owner.account.user_id, "consume") == 1


def test_followup_ops_refunds_balance_when_patch_fails(monkeypatch, tmp_path) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_APP_EDITION", "ops")
    monkeypatch.setenv("METAVIEW_OPENAI_API_KEY", "sk-server")
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    monkeypatch.setenv("METAVIEW_GENERATION_COST_CENTS", "10")
    db = str(tmp_path / "ops-followup-refund.db")
    init_db(db)
    repo = SqliteRunRepository(db)
    director_repo = SqliteRunDirectorRepository(db)
    monkeypatch.setenv("METAVIEW_HISTORY_DB_PATH", db)
    owner = _session_with_balance(db, 20)
    run_id = _seed_run(repo, user_id=owner.account.user_id)
    app = create_app()
    app.dependency_overrides[get_run_repo] = lambda: repo
    app.dependency_overrides[get_run_director_repo] = lambda: director_repo
    app.dependency_overrides[get_llm_provider] = lambda: SequenceLLM([
        _llm_payload([{"op": "replace", "path": "/fps", "value": 24}])
    ])

    with TestClient(app) as client:
        resp = client.post(
            f"/api/v1/runs/{run_id}/follow-up",
            json={"message": "改一下"},
            headers={"Cookie": f"mv_session={owner.token}"},
        )

    get_settings.cache_clear()
    assert resp.status_code == 422
    assert _balance(db, owner.account.user_id) == 20
    assert _ledger_count(db, owner.account.user_id, "consume") == 1
    assert _ledger_count(db, owner.account.user_id, "refund") == 1


def _seed_run(repo: SqliteRunRepository, user_id: str | None = None) -> str:
    run_id = "run-1"
    _run(repo.create(run_id, "prompt", "2026-06-01T00:00:00+00:00", user_id=user_id))
    _run(
        repo.update(
            run_id,
            status=PipelineRunStatus.SUCCEEDED,
            playbook_json=json.dumps(_playbook(), ensure_ascii=False),
        )
    )
    return run_id


def _run(coro):
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


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


def _llm_payload(patch: list[dict]) -> str:
    return json.dumps(
        {
            "reply": "已按要求更新。",
            "change_summary": "refactor: update explanation",
            "patch": patch,
        },
        ensure_ascii=False,
    )


def _playbook() -> dict:
    return {
        "schema_version": "1.0.0",
        "fps": 30,
        "total_frames": 120,
        "domain": "algorithm",
        "title": "Original",
        "summary": "Original summary.",
        "steps": [
            _step("step_01", 60, "Step 1", ["1", "2"]),
            _step("step_02", 120, "Step 2", ["2", "1"]),
        ],
        "parameter_controls": [],
        "initial_data": {},
    }


def _step(step_id: str, end_frame: int, title: str, values: list[str]) -> dict:
    snapshot = {
        "kind": "algorithm_array",
        "array_values": values,
        "active_indices": [],
        "swap_indices": [],
        "sorted_indices": [],
        "pointers": {},
    }
    return {
        "step_id": step_id,
        "end_frame": end_frame,
        "title": title,
        "voiceover_text": f"{title} narration.",
        "snapshot": snapshot,
        "layers": [
            {
                "timing": {
                    "enter_at": 0.0,
                    "exit_at": 1.0,
                    "appear_anim": "fade",
                    "z_order": 0,
                },
                "body": snapshot,
            }
        ],
        "tokens": [],
    }
