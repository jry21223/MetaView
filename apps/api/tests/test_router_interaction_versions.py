from __future__ import annotations

import asyncio
import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from app.config import get_settings
from app.domain.models.pipeline_run import PipelineRunStatus
from app.infrastructure.persistence.db_init import init_db
from app.infrastructure.persistence.sqlite_account_repository import SqliteAccountRepository
from app.infrastructure.persistence.sqlite_run_repository import SqliteRunRepository
from app.main import create_app
from app.presentation.dependencies import get_run_repo


def test_interaction_events_create_a_validated_child_version(monkeypatch, tmp_path) -> None:
    client, repo, run_id = _client(monkeypatch, tmp_path, _math_playbook())

    with client:
        response = client.post(
            f"/api/v1/runs/{run_id}/interaction-version",
            json=_derivative_payload(3),
        )
        history = client.get(f"/api/v1/runs/{run_id}/follow-ups").json()

    get_settings.cache_clear()
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["playbook"]["steps"][0]["snapshot"]["marker_x"] == 3
    assert data["director"]["run_id"] == run_id
    assert [version["source"] for version in history["versions"]] == [
        "initial",
        "interaction",
    ]
    assert history["versions"][1]["version_id"] == data["version_id"]
    assert history["versions"][1]["parent_version_id"] == history["versions"][0][
        "version_id"
    ]
    stored = _run(repo.get(run_id))
    assert stored is not None
    assert stored.playbook is not None
    assert stored.playbook.steps[0].snapshot.marker_x == 3  # type: ignore[union-attr]
    assert stored.quality_report is not None
    assert stored.quality_report.generator_path == "interaction_version"
    assert "interaction:quality_gate" in stored.quality_report.actions


def test_interaction_version_requires_the_current_base_after_first_apply(
    monkeypatch,
    tmp_path,
) -> None:
    client, _repo, run_id = _client(monkeypatch, tmp_path, _math_playbook())

    with client:
        first = client.post(
            f"/api/v1/runs/{run_id}/interaction-version",
            json=_derivative_payload(2),
        )
        assert first.status_code == 200, first.text
        stale_without_base = client.post(
            f"/api/v1/runs/{run_id}/interaction-version",
            json=_derivative_payload(3),
        )
        stale_wrong_base = client.post(
            f"/api/v1/runs/{run_id}/interaction-version",
            json={**_derivative_payload(3), "base_version_id": "missing"},
        )
        current = client.post(
            f"/api/v1/runs/{run_id}/interaction-version",
            json={
                **_derivative_payload(3),
                "base_version_id": first.json()["version_id"],
            },
        )

    get_settings.cache_clear()
    assert stale_without_base.status_code == 409
    assert stale_wrong_base.status_code == 409
    assert current.status_code == 200
    assert current.json()["playbook"]["steps"][0]["snapshot"]["marker_x"] == 3


def test_invalid_interaction_is_rejected_without_an_interaction_version(
    monkeypatch,
    tmp_path,
) -> None:
    client, _repo, run_id = _client(monkeypatch, tmp_path, _bfs_playbook())
    payload = _bfs_payload("missing")

    with client:
        response = client.post(
            f"/api/v1/runs/{run_id}/interaction-version",
            json=payload,
        )
        history = client.get(f"/api/v1/runs/{run_id}/follow-ups").json()

    get_settings.cache_clear()
    assert response.status_code == 422
    assert "does not exist" in response.json()["detail"]
    assert history["versions"] == []


