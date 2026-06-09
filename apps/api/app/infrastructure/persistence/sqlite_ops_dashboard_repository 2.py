from __future__ import annotations

import asyncio
import json
import sqlite3
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal

from app.application.dto.ops_dashboard_dto import (
    OpsDashboardResponse,
    OpsDistributionPoint,
    OpsHealthTreeItem,
    OpsMetricCard,
    OpsOrderRow,
    OpsRevenueTrendPoint,
    OpsRunRow,
    OpsRunTrendPoint,
)
from app.domain.models.account import money_from_cents

_IN_FLIGHT_STATUSES = {"queued", "running", "reviewing"}
_WINDOW_DAYS: tuple[Literal[7, 30, 90], ...] = (7, 30, 90)


@dataclass(frozen=True)
class _Window:
    today: date
    start: datetime
    end: datetime
    previous_start: datetime
    previous_end: datetime
    days: list[date]


class SqliteOpsDashboardRepository:
    def __init__(self, db_path: str) -> None:
        self._db_path = db_path

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    async def get_dashboard(
        self,
        *,
        window_days: Literal[7, 30, 90],
        limit: int,
    ) -> OpsDashboardResponse:
        return await asyncio.to_thread(self._get_dashboard_sync, window_days, limit)

    def _get_dashboard_sync(
        self,
        window_days: Literal[7, 30, 90],
        limit: int,
    ) -> OpsDashboardResponse:
        if window_days not in _WINDOW_DAYS:
            window_days = 30
        limit = max(1, min(limit, 100))
        generated_at = datetime.now(timezone.utc)
        window = _build_window(generated_at, window_days)
        with self._connect() as conn:
            accounts = conn.execute("SELECT * FROM accounts").fetchall()
            runs = conn.execute(
                """
                SELECT r.*, a.display_name AS user_display_name
                FROM pipeline_runs AS r
                LEFT JOIN accounts AS a ON a.user_id = r.user_id
                ORDER BY r.created_at DESC
                """
            ).fetchall()
            orders = conn.execute(
                """
                SELECT o.*, a.display_name AS user_display_name
                FROM recharge_orders AS o
                LEFT JOIN accounts AS a ON a.user_id = o.user_id
                ORDER BY o.created_at DESC
                """
            ).fetchall()
            ledger = conn.execute("SELECT * FROM balance_ledger").fetchall()

        run_trend = _build_run_trend(runs, window)
        revenue_trend = _build_revenue_trend(orders, window)
        status_distribution = _build_status_distribution(runs, window)
        domain_distribution = _build_domain_distribution(runs, window)
        kpis = _build_kpis(accounts, runs, orders, ledger, run_trend, revenue_trend, window)
        recent_runs = [_run_row(row) for row in runs[:limit]]
        recent_orders = [_order_row(row) for row in orders[:limit]]
        health_tree = _build_health_tree(
            accounts=accounts,
            runs=runs,
            orders=orders,
            ledger=ledger,
            kpis=kpis,
            window=window,
        )

        return OpsDashboardResponse(
            generated_at=generated_at.isoformat(),
            window_days=window_days,
            kpis=kpis,
            run_trend=run_trend,
            revenue_trend=revenue_trend,
            status_distribution=status_distribution,
            domain_distribution=domain_distribution,
            recent_runs=recent_runs,
            recent_orders=recent_orders,
            health_tree=health_tree,
        )


def _build_window(now: datetime, window_days: int) -> _Window:
    today = now.astimezone(timezone.utc).date()
    first_day = today - timedelta(days=window_days - 1)
    start = datetime.combine(first_day, time.min, tzinfo=timezone.utc)
    end = datetime.combine(today + timedelta(days=1), time.min, tzinfo=timezone.utc)
    previous_start = start - timedelta(days=window_days)
    previous_end = start
    days = [first_day + timedelta(days=i) for i in range(window_days)]
    return _Window(today, start, end, previous_start, previous_end, days)


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _in_window(value: str | None, start: datetime, end: datetime) -> bool:
    parsed = _parse_dt(value)
    return parsed is not None and start <= parsed < end


def _day_key(value: str | None) -> str | None:
    parsed = _parse_dt(value)
    return parsed.date().isoformat() if parsed else None


def _series_data(points: list[OpsRunTrendPoint | OpsRevenueTrendPoint], key: str) -> list[int]:
    return [int(getattr(point, key)) for point in points]


