from __future__ import annotations

import sqlite3

import pytest
from pydantic import ValidationError

from app.application.dto.pipeline_dto import PipelineRunResponse
from app.domain.models.coverage import CoverageDecision
from app.domain.models.pipeline_run import PipelineRunStatus
from app.infrastructure.persistence.db_init import init_db
from app.infrastructure.persistence.sqlite_run_repository import SqliteRunRepository


def _coverage_decision() -> CoverageDecision:
    return CoverageDecision(
        mode="specialized",
        domain="algorithm",
        confidence=0.96,
        matched_skill_ids=["algorithm_core"],
        available_tool_ids=["playbook.self_check", "scene_blueprint.compile"],
        missing_capabilities=[],
        fallback_policy="use_skill",
        reason="A registered deterministic skill covers the requested capability.",
    )


@pytest.mark.asyncio
async def test_coverage_decision_round_trips_through_run_repository(tmp_path) -> None:
    db_path = str(tmp_path / "coverage-decision.db")
    init_db(db_path)
    repo = SqliteRunRepository(db_path)
    await repo.create("run-coverage", "Explain BFS", "2026-07-11T00:00:00+00:00")

    decision = _coverage_decision()
    await repo.update_coverage_decision("run-coverage", decision.model_dump_json())
    await repo.update("run-coverage", status=PipelineRunStatus.RUNNING)

    stored = await repo.get("run-coverage")
    assert stored is not None
    assert stored.coverage_decision == decision

    listed = await repo.list()
    assert len(listed) == 1
    assert listed[0].coverage_decision == decision


def test_pipeline_run_response_exposes_coverage_decision_contract() -> None:
    response = PipelineRunResponse(
        run_id="run-contract",
        status=PipelineRunStatus.RUNNING,
        prompt="Explain BFS",
        created_at="2026-07-11T00:00:00+00:00",
        coverage_decision=_coverage_decision(),
    )

    payload = response.model_dump(mode="json")

    assert payload["coverage_decision"]["mode"] == "specialized"
    assert payload["coverage_decision"]["fallback_policy"] == "use_skill"


@pytest.mark.asyncio
async def test_invalid_stored_coverage_decision_is_rejected(tmp_path) -> None:
    db_path = str(tmp_path / "invalid-coverage-decision.db")
    init_db(db_path)
    repo = SqliteRunRepository(db_path)
    await repo.create("run-invalid", "Explain BFS", "2026-07-11T00:00:00+00:00")

    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "UPDATE pipeline_runs SET coverage_decision_json=? WHERE run_id=?",
            ('{"mode":"not-a-mode"}', "run-invalid"),
        )

    with pytest.raises(ValidationError):
        await repo.get("run-invalid")


@pytest.mark.asyncio
async def test_existing_canonical_run_migrates_coverage_as_nullable(tmp_path) -> None:
    db_path = str(tmp_path / "legacy-canonical-coverage.db")
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
            (
                "legacy-canonical",
                "succeeded",
                "Old prompt",
                "2026-07-09T00:00:00+00:00",
            ),
        )

    init_db(db_path)

    with sqlite3.connect(db_path) as conn:
        columns = {row[1] for row in conn.execute("PRAGMA table_info(pipeline_runs)")}
        value = conn.execute(
            "SELECT coverage_decision_json FROM pipeline_runs WHERE run_id=?",
            ("legacy-canonical",),
        ).fetchone()

    assert "coverage_decision_json" in columns
    assert value == (None,)

    stored = await SqliteRunRepository(db_path).get("legacy-canonical")
    assert stored is not None
    assert stored.coverage_decision is None


@pytest.mark.asyncio
async def test_request_id_run_migrates_coverage_as_nullable(tmp_path) -> None:
    db_path = str(tmp_path / "legacy-request-id-coverage.db")
    with sqlite3.connect(db_path) as conn:
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
            (
                "legacy-request-id",
                "2026-07-09T00:00:00+00:00",
                "Old request-id prompt",
                "failed",
                "boom",
                None,
            ),
        )

    init_db(db_path)

    with sqlite3.connect(db_path) as conn:
        columns = {row[1] for row in conn.execute("PRAGMA table_info(pipeline_runs)")}
        value = conn.execute(
            "SELECT coverage_decision_json FROM pipeline_runs WHERE run_id=?",
            ("legacy-request-id",),
        ).fetchone()

    assert "run_id" in columns
    assert "coverage_decision_json" in columns
    assert value == (None,)

    stored = await SqliteRunRepository(db_path).get("legacy-request-id")
    assert stored is not None
    assert stored.coverage_decision is None
