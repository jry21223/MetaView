"""Tests for the /api/v1/agent/assert/* endpoints exposed for the Node sidecar."""

from __future__ import annotations

import math
from collections.abc import Generator
from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.domain.models.coverage import CoverageDecision
from app.main import create_app
from app.presentation.dependencies import get_run_repo

_AGENT_TOKEN = "secret"
_AGENT_HEADERS = {"X-MetaView-Agent-Token": _AGENT_TOKEN}


@dataclass
class _FakeRun:
    coverage_decision: CoverageDecision | None


class _FakeRunRepo:
    def __init__(self, runs: dict[str, _FakeRun] | None = None) -> None:
        self.runs = runs or {}

    async def get(self, run_id: str, user_id: str | None = None) -> _FakeRun | None:
        del user_id
        return self.runs.get(run_id)


def _coverage(*tool_ids: str) -> CoverageDecision:
    return CoverageDecision(
        mode="composable",
        domain="math",
        confidence=0.9,
        matched_skill_ids=[],
        available_tool_ids=list(tool_ids),
        missing_capabilities=[],
        fallback_policy="compose",
        reason="test inventory",
    )


@pytest.fixture(autouse=True)
def clear_settings_cache(monkeypatch: pytest.MonkeyPatch) -> Generator[None, None, None]:
    # Fail-closed agent routes require a configured shared token.
    monkeypatch.setenv("METAVIEW_AGENT_SHARED_TOKEN", _AGENT_TOKEN)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture()
def client() -> TestClient:
    app = create_app()
    # Default: no runs → empty server inventory (deny non-internal tools).
    app.dependency_overrides[get_run_repo] = lambda: _FakeRunRepo()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _client_with_inventory(*tool_ids: str, run_id: str = "run-inv") -> TestClient:
    app = create_app()
    app.dependency_overrides[get_run_repo] = lambda: _FakeRunRepo(
        {run_id: _FakeRun(coverage_decision=_coverage(*tool_ids))}
    )
    return TestClient(app)


