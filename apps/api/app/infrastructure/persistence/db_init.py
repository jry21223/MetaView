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


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}


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
        _migrate_legacy_pipeline_runs(conn)
        try:
            conn.execute("ALTER TABLE pipeline_runs ADD COLUMN review_json TEXT")
        except sqlite3.OperationalError as exc:
            if "duplicate column name" not in str(exc).lower():
                raise
        conn.commit()
