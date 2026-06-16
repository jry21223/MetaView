"""Tests for the /api/v1/agent/assert/* endpoints exposed for the Node sidecar."""

from __future__ import annotations

import math
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import create_app


@pytest.fixture(autouse=True)
def clear_settings_cache() -> Generator[None, None, None]:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app())


def test_orientation_endpoint_returns_clockwise_for_cos_negative_sin(
    client: TestClient,
) -> None:
    response = client.post(
        "/api/v1/agent/assert/orientation",
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
        json={"expression": "x**2", "x_min": 0.1, "x_max": 2.0},
    )
    assert response.json()["verdict"] == "increasing"


def test_monotonic_endpoint_mixed(client: TestClient) -> None:
    response = client.post(
        "/api/v1/agent/assert/monotonic",
        json={"expression": "x**2", "x_min": -1.0, "x_max": 1.0},
    )
    assert response.json()["verdict"] == "mixed"


def test_rejects_oversize_expression(client: TestClient) -> None:
    # Endpoint pydantic guard: max_length=256 on expression fields.
    big = "x" * 300
    response = client.post(
        "/api/v1/agent/assert/monotonic",
        json={"expression": big, "x_min": 0.0, "x_max": 1.0},
    )
    assert response.status_code == 422


def test_animation_tool_list_requires_shared_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("METAVIEW_AGENT_SHARED_TOKEN", "secret")
    get_settings.cache_clear()
    client = TestClient(create_app())

    missing = client.get("/api/v1/agent/animation-tools")
    wrong = client.get(
        "/api/v1/agent/animation-tools",
        headers={"X-MetaView-Agent-Token": "wrong"},
    )
    ok = client.get(
        "/api/v1/agent/animation-tools",
        headers={"X-MetaView-Agent-Token": "secret"},
    )

    assert missing.status_code == 401
    assert wrong.status_code == 401
    assert ok.status_code == 200
    tools = ok.json()["tools"]
    tangent = next(tool for tool in tools if tool["name"] == "math.show_tangent")
    assert tangent["description"] == "Show a function and tangent line at a selected x value."
    assert tangent["args_schema"]["properties"]["expression"]["minLength"] == 1


def test_animation_tool_list_returns_args_schema(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("METAVIEW_AGENT_SHARED_TOKEN", "secret")
    get_settings.cache_clear()
    client = TestClient(create_app())

    response = client.get(
        "/api/v1/agent/animation-tools",
        headers={"X-MetaView-Agent-Token": "secret"},
    )

    assert response.status_code == 200
    tools = response.json()["tools"]
    show_function = next(tool for tool in tools if tool["name"] == "math.show_function")
    schema = show_function["args_schema"]
    assert schema["type"] == "object"
    assert schema["properties"]["expression"]["minLength"] == 1
    assert "x_min" in schema["properties"]
    assert "x_max" in schema["properties"]


def test_animation_tool_expand_returns_layers_with_issues_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("METAVIEW_AGENT_SHARED_TOKEN", "secret")
    get_settings.cache_clear()
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/agent/animation-tools/expand",
        headers={"X-MetaView-Agent-Token": "secret"},
        json={
            "tool": "math.show_function",
            "args": {"expression": "x**2", "x_min": -2, "x_max": 2},
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["issues"] == []
    assert payload["layers"]
    assert payload["layers"][0]["kind"] == "math_plot"


def test_animation_tool_expand_reports_unknown_tool(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("METAVIEW_AGENT_SHARED_TOKEN", "secret")
    get_settings.cache_clear()
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/agent/animation-tools/expand",
        headers={"X-MetaView-Agent-Token": "secret"},
        json={"tool": "math.nope", "args": {}},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["layers"] == []
    assert payload["issues"][0]["code"] == "animation_tool.unknown_tool"