def test_valid_bfs_interaction_syncs_code_state_and_passes_the_quality_gate(
    monkeypatch,
    tmp_path,
) -> None:
    client, repo, run_id = _client(
        monkeypatch,
        tmp_path,
        _bfs_playbook(),
        prompt="Explain a BFS queue choice",
    )

    with client:
        response = client.post(
            f"/api/v1/runs/{run_id}/interaction-version",
            json=_bfs_payload("C"),
        )

    get_settings.cache_clear()
    assert response.status_code == 200, response.text
    code = response.json()["playbook"]["steps"][0]["code_highlight"]
    assert code["variables"] == {
        "current": "C",
        "queue": "[A]",
        "visited": "{C}",
    }
    stored = _run(repo.get(run_id))
    assert stored is not None
    assert stored.quality_report is not None
    assert stored.quality_report.status not in {"repairable", "blocked"}
    assert all(
        issue.code != "code.state_mismatch"
        for issue in stored.quality_report.issues
    )


def test_ops_interaction_requires_login_and_cannot_cross_run_ownership(
    monkeypatch,
    tmp_path,
) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_APP_EDITION", "ops")
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    db = str(tmp_path / "ops-interaction.db")
    monkeypatch.setenv("METAVIEW_HISTORY_DB_PATH", db)
    init_db(db)
    repo = SqliteRunRepository(db)
    owner = _wechat_session(db)
    other = _wechat_session(db)
    run_id = "owned-interaction-run"
    _run(
        repo.create(
            run_id,
            "tangent slope",
            "2026-07-15T00:00:00+00:00",
            user_id=owner.account.user_id,
        )
    )
    _run(
        repo.update(
            run_id,
            status=PipelineRunStatus.SUCCEEDED,
            playbook_json=json.dumps(_math_playbook()),
        )
    )
    app = create_app()
    app.dependency_overrides[get_run_repo] = lambda: repo

    with TestClient(app) as client:
        missing = client.post(
            f"/api/v1/runs/{run_id}/interaction-version",
            json=_derivative_payload(2),
        )
        cross_user = client.post(
            f"/api/v1/runs/{run_id}/interaction-version",
            json=_derivative_payload(2),
            headers={"Cookie": f"mv_session={other.token}"},
        )

    get_settings.cache_clear()
    assert missing.status_code == 401
    assert cross_user.status_code == 404
    assert _run(repo.list_versions(run_id)) == []
    stored = _run(repo.get(run_id, user_id=owner.account.user_id))
    assert stored is not None
    assert stored.playbook is not None
    assert stored.playbook.steps[0].snapshot.marker_x == 1  # type: ignore[union-attr]


