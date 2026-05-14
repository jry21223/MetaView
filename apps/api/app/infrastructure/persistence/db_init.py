from __future__ import annotations

import os
import sqlite3


def init_db(db_path: str) -> None:
    os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
    with sqlite3.connect(db_path) as conn:
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
        try:
            conn.execute("ALTER TABLE pipeline_runs ADD COLUMN review_json TEXT")
        except sqlite3.OperationalError as exc:
            if "duplicate column name" not in str(exc).lower():
                raise
        conn.commit()
