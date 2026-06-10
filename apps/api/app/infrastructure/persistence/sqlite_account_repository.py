from __future__ import annotations

import asyncio
import hashlib
import secrets
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone

from app.domain.models.account import Account, OAuthIdentity, RechargeOrder, SessionAccount


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat()


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class SqliteAccountRepository:
    def __init__(self, db_path: str) -> None:
        self._db_path = db_path

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    async def get_or_create_session(
        self,
        token: str | None,
        *,
        session_days: int,
    ) -> SessionAccount:
        return await asyncio.to_thread(self._get_or_create_session_sync, token, session_days)

    def _get_or_create_session_sync(
        self,
        token: str | None,
        session_days: int,
    ) -> SessionAccount:
        now = utc_now()
        if token:
            token_hash = hash_token(token)
            with self._connect() as conn:
                row = conn.execute(
                    """
                    SELECT a.*
                    FROM account_sessions s
                    JOIN accounts a ON a.user_id = s.user_id
                    WHERE s.token_hash = ? AND s.expires_at > ?
                    """,
                    (token_hash, iso(now)),
                ).fetchone()
                if row is not None:
                    return SessionAccount(token, token_hash, _row_to_account(row))

        new_token = secrets.token_urlsafe(32)
        new_hash = hash_token(new_token)
        user_id = f"user_{uuid.uuid4().hex}"
        created_at = iso(now)
        expires_at = iso(now + timedelta(days=session_days))
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO accounts
                    (user_id, display_name, avatar_url, login_provider, status, role,
                     balance_cents, created_at, updated_at, last_login_at)
                VALUES (?, ?, ?, ?, 'enabled', 'user', ?, ?, ?, ?)
                """,
                (user_id, "游客账户", None, "guest", 0, created_at, created_at, created_at),
            )
            conn.execute(
                """
                INSERT INTO account_sessions
                    (token_hash, user_id, created_at, expires_at)
                VALUES (?, ?, ?, ?)
                """,
                (new_hash, user_id, created_at, expires_at),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM accounts WHERE user_id = ?", (user_id,)).fetchone()
            assert row is not None
            return SessionAccount(new_token, new_hash, _row_to_account(row))

    async def clear_session(self, token: str | None) -> None:
        if not token:
            return

        def _sync() -> None:
            with self._connect() as conn:
                conn.execute(
                    "DELETE FROM account_sessions WHERE token_hash = ?",
                    (hash_token(token),),
                )
                conn.commit()

        await asyncio.to_thread(_sync)

    async def save_oauth_state(
        self,
        state: str,
        token_hash: str | None,
        *,
        ttl_minutes: int = 10,
    ) -> None:
        now = utc_now()

        def _sync() -> None:
            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO wechat_oauth_states
                        (state, token_hash, created_at, expires_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (state, token_hash, iso(now), iso(now + timedelta(minutes=ttl_minutes))),
                )
                conn.commit()

        await asyncio.to_thread(_sync)

    async def consume_oauth_state(self, state: str) -> str | None:
        now_text = iso(utc_now())

        def _sync() -> str | None:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT token_hash FROM wechat_oauth_states WHERE state = ? AND expires_at > ?",
                    (state, now_text),
                ).fetchone()
                conn.execute("DELETE FROM wechat_oauth_states WHERE state = ?", (state,))
                conn.commit()
                return row["token_hash"] if row else None

        return await asyncio.to_thread(_sync)

    async def link_oauth_account(
        self,
        *,
        current_token_hash: str | None,
        identity: OAuthIdentity,
        session_days: int,
    ) -> SessionAccount:
        return await asyncio.to_thread(
            self._link_oauth_account_sync,
            current_token_hash,
            identity,
            session_days,
        )

    def _link_oauth_account_sync(
        self,
        current_token_hash: str | None,
        identity: OAuthIdentity,
        session_days: int,
    ) -> SessionAccount:
        if identity.provider != "wechat":
            raise ValueError(f"Unsupported OAuth provider: {identity.provider}")
        now = utc_now()
        now_text = iso(now)
        with self._connect() as conn:
            existing = conn.execute(
                """
                SELECT * FROM accounts
                WHERE wechat_openid = ? OR (? IS NOT NULL AND wechat_unionid = ?)
                """,
                (identity.provider_user_id, identity.union_id, identity.union_id),
            ).fetchone()
            current_user_id = None
            if current_token_hash:
                session_row = conn.execute(
                    "SELECT user_id FROM account_sessions WHERE token_hash = ?",
                    (current_token_hash,),
                ).fetchone()
                current_user_id = session_row["user_id"] if session_row else None

            if existing is not None:
                user_id = existing["user_id"]
                if current_user_id and current_user_id != user_id:
                    current = conn.execute(
                        "SELECT balance_cents FROM accounts WHERE user_id = ?",
                        (current_user_id,),
                    ).fetchone()
                    if current and current["balance_cents"] > 0:
                        conn.execute(
                            """
                            UPDATE accounts
                            SET balance_cents = balance_cents + ?, updated_at = ?
                            WHERE user_id = ?
                            """,
                            (current["balance_cents"], now_text, user_id),
                        )
                        conn.execute(
                            """
                            UPDATE accounts
                            SET balance_cents = 0, updated_at = ?
                            WHERE user_id = ?
                            """,
                            (now_text, current_user_id),
                        )
                conn.execute(
                    """
                    UPDATE accounts
                    SET display_name = ?, avatar_url = ?, login_provider = 'wechat',
                        status = 'enabled', wechat_openid = ?, wechat_unionid = ?,
                        updated_at = ?, last_login_at = ?
                    WHERE user_id = ?
                    """,
                    (
                        identity.display_name or existing["display_name"] or "微信用户",
                        identity.avatar_url,
                        identity.provider_user_id,
                        identity.union_id,
                        now_text,
                        now_text,
                        user_id,
                    ),
                )
            else:
                user_id = current_user_id or f"user_{uuid.uuid4().hex}"
                current_exists = (
                    conn.execute(
                        "SELECT user_id FROM accounts WHERE user_id = ?",
                        (user_id,),
                    ).fetchone()
                    is not None
                )
                if current_exists:
                    conn.execute(
                        """
                        UPDATE accounts
                        SET display_name = ?, avatar_url = ?, login_provider = 'wechat',
                            status = 'enabled', wechat_openid = ?, wechat_unionid = ?,
                            updated_at = ?, last_login_at = ?
                        WHERE user_id = ?
                        """,
                        (
                            identity.display_name or "微信用户",
                            identity.avatar_url,
                            identity.provider_user_id,
                            identity.union_id,
                            now_text,
                            now_text,
                            user_id,
                        ),
                    )
                else:
                    conn.execute(
                        """
                        INSERT INTO accounts
                            (user_id, display_name, avatar_url, login_provider, status, role,
                             wechat_openid, wechat_unionid, balance_cents, created_at,
                             updated_at, last_login_at)
                        VALUES (?, ?, ?, 'wechat', 'enabled', 'user', ?, ?, 0, ?, ?, ?)
                        """,
                        (
                            user_id,
                            identity.display_name or "微信用户",
                            identity.avatar_url,
                            identity.provider_user_id,
                            identity.union_id,
                            now_text,
                            now_text,
                            now_text,
                        ),
                    )

            token = secrets.token_urlsafe(32)
            token_hash = hash_token(token)
            conn.execute(
                """
                INSERT INTO account_sessions
                    (token_hash, user_id, created_at, expires_at)
                VALUES (?, ?, ?, ?)
                """,
                (token_hash, user_id, now_text, iso(now + timedelta(days=session_days))),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM accounts WHERE user_id = ?", (user_id,)).fetchone()
            assert row is not None
            return SessionAccount(token, token_hash, _row_to_account(row))

    async def create_recharge_order(
        self,
        user_id: str,
        amount_cents: int,
        *,
        channel: str,
    ) -> RechargeOrder:
        now = iso(utc_now())
        order_id = f"mv{uuid.uuid4().hex[:30]}"

        def _sync() -> RechargeOrder:
            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT INTO recharge_orders
                        (order_id, user_id, amount_cents, status, channel, created_at)
                    VALUES (?, ?, ?, 'pending', ?, ?)
                    """,
                    (order_id, user_id, amount_cents, channel, now),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM recharge_orders WHERE order_id = ?", (order_id,)
                ).fetchone()
                assert row is not None
                return _row_to_order(row)

        return await asyncio.to_thread(_sync)

    async def attach_order_payment_info(
        self,
        order_id: str,
        *,
        code_url: str,
        provider_order_id: str | None,
    ) -> RechargeOrder | None:
        def _sync() -> RechargeOrder | None:
            with self._connect() as conn:
                conn.execute(
                    """
                    UPDATE recharge_orders
                    SET code_url = ?, provider_order_id = ?
                    WHERE order_id = ?
                    """,
                    (code_url, provider_order_id, order_id),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM recharge_orders WHERE order_id = ?", (order_id,)
                ).fetchone()
                return _row_to_order(row) if row else None

        return await asyncio.to_thread(_sync)

    async def get_order(self, order_id: str, user_id: str | None = None) -> RechargeOrder | None:
        def _sync() -> RechargeOrder | None:
            with self._connect() as conn:
                if user_id:
                    row = conn.execute(
                        "SELECT * FROM recharge_orders WHERE order_id = ? AND user_id = ?",
                        (order_id, user_id),
                    ).fetchone()
                else:
                    row = conn.execute(
                        "SELECT * FROM recharge_orders WHERE order_id = ?", (order_id,)
                    ).fetchone()
                return _row_to_order(row) if row else None

        return await asyncio.to_thread(_sync)

    async def list_orders(self, user_id: str, limit: int = 20) -> list[RechargeOrder]:
        def _sync() -> list[RechargeOrder]:
            with self._connect() as conn:
                rows = conn.execute(
                    """
                    SELECT * FROM recharge_orders
                    WHERE user_id = ?
                    ORDER BY created_at DESC
                    LIMIT ?
                    """,
                    (user_id, limit),
                ).fetchall()
                return [_row_to_order(row) for row in rows]

        return await asyncio.to_thread(_sync)

    async def mark_order_paid(
        self,
        *,
        order_id: str,
        amount_cents: int,
        provider_order_id: str,
        paid_at: str,
    ) -> RechargeOrder | None:
        def _sync() -> RechargeOrder | None:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT * FROM recharge_orders WHERE order_id = ?", (order_id,)
                ).fetchone()
                if row is None:
                    return None
                if row["status"] == "paid":
                    conn.execute(
                        """
                        UPDATE recharge_orders
                        SET provider_order_id = CASE
                            WHEN provider_order_id IS NULL OR provider_order_id = ''
                            THEN ?
                            ELSE provider_order_id
                        END
                        WHERE order_id = ?
                        """,
                        (provider_order_id, order_id),
                    )
                    conn.commit()
                    next_row = conn.execute(
                        "SELECT * FROM recharge_orders WHERE order_id = ?", (order_id,)
                    ).fetchone()
                    return _row_to_order(next_row) if next_row else None
                if row["status"] != "pending" or row["amount_cents"] != amount_cents:
                    return _row_to_order(row)

                ledger_id = f"ledger_{uuid.uuid4().hex}"
                conn.execute(
                    """
                    UPDATE recharge_orders
                    SET status = 'paid',
                        paid_at = ?,
                        provider_order_id = CASE
                            WHEN provider_order_id IS NULL OR provider_order_id = ''
                            THEN ?
                            ELSE provider_order_id
                        END
                    WHERE order_id = ?
                    """,
                    (paid_at, provider_order_id, order_id),
                )
                conn.execute(
                    """
                    UPDATE accounts
                    SET balance_cents = balance_cents + ?, updated_at = ?
                    WHERE user_id = ?
                    """,
                    (amount_cents, paid_at, row["user_id"]),
                )
                conn.execute(
                    """
                    INSERT INTO balance_ledger
                        (ledger_id, user_id, order_id, amount_cents, kind, created_at)
                    VALUES (?, ?, ?, ?, 'recharge', ?)
                    """,
                    (ledger_id, row["user_id"], order_id, amount_cents, paid_at),
                )
                conn.commit()
                next_row = conn.execute(
                    "SELECT * FROM recharge_orders WHERE order_id = ?", (order_id,)
                ).fetchone()
                return _row_to_order(next_row) if next_row else None

        return await asyncio.to_thread(_sync)

    async def consume_balance(
        self,
        *,
        user_id: str,
        amount_cents: int,
        ledger_id: str,
        created_at: str,
    ) -> bool:
        if amount_cents <= 0:
            return True

        def _sync() -> bool:
            with self._connect() as conn:
                existing = conn.execute(
                    "SELECT ledger_id FROM balance_ledger WHERE ledger_id = ?",
                    (ledger_id,),
                ).fetchone()
                if existing is not None:
                    return True

                cursor = conn.execute(
                    """
                    UPDATE accounts
                    SET balance_cents = balance_cents - ?, updated_at = ?
                    WHERE user_id = ? AND balance_cents >= ?
                    """,
                    (amount_cents, created_at, user_id, amount_cents),
                )
                if cursor.rowcount == 0:
                    return False
                conn.execute(
                    """
                    INSERT INTO balance_ledger
                        (ledger_id, user_id, order_id, amount_cents, kind, created_at)
                    VALUES (?, ?, NULL, ?, 'consume', ?)
                    """,
                    (ledger_id, user_id, amount_cents, created_at),
                )
                conn.commit()
                return True

        return await asyncio.to_thread(_sync)

    async def refund_balance(
        self,
        *,
        user_id: str,
        amount_cents: int,
        consume_ledger_id: str,
        refund_ledger_id: str,
        created_at: str,
    ) -> bool:
        if amount_cents <= 0:
            return True

        def _sync() -> bool:
            with self._connect() as conn:
                existing_refund = conn.execute(
                    "SELECT ledger_id FROM balance_ledger WHERE ledger_id = ?",
                    (refund_ledger_id,),
                ).fetchone()
                if existing_refund is not None:
                    return True

                consumed = conn.execute(
                    """
                    SELECT ledger_id FROM balance_ledger
                    WHERE ledger_id = ?
                        AND user_id = ?
                        AND amount_cents = ?
                        AND kind = 'consume'
                    """,
                    (consume_ledger_id, user_id, amount_cents),
                ).fetchone()
                if consumed is None:
                    return False

                conn.execute(
                    """
                    UPDATE accounts
                    SET balance_cents = balance_cents + ?, updated_at = ?
                    WHERE user_id = ?
                    """,
                    (amount_cents, created_at, user_id),
                )
                conn.execute(
                    """
                    INSERT INTO balance_ledger
                        (ledger_id, user_id, order_id, amount_cents, kind, created_at)
                    VALUES (?, ?, NULL, ?, 'refund', ?)
                    """,
                    (refund_ledger_id, user_id, amount_cents, created_at),
                )
                conn.commit()
                return True

        return await asyncio.to_thread(_sync)


def _row_to_account(row: sqlite3.Row) -> Account:
    return Account(
        user_id=row["user_id"],
        display_name=row["display_name"],
        avatar_url=row["avatar_url"],
        login_provider=row["login_provider"],
        status=row["status"] if "status" in row.keys() else "enabled",
        role=row["role"] if "role" in row.keys() else "user",
        balance_cents=int(row["balance_cents"]),
        wechat_openid=row["wechat_openid"] if "wechat_openid" in row.keys() else None,
        wechat_unionid=row["wechat_unionid"] if "wechat_unionid" in row.keys() else None,
        created_at=row["created_at"] if "created_at" in row.keys() else None,
        last_login_at=row["last_login_at"] if "last_login_at" in row.keys() else None,
    )


def _row_to_order(row: sqlite3.Row) -> RechargeOrder:
    return RechargeOrder(
        order_id=row["order_id"],
        user_id=row["user_id"],
        amount_cents=int(row["amount_cents"]),
        status=row["status"],
        channel=row["channel"],
        provider_order_id=(
            row["provider_order_id"] if "provider_order_id" in row.keys() else None
        ),
        code_url=row["code_url"],
        created_at=row["created_at"],
        paid_at=row["paid_at"],
    )
