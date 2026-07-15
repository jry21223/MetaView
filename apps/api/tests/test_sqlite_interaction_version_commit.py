from __future__ import annotations

import asyncio
import sqlite3

import pytest

from app.application.ports.run_repository import InteractionVersionConflictError
from app.domain.models.director import DirectorScript
from app.domain.models.pipeline_run import PipelineRunStatus
from app.infrastructure.persistence.db_init import init_db
from app.infrastructure.persistence.sqlite_run_repository import SqliteRunRepository

_RUN_ID = "interaction-atomic-run"
_CREATED_AT = "2026-07-15T00:00:00+00:00"
_INITIAL_PLAYBOOK = '{"marker_x":1}'
_NEXT_PLAYBOOK = '{"marker_x":2}'
_NEXT_QUALITY = '{"status":"passed"}'


@pytest.mark.parametrize(
    "trigger_sql",
    [
        """
        CREATE TRIGGER fail_interaction_initial
        BEFORE INSERT ON pipeline_run_versions
        WHEN NEW.source = 'initial'
        BEGIN
            SELECT RAISE(ABORT, 'injected initial version failure');
        END
        """,
        """
        CREATE TRIGGER fail_interaction_child
        BEFORE INSERT ON pipeline_run_versions
        WHEN NEW.source = 'interaction'
        BEGIN
            SELECT RAISE(ABORT, 'injected interaction version failure');
        END
        """,
        """
        CREATE TRIGGER fail_interaction_director
        BEFORE INSERT ON pipeline_run_directors
        BEGIN
            SELECT RAISE(ABORT, 'injected director failure');
        END
        """,
        """
        CREATE TRIGGER fail_interaction_active_run
        BEFORE UPDATE OF playbook_json, quality_report_json ON pipeline_runs
        BEGIN
            SELECT RAISE(ABORT, 'injected active run failure');
        END
        """,
    ],
    ids=("initial", "interaction", "director", "active-run"),
)
def test_every_interaction_write_failure_rolls_back_without_history_pollution(
    tmp_path,
    trigger_sql: str,
) -> None:
    db_path = str(tmp_path / "fault-injection.db")
    repo = _seed_repo(db_path)
    with sqlite3.connect(db_path) as conn:
        conn.executescript(trigger_sql)

    with pytest.raises(sqlite3.IntegrityError, match="injected"):
        _run(
            _commit(
                repo,
                version_id="interaction-v1",
                expected_base_version_id=None,
                playbook_json=_NEXT_PLAYBOOK,
            )
        )

    with sqlite3.connect(db_path) as conn:
        versions = conn.execute(
            "SELECT version_id FROM pipeline_run_versions WHERE run_id=?",
            (_RUN_ID,),
        ).fetchall()
        directors = conn.execute(
            "SELECT run_id FROM pipeline_run_directors WHERE run_id=?",
            (_RUN_ID,),
        ).fetchall()
        run_row = conn.execute(
            "SELECT playbook_json, quality_report_json FROM pipeline_runs WHERE run_id=?",
            (_RUN_ID,),
        ).fetchone()

    assert versions == []
    assert directors == []
    assert run_row == (_INITIAL_PLAYBOOK, None)


def test_concurrent_repository_commits_with_one_base_have_one_winner(tmp_path) -> None:
    db_path = str(tmp_path / "cas.db")
    repo = _seed_repo(db_path)
    _run(
        _commit(
            repo,
            version_id="interaction-v1",
            expected_base_version_id=None,
            playbook_json=_NEXT_PLAYBOOK,
        )
    )

    async def _race() -> list[object]:
        return await asyncio.gather(
            _commit(
                repo,
                version_id="interaction-v2-a",
                expected_base_version_id="interaction-v1",
                playbook_json='{"marker_x":3}',
                source_playbook_json=_NEXT_PLAYBOOK,
            ),
            _commit(
                repo,
                version_id="interaction-v2-b",
                expected_base_version_id="interaction-v1",
                playbook_json='{"marker_x":4}',
                source_playbook_json=_NEXT_PLAYBOOK,
            ),
            return_exceptions=True,
        )

    results = _run(_race())
    assert sum(result is None for result in results) == 1
    assert sum(isinstance(result, InteractionVersionConflictError) for result in results) == 1

    with sqlite3.connect(db_path) as conn:
        versions = conn.execute(
            "SELECT version_id, parent_version_id, playbook_json"
            " FROM pipeline_run_versions WHERE run_id=? ORDER BY version_number",
            (_RUN_ID,),
        ).fetchall()
        active = conn.execute(
            "SELECT playbook_json FROM pipeline_runs WHERE run_id=?",
            (_RUN_ID,),
        ).fetchone()

    assert [row[0] for row in versions[:2]] == [f"{_RUN_ID}:v0", "interaction-v1"]
    assert len(versions) == 3
    assert versions[2][1] == "interaction-v1"
    assert active == (versions[2][2],)


def test_existing_head_requires_an_explicit_base(tmp_path) -> None:
    repo = _seed_repo(str(tmp_path / "strict-base.db"))
    _run(
        _commit(
            repo,
            version_id="interaction-v1",
            expected_base_version_id=None,
            playbook_json=_NEXT_PLAYBOOK,
        )
    )

    with pytest.raises(InteractionVersionConflictError):
        _run(
            _commit(
                repo,
                version_id="interaction-v2",
                expected_base_version_id=None,
                playbook_json='{"marker_x":3}',
            )
        )

    versions = _run(repo.list_versions(_RUN_ID))
    assert [version.version_id for version in versions] == [
        f"{_RUN_ID}:v0",
        "interaction-v1",
    ]


def test_source_playbook_change_is_rejected_even_before_a_version_exists(tmp_path) -> None:
    db_path = str(tmp_path / "source-cas.db")
    repo = _seed_repo(db_path)
    _run(repo.update_playbook_json(_RUN_ID, '{"marker_x":9}'))

    with pytest.raises(InteractionVersionConflictError, match="source lesson has changed"):
        _run(
            _commit(
                repo,
                version_id="interaction-v1",
                expected_base_version_id=None,
                playbook_json=_NEXT_PLAYBOOK,
            )
        )

    assert _run(repo.list_versions(_RUN_ID)) == []


def _seed_repo(db_path: str) -> SqliteRunRepository:
    init_db(db_path)
    repo = SqliteRunRepository(db_path)
    _run(repo.create(_RUN_ID, "move the tangent", _CREATED_AT))
    _run(
        repo.update(
            _RUN_ID,
            status=PipelineRunStatus.SUCCEEDED,
            playbook_json=_INITIAL_PLAYBOOK,
        )
    )
    return repo


async def _commit(
    repo: SqliteRunRepository,
    *,
    version_id: str,
    expected_base_version_id: str | None,
    playbook_json: str,
    source_playbook_json: str = _INITIAL_PLAYBOOK,
) -> None:
    await repo.commit_interaction_version(
        _RUN_ID,
        expected_base_version_id=expected_base_version_id,
        version_id=version_id,
        initial_playbook_json=source_playbook_json,
        playbook_json=playbook_json,
        quality_report_json=_NEXT_QUALITY,
        director=DirectorScript(run_id=_RUN_ID),
        summary="move tangent",
        created_at=_CREATED_AT,
    )


def _run(coro):
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)
