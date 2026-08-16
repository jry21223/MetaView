from __future__ import annotations

import importlib.util
import json
import sqlite3
from pathlib import Path

import pytest

SCRIPT_PATH = Path(__file__).resolve().parents[3] / "scripts" / "pipeline_observability.py"
if not SCRIPT_PATH.exists():
    pytest.skip(f"script not found: {SCRIPT_PATH}", allow_module_level=True)

_spec = importlib.util.spec_from_file_location("pipeline_observability", SCRIPT_PATH)
assert _spec and _spec.loader is not None
obs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(obs)

SCHEMA = """
CREATE TABLE pipeline_runs (
    run_id TEXT PRIMARY KEY,
    user_id TEXT,
    status TEXT NOT NULL,
    prompt TEXT NOT NULL,
    playbook_json TEXT,
    error TEXT,
    review_json TEXT,
    quality_report_json TEXT,
    lesson_plan_json TEXT,
    coverage_decision_json TEXT,
    created_at TEXT NOT NULL
)
"""


def _make_db(tmp_path: Path, rows: list[tuple]) -> Path:
    db = tmp_path / "runs.db"
    conn = sqlite3.connect(db)
    conn.execute(SCHEMA)
    conn.executemany(
        "INSERT INTO pipeline_runs"
        " (run_id, status, prompt, review_json, quality_report_json, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        rows,
    )
    conn.commit()
    conn.close()
    return db


def _review(status: str, actions: list[str]) -> str:
    return json.dumps({"status": status, "summary": "s", "issues": [], "actions": actions})


def _quality(status: str, generator_path: str, issues: list[dict]) -> str:
    return json.dumps(
        {
            "status": status,
            "generator_path": generator_path,
            "coverage_mode": "unknown",
            "issues": issues,
            "scores": {},
            "repair_targets": [],
            "summary": "s",
            "actions": [],
            "attempts": 0,
        }
    )


def _warning_issue(code: str) -> dict:
    return {"code": code, "severity": "warning", "path": "steps[0].end_frame", "message": "m"}


def test_collect_metrics_from_fixture(tmp_path: Path) -> None:
    rows = [
        (
            "run-a",
            "succeeded",
            "p",
            _review("clean", ["generator:agent", "agent:self_check:clean", "reviewer:status:clean"]),
            _quality("clean", "agent", []),
            "2026-07-01T00:00:00+00:00",
        ),
        (
            "run-b",
            "failed",
            "p",
            _review(
                "warnings",
                [
                    "generator:agent",
                    "quality:repair_attempt:1",
                    "quality:repair_attempt:2",
                    "reviewer:repair_attempt:1",
                    "quality:warning_repair_attempt:1",
                ],
            ),
            _quality(
                "warnings",
                "agent",
                [_warning_issue("timeline.voiceover_too_short"), _warning_issue("snapshot.narration_mismatch")],
            ),
            "2026-07-02T00:00:00+00:00",
        ),
        (
            "run-c",
            "succeeded",
            "p",
            _review("clean", ["generator:agent", "quality:warning_repair_attempt:1"]),
            _quality("clean", "agent", []),
            "2026-07-03T00:00:00+00:00",
        ),
        (
            "run-d",
            "succeeded",
            "p",
            _review("warnings", ["router:skill_pack", "router:skill_id:calculus_core"]),
            _quality(
                "warnings",
                "skill_pack",
                [
                    _warning_issue("timeline.voiceover_too_short"),
                    _warning_issue("timeline.voiceover_too_short"),
                ],
            ),
            "2026-07-04T00:00:00+00:00",
        ),
        (
            "run-e",
            "succeeded",
            "p",
            _review("repaired", ["repair_attempt_1", "repair_attempt_2"]),
            None,
            "2026-07-05T00:00:00+00:00",
        ),
        (
            "run-f",
            "failed",
            "p",
            _review("blocked", ["quality:repair_exhausted"]),
            None,
            "2026-07-06T00:00:00+00:00",
        ),
    ]
    db = _make_db(tmp_path, rows)
    runs = obs.load_runs(str(db))
    stats = obs.collect(runs)

    counts = stats["run_counts"]
    assert counts["total"] == 6
    assert counts["by_status"] == {"failed": 2, "succeeded": 4}
    assert counts["with_quality_report"] == 4

    paths = stats["provider_paths"]
    assert paths["generator_path"] == {"agent": 3, "skill_pack": 1, "unknown": 2}
    assert paths["agent_router_skill_ids"] == {}

    repair = stats["repair_stats"]
    assert repair["quality_repair_attempts"] == {"0": 5, "2": 1}
    assert repair["reviewer_repair_attempts"] == {"0": 5, "1": 1}
    assert repair["self_repair_attempts"] == {"0": 6}
    assert repair["cir_repair_attempts"] == {"0": 5, "2": 1}
    assert repair["warning_repair_attempts"] == 2
    assert repair["repair_exhausted"] == 1
    assert repair["repair_unavailable"] == 0

    codes = stats["warning_codes"]
    assert codes["timeline.voiceover_too_short"] == {"issues": 3, "runs": 2}
    assert codes["snapshot.narration_mismatch"] == {"issues": 1, "runs": 1}

    success = stats["warning_repair_success"]["timeline.voiceover_too_short"]
    assert success == {"attempted_runs": 2, "cleared_runs": 1, "still_warning_runs": 1, "missing_final_report": 0}


