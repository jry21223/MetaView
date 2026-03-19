import httpx
import pytest

from app.schemas import CirDocument
from app.services.providers.openai import (
    OpenAICompatibleProvider,
    ProviderInvocationError,
    _extract_json_object,
)


def test_extract_json_object_parses_response() -> None:
    payload = _extract_json_object(
        'prefix {"focus":"test","concepts":["a"],"warnings":[]} suffix'
    )
    assert payload["focus"] == "test"


def test_extract_json_object_rejects_invalid_payload() -> None:
    with pytest.raises(ProviderInvocationError):
        _extract_json_object("not-json")


def test_openai_provider_wraps_timeout_as_provider_error(monkeypatch) -> None:
    provider = OpenAICompatibleProvider(
        api_key="test-key",
        model="test-model",
        base_url="https://example.com/v1",
        timeout_s=3,
    )

    def fake_post(*args, **kwargs):
        raise httpx.ReadTimeout("timed out")

    monkeypatch.setattr(httpx, "post", fake_post)

    with pytest.raises(ProviderInvocationError, match="Provider 请求超时"):
        provider.plan(
            prompt="解释二分查找",
            domain="algorithm",
            skill_brief="突出边界收缩",
        )


def test_openai_provider_exposes_raw_output_on_trace(monkeypatch) -> None:
    provider = OpenAICompatibleProvider(
        api_key="test-key",
        model="test-model",
        base_url="https://example.com/v1",
    )

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {
                "choices": [
                    {
                        "message": {
                            "content": (
                                '{"focus":"突出边界收缩","concepts":["left","mid","right"],'
                                '"warnings":[]}'
                            )
                        }
                    }
                ]
            }

    def fake_post(*args, **kwargs):
        return FakeResponse()

    monkeypatch.setattr(httpx, "post", fake_post)

    hints, trace = provider.plan(
        prompt="解释二分查找",
        domain="algorithm",
        skill_brief="突出边界收缩",
    )

    assert hints.focus == "突出边界收缩"
    assert trace.raw_output is not None
    assert '"focus":"突出边界收缩"' in trace.raw_output


def test_openai_provider_retries_remote_protocol_error_without_env_proxy(monkeypatch) -> None:
    provider = OpenAICompatibleProvider(
        api_key="test-key",
        model="test-model",
        base_url="https://example.com/v1",
    )

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {
                "choices": [
                    {
                        "message": {
                            "content": "reachable"
                        }
                    }
                ]
            }

    calls: list[bool] = []

    def fake_post(*args, **kwargs):
        calls.append(bool(kwargs.get("trust_env", True)))
        if kwargs.get("trust_env", True):
            raise httpx.RemoteProtocolError("Server disconnected without sending a response.")
        return FakeResponse()

    monkeypatch.setattr(httpx, "post", fake_post)

    message, raw_output = provider.test_connection()

    assert message == "reachable"
    assert raw_output == "reachable"
    assert calls == [True, False]


def test_openai_provider_reports_remote_protocol_error_with_endpoint(monkeypatch) -> None:
    provider = OpenAICompatibleProvider(
        api_key="test-key",
        model="test-model",
        base_url="https://example.com/v1",
    )

    def fake_post(*args, **kwargs):
        raise httpx.RemoteProtocolError("Server disconnected without sending a response.")

    monkeypatch.setattr(httpx, "post", fake_post)

    with pytest.raises(ProviderInvocationError) as exc_info:
        provider.test_connection()

    detail = str(exc_info.value)
    assert "RemoteProtocolError" in detail
    assert "Server disconnected without sending a response." in detail
    assert "https://example.com/v1/chat/completions" in detail
    assert "不兼容 OpenAI `/chat/completions` 协议" in detail


def test_openai_provider_retries_connect_error_without_env_proxy(monkeypatch) -> None:
    provider = OpenAICompatibleProvider(
        api_key="test-key",
        model="test-model",
        base_url="https://example.com/v1",
    )

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {
                "choices": [
                    {
                        "message": {
                            "content": "reachable"
                        }
                    }
                ]
            }

    calls: list[bool] = []

    def fake_post(*args, **kwargs):
        calls.append(bool(kwargs.get("trust_env", True)))
        if kwargs.get("trust_env", True):
            raise httpx.ConnectError(
                "[SSL: UNEXPECTED_EOF_WHILE_READING] EOF occurred in violation of protocol"
            )
        return FakeResponse()

    monkeypatch.setattr(httpx, "post", fake_post)

    message, raw_output = provider.test_connection()

    assert message == "reachable"
    assert raw_output == "reachable"
    assert calls == [True, False]


def test_openai_provider_uses_stage_specific_models(monkeypatch) -> None:
    provider = OpenAICompatibleProvider(
        api_key="test-key",
        model="default-model",
        stage_models={
            "router": "router-small",
            "planning": "planner-medium",
            "coding": "coder-large",
            "critic": "critic-medium",
            "test": "probe-mini",
        },
        base_url="https://example.com/v1",
    )

    class FakeResponse:
        def __init__(self, content: str) -> None:
            self._content = content

        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {"choices": [{"message": {"content": self._content}}]}

    seen_models: list[str] = []

    def fake_post(*args, **kwargs):
        model = kwargs["json"]["model"]
        seen_models.append(model)
        content_by_model = {
            "router-small": '{"domain":"algorithm","reason":"route with small model"}',
            "planner-medium": '{"focus":"plan with medium model","concepts":[],"warnings":[]}',
            "coder-large": (
                "from manim import *\n\n"
                "class Demo(Scene):\n"
                "    def construct(self):\n"
                "        self.wait(0.1)\n"
            ),
            "critic-medium": '{"checks":["ok"],"warnings":[]}',
            "probe-mini": "reachable",
        }
        return FakeResponse(content_by_model[model])

    monkeypatch.setattr(httpx, "post", fake_post)

    domain, route_trace = provider.route("解释二分查找")
    planning_hints, plan_trace = provider.plan(
        prompt="解释二分查找",
        domain="algorithm",
        skill_brief="突出边界收缩",
    )
    _, code_trace = provider.code(
        CirDocument(
            title="二分查找",
            domain=domain,
            summary="摘要",
            steps=[],
        )
    )
    _, critique_trace = provider.critique(
        title="二分查找",
        renderer_script="from manim import *",
        domain=domain,
    )
    message, _ = provider.test_connection()

    assert planning_hints.focus == "plan with medium model"
    assert message == "reachable"
    assert route_trace.model == "router-small"
    assert plan_trace.model == "planner-medium"
    assert code_trace.model == "coder-large"
    assert critique_trace.model == "critic-medium"
    assert provider.descriptor.stage_models == {
        "router": "router-small",
        "planning": "planner-medium",
        "coding": "coder-large",
        "critic": "critic-medium",
        "test": "probe-mini",
    }
    assert seen_models == [
        "router-small",
        "planner-medium",
        "coder-large",
        "critic-medium",
        "probe-mini",
    ]
