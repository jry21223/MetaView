from __future__ import annotations

import asyncio
import sqlite3

from app.domain.models.director import DirectorBeat, DirectorScript
from app.infrastructure.persistence.db_init import init_db
from app.infrastructure.persistence.sqlite_director_repository import (
    SqliteRunDirectorRepository,
)


def test_sqlite_director_repository_upserts_gets_and_deletes(tmp_path) -> None:
    db = str(tmp_path / "directors.db")
    init_db(db)
    repo = SqliteRunDirectorRepository(db)

    _run(repo.upsert(_director("run-1", "Original voice."), "2026-06-05T00:00:00+00:00"))
    _run(repo.upsert(_director("run-1", "Updated voice."), "2026-06-05T00:01:00+00:00"))

    stored = _run(repo.get("run-1"))
    assert stored is not None
    assert stored.beats[0].voiceover_text == "Updated voice."

    assert _run(repo.delete("run-1")) is True
    assert _run(repo.get("run-1")) is None


def test_sqlite_director_repository_initializes_legacy_database(tmp_path) -> None:
    db = str(tmp_path / "legacy.db")
    with sqlite3.connect(db) as conn:
        conn.execute("""
            CREATE TABLE pipeline_runs (
                run_id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                prompt TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)

    init_db(db)

    with sqlite3.connect(db) as conn:
        cols = {row[1] for row in conn.execute("PRAGMA table_info(pipeline_run_directors)")}

    assert {"run_id", "director_json", "source", "created_at", "updated_at"} <= cols


def test_sqlite_director_repository_treats_invalid_json_as_absent(tmp_path) -> None:
    db = str(tmp_path / "invalid.db")
    init_db(db)
    with sqlite3.connect(db) as conn:
        conn.execute(
            "INSERT INTO pipeline_run_directors"
            " (run_id, director_json, source, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?)",
            ("run-bad", '{"run_id": ""}', "rule", "now", "now"),
        )

    repo = SqliteRunDirectorRepository(db)

    assert _run(repo.get("run-bad")) is None


def _director(run_id: str, voiceover: str) -> DirectorScript:
    return DirectorScript(
        run_id=run_id,
        beats=[
            DirectorBeat(
                beat_id="beat_01",
                step_id="s1",
                start_frame=0,
                end_frame=30,
                intent="hook",
                shot_type="medium",
                camera_motion="push_in",
                pacing="normal",
                voiceover_text=voiceover,
            )
        ],
    )


def _run(coro):
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)