def test_collect_agent_skill_id_hits_only_for_agent_runs(tmp_path: Path) -> None:
    rows = [
        (
            "run-a",
            "succeeded",
            "p",
            _review("clean", ["generator:agent", "router:skill_id:calculus_core"]),
            _quality("clean", "agent", []),
            "2026-07-01T00:00:00+00:00",
        ),
        (
            "run-b",
            "succeeded",
            "p",
            _review("warnings", ["router:skill_pack", "router:skill_id:physics_mechanics"]),
            _quality("warnings", "skill_pack", []),
            "2026-07-02T00:00:00+00:00",
        ),
    ]
    db = _make_db(tmp_path, rows)
    stats = obs.collect(obs.load_runs(str(db)))
    assert stats["provider_paths"]["agent_router_skill_ids"] == {"calculus_core": 1}


def test_empty_database_yields_zeroed_metrics(tmp_path: Path) -> None:
    db = _make_db(tmp_path, [])
    stats = obs.collect(obs.load_runs(str(db)))
    assert stats["run_counts"]["total"] == 0
    assert stats["run_counts"]["by_status"] == {}
    assert stats["warning_repair_success"]["timeline.voiceover_too_short"] == {
        "attempted_runs": 0,
        "cleared_runs": 0,
        "still_warning_runs": 0,
        "missing_final_report": 0,
    }


def test_missing_database_raises(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="database not found"):
        obs.load_runs(str(tmp_path / "nope.db"))


def test_missing_schema_raises(tmp_path: Path) -> None:
    db = tmp_path / "other.db"
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE unrelated (id TEXT)")
    conn.commit()
    conn.close()
    with pytest.raises(ValueError, match="no pipeline_runs table"):
        obs.load_runs(str(db))


def test_corrupt_json_is_tolerated(tmp_path: Path) -> None:
    db = tmp_path / "runs.db"
    conn = sqlite3.connect(db)
    conn.execute(SCHEMA)
    conn.execute(
        "INSERT INTO pipeline_runs (run_id, status, prompt, review_json, created_at)"
        " VALUES (?, ?, ?, ?, ?)",
        ("run-x", "failed", "p", "{not json", "2026-07-01T00:00:00+00:00"),
    )
    conn.commit()
    conn.close()
    stats = obs.collect(obs.load_runs(str(db)))
    assert stats["run_counts"] == {"total": 1, "by_status": {"failed": 1}, "with_quality_report": 0}
    assert stats["actions"] == {}