def _build_run_trend(rows: list[sqlite3.Row], window: _Window) -> list[OpsRunTrendPoint]:
    by_day = {
        day.isoformat(): {"total": 0, "succeeded": 0, "failed": 0, "in_flight": 0}
        for day in window.days
    }
    for row in rows:
        if not _in_window(row["created_at"], window.start, window.end):
            continue
        key = _day_key(row["created_at"])
        if key not in by_day:
            continue
        status = str(row["status"])
        by_day[key]["total"] += 1
        if status == "succeeded":
            by_day[key]["succeeded"] += 1
        elif status == "failed":
            by_day[key]["failed"] += 1
        elif status in _IN_FLIGHT_STATUSES:
            by_day[key]["in_flight"] += 1
    return [OpsRunTrendPoint(date=day, **values) for day, values in by_day.items()]


def _build_revenue_trend(rows: list[sqlite3.Row], window: _Window) -> list[OpsRevenueTrendPoint]:
    by_day = {
        day.isoformat(): {"paid_orders": 0, "revenue_cents": 0}
        for day in window.days
    }
    for row in rows:
        if row["status"] != "paid":
            continue
        paid_at = row["paid_at"] or row["created_at"]
        if not _in_window(paid_at, window.start, window.end):
            continue
        key = _day_key(paid_at)
        if key not in by_day:
            continue
        by_day[key]["paid_orders"] += 1
        by_day[key]["revenue_cents"] += int(row["amount_cents"])
    return [
        OpsRevenueTrendPoint(
            date=day,
            paid_orders=values["paid_orders"],
            revenue_cents=values["revenue_cents"],
            revenue_yuan=money_from_cents(values["revenue_cents"]),
        )
        for day, values in by_day.items()
    ]


def _build_status_distribution(
    rows: list[sqlite3.Row],
    window: _Window,
) -> list[OpsDistributionPoint]:
    counts: Counter[str] = Counter()
    for row in rows:
        if _in_window(row["created_at"], window.start, window.end):
            counts[str(row["status"])] += 1
    return [
        OpsDistributionPoint(id=status, label=_status_label(status), count=count)
        for status, count in sorted(counts.items())
    ]


def _build_domain_distribution(
    rows: list[sqlite3.Row],
    window: _Window,
) -> list[OpsDistributionPoint]:
    counts: Counter[str] = Counter()
    for row in rows:
        if _in_window(row["created_at"], window.start, window.end):
            _, domain, _ = _playbook_meta(row["playbook_json"])
            counts[domain or "unresolved"] += 1
    return [
        OpsDistributionPoint(id=domain, label=_domain_label(domain), count=count)
        for domain, count in counts.most_common()
    ]


