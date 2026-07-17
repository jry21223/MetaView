from __future__ import annotations

import sqlite3

import pytest

from app.domain.models.lesson_plan import LessonPlan, SceneIntent
from app.domain.models.pipeline_run import PipelineRunStatus
from app.infrastructure.persistence.db_init import init_db
from app.infrastructure.persistence.sqlite_run_repository import SqliteRunRepository


def _lesson_plan() -> LessonPlan:
    return LessonPlan(
        schema_version="1.0.0",
        domain="algorithm",
        title="Breadth-first traversal",
        learning_objectives=["Explain why BFS uses a FIFO queue."],
        prerequisites=["Know what a graph node and edge are."],
        misconceptions=["BFS follows one branch to its deepest node first."],
        expected_conclusion="BFS visits the graph level by level using a FIFO queue.",
        lesson_arc="state_transition",
        scenes=[
            SceneIntent(
                scene_id="introduce_queue",
                teaching_goal="Connect level-order traversal to a FIFO queue.",
                strategy="intuition",
                required_fact_ids=["bfs_fifo"],
                required_visual_roles=["node", "edge", "queue"],
                preferred_scene_type="bfs_graph",
                narration_goal="Explain why newly discovered nodes wait at the queue tail.",
            )
        ],
    )


@pytest.mark.asyncio
async def test_lesson_plan_round_trips_through_run_repository(tmp_path) -> None:
    db_path = str(tmp_path / "lesson-plan.db")
    init_db(db_path)
    repo = SqliteRunRepository(db_path)
    await repo.create("run-lesson", "Explain BFS", "2026-07-10T00:00:00+00:00")

    plan = _lesson_plan()
    await repo.update_lesson_plan("run-lesson", plan.model_dump_json())
    await repo.update("run-lesson", status=PipelineRunStatus.RUNNING)

    stored = await repo.get("run-lesson")
    assert stored is not None
    assert stored.lesson_plan == plan

    listed = await repo.list()
    assert len(listed) == 1
    assert listed[0].lesson_plan == plan


@pytest.mark.asyncio
async def test_existing_run_without_lesson_plan_migrates_as_nullable(tmp_path) -> None:
    db_path = str(tmp_path / "legacy-lesson-plan.db")
    with sqlite3.connect(db_path) as conn:
        conn.execute("""
            CREATE TABLE pipeline_runs (
                run_id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                prompt TEXT NOT NULL,
                playbook_json TEXT,
                error TEXT,
                review_json TEXT,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute(
            "INSERT INTO pipeline_runs"
            " (run_id, status, prompt, created_at) VALUES (?, ?, ?, ?)",
            ("legacy-run", "succeeded", "Old prompt", "2026-07-09T00:00:00+00:00"),
        )

    init_db(db_path)

    with sqlite3.connect(db_path) as conn:
        columns = {row[1] for row in conn.execute("PRAGMA table_info(pipeline_runs)")}
        value = conn.execute(
            "SELECT lesson_plan_json FROM pipeline_runs WHERE run_id=?",
            ("legacy-run",),
        ).fetchone()

    assert "lesson_plan_json" in columns
    assert value == (None,)

    stored = await SqliteRunRepository(db_path).get("legacy-run")
    assert stored is not None
    assert stored.lesson_plan is None
