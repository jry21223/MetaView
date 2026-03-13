from fastapi.testclient import TestClient

from app.main import app, orchestrator
from app.schemas import AgentTrace, ProviderDescriptor, ProviderKind, TopicDomain
from app.services.providers.base import CodingHints, CritiqueHints, PlanningHints

client = TestClient(app)


def test_healthcheck() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_pipeline_returns_cir() -> None:
    response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请可视化讲解二分查找为什么能在有序数组中快速定位答案。",
            "provider": "mock",
            "sandbox_mode": "dry_run",
        },
    )
    assert response.status_code == 200

    payload = response.json()
    assert payload["cir"]["domain"] == "algorithm"
    assert len(payload["cir"]["steps"]) == 3
    assert "previewTimeline" in payload["renderer_script"]
    assert payload["runtime"]["skill"]["id"] == "algorithm-process-viz"
    assert payload["runtime"]["router_provider"]["name"] == "mock"
    assert payload["runtime"]["generation_provider"]["name"] == "mock"
    assert payload["runtime"]["provider"]["name"] == "mock"
    assert payload["runtime"]["sandbox"]["status"] == "passed"
    assert payload["runtime"]["validation"]["status"] == "valid"
    assert payload["runtime"]["repair_count"] == 0
    assert payload["runtime"]["agent_traces"][0]["agent"] == "router"


def test_runtime_catalog() -> None:
    response = client.get("/api/v1/runtime")
    assert response.status_code == 200

    payload = response.json()
    assert payload["default_provider"] == "mock"
    assert payload["default_router_provider"] == "mock"
    assert payload["default_generation_provider"] == "mock"
    assert payload["sandbox_engine"] == "preview-dry-run"
    assert payload["providers"][0]["name"] == "mock"
    assert payload["providers"][0]["label"] == "Mock Provider"
    assert payload["providers"][1]["name"] == "openai"
    assert payload["providers"][1]["configured"] is False
    assert any(skill["id"] == "physics-simulation-viz" for skill in payload["skills"])


def test_runtime_catalog_allows_local_dev_cors_origin() -> None:
    response = client.get(
        "/api/v1/runtime",
        headers={"Origin": "http://127.0.0.1:4174"},
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:4174"


def test_pipeline_runs_history_endpoints() -> None:
    pipeline_response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请讲解动态规划中的状态定义与转移。",
            "provider": "mock",
            "sandbox_mode": "dry_run",
            "persist_run": True,
        },
    )
    assert pipeline_response.status_code == 200
    request_id = pipeline_response.json()["request_id"]

    list_response = client.get("/api/v1/runs")
    assert list_response.status_code == 200
    runs = list_response.json()
    assert any(item["request_id"] == request_id for item in runs)

    detail_response = client.get(f"/api/v1/runs/{request_id}")
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["request"]["prompt"] == "请讲解动态规划中的状态定义与转移。"
    assert detail["request"]["domain"] == "algorithm"
    assert detail["request"]["router_provider"] == "mock"
    assert detail["request"]["generation_provider"] == "mock"
    assert detail["response"]["request_id"] == request_id


def test_physics_pipeline_supports_static_image_prompt() -> None:
    response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请根据题图讲解斜面上小球的受力、加速度与运动轨迹。",
            "provider": "mock",
            "source_image": "data:image/png;base64,ZmFrZS1pbWFnZS1ieXRlcw==",
            "source_image_name": "inclined-plane.png",
            "sandbox_mode": "dry_run",
        },
    )
    assert response.status_code == 200

    payload = response.json()
    assert payload["runtime"]["skill"]["id"] == "physics-simulation-viz"
    assert payload["cir"]["domain"] == "physics"
    assert any(step["title"] == "题图解析" for step in payload["cir"]["steps"])
    assert "静态题图" in payload["cir"]["summary"]


