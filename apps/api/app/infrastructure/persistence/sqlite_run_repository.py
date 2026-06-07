from __future__ import annotations

import asyncio
import hashlib
import json
import sqlite3

from app.application.dto.followup_dto import RunFollowUpRecord, RunVersionRecord
from app.application.dto.pipeline_dto import PipelineRunResponse
from app.domain.models.pipeline_run import PipelineRunStatus
from app.domain.models.playbook import PlaybookScript
from app.domain.models.review import CirReviewReport, PlaybookReviewVerdict


class SqliteRunRepository:
    def __init__(self, db_path: str) -> None:
        self._db_path = db_path

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    async def create(
        self,
        run_id: str,
        prompt: str,
        created_at: str,
        user_id: str | None = None,
    ) -> None:
        def _sync() -> None:
            with self._connect() as conn:
                conn.execute(
                    "INSERT INTO pipeline_runs"
                    " (run_id, user_id, status, prompt, created_at) VALUES (?, ?, ?, ?, ?)",
                    (run_id, user_id, PipelineRunStatus.QUEUED.value, prompt, created_at),
                )
                conn.commit()

        await asyncio.to_thread(_sync)

    async def update(
        self,
        run_id: str,
        *,
        status: PipelineRunStatus,
        playbook_json: str | None = None,
        error: str | None = None,
        review_json: str | None = None,
    ) -> None:
        def _sync() -> None:
            with self._connect() as conn:
                conn.execute(
                    "UPDATE pipeline_runs"
                    " SET status=?, playbook_json=?, error=?, review_json=?"
                    " WHERE run_id=?",
                    (status.value, playbook_json, error, review_json, run_id),
                )
                conn.commit()

        await asyncio.to_thread(_sync)

    async def get(
        self,
        run_id: str,
        user_id: str | None = None,
    ) -> PipelineRunResponse | None:
        def _sync() -> sqlite3.Row | None:
            with self._connect() as conn:
                if user_id is not None:
                    return conn.execute(
                        "SELECT * FROM pipeline_runs WHERE run_id=? AND user_id=?",
                        (run_id, user_id),
                    ).fetchone()
                return conn.execute(
                    "SELECT * FROM pipeline_runs WHERE run_id=?", (run_id,)
                ).fetchone()

        row = await asyncio.to_thread(_sync)
        if row is None:
            return None
        return _row_to_response(row)

    async def update_playbook_json(self, run_id: str, playbook_json: str) -> None:
        def _sync() -> None:
            with self._connect() as conn:
                conn.execute(
                    "UPDATE pipeline_runs SET playbook_json=? WHERE run_id=?",
                    (playbook_json, run_id),
                )
                conn.commit()

        await asyncio.to_thread(_sync)

    async def list(
        self,
        limit: int = 50,
        user_id: str | None = None,
    ) -> list[PipelineRunResponse]:
        def _sync() -> list[sqlite3.Row]:
            with self._connect() as conn:
                if user_id is not None:
                    return conn.execute(
                        "SELECT * FROM pipeline_runs"
                        " WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
                        (user_id, limit),
                    ).fetchall()
                return conn.execute(
                    "SELECT * FROM pipeline_runs ORDER BY created_at DESC LIMIT ?", (limit,)
                ).fetchall()

        rows = await asyncio.to_thread(_sync)
        return [_row_to_response(r) for r in rows]

    async def delete(self, run_id: str, user_id: str | None = None) -> bool:
        def _sync() -> bool:
            with self._connect() as conn:
                if user_id is not None:
                    owned = conn.execute(
                        "SELECT run_id FROM pipeline_runs WHERE run_id=? AND user_id=?",
                        (run_id, user_id),
                    ).fetchone()
                    if owned is None:
                        return False
                conn.execute(
                    "DELETE FROM pipeline_run_directors WHERE run_id=?", (run_id,)
                )
                conn.execute(
                    "DELETE FROM pipeline_run_versions WHERE run_id=?", (run_id,)
                )
                conn.execute(
                    "DELETE FROM pipeline_run_followups WHERE run_id=?", (run_id,)
                )
                cursor = conn.execute(
                    "DELETE FROM pipeline_runs WHERE run_id=?", (run_id,)
                )
                conn.commit()
                return cursor.rowcount > 0

        return await asyncio.to_thread(_sync)

    async def ensure_initial_version(
        self, run_id: str, playbook_json: str, created_at: str
    ) -> str:
        def _sync() -> str:
            with self._connect() as conn:
                existing = conn.execute(
                    "SELECT version_id FROM pipeline_run_versions"
                    " WHERE run_id=? AND version_number=0",
                    (run_id,),
                ).fetchone()
                if existing is not None:
                    return str(existing["version_id"])
                version_id = f"{run_id}:v0"
                conn.execute(
                    "INSERT INTO pipeline_run_versions"
                    " (version_id, run_id, version_number, playbook_json,"
                    " source, followup_id, parent_version_id, summary, created_at)"
                    " VALUES (?, ?, 0, ?, 'initial', NULL, NULL, ?, ?)",
                    (version_id, run_id, playbook_json, "initial playbook", created_at),
                )
                conn.commit()
                return version_id

        return await asyncio.to_thread(_sync)

    async def append_followup(
        self,
        run_id: str,
        *,
        followup_id: str,
        user_message: str,
        assistant_reply: str,
        change_summary: str,
        patch_json: str,
        created_at: str,
    ) -> None:
        def _sync() -> None:
            with self._connect() as conn:
                conn.execute(
                    "INSERT INTO pipeline_run_followups"
                    " (followup_id, run_id, user_message, assistant_reply,"
                    " change_summary, patch_json, version_id, created_at)"
                    " VALUES (?, ?, ?, ?, ?, ?, NULL, ?)",
                    (
                        followup_id,
                        run_id,
                        user_message,
                        assistant_reply,
                        change_summary,
                        patch_json,
                        created_at,
                    ),
                )
                conn.commit()

        await asyncio.to_thread(_sync)

    async def append_version(
        self,
        run_id: str,
        *,
        version_id: str,
        playbook_json: str,
        source: str,
        followup_id: str | None,
        parent_version_id: str | None,
        summary: str,
        created_at: str,
    ) -> int:
        def _sync() -> int:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT COALESCE(MAX(version_number), -1) + 1 AS next_number"
                    " FROM pipeline_run_versions WHERE run_id=?",
                    (run_id,),
                ).fetchone()
                version_number = int(row["next_number"] if row is not None else 0)
                conn.execute(
                    "INSERT INTO pipeline_run_versions"
                    " (version_id, run_id, version_number, playbook_json,"
                    " source, followup_id, parent_version_id, summary, created_at)"
                    " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        version_id,
                        run_id,
                        version_number,
                        playbook_json,
                        source,
                        followup_id,
                        parent_version_id,
                        summary,
                        created_at,
                    ),
                )
                conn.commit()
                return version_number

        return await asyncio.to_thread(_sync)

    async def attach_followup_version(self, followup_id: str, version_id: str) -> None:
        def _sync() -> None:
            with self._connect() as conn:
                conn.execute(
                    "UPDATE pipeline_run_followups SET version_id=? WHERE followup_id=?",
                    (version_id, followup_id),
                )
                conn.commit()

        await asyncio.to_thread(_sync)

    async def get_version_playbook(self, run_id: str, version_id: str) -> str | None:
        def _sync() -> str | None:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT playbook_json FROM pipeline_run_versions"
                    " WHERE run_id=? AND version_id=?",
                    (run_id, version_id),
                ).fetchone()
                return str(row["playbook_json"]) if row is not None else None

        return await asyncio.to_thread(_sync)

    async def get_head_version_id(self, run_id: str) -> str | None:
        def _sync() -> str | None:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT version_id FROM pipeline_run_versions"
                    " WHERE run_id=? ORDER BY version_number DESC LIMIT 1",
                    (run_id,),
                ).fetchone()
                return str(row["version_id"]) if row is not None else None

        return await asyncio.to_thread(_sync)

    async def list_followups(self, run_id: str) -> list[RunFollowUpRecord]:
        def _sync() -> list[sqlite3.Row]:
            with self._connect() as conn:
                return conn.execute(
                    "SELECT * FROM pipeline_run_followups"
                    " WHERE run_id=? ORDER BY created_at ASC",
                    (run_id,),
                ).fetchall()

        rows = await asyncio.to_thread(_sync)
        return [_followup_row_to_record(row) for row in rows]

    async def list_versions(self, run_id: str) -> list[RunVersionRecord]:
        def _sync() -> tuple[list[sqlite3.Row], str | None]:
            with self._connect() as conn:
                head = conn.execute(
                    "SELECT version_id FROM pipeline_run_versions"
                    " WHERE run_id=? ORDER BY version_number DESC LIMIT 1",
                    (run_id,),
                ).fetchone()
                rows = conn.execute(
                    "SELECT v.version_id, v.run_id, v.version_number, v.source,"
                    " v.followup_id, v.parent_version_id, v.summary, v.created_at,"
                    " f.change_summary AS followup_summary"
                    " FROM pipeline_run_versions AS v"
                    " LEFT JOIN pipeline_run_followups AS f"
                    " ON f.followup_id = v.followup_id"
                    " WHERE v.run_id=? ORDER BY v.created_at ASC, v.version_number ASC",
                    (run_id,),
                ).fetchall()
                head_version_id = str(head["version_id"]) if head is not None else None
                return rows, head_version_id

        rows, head_version_id = await asyncio.to_thread(_sync)
        return [_version_row_to_record(row, head_version_id) for row in rows]


