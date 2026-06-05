from __future__ import annotations

import json
import time


def generate_live_playbook(
    prompt: str,
    api_base: str,
    *,
    api_prefix: str = "/api/v1",
    timeout: int = 900,
    poll_interval: float = 2.0,
) -> str:
    try:
        import httpx
    except ImportError:
        raise RuntimeError("httpx not installed; run: uv add httpx") from None

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
            return json.dumps(playbook, ensure_ascii=False) if isinstance(playbook, dict) else playbook
        if status == "failed":
            raise RuntimeError(f"Run {run_id} failed: {data.get('error') or 'unknown error'}")
        time.sleep(poll_interval)

    raise TimeoutError(f"Timed out waiting for run {run_id}; last status={last_status}")