def test_custom_provider_crud() -> None:
    create_response = client.post(
        "/api/v1/providers/custom",
        json={
            "name": "local-ollama",
            "label": "Local Ollama",
            "base_url": "http://127.0.0.1:11434/v1",
            "model": "qwen2.5-coder",
            "api_key": "",
            "description": "本地自定义 provider",
            "temperature": 0.1,
            "supports_vision": True,
            "enabled": True,
        },
    )
    assert create_response.status_code == 200
    payload = create_response.json()
    assert payload["name"] == "local-ollama"
    assert payload["is_custom"] is True
    assert payload["supports_vision"] is True

    runtime_response = client.get("/api/v1/runtime")
    providers = runtime_response.json()["providers"]
    assert any(provider["name"] == "local-ollama" for provider in providers)

    delete_response = client.delete("/api/v1/providers/custom/local-ollama")
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] is True


def test_pipeline_supports_dual_provider_orchestration(monkeypatch) -> None:
    class RouterStubProvider:
        descriptor = ProviderDescriptor(
            name="router-stub",
            label="Router Stub",
            kind=ProviderKind.MOCK,
            model="router-model-v1",
            description="stub router",
            configured=True,
        )

        def route(
            self, prompt: str, source_image: str | None = None
        ) -> tuple[TopicDomain, AgentTrace]:
            return (
                TopicDomain.MATH,
                AgentTrace(
                    agent="router",
                    provider=self.descriptor.name,
                    model=self.descriptor.model,
                    summary="router stub picked math",
                ),
            )

        def plan(self, *args, **kwargs):
            raise AssertionError("router provider should not handle planning")

        def code(self, *args, **kwargs):
            raise AssertionError("router provider should not handle coding")

        def critique(self, *args, **kwargs):
            raise AssertionError("router provider should not handle critique")

    class GenerationStubProvider:
        descriptor = ProviderDescriptor(
            name="generation-stub",
            label="Generation Stub",
            kind=ProviderKind.OPENAI_COMPATIBLE,
            model="generation-model-v2",
            description="stub generation",
            configured=True,
        )

        def route(self, *args, **kwargs):
            raise AssertionError("generation provider should not handle routing")

        def plan(
            self,
            prompt: str,
            domain: str,
            skill_brief: str,
            source_image: str | None = None,
        ) -> tuple[PlanningHints, AgentTrace]:
            return (
                PlanningHints(
                    focus="突出函数和切线",
                    concepts=["函数", "切线", "变化率"],
                    warnings=[],
                ),
                AgentTrace(
                    agent="planner",
                    provider=self.descriptor.name,
                    model=self.descriptor.model,
                    summary="generation stub planned math flow",
                ),
            )

        def code(self, title: str, step_count: int) -> tuple[CodingHints, AgentTrace]:
            return (
                CodingHints(
                    target="manim-web-ts",
                    style_notes=["keep timeline deterministic"],
                ),
                AgentTrace(
                    agent="coder",
                    provider=self.descriptor.name,
                    model=self.descriptor.model,
                    summary=f"generation stub coded {step_count} steps",
                ),
            )

        def critique(
            self, title: str, renderer_script: str
        ) -> tuple[CritiqueHints, AgentTrace]:
            return (
                CritiqueHints(
                    checks=["check overlap", "check narration density"],
                    warnings=[],
                ),
                AgentTrace(
                    agent="critic",
                    provider=self.descriptor.name,
                    model=self.descriptor.model,
                    summary="generation stub reviewed renderer",
                ),
            )

    original_get = orchestrator.provider_registry.get

    def fake_get(name: str):
        if name == "router-stub":
            return RouterStubProvider()
        if name == "generation-stub":
            return GenerationStubProvider()
        return original_get(name)

    monkeypatch.setattr(orchestrator.provider_registry, "get", fake_get)

    response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请讲解导数如何表示函数在一点附近的变化率。",
            "router_provider": "router-stub",
            "generation_provider": "generation-stub",
            "sandbox_mode": "dry_run",
            "persist_run": False,
        },
    )
    assert response.status_code == 200

    payload = response.json()
    traces = {trace["agent"]: trace for trace in payload["runtime"]["agent_traces"]}
    assert payload["cir"]["domain"] == "math"
    assert payload["runtime"]["router_provider"]["name"] == "router-stub"
    assert payload["runtime"]["generation_provider"]["name"] == "generation-stub"
    assert traces["router"]["provider"] == "router-stub"
    assert traces["planner"]["provider"] == "generation-stub"
    assert traces["coder"]["provider"] == "generation-stub"
    assert traces["critic"]["provider"] == "generation-stub"
