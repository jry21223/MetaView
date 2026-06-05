from __future__ import annotations

import httpx
import pytest

from eval.live_client import generate_live_playbook


class _Response:
    def __init__(self, payload: dict, status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                "error",
                request=httpx.Request("GET", "http://test"),
                response=httpx.Response(self.status_code),
            )

    def json(self) -> dict:
        return self._payload


def test_generate_live_playbook_submits_and_polls_current_api(monkeypatch) -> None:
    calls: list[str] = []

    def post(url: str, *, json: dict, timeout: int) -> _Response:
        calls.append(url)
        assert url == "http://localhost:8000/api/v1/pipeline"
        assert json == {"prompt": "hello"}
        return _Response({"run_id": "run-1"})

    statuses = iter([
        {"run_id": "run-1", "status": "running"},
        {"run_id": "run-1", "status": "succeeded", "playbook": {"title": "ok"}},
    ])

    def get(url: str, *, timeout: int) -> _Response:
        calls.append(url)
        assert url == "http://localhost:8000/api/v1/runs/run-1"
        return _Response(next(statuses))

    monkeypatch.setattr(httpx, "post", post)
    monkeypatch.setattr(httpx, "get", get)
    monkeypatch.setattr("eval.live_client.time.sleep", lambda _: None)

    raw = generate_live_playbook("hello", "http://localhost:8000", poll_interval=0)

    assert '"title": "ok"' in raw
    assert "http://localhost:8000/api/pipeline/run" not in calls


def test_generate_live_playbook_surfaces_failed_run(monkeypatch) -> None:
    monkeypatch.setattr(httpx, "post", lambda *_, **__: _Response({"run_id": "run-1"}))
    monkeypatch.setattr(
        httpx,
        "get",
        lambda *_, **__: _Response({"run_id": "run-1", "status": "failed", "error": "boom"}),
    )

    with pytest.raises(RuntimeError, match="boom"):
        generate_live_playbook("hello", "http://localhost:8000", poll_interval=0)