def _row_to_response(row: sqlite3.Row) -> PipelineRunResponse:
    playbook = None
    if row["playbook_json"]:
        playbook = PlaybookScript.model_validate_json(row["playbook_json"])
    review = None
    if "review_json" in row.keys() and row["review_json"]:
        review = _parse_review_json(row["review_json"])
    return PipelineRunResponse(
        run_id=row["run_id"],
        status=PipelineRunStatus(row["status"]),
        prompt=row["prompt"] or "",
        playbook=playbook,
        error=row["error"],
        created_at=row["created_at"],
        review=review,
    )


def _parse_review_json(raw: str) -> CirReviewReport | PlaybookReviewVerdict:
    try:
        data = json.loads(raw)
    except ValueError:
        return CirReviewReport.model_validate_json(raw)
    if isinstance(data, dict) and (
        data.get("status") == "blocked" or "summary" in data or _has_playbook_issue(data)
    ):
        return PlaybookReviewVerdict.model_validate(data)
    return CirReviewReport.model_validate(data)


def _has_playbook_issue(data: dict) -> bool:
    issues = data.get("issues")
    return isinstance(issues, list) and any(
        isinstance(issue, dict) and "requires_repair" in issue
        for issue in issues
    )


def _followup_row_to_record(row: sqlite3.Row) -> RunFollowUpRecord:
    return RunFollowUpRecord(
        followup_id=row["followup_id"],
        run_id=row["run_id"],
        user_message=row["user_message"],
        assistant_reply=row["assistant_reply"],
        change_summary=row["change_summary"],
        patch_json=row["patch_json"],
        version_id=row["version_id"],
        created_at=row["created_at"],
    )


def _version_row_to_record(row: sqlite3.Row, head_version_id: str | None) -> RunVersionRecord:
    summary = row["summary"] or row["followup_summary"] or _fallback_version_summary(
        row["source"]
    )
    return RunVersionRecord(
        version_id=row["version_id"],
        short_id=_short_version_id(row["version_id"]),
        run_id=row["run_id"],
        version_number=row["version_number"],
        parent_version_id=row["parent_version_id"],
        source=row["source"],
        summary=summary,
        followup_id=row["followup_id"],
        created_at=row["created_at"],
        is_head=row["version_id"] == head_version_id,
    )


def _fallback_version_summary(source: str) -> str:
    if source == "initial":
        return "initial playbook"
    if source == "restore":
        return "restore previous version"
    return "follow-up update"


def _short_version_id(version_id: str) -> str:
    compact = version_id.replace("-", "")
    if len(compact) >= 8 and all(c in "0123456789abcdefABCDEF" for c in compact[:8]):
        return compact[:8].lower()
    return hashlib.sha1(version_id.encode("utf-8")).hexdigest()[:8]
