from __future__ import annotations

import os
import sqlite3


def _create_pipeline_runs(conn: sqlite3.Connection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS pipeline_runs (
            run_id      TEXT PRIMARY KEY,
            status      TEXT NOT NULL,
            prompt      TEXT NOT NULL,
            playbook_json TEXT,
            error       TEXT,
            review_json TEXT,
            created_at  TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS pipeline_run_followups (
            followup_id    TEXT PRIMARY KEY,
            run_id         TEXT NOT NULL,
            user_message   TEXT NOT NULL,
            assistant_reply TEXT NOT NULL,
            change_summary TEXT NOT NULL,
            patch_json     TEXT NOT NULL,
            version_id     TEXT,
            created_at     TEXT NOT NULL,
            FOREIGN KEY(run_id) REFERENCES pipeline_runs(run_id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS pipeline_run_versions (
            version_id    TEXT PRIMARY KEY,
            run_id        TEXT NOT NULL,
            version_number INTEGER NOT NULL,
            playbook_json TEXT NOT NULL,
            source        TEXT NOT NULL,
            followup_id   TEXT,
            parent_version_id TEXT,
            summary       TEXT,
            created_at    TEXT NOT NULL,
            FOREIGN KEY(run_id) REFERENCES pipeline_runs(run_id),
            FOREIGN KEY(followup_id) REFERENCES pipeline_run_followups(followup_id),
            UNIQUE(run_id, version_number)
        )
    """)
    _add_column_if_missing(conn, "pipeline_run_versions", "parent_version_id", "TEXT")
    _add_column_if_missing(conn, "pipeline_run_versions", "summary", "TEXT")


def _create_accounts(conn: sqlite3.Connection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            user_id      TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            avatar_url   TEXT,
            login_provider TEXT NOT NULL,
            status       TEXT NOT NULL DEFAULT 'enabled',
            role         TEXT NOT NULL DEFAULT 'user',
            wechat_openid TEXT UNIQUE,
            wechat_unionid TEXT UNIQUE,
            balance_cents INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL,
            last_login_at TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS account_sessions (
            token_hash TEXT PRIMARY KEY,
            user_id    TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES accounts(user_id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS wechat_oauth_states (
            state      TEXT PRIMARY KEY,
            token_hash TEXT,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS recharge_orders (
            order_id       TEXT PRIMARY KEY,
            user_id        TEXT NOT NULL,
            amount_cents   INTEGER NOT NULL,
            status         TEXT NOT NULL,
            channel        TEXT NOT NULL,
            provider_order_id TEXT,
            code_url       TEXT,
            created_at     TEXT NOT NULL,
            paid_at        TEXT,
            FOREIGN KEY(user_id) REFERENCES accounts(user_id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS balance_ledger (
            ledger_id    TEXT PRIMARY KEY,
            user_id      TEXT NOT NULL,
            order_id     TEXT,
            amount_cents INTEGER NOT NULL,
            kind         TEXT NOT NULL,
            created_at   TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES accounts(user_id),
            FOREIGN KEY(order_id) REFERENCES recharge_orders(order_id)
        )
    """)
    _add_column_if_missing(conn, "accounts", "status", "TEXT NOT NULL DEFAULT 'enabled'")
    _add_column_if_missing(conn, "accounts", "role", "TEXT NOT NULL DEFAULT 'user'")
    _add_column_if_missing(conn, "accounts", "last_login_at", "TEXT")
    _add_column_if_missing(conn, "recharge_orders", "provider_order_id", "TEXT")
    conn.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_recharge_provider_order_id
        ON recharge_orders(provider_order_id)
        WHERE provider_order_id IS NOT NULL
    """)


def _create_newapi_topups(conn: sqlite3.Connection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS newapi_topup_intents (
            intent_id         TEXT PRIMARY KEY,
            order_id          TEXT NOT NULL UNIQUE,
            newapi_user_id    INTEGER NOT NULL,
            amount_cents      INTEGER NOT NULL,
            quota_delta       INTEGER NOT NULL,
            state             TEXT NOT NULL,
            return_url        TEXT NOT NULL,
            status            TEXT NOT NULL,
            code_url          TEXT,
            provider_order_id TEXT,
            receipt_code_hash TEXT,
            created_at        TEXT NOT NULL,
            expires_at        TEXT NOT NULL,
            paid_at           TEXT,
            verified_at       TEXT,
            acked_at          TEXT
        )
    """)
    conn.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_newapi_topup_provider_order_id
        ON newapi_topup_intents(provider_order_id)
        WHERE provider_order_id IS NOT NULL
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_newapi_topup_state
        ON newapi_topup_intents(state)
    """)


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}


def _add_column_if_missing(
    conn: sqlite3.Connection,
    table: str,
    column: str,
    definition: str,
) -> None:
    if column not in _columns(conn, table):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def _migrate_legacy_pipeline_runs(conn: sqlite3.Connection) -> None:
    cols = _columns(conn, "pipeline_runs")
    if "run_id" in cols or "request_id" not in cols:
        return

    conn.execute("ALTER TABLE pipeline_runs RENAME TO pipeline_runs_legacy")
    _create_pipeline_runs(conn)
    legacy_cols = _columns(conn, "pipeline_runs_legacy")
    status_expr = (
        "COALESCE(NULLIF(status, ''), 'succeeded')"
        if "status" in legacy_cols
        else "'succeeded'"
    )
    error_expr = "error_message" if "error_message" in legacy_cols else "NULL"
    review_expr = "review_json" if "review_json" in legacy_cols else "NULL"
    conn.execute(f"""
        INSERT OR IGNORE INTO pipeline_runs
            (run_id, status, prompt, playbook_json, error, review_json, created_at)
        SELECT
            request_id,
            {status_expr},
            prompt,
            NULL,
            {error_expr},
            {review_expr},
            created_at
        FROM pipeline_runs_legacy
    """)


def init_db(db_path: str) -> None:
    os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        _create_pipeline_runs(conn)
        _create_accounts(conn)
        _create_newapi_topups(conn)
        _migrate_legacy_pipeline_runs(conn)
        try:
            conn.execute("ALTER TABLE pipeline_runs ADD COLUMN review_json TEXT")
        except sqlite3.OperationalError as exc:
            if "duplicate column name" not in str(exc).lower():
                raise
        conn.commit()
