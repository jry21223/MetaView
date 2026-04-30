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
                created_at  TEXT NOT NULL
            )
        """)
        conn.commit()
