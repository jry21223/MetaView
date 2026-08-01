from __future__ import annotations

import httpx
import pytest

from eval.live_client import generate_live_playbook, generate_live_playbook_with_metadata


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
        assert json == {"prompt": "hello", "domain": "code"}
        return _Response({"run_id": "run-1"})

    statuses = iter(
        [
            {"run_id": "run-1", "status": "running"},
            {
                "run_id": "run-1",
                "status": "succeeded",
                "playbook": {"title": "ok"},
                "quality_report": {"attempts": 0, "issues": []},
            },
        ]
    )

    def get(url: str, *, timeout: int) -> _Response:
        calls.append(url)
        assert url == "http://localhost:8000/api/v1/runs/run-1"
        return _Response(next(statuses))

    monkeypatch.setattr(httpx, "post", post)
    monkeypatch.setattr(httpx, "get", get)
    monkeypatch.setattr("eval.live_client.time.sleep", lambda _: None)

    raw = generate_live_playbook(
        "hello",
        "http://localhost:8000",
        domain="code",
        poll_interval=0,
    )

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


def test_generate_live_playbook_preserves_available_metrics_and_nulls(monkeypatch) -> None:
    monkeypatch.setattr(httpx, "post", lambda *_, **__: _Response({"run_id": "run-2"}))
    monkeypatch.setattr(
        httpx,
        "get",
        lambda *_, **__: _Response(
            {
                "run_id": "run-2",
                "status": "succeeded",
                "playbook": {"title": "ok"},
                "review": {"attempts": 2, "issues": [{"severity": "warning"}]},
                "telemetry": {
                    "input_tokens": 123,
                    "outputTokens": 45,
                    "cache_read_tokens": 80,
                    "cache_write_tokens": 10,
                    "generation_model_turns": 4,
                    "tool_batches": 3,
                    "tool_calls": 7,
                    "single_model_requests": 0,
                    "agent_provider_calls": 2,
                    "agent_attempts": 3,
                    "reviewer_calls": 2,
                    "quality_repair_calls": 1,
                },
            }
        ),
    )

    result = generate_live_playbook_with_metadata(
        "hello",
        "http://localhost:8000",
        poll_interval=0,
    )

    assert result.run_id == "run-2"
    assert result.latency_ms >= 0
    assert result.repair_count == 2
    assert result.input_tokens == 123
    assert result.output_tokens == 45
    assert result.cache_read_tokens == 80
    assert result.cache_write_tokens == 10
    assert result.generation_model_turns == 4
    assert result.tool_batches == 3
    assert result.tool_calls == 7
    assert not hasattr(result, "total_model_requests")
    assert result.single_model_requests == 0
    assert result.agent_provider_calls == 2
    assert result.agent_attempts == 3
    assert result.reviewer_calls == 2
    assert result.quality_repair_calls == 1
    assert result.warning_count == 1
    assert result.estimated_cost is None


def test_generate_live_playbook_rejects_missing_warning_telemetry(monkeypatch) -> None:
    monkeypatch.setattr(httpx, "post", lambda *_, **__: _Response({"run_id": "run-3"}))
    monkeypatch.setattr(
        httpx,
        "get",
        lambda *_, **__: _Response(
            {"run_id": "run-3", "status": "succeeded", "playbook": {"title": "ok"}}
        ),
    )

    with pytest.raises(ValueError, match="warning telemetry"):
        generate_live_playbook_with_metadata(
            "hello",
            "http://localhost:8000",
            poll_interval=0,
        )


def test_generate_live_playbook_reads_repair_count_from_quality_report(monkeypatch) -> None:
    monkeypatch.setattr(httpx, "post", lambda *_, **__: _Response({"run_id": "run-4"}))
    monkeypatch.setattr(
        httpx,
        "get",
        lambda *_, **__: _Response(
            {
                "run_id": "run-4",
                "status": "succeeded",
                "playbook": {"title": "ok"},
                "review": {"issues": []},
                "quality_report": {"attempts": 3, "issues": []},
            }
        ),
    )

    result = generate_live_playbook_with_metadata(
        "hello",
        "http://localhost:8000",
        poll_interval=0,
    )

    assert result.repair_count == 3
    assert result.input_tokens is None
    assert result.output_tokens is None
    assert result.cache_read_tokens is None
    assert result.cache_write_tokens is None
    assert result.generation_model_turns is None
    assert result.tool_batches is None
    assert result.tool_calls is None
    assert not hasattr(result, "total_model_requests")
    assert result.single_model_requests is None
    assert result.agent_provider_calls is None
    assert result.agent_attempts is None
    assert result.reviewer_calls is None
    assert result.quality_repair_calls is None
    assert result.estimated_cost is None
    assert result.warning_count == 0