def _build_kpis(
    accounts: list[sqlite3.Row],
    runs: list[sqlite3.Row],
    orders: list[sqlite3.Row],
    ledger: list[sqlite3.Row],
    run_trend: list[OpsRunTrendPoint],
    revenue_trend: list[OpsRevenueTrendPoint],
    window: _Window,
) -> list[OpsMetricCard]:
    total_users = len(accounts)
    new_users = sum(
        1
        for row in accounts
        if _in_window(row["created_at"], window.start, window.end)
    )
    active_users = len(
        {
            row["user_id"]
            for row in runs
            if row["user_id"] and _in_window(row["created_at"], window.start, window.end)
        }
    )
    admin_users = sum(
        1
        for row in accounts
        if row["role"] == "admin" and row["status"] == "enabled"
    )
    run_total = sum(point.total for point in run_trend)
    succeeded = sum(point.succeeded for point in run_trend)
    failed = sum(point.failed for point in run_trend)
    terminal = succeeded + failed
    success_rate = round(succeeded / terminal * 100, 1) if terminal else 0.0
    revenue_cents = sum(point.revenue_cents for point in revenue_trend)
    balance_cents = sum(int(row["balance_cents"]) for row in accounts)
    consumed_cents = _ledger_sum(ledger, "consume", window.start, window.end)
    previous_runs = sum(
        1
        for row in runs
        if _in_window(row["created_at"], window.previous_start, window.previous_end)
    )
    previous_revenue = sum(
        int(row["amount_cents"])
        for row in orders
        if row["status"] == "paid"
        and _in_window(
            row["paid_at"] or row["created_at"],
            window.previous_start,
            window.previous_end,
        )
    )
    previous_consumed = _ledger_sum(ledger, "consume", window.previous_start, window.previous_end)

    return [
        OpsMetricCard(
            id="users",
            label="用户数",
            value=str(total_users),
            helper=f"近窗新增 {new_users}，活跃 {active_users}，管理员 {admin_users}",
            trend="up" if new_users > 0 else "neutral",
            delta_percent=_delta_percent(new_users, max(total_users - new_users, 0)),
            data=_daily_new_users(accounts, window),
        ),
        OpsMetricCard(
            id="runs",
            label="生成任务",
            value=str(run_total),
            helper=f"成功 {succeeded}，失败 {failed}，成功率 {success_rate:.1f}%",
            trend=_trend(run_total, previous_runs),
            delta_percent=_delta_percent(run_total, previous_runs),
            data=_series_data(run_trend, "total"),
        ),
        OpsMetricCard(
            id="success_rate",
            label="成功率",
            value=f"{success_rate:.1f}%",
            helper="仅统计成功/失败终态任务",
            trend="down" if failed > succeeded and terminal > 0 else "neutral",
            data=_series_data(run_trend, "succeeded"),
        ),
        OpsMetricCard(
            id="revenue",
            label="充值收入",
            value=f"¥ {money_from_cents(revenue_cents)}",
            helper=f"近 {len(window.days)} 天已支付订单",
            trend=_trend(revenue_cents, previous_revenue),
            delta_percent=_delta_percent(revenue_cents, previous_revenue),
            data=_series_data(revenue_trend, "revenue_cents"),
        ),
        OpsMetricCard(
            id="consumption",
            label="生成消耗",
            value=f"¥ {money_from_cents(consumed_cents)}",
            helper="balance_ledger consume 汇总",
            trend=_trend(consumed_cents, previous_consumed),
            delta_percent=_delta_percent(consumed_cents, previous_consumed),
            data=_daily_ledger(ledger, "consume", window),
        ),
        OpsMetricCard(
            id="balance",
            label="账户余额",
            value=f"¥ {money_from_cents(balance_cents)}",
            helper="全站未消费余额",
            trend="neutral",
            data=[],
        ),
    ]


def _daily_new_users(accounts: list[sqlite3.Row], window: _Window) -> list[int]:
    by_day = {day.isoformat(): 0 for day in window.days}
    for row in accounts:
        if not _in_window(row["created_at"], window.start, window.end):
            continue
        key = _day_key(row["created_at"])
        if key in by_day:
            by_day[key] += 1
    return list(by_day.values())


def _daily_ledger(ledger: list[sqlite3.Row], kind: str, window: _Window) -> list[int]:
    by_day = {day.isoformat(): 0 for day in window.days}
    for row in ledger:
        if row["kind"] != kind or not _in_window(row["created_at"], window.start, window.end):
            continue
        key = _day_key(row["created_at"])
        if key in by_day:
            by_day[key] += int(row["amount_cents"])
    return list(by_day.values())


def _ledger_sum(ledger: list[sqlite3.Row], kind: str, start: datetime, end: datetime) -> int:
    return sum(
        int(row["amount_cents"])
        for row in ledger
        if row["kind"] == kind and _in_window(row["created_at"], start, end)
    )


def _delta_percent(current: int | float, previous: int | float) -> float | None:
    if previous == 0:
        return None if current == 0 else 100.0
    return round((current - previous) / previous * 100, 1)


def _trend(current: int | float, previous: int | float) -> str:
    if current > previous:
        return "up"
    if current < previous:
        return "down"
    return "neutral"


def _run_row(row: sqlite3.Row) -> OpsRunRow:
    title, domain, _ = _playbook_meta(row["playbook_json"])
    return OpsRunRow(
        run_id=row["run_id"],
        user_id=row["user_id"],
        user_display_name=row["user_display_name"],
        status=row["status"],
        prompt=row["prompt"] or "",
        title=title,
        domain=domain,
        created_at=row["created_at"],
        error=row["error"],
    )


