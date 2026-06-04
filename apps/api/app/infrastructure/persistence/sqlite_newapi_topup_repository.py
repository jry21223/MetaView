from __future__ import annotations

import asyncio
import sqlite3

from app.domain.models.newapi_topup import NewApiTopupIntent


class SqliteNewApiTopupRepository:
    def __init__(self, db_path: str) -> None:
        self._db_path = db_path

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    async def create_intent(
        self,
        *,
        intent_id: str,
        order_id: str,
        newapi_user_id: int,
        amount_cents: int,
        quota_delta: int,
        state: str,
        return_url: str,
        expires_at: str,
        created_at: str,
    ) -> NewApiTopupIntent:
        def _sync() -> NewApiTopupIntent:
            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT INTO newapi_topup_intents
                        (intent_id, order_id, newapi_user_id, amount_cents, quota_delta,
                         state, return_url, status, created_at, expires_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
                    """,
                    (
                        intent_id,
                        order_id,
                        newapi_user_id,
                        amount_cents,
                        quota_delta,
                        state,
                        return_url,
                        created_at,
                        expires_at,
                    ),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM newapi_topup_intents WHERE intent_id = ?",
                    (intent_id,),
                ).fetchone()
                assert row is not None
                return _row_to_intent(row)

        return await asyncio.to_thread(_sync)

    async def attach_payment_info(
        self,
        intent_id: str,
        *,
        code_url: str | None,
        provider_order_id: str | None,
    ) -> NewApiTopupIntent | None:
        def _sync() -> NewApiTopupIntent | None:
            with self._connect() as conn:
                conn.execute(
                    """
                    UPDATE newapi_topup_intents
                    SET code_url = ?, provider_order_id = COALESCE(provider_order_id, ?)
                    WHERE intent_id = ?
                    """,
                    (code_url, provider_order_id, intent_id),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM newapi_topup_intents WHERE intent_id = ?",
                    (intent_id,),
                ).fetchone()
                return _row_to_intent(row) if row else None

        return await asyncio.to_thread(_sync)

    async def get_intent(self, intent_id: str) -> NewApiTopupIntent | None:
        def _sync() -> NewApiTopupIntent | None:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT * FROM newapi_topup_intents WHERE intent_id = ?",
                    (intent_id,),
                ).fetchone()
                return _row_to_intent(row) if row else None

        return await asyncio.to_thread(_sync)

    async def get_intent_by_order_id(self, order_id: str) -> NewApiTopupIntent | None:
        def _sync() -> NewApiTopupIntent | None:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT * FROM newapi_topup_intents WHERE order_id = ?",
                    (order_id,),
                ).fetchone()
                return _row_to_intent(row) if row else None

        return await asyncio.to_thread(_sync)

    async def mark_paid(
        self,
        *,
        order_id: str,
        amount_cents: int,
        provider_order_id: str,
        paid_at: str,
        receipt_code_hash: str,
    ) -> NewApiTopupIntent | None:
        def _sync() -> NewApiTopupIntent | None:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT * FROM newapi_topup_intents WHERE order_id = ?",
                    (order_id,),
                ).fetchone()
                if row is None:
                    return None
                if row["status"] == "paid":
                    return _row_to_intent(row)
                if row["status"] != "pending" or row["amount_cents"] != amount_cents:
                    return _row_to_intent(row)
                conn.execute(
                    """
                    UPDATE newapi_topup_intents
                    SET status = 'paid',
                        provider_order_id = COALESCE(provider_order_id, ?),
                        receipt_code_hash = ?,
                        paid_at = ?
                    WHERE order_id = ?
                    """,
                    (provider_order_id, receipt_code_hash, paid_at, order_id),
                )
                conn.commit()
                next_row = conn.execute(
                    "SELECT * FROM newapi_topup_intents WHERE order_id = ?",
                    (order_id,),
                ).fetchone()
                return _row_to_intent(next_row) if next_row else None

        return await asyncio.to_thread(_sync)

    async def mark_verified(
        self,
        *,
        intent_id: str,
        verified_at: str,
    ) -> NewApiTopupIntent | None:
        def _sync() -> NewApiTopupIntent | None:
            with self._connect() as conn:
                conn.execute(
                    """
                    UPDATE newapi_topup_intents
                    SET status = 'verified', verified_at = COALESCE(verified_at, ?)
                    WHERE intent_id = ? AND status IN ('paid', 'verified')
                    """,
                    (verified_at, intent_id),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM newapi_topup_intents WHERE intent_id = ?",
                    (intent_id,),
                ).fetchone()
                return _row_to_intent(row) if row else None

        return await asyncio.to_thread(_sync)

    async def mark_acked(
        self,
        *,
        intent_id: str,
        acked_at: str,
    ) -> NewApiTopupIntent | None:
        def _sync() -> NewApiTopupIntent | None:
            with self._connect() as conn:
                conn.execute(
                    """
                    UPDATE newapi_topup_intents
                    SET status = 'acked', acked_at = COALESCE(acked_at, ?)
                    WHERE intent_id = ? AND status IN ('verified', 'acked')
                    """,
                    (acked_at, intent_id),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM newapi_topup_intents WHERE intent_id = ?",
                    (intent_id,),
                ).fetchone()
                return _row_to_intent(row) if row else None

        return await asyncio.to_thread(_sync)


def _row_to_intent(row: sqlite3.Row) -> NewApiTopupIntent:
    return NewApiTopupIntent(
        intent_id=row["intent_id"],
        order_id=row["order_id"],
        newapi_user_id=int(row["newapi_user_id"]),
        amount_cents=int(row["amount_cents"]),
        quota_delta=int(row["quota_delta"]),
        state=row["state"],
        return_url=row["return_url"],
        status=row["status"],
        code_url=row["code_url"],
        provider_order_id=row["provider_order_id"],
        receipt_code_hash=row["receipt_code_hash"],
        created_at=row["created_at"],
        expires_at=row["expires_at"],
        paid_at=row["paid_at"],
        verified_at=row["verified_at"],
        acked_at=row["acked_at"],
    )