def test_concurrent_interactions_from_the_same_base_commit_only_one_child(
    monkeypatch,
    tmp_path,
) -> None:
    client, repo, run_id = _client(monkeypatch, tmp_path, _math_playbook())

    with client:
        first = client.post(
            f"/api/v1/runs/{run_id}/interaction-version",
            json=_derivative_payload(2),
        )
        assert first.status_code == 200, first.text
        base_version_id = first.json()["version_id"]

        def _post(value: float):
            return client.post(
                f"/api/v1/runs/{run_id}/interaction-version",
                json={
                    **_derivative_payload(value),
                    "base_version_id": base_version_id,
                },
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(executor.map(_post, (3, 4)))

        history = client.get(f"/api/v1/runs/{run_id}/follow-ups").json()

    get_settings.cache_clear()
    assert sorted(response.status_code for response in responses) == [200, 409]
    successful = next(response for response in responses if response.status_code == 200)
    conflict = next(response for response in responses if response.status_code == 409)
    assert "no longer current" in conflict.json()["detail"]
    assert [version["source"] for version in history["versions"]] == [
        "initial",
        "interaction",
        "interaction",
    ]
    assert sum(version["is_head"] for version in history["versions"]) == 1
    stored = _run(repo.get(run_id))
    assert stored is not None
    assert stored.playbook is not None
    assert stored.playbook.steps[0].snapshot.marker_x == successful.json()["playbook"][  # type: ignore[union-attr]
        "steps"
    ][0]["snapshot"]["marker_x"]


def _client(monkeypatch, tmp_path, playbook: dict, *, prompt: str = "tangent slope"):
    get_settings.cache_clear()
    monkeypatch.setenv("METAVIEW_RATE_LIMIT_ENABLED", "false")
    db = str(tmp_path / "interaction-versions.db")
    init_db(db)
    repo = SqliteRunRepository(db)
    run_id = "run-interaction"
    _run(repo.create(run_id, prompt, "2026-07-15T00:00:00+00:00"))
    _run(
        repo.update(
            run_id,
            status=PipelineRunStatus.SUCCEEDED,
            playbook_json=json.dumps(playbook),
        )
    )
    app = create_app()
    app.dependency_overrides[get_run_repo] = lambda: repo
    return TestClient(app), repo, run_id


def _derivative_payload(value: float) -> dict:
    return {
        "manifest_version": "1",
        "events": [
            {
                "adapter_id": "math.derivative-tangent",
                "step_id": "plot",
                "target_id": "step:plot:marker-x",
                "action": "set-value",
                "value": value,
                "sequence": 1,
            }
        ],
    }


def _bfs_payload(value: str) -> dict:
    return {
        "manifest_version": "1",
        "events": [
            {
                "adapter_id": "algorithm.bfs",
                "step_id": "graph",
                "target_id": "step:graph:start-node",
                "action": "select",
                "value": value,
                "sequence": 1,
            }
        ],
    }


def _math_playbook() -> dict:
    snapshot = {
        "kind": "math_plot",
        "curves": [
            {"expression": "x^2", "semantic_role": "curve"},
            {
                "expression": "2*x - 1",
                "semantic_role": "tangent",
                "emphasis": "accent",
            },
        ],
        "x_min": -5,
        "x_max": 5,
        "y_min": -1,
        "y_max": 25,
        "marker_x": 1,
    }
    return {
        "schema_version": "1.0.0",
        "fps": 30,
        "total_frames": 60,
        "domain": "math",
        "title": "Derivative tangent",
        "summary": "Move the tangent point and compare local slope.",
        "parameter_controls": [],
        "initial_data": {},
        "steps": [
            {
                "step_id": "plot",
                "end_frame": 60,
                "title": "Move the tangent point",
                "voiceover_text": "Tangent slope.",
                "snapshot": snapshot,
                "layers": [{"body": snapshot}],
                "tokens": [],
            }
        ],
    }


def _bfs_playbook() -> dict:
    graph = {
        "kind": "graph_scene",
        "nodes": [{"id": node} for node in ("A", "B", "C")],
        "edges": [
            {"id": "AB", "source": "A", "target": "B"},
            {"id": "AC", "source": "A", "target": "C"},
        ],
    }
    return {
        "schema_version": "1.0.0",
        "fps": 30,
        "total_frames": 60,
        "domain": "algorithm",
        "algorithm_id": "bfs",
        "title": "Breadth-first search",
        "summary": "Choose a start node and inspect the queue.",
        "parameter_controls": [],
        "initial_data": {},
        "steps": [
            {
                "step_id": "graph",
                "end_frame": 60,
                "title": "Choose a start node",
                "voiceover_text": "BFS visits the graph level by level.",
                "snapshot": graph,
                "layers": [{"body": graph}],
                "code_highlight": {
                    "language": "python",
                    "lines": ["while queue:"],
                    "active_lines": [0],
                    "active_line": 0,
                    "variables": {
                        "current": "A",
                        "queue": "[]",
                        "visited": "{}",
                    },
                },
                "tokens": [],
            }
        ],
    }


def _run(coro):
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


def _wechat_session(db: str):
    session = _run(SqliteAccountRepository(db).get_or_create_session(None, session_days=30))
    with sqlite3.connect(db) as conn:
        conn.execute(
            """
            UPDATE accounts
            SET login_provider = 'wechat',
                display_name = '微信用户',
                wechat_openid = ?
            WHERE user_id = ?
            """,
            (f"openid_{session.account.user_id}", session.account.user_id),
        )
        conn.commit()
    return session