def _order_row(row: sqlite3.Row) -> OpsOrderRow:
    return OpsOrderRow(
        order_id=row["order_id"],
        user_id=row["user_id"],
        user_display_name=row["user_display_name"],
        amount_cents=int(row["amount_cents"]),
        amount_yuan=money_from_cents(int(row["amount_cents"])),
        status=row["status"],
        channel=row["channel"],
        created_at=row["created_at"],
        paid_at=row["paid_at"],
    )


def _playbook_meta(raw: str | None) -> tuple[str | None, str | None, int | None]:
    if not raw:
        return None, None, None
    try:
        payload = json.loads(raw)
    except ValueError:
        return None, None, None
    if not isinstance(payload, dict):
        return None, None, None
    title = payload.get("title") if isinstance(payload.get("title"), str) else None
    domain = payload.get("domain") if isinstance(payload.get("domain"), str) else None
    steps = payload.get("steps")
    step_count = len(steps) if isinstance(steps, list) else None
    return title, domain, step_count


def _build_health_tree(
    *,
    accounts: list[sqlite3.Row],
    runs: list[sqlite3.Row],
    orders: list[sqlite3.Row],
    ledger: list[sqlite3.Row],
    kpis: list[OpsMetricCard],
    window: _Window,
) -> list[OpsHealthTreeItem]:
    metrics = {metric.id: metric for metric in kpis}
    failed = sum(
        1
        for row in runs
        if row["status"] == "failed" and _in_window(row["created_at"], window.start, window.end)
    )
    in_flight = sum(
        1
        for row in runs
        if row["status"] in _IN_FLIGHT_STATUSES
        and _in_window(row["created_at"], window.start, window.end)
    )
    pending_orders = sum(
        1
        for row in orders
        if row["status"] == "pending" and _in_window(row["created_at"], window.start, window.end)
    )
    disabled_users = sum(1 for row in accounts if row["status"] == "disabled")
    refunds = _ledger_sum(ledger, "refund", window.start, window.end)
    return [
        OpsHealthTreeItem(
            id="generation",
            label="生成任务",
            value=metrics["runs"].value,
            status="bad" if failed > 0 else ("warn" if in_flight > 0 else "ok"),
            children=[
                OpsHealthTreeItem(
                    id="generation-success",
                    label="成功率",
                    value=metrics["success_rate"].value,
                    status="neutral",
                ),
                OpsHealthTreeItem(
                    id="generation-active",
                    label="进行中",
                    value=str(in_flight),
                    status="warn" if in_flight else "ok",
                ),
                OpsHealthTreeItem(
                    id="generation-failed",
                    label="失败",
                    value=str(failed),
                    status="bad" if failed else "ok",
                ),
            ],
        ),
        OpsHealthTreeItem(
            id="billing",
            label="充值与余额",
            value=metrics["revenue"].value,
            status="warn" if pending_orders > 0 else "ok",
            children=[
                OpsHealthTreeItem(
                    id="billing-pending",
                    label="待支付订单",
                    value=str(pending_orders),
                    status="warn" if pending_orders else "ok",
                ),
                OpsHealthTreeItem(
                    id="billing-balance",
                    label="未消费余额",
                    value=metrics["balance"].value,
                    status="neutral",
                ),
                OpsHealthTreeItem(
                    id="billing-refund",
                    label="退款回补",
                    value=f"¥ {money_from_cents(refunds)}",
                    status="warn" if refunds else "ok",
                ),
            ],
        ),
        OpsHealthTreeItem(
            id="accounts",
            label="账户",
            value=metrics["users"].value,
            status="warn" if disabled_users > 0 else "ok",
            children=[
                OpsHealthTreeItem(
                    id="accounts-active",
                    label="近窗活跃",
                    value=metrics["users"].helper,
                    status="neutral",
                ),
                OpsHealthTreeItem(
                    id="accounts-disabled",
                    label="禁用账户",
                    value=str(disabled_users),
                    status="warn" if disabled_users else "ok",
                ),
            ],
        ),
    ]


def _status_label(status: str) -> str:
    return {
        "queued": "排队",
        "running": "生成中",
        "reviewing": "审核中",
        "succeeded": "完成",
        "failed": "失败",
    }.get(status, status)


def _domain_label(domain: str) -> str:
    return {
        "algorithm": "算法",
        "math": "数学",
        "code": "代码",
        "physics": "物理",
        "chemistry": "化学",
        "biology": "生物",
        "geography": "地理",
        "unresolved": "未识别",
    }.get(domain, domain)