def test_orientation_endpoint_returns_clockwise_for_cos_negative_sin(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/v1/agent/assert/orientation",
        headers=_AGENT_HEADERS,
        json={
            "expression_x": "cos(t)",
            "expression_y": "-sin(t)",
            "t_min": 0.0,
            "t_max": 2 * math.pi,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["direction"] == "clockwise"


def test_orientation_endpoint_returns_counterclockwise(client: TestClient) -> None:
    response = client.post(
        "/api/v1/agent/assert/orientation",
        headers=_AGENT_HEADERS,
        json={
            "expression_x": "cos(t)",
            "expression_y": "sin(t)",
            "t_min": 0.0,
            "t_max": 2 * math.pi,
        },
    )
    assert response.json()["direction"] == "counterclockwise"


def test_passes_through_endpoint(client: TestClient) -> None:
    response = client.post(
        "/api/v1/agent/assert/passes-through",
        headers=_AGENT_HEADERS,
        json={
            "expression_x": "cos(t)",
            "expression_y": "sin(t)",
            "t_min": 0.0,
            "t_max": 2 * math.pi,
            "target_x": 1.0,
            "target_y": 0.0,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["passes"] is True
    assert payload["distance"] < 1e-3


def test_passes_through_far_point_misses(client: TestClient) -> None:
    response = client.post(
        "/api/v1/agent/assert/passes-through",
        headers=_AGENT_HEADERS,
        json={
            "expression_x": "cos(t)",
            "expression_y": "sin(t)",
            "t_min": 0.0,
            "t_max": 2 * math.pi,
            "target_x": 10.0,
            "target_y": 10.0,
        },
    )
    payload = response.json()
    assert payload["passes"] is False


def test_monotonic_endpoint_increasing(client: TestClient) -> None:
    response = client.post(
        "/api/v1/agent/assert/monotonic",
        headers=_AGENT_HEADERS,
        json={"expression": "x**2", "x_min": 0.1, "x_max": 2.0},
    )
    assert response.json()["verdict"] == "increasing"


def test_monotonic_endpoint_mixed(client: TestClient) -> None:
    response = client.post(
        "/api/v1/agent/assert/monotonic",
        headers=_AGENT_HEADERS,
        json={"expression": "x**2", "x_min": -1.0, "x_max": 1.0},
    )
    assert response.json()["verdict"] == "mixed"


def test_rejects_oversize_expression(client: TestClient) -> None:
    # Endpoint pydantic guard: max_length=256 on expression fields.
    big = "x" * 300
    response = client.post(
        "/api/v1/agent/assert/monotonic",
        headers=_AGENT_HEADERS,
        json={"expression": big, "x_min": 0.0, "x_max": 1.0},
    )
    assert response.status_code == 422


def test_assert_routes_require_shared_token(client: TestClient) -> None:
    missing = client.post(
        "/api/v1/agent/assert/monotonic",
        json={"expression": "x**2", "x_min": 0.1, "x_max": 2.0},
    )
    wrong = client.post(
        "/api/v1/agent/assert/monotonic",
        headers={"X-MetaView-Agent-Token": "wrong"},
        json={"expression": "x**2", "x_min": 0.1, "x_max": 2.0},
    )
    assert missing.status_code == 401
    assert wrong.status_code == 401


def test_agent_routes_fail_closed_when_token_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Empty string must not re-open the route even if a client sends a header.
    monkeypatch.setenv("METAVIEW_AGENT_SHARED_TOKEN", "")
    get_settings.cache_clear()
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/agent/assert/monotonic",
        headers={"X-MetaView-Agent-Token": "anything"},
        json={"expression": "x**2", "x_min": 0.1, "x_max": 2.0},
    )
    assert response.status_code == 401
    assert "not configured" in response.json()["detail"]


def test_animation_tool_list_requires_shared_token(client: TestClient) -> None:
    missing = client.get("/api/v1/agent/animation-tools")
    wrong = client.get(
        "/api/v1/agent/animation-tools",
        headers={"X-MetaView-Agent-Token": "wrong"},
    )
    ok = client.get(
        "/api/v1/agent/animation-tools",
        headers=_AGENT_HEADERS,
    )

    assert missing.status_code == 401
    assert wrong.status_code == 401
    assert ok.status_code == 200
    tools = ok.json()["tools"]
    tangent = next(tool for tool in tools if tool["name"] == "math.show_tangent")
    assert tangent["description"] == (
        "Show a function and tangent line at a selected x value."
    )
    assert tangent["args_schema"]["properties"]["expression"]["minLength"] == 1


def test_animation_tool_list_returns_args_schema(client: TestClient) -> None:
    response = client.get(
        "/api/v1/agent/animation-tools",
        headers=_AGENT_HEADERS,
    )

    assert response.status_code == 200
    tools = response.json()["tools"]
    show_function = next(tool for tool in tools if tool["name"] == "math.show_function")
    schema = show_function["args_schema"]
    assert schema["type"] == "object"
    assert schema["properties"]["expression"]["minLength"] == 1
    assert "x_min" in schema["properties"]
    assert "x_max" in schema["properties"]


def test_animation_tool_expand_returns_layers_with_issues_empty() -> None:
    client = _client_with_inventory("animation_tool.expand")
    response = client.post(
        "/api/v1/agent/animation-tools/expand",
        headers=_AGENT_HEADERS,
        json={
            "run_id": "run-inv",
            "tool": "math.show_function",
            "args": {"expression": "x**2", "x_min": -2, "x_max": 2},
            "allowed_tools": ["animation_tool.expand"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["issues"] == []
    assert payload["layers"]
    assert payload["layers"][0]["kind"] == "math_plot"


def test_animation_tool_expand_reports_unknown_tool() -> None:
    client = _client_with_inventory("animation_tool.expand")
    response = client.post(
        "/api/v1/agent/animation-tools/expand",
        headers=_AGENT_HEADERS,
        json={
            "run_id": "run-inv",
            "tool": "math.nope",
            "args": {},
            "allowed_tools": ["animation_tool.expand"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["layers"] == []
    assert payload["issues"][0]["code"] == "animation_tool.unknown_tool"


def test_animation_tool_expand_empty_allowlist_denied(client: TestClient) -> None:
    response = client.post(
        "/api/v1/agent/animation-tools/expand",
        headers=_AGENT_HEADERS,
        json={
            "tool": "math.show_function",
            "args": {"expression": "x**2", "x_min": -2, "x_max": 2},
            "allowed_tools": [],
        },
    )
    assert response.status_code == 403


def test_runtime_tool_list_requires_shared_token(client: TestClient) -> None:
    missing = client.get("/api/v1/agent/runtime-tools")
    ok = client.get(
        "/api/v1/agent/runtime-tools",
        headers=_AGENT_HEADERS,
    )

    assert missing.status_code == 401
    assert ok.status_code == 200
    names = {tool["name"] for tool in ok.json()["tools"]}
    assert "playbook.schema.validate" in names
    assert "geometry.assert_monotonic" in names


def test_runtime_tool_execute_returns_structured_result() -> None:
    client = _client_with_inventory("geometry.assert_monotonic")
    response = client.post(
        "/api/v1/agent/runtime-tools/execute",
        headers=_AGENT_HEADERS,
        json={
            "run_id": "run-inv",
            "tool": "geometry.assert_monotonic",
            "args": {"expression": "x**2", "x_min": 0.1, "x_max": 2.0},
            "allowed_tools": ["geometry.assert_monotonic"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["result"]["verdict"] == "increasing"


def test_runtime_tool_execute_unknown_tool_does_not_raise() -> None:
    # Unknown tools still require inventory membership before hub lookup.
    client = _client_with_inventory("tool.nope")
    response = client.post(
        "/api/v1/agent/runtime-tools/execute",
        headers=_AGENT_HEADERS,
        json={
            "run_id": "run-inv",
            "tool": "tool.nope",
            "args": {},
            "allowed_tools": ["tool.nope"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is False
    assert payload["error"]["code"] == "runtime_tool.unknown_tool"


def test_runtime_tool_execute_empty_allowlist_denies_scene_blueprint(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/v1/agent/runtime-tools/execute",
        headers=_AGENT_HEADERS,
        json={
            "tool": "scene_blueprint.compile",
            "args": {"blueprint": {}},
            "allowed_tools": [],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is False
    assert payload["error"]["code"] == "runtime_tool.capability_denied"


def test_runtime_tool_execute_star_is_not_superuser(client: TestClient) -> None:
    response = client.post(
        "/api/v1/agent/runtime-tools/execute",
        headers=_AGENT_HEADERS,
        json={
            "tool": "scene_blueprint.compile",
            "args": {"blueprint": {}},
            "allowed_tools": ["*"],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is False
    assert payload["error"]["code"] == "runtime_tool.capability_denied"


def test_runtime_tool_execute_client_cannot_widen_beyond_server_inventory() -> None:
    client = _client_with_inventory("geometry.assert_monotonic")
    response = client.post(
        "/api/v1/agent/runtime-tools/execute",
        headers=_AGENT_HEADERS,
        json={
            "run_id": "run-inv",
            "tool": "scene_blueprint.compile",
            "args": {"blueprint": {}},
            "allowed_tools": ["scene_blueprint.compile"],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is False
    assert payload["error"]["code"] == "runtime_tool.capability_denied"


def test_runtime_tool_execute_uses_server_inventory_when_client_list_empty() -> None:
    client = _client_with_inventory("geometry.assert_monotonic")
    response = client.post(
        "/api/v1/agent/runtime-tools/execute",
        headers=_AGENT_HEADERS,
        json={
            "run_id": "run-inv",
            "tool": "geometry.assert_monotonic",
            "args": {"expression": "x**2", "x_min": 0.1, "x_max": 2.0},
            "allowed_tools": [],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["result"]["verdict"] == "increasing"


def test_runtime_tool_execute_unknown_run_denies_non_internal_tools(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/v1/agent/runtime-tools/execute",
        headers=_AGENT_HEADERS,
        json={
            "run_id": "missing-run",
            "tool": "scene_blueprint.compile",
            "args": {"blueprint": {}},
            "allowed_tools": ["scene_blueprint.compile"],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is False
    assert payload["error"]["code"] == "runtime_tool.capability_denied"
