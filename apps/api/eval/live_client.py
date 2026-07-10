from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class LiveGenerationResult:
    playbook_json: str
    run_id: str
    latency_ms: float
    repair_count: int | None
    input_tokens: int | None
    output_tokens: int | None
    estimated_cost: float | None
    warning_count: int | None


def generate_live_playbook(
    prompt: str,
    api_base: str,
    *,
    api_prefix: str = "/api/v1",
    timeout: int = 900,
    poll_interval: float = 2.0,
) -> str:
    """Compatibility wrapper returning only the generated Playbook JSON."""

    return generate_live_playbook_with_metadata(
        prompt,
        api_base,
        api_prefix=api_prefix,
        timeout=timeout,
        poll_interval=poll_interval,
    ).playbook_json


def generate_live_playbook_with_metadata(
    prompt: str,
    api_base: str,
    *,
    api_prefix: str = "/api/v1",
    timeout: int = 900,
    poll_interval: float = 2.0,
) -> LiveGenerationResult:
    """Generate one live Playbook and preserve only metrics the API provides.

    Client-observed latency is measured directly.  Token, cost, repair, and
    warning metrics remain ``None`` when the API response does not expose them;
    the eval harness never invents zeroes for unavailable telemetry.
    """

    try:
        import httpx
    except ImportError:
        raise RuntimeError("httpx not installed; run: uv add httpx") from None

    started_at = time.monotonic()
    base = api_base.rstrip("/")
    prefix = "/" + api_prefix.strip("/")
    deadline = time.monotonic() + timeout
    last_status = "submitted"

    submit = httpx.post(
        f"{base}{prefix}/pipeline",
        json={"prompt": prompt},
        timeout=min(timeout, 60),
    )
    submit.raise_for_status()
    submit_data = submit.json()
    run_id = submit_data.get("run_id")
    if not isinstance(run_id, str) or not run_id:
        raise ValueError(f"No 'run_id' in response: {submit_data}")

    while time.monotonic() < deadline:
        resp = httpx.get(f"{base}{prefix}/runs/{run_id}", timeout=60)
        resp.raise_for_status()
        data = resp.json()
        status = data.get("status")
        last_status = str(status)
        if status == "succeeded":
            playbook = data.get("playbook")
            if playbook is None:
                raise ValueError(f"Run {run_id} succeeded without 'playbook'")
            warning_count = _warning_count(data)
            if warning_count is None:
                raise ValueError(
                    f"Run {run_id} succeeded without canonical quality warning telemetry"
                )
            playbook_json = (
                json.dumps(playbook, ensure_ascii=False) if isinstance(playbook, dict) else playbook
            )
            return LiveGenerationResult(
                playbook_json=playbook_json,
                run_id=run_id,
                latency_ms=round((time.monotonic() - started_at) * 1000, 3),
                repair_count=_repair_count(data),
                input_tokens=_integer_metric(data, "input_tokens", "inputTokens"),
                output_tokens=_integer_metric(data, "output_tokens", "outputTokens"),
                estimated_cost=_number_metric(data, "estimated_cost", "estimatedCost"),
                warning_count=warning_count,
            )
        if status == "failed":
            raise RuntimeError(f"Run {run_id} failed: {data.get('error') or 'unknown error'}")
        time.sleep(poll_interval)

    raise TimeoutError(f"Timed out waiting for run {run_id}; last status={last_status}")


def _metric_value(payload: dict[str, Any], *keys: str) -> Any:
    containers = [payload]
    for container_name in ("metrics", "telemetry", "quality_report"):
        container = payload.get(container_name)
        if isinstance(container, dict):
            containers.append(container)
    for container in containers:
        for key in keys:
            if key in container:
                return container[key]
    return None


def _integer_metric(payload: dict[str, Any], *keys: str) -> int | None:
    value = _metric_value(payload, *keys)
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


def _number_metric(payload: dict[str, Any], *keys: str) -> float | None:
    value = _metric_value(payload, *keys)
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _review_attempts(payload: dict[str, Any]) -> int | None:
    for key in ("quality_report", "review"):
        report = payload.get(key)
        if not isinstance(report, dict):
            continue
        attempts = report.get("attempts")
        if isinstance(attempts, int) and not isinstance(attempts, bool):
            return attempts
    return None


def _repair_count(payload: dict[str, Any]) -> int | None:
    direct = _integer_metric(payload, "repair_count", "repairCount")
    return direct if direct is not None else _review_attempts(payload)


def _warning_count(payload: dict[str, Any]) -> int | None:
    report = payload.get("quality_report")
    if not isinstance(report, dict):
        report = payload.get("review")
    if not isinstance(report, dict):
        return None
    issues = report.get("issues")
    if not isinstance(issues, list):
        return None
    return sum(
        isinstance(issue, dict) and str(issue.get("severity") or "").lower() == "warning"
        for issue in issues
    )
