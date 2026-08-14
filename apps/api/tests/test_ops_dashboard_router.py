from __future__ import annotations

import asyncio
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings, get_settings
from app.infrastructure.persistence.db_init import init_db
from app.infrastructure.persistence.sqlite_account_repository import SqliteAccountRepository
from app.main import create_app


def test_ops_dashboard_requires_admin_role(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    db = _db(tmp_path, "ordinary.db")
    session = _session(db, role="user")

    with _client(monkeypatch, db) as client:
        resp = client.get(
            "/api/v1/ops/dashboard",
            headers={"Cookie": f"mv_session={session.token}"},
    )

    assert resp.status_code == 403
    assert "管理员权限" in resp.json()["detail"]


def test_ops_dashboard_rejects_disabled_admin(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    db = _db(tmp_path, "disabled.db")
    session = _session(db, role="admin", status="disabled")

    with _client(monkeypatch, db) as client:
        resp = client.get(
            "/api/v1/ops/dashboard",
            headers={"Cookie": f"mv_session={session.token}"},
        )

    assert resp.status_code == 403
    assert "账户已禁用" in resp.json()["detail"]


def test_ops_dashboard_rejects_self_edition(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    db = _db(tmp_path, "self.db")
    session = _session(db, role="admin")

    with _client(monkeypatch, db, app_edition="self") as client:
        resp = client.get(
            "/api/v1/ops/dashboard",
            headers={"Cookie": f"mv_session={session.token}"},
        )

    assert resp.status_code == 403
    assert "管理员权限" in resp.json()["detail"]


def test_ops_dashboard_rejects_missing_admin_session(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    db = _db(tmp_path, "missing-session.db")

    with _client(monkeypatch, db) as client:
        resp = client.get("/api/v1/ops/dashboard")

    assert resp.status_code == 401
    assert "微信登录" in resp.json()["detail"]


def test_ops_dashboard_aggregates_global_metrics_and_recent_rows(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    db = _db(tmp_path, "aggregate.db")
    admin = _session(db, role="admin", balance_cents=400)
    user = _session(db, role="user", balance_cents=900)
    guest = _session(db, role="user", balance_cents=0)
    _set_login_provider(db, guest.account.user_id, "guest")
    _seed_dashboard_data(db, user.account.user_id)

    with _client(monkeypatch, db, ops_admin_user_id=admin.account.user_id) as client:
        resp = client.get(
            "/api/v1/ops/dashboard?window_days=7&limit=2",
            headers={"Cookie": f"mv_session={admin.token}"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["window_days"] == 7
    assert len(data["run_trend"]) == 7
    assert len(data["revenue_trend"]) == 7
    assert _metric(data, "users")["value"] == "2"
    assert _metric(data, "users")["helper"] == "近窗新增 2，活跃 1，管理员 1"
    assert sum(_metric(data, "users")["data"]) == 2
    assert data["run_trend"][0] == {
        "date": _day(6),
        "total": 0,
        "succeeded": 0,
        "failed": 0,
        "in_flight": 0,
    }
    assert _metric(data, "runs")["value"] == "3"
    assert _metric(data, "revenue")["value"] == "¥ 15.00"
    assert _metric(data, "consumption")["value"] == "¥ 0.10"
    assert _metric(data, "balance")["value"] == "¥ 13.00"
    assert {item["id"]: item["count"] for item in data["status_distribution"]} == {
        "failed": 1,
        "running": 1,
        "succeeded": 1,
    }
    assert {item["id"]: item["count"] for item in data["domain_distribution"]} == {
        "math": 1,
        "unresolved": 2,
    }
    assert [row["run_id"] for row in data["recent_runs"]] == ["run-today", "run-yesterday"]
    assert len(data["recent_orders"]) == 2
    assert data["recent_orders"][0]["amount_yuan"] == "15.00"
    assert data["health_tree"][0]["id"] == "generation"


def test_ops_dashboard_redacts_recent_row_user_identity(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    db = _db(tmp_path, "redacted-users.db")
    admin = _session(db, role="admin")
    user = _session(db, role="user", display_name="敏感用户")
    _seed_dashboard_data(db, user.account.user_id)

    with _client(monkeypatch, db, ops_admin_user_id=admin.account.user_id) as client:
        resp = client.get(
            "/api/v1/ops/dashboard?window_days=7&limit=2",
            headers={"Cookie": f"mv_session={admin.token}"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["recent_runs"]
    assert data["recent_orders"]
    assert "user_id" not in data["recent_runs"][0]
    assert "user_display_name" not in data["recent_runs"][0]
    assert "user_id" not in data["recent_orders"][0]
    assert "user_display_name" not in data["recent_orders"][0]
    serialized = json.dumps(data, ensure_ascii=False)
    assert user.account.user_id not in serialized
    assert "敏感用户" not in serialized


def test_ops_dashboard_validates_query_shape(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    db = _db(tmp_path, "query.db")
    admin = _session(db, role="admin")

    with _client(monkeypatch, db, ops_admin_user_id=admin.account.user_id) as client:
        bad_window = client.get(
            "/api/v1/ops/dashboard?window_days=14",
            headers={"Cookie": f"mv_session={admin.token}"},
        )
        bad_limit = client.get(
            "/api/v1/ops/dashboard?limit=101",
            headers={"Cookie": f"mv_session={admin.token}"},
        )

    assert bad_window.status_code == 422
    assert bad_limit.status_code == 422


def test_ops_dashboard_allows_bound_admin(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    db = _db(tmp_path, "bound-admin.db")
    admin = _session(db, role="admin")

    with _client(monkeypatch, db, ops_admin_user_id=admin.account.user_id) as client:
        resp = client.get(
            "/api/v1/ops/dashboard",
            headers={"Cookie": f"mv_session={admin.token}"},
        )

    assert resp.status_code == 200


def test_ops_dashboard_rejects_unbound_admin(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    db = _db(tmp_path, "unbound-admin.db")
    bound = _session(db, role="admin")
    intruder = _session(db, role="admin")
    assert intruder.account.user_id != bound.account.user_id

    with _client(monkeypatch, db, ops_admin_user_id=bound.account.user_id) as client:
        resp = client.get(
            "/api/v1/ops/dashboard",
            headers={"Cookie": f"mv_session={intruder.token}"},
        )

    assert resp.status_code == 403
    assert "管理员权限" in resp.json()["detail"]


def test_settings_ops_edition_requires_bound_admin_user_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("METAVIEW_OPS_ADMIN_USER_ID", raising=False)
    monkeypatch.delenv("METAVIEW_APP_EDITION", raising=False)
    with pytest.raises(ValidationError):
        Settings(app_edition="ops")


def test_settings_self_edition_allows_missing_bound_admin_user_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("METAVIEW_OPS_ADMIN_USER_ID", raising=False)
    monkeypatch.delenv("METAVIEW_APP_EDITION", raising=False)
    settings = Settings(app_edition="self")
    assert settings.app_edition == "self"
    assert settings.ops_admin_user_id is None


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
    balance_cents: int = 0,
    display_name: str = "游客账户",
):
    session = _run(SqliteAccountRepository(db).get_or_create_session(None, session_days=30))
    with sqlite3.connect(db) as conn:
        conn.execute(
            """
            UPDATE accounts
            SET role = ?,
                status = ?,
                balance_cents = ?,
                display_name = ?,
                login_provider = 'wechat',
                wechat_openid = ?,
                created_at = ?
            WHERE user_id = ?
            """,
            (
                role,
                status,
                balance_cents,
                display_name,
                f"openid_{session.account.user_id}",
                _iso(3),
                session.account.user_id,
            ),
        )
        conn.commit()
    return session


def _seed_dashboard_data(db: str, user_id: str) -> None:
    playbook = json.dumps(
        {
            "title": "矩阵特征值",
            "domain": "math",
            "steps": [{"id": "s1"}, {"id": "s2"}],
        },
        ensure_ascii=False,
    )
    with sqlite3.connect(db) as conn:
        conn.executemany(
            """
            INSERT INTO pipeline_runs
                (run_id, user_id, status, prompt, playbook_json, error, review_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
            """,
            [
                ("run-today", user_id, "succeeded", "讲解矩阵", playbook, None, _iso(0)),
                ("run-yesterday", user_id, "failed", "失败任务", None, "boom", _iso(1)),
                ("run-running", user_id, "running", "运行中任务", None, None, _iso(2)),
                ("run-old", user_id, "succeeded", "旧任务", playbook, None, _iso(20)),
            ],
        )
        conn.executemany(
            """
            INSERT INTO recharge_orders
                (order_id, user_id, amount_cents, status, channel, created_at, paid_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
                ("order-paid", user_id, 1500, "paid", "wechat_native", _iso(0), _iso(0)),
                ("order-pending", user_id, 500, "pending", "wechat_native", _iso(1), None),
                ("order-old", user_id, 2000, "paid", "wechat_native", _iso(20), _iso(20)),
            ],
        )
        conn.executemany(
            """
            INSERT INTO balance_ledger
                (ledger_id, user_id, order_id, amount_cents, kind, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [
                ("ledger-consume", user_id, None, 10, "consume", _iso(0)),
                ("ledger-refund", user_id, None, 5, "refund", _iso(1)),
                ("ledger-old", user_id, None, 10, "consume", _iso(20)),
            ],
        )
        conn.commit()


def _set_login_provider(db: str, user_id: str, login_provider: str) -> None:
    with sqlite3.connect(db) as conn:
        conn.execute(
            "UPDATE accounts SET login_provider = ?, wechat_openid = NULL WHERE user_id = ?",
            (login_provider, user_id),
        )
        conn.commit()


def _metric(data: dict, metric_id: str) -> dict:
    for metric in data["kpis"]:
        if metric["id"] == metric_id:
            return metric
    raise AssertionError(f"metric {metric_id!r} not found")


def _iso(days_ago: int) -> str:
    return (
        datetime.now(timezone.utc)
        .replace(hour=12, minute=0, second=0, microsecond=0)
        - timedelta(days=days_ago)
    ).isoformat()


def _day(days_ago: int) -> str:
    return (
        datetime.now(timezone.utc).date() - timedelta(days=days_ago)
    ).isoformat()


def _run(coro):
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)
