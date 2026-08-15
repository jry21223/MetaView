from __future__ import annotations

import asyncio
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.infrastructure.persistence.db_init import init_db
from app.infrastructure.persistence.sqlite_account_repository import SqliteAccountRepository
from app.main import create_app

ACCOUNT_FIELDS = {
    "user_id",
    "display_name",
    "avatar_url",
    "login_provider",
    "status",
    "role",
    "balance_yuan",
    "created_at",
    "last_active_at",
}


def test_ops_accounts_lists_paginated_accounts_for_bound_admin(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    db = _db(tmp_path, "accounts-page.db")
    admin = _session(db, role="admin")
    _seed_account(db, "user_a1", display_name="账户甲", created_at=_iso(0), balance_cents=1234)
    _seed_account(db, "user_a2", display_name="账户乙", created_at=_iso(1))
    _seed_account(db, "user_a3", display_name="账户丙", created_at=_iso(2))
    _seed_account(db, "user_a4", display_name="账户丁", created_at=_iso(4))
    _seed_account(db, "user_a5", display_name="账户戊", created_at=_iso(5))

    with _client(monkeypatch, db, ops_admin_user_id=admin.account.user_id) as client:
        resp = client.get(
            "/api/v1/ops/accounts?page=1&page_size=2",
            headers={"Cookie": f"mv_session={admin.token}"},
        )
        page_two = client.get(
            "/api/v1/ops/accounts?page=2&page_size=2",
            headers={"Cookie": f"mv_session={admin.token}"},
        )
        last_page = client.get(
            "/api/v1/ops/accounts?page=3&page_size=2",
            headers={"Cookie": f"mv_session={admin.token}"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 6
    assert data["page"] == 1
    assert data["page_size"] == 2
    # Newest first: a1, a2, a3, admin, a4, a5.
    assert [item["user_id"] for item in data["items"]] == ["user_a1", "user_a2"]
    assert page_two.json()["items"][1]["user_id"] == admin.account.user_id
    assert [item["user_id"] for item in last_page.json()["items"]] == ["user_a4", "user_a5"]

    first = data["items"][0]
    assert set(first.keys()) == ACCOUNT_FIELDS
    assert first["display_name"] == "账户甲"
    assert first["login_provider"] == "wechat"
    assert first["status"] == "enabled"
    assert first["role"] == "user"
    assert first["balance_yuan"] == "12.34"
    assert first["created_at"] == _iso(0)
    serialized = _dump(data)
    assert "wechat_openid" not in serialized
    assert "wechat_unionid" not in serialized


def test_ops_accounts_derives_last_active_at_from_login_or_session(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    db = _db(tmp_path, "last-active.db")
    admin = _session(db, role="admin")
    _seed_account(db, "user_logged", display_name="有登录", created_at=_iso(10), last_login_at=_iso(1))
    _seed_account(
        db,
        "user_sessions",
        display_name="仅有会话",
        created_at=_iso(10),
        session_created_at=_iso(2),
    )
    _seed_account(db, "user_cold", display_name="无痕迹", created_at=_iso(10))

    with _client(monkeypatch, db, ops_admin_user_id=admin.account.user_id) as client:
        resp = client.get(
            "/api/v1/ops/accounts?page_size=50",
            headers={"Cookie": f"mv_session={admin.token}"},
        )

    assert resp.status_code == 200
    by_id = {item["user_id"]: item for item in resp.json()["items"]}
    assert by_id["user_logged"]["last_active_at"] == _iso(1)
    assert by_id["user_sessions"]["last_active_at"] == _iso(2)
    assert by_id["user_cold"]["last_active_at"] is None


def test_ops_accounts_searches_by_display_name_and_user_id(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    db = _db(tmp_path, "accounts-search.db")
    admin = _session(db, role="admin")
    _seed_account(db, "user_alpha", display_name="王小明", created_at=_iso(0))
    _seed_account(db, "user_beta", display_name="李小红", created_at=_iso(1))
    _seed_account(db, "user_gamma", display_name="王小刚", created_at=_iso(2))

    with _client(monkeypatch, db, ops_admin_user_id=admin.account.user_id) as client:
        by_name = client.get(
            "/api/v1/ops/accounts?search=王小",
            headers={"Cookie": f"mv_session={admin.token}"},
        )
        by_id = client.get(
            "/api/v1/ops/accounts?search=user_beta",
            headers={"Cookie": f"mv_session={admin.token}"},
        )
        no_match = client.get(
            "/api/v1/ops/accounts?search=不存在",
            headers={"Cookie": f"mv_session={admin.token}"},
        )

    assert by_name.status_code == 200
    assert {item["user_id"] for item in by_name.json()["items"]} == {
        "user_alpha",
        "user_gamma",
    }
    assert by_name.json()["total"] == 2
    assert [item["user_id"] for item in by_id.json()["items"]] == ["user_beta"]
    assert no_match.json()["items"] == []
    assert no_match.json()["total"] == 0


def test_ops_accounts_rejects_unbound_admin(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    db = _db(tmp_path, "accounts-unbound.db")
    bound = _session(db, role="admin")
    intruder = _session(db, role="admin")
    assert intruder.account.user_id != bound.account.user_id

    with _client(monkeypatch, db, ops_admin_user_id=bound.account.user_id) as client:
        resp = client.get(
            "/api/v1/ops/accounts",
            headers={"Cookie": f"mv_session={intruder.token}"},
        )

    assert resp.status_code == 403
    assert "管理员权限" in resp.json()["detail"]


def test_ops_accounts_rejects_non_admin_role(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    db = _db(tmp_path, "accounts-user.db")
    session = _session(db, role="user")

    with _client(monkeypatch, db) as client:
        resp = client.get(
            "/api/v1/ops/accounts",
            headers={"Cookie": f"mv_session={session.token}"},
        )

    assert resp.status_code == 403
    assert "管理员权限" in resp.json()["detail"]


def test_ops_accounts_rejects_disabled_admin(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    db = _db(tmp_path, "accounts-disabled.db")
    session = _session(db, role="admin", status="disabled")

    with _client(monkeypatch, db) as client:
        resp = client.get(
            "/api/v1/ops/accounts",
            headers={"Cookie": f"mv_session={session.token}"},
        )

    assert resp.status_code == 403
    assert "账户已禁用" in resp.json()["detail"]


def test_ops_accounts_rejects_self_edition(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    db = _db(tmp_path, "accounts-self.db")
    session = _session(db, role="admin")

    with _client(monkeypatch, db, app_edition="self") as client:
        resp = client.get(
            "/api/v1/ops/accounts",
            headers={"Cookie": f"mv_session={session.token}"},
        )

    assert resp.status_code == 403
    assert "管理员权限" in resp.json()["detail"]


def test_ops_accounts_rejects_missing_session(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    db = _db(tmp_path, "accounts-no-session.db")

    with _client(monkeypatch, db) as client:
        resp = client.get("/api/v1/ops/accounts")

    assert resp.status_code == 401
    assert "微信登录" in resp.json()["detail"]


def test_ops_accounts_validates_query_shape(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    db = _db(tmp_path, "accounts-query.db")
    admin = _session(db, role="admin")
    long_search = "a" * 101

    with _client(monkeypatch, db, ops_admin_user_id=admin.account.user_id) as client:
        bad_page = client.get(
            "/api/v1/ops/accounts?page=0",
            headers={"Cookie": f"mv_session={admin.token}"},
        )
        bad_page_size_zero = client.get(
            "/api/v1/ops/accounts?page_size=0",
            headers={"Cookie": f"mv_session={admin.token}"},
        )
        bad_page_size = client.get(
            "/api/v1/ops/accounts?page_size=101",
            headers={"Cookie": f"mv_session={admin.token}"},
        )
        bad_search = client.get(
            f"/api/v1/ops/accounts?search={long_search}",
            headers={"Cookie": f"mv_session={admin.token}"},
        )

    assert bad_page.status_code == 422
    assert bad_page_size_zero.status_code == 422
    assert bad_page_size.status_code == 422
    assert bad_search.status_code == 422


def _db(tmp_path: Path, name: str) -> str:
    db = str(tmp_path / name)
    init_db(db)
    return db


def _client(
    monkeypatch: pytest.MonkeyPatch,
    db: str,
    *,
    app_edition: str = "ops",
    ops_admin_user_id: str = "ops-admin",
):
    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_APP_EDITION", app_edition)
    monkeypatch.setenv("METAVIEW_HISTORY_DB_PATH", db)
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    monkeypatch.setenv("METAVIEW_OPS_ADMIN_USER_ID", ops_admin_user_id)
    app = create_app()
    return TestClient(app)


def _session(
    db: str,
    *,
    role: str,
    status: str = "enabled",
):
    session = _run(SqliteAccountRepository(db).get_or_create_session(None, session_days=30))
    with sqlite3.connect(db) as conn:
        conn.execute(
            """
            UPDATE accounts
            SET role = ?,
                status = ?,
                login_provider = 'wechat',
                wechat_openid = ?,
                created_at = ?
            WHERE user_id = ?
            """,
            (
                role,
                status,
                f"openid_{session.account.user_id}",
                _iso(3),
                session.account.user_id,
            ),
        )
        conn.commit()
    return session


def _seed_account(
    db: str,
    user_id: str,
    *,
    display_name: str,
    created_at: str,
    balance_cents: int = 0,
    last_login_at: str | None = None,
    login_provider: str = "wechat",
    status: str = "enabled",
    role: str = "user",
    session_created_at: str | None = None,
) -> None:
    with sqlite3.connect(db) as conn:
        conn.execute(
            """
            INSERT INTO accounts
                (user_id, display_name, avatar_url, login_provider, status, role,
                 balance_cents, created_at, updated_at, last_login_at)
            VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                display_name,
                login_provider,
                status,
                role,
                balance_cents,
                created_at,
                created_at,
                last_login_at,
            ),
        )
        if session_created_at is not None:
            conn.execute(
                """
                INSERT INTO account_sessions (token_hash, user_id, created_at, expires_at)
                VALUES (?, ?, ?, ?)
                """,
                (f"hash_{user_id}", user_id, session_created_at, _iso(-30)),
            )
        conn.commit()


def _dump(data: dict) -> str:
    import json

    return json.dumps(data, ensure_ascii=False)


def _iso(days_ago: int) -> str:
    return (
        datetime.now(timezone.utc)
        .replace(hour=12, minute=0, second=0, microsecond=0)
        - timedelta(days=days_ago)
    ).isoformat()


def _run(coro):
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)
