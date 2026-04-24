import json
import time

from fastapi.testclient import TestClient

from app.main import app, orchestrator
from app.schemas import (
    AgentTrace,
    CirDocument,
    CirStep,
    CustomProviderUpsertRequest,
    PipelineRunStatus,
    ProviderDefaultsRequest,
    ProviderDescriptor,
    ProviderKind,
    RuntimeSettingsRequest,
    TopicDomain,
    TTSSettingsRequest,
    VisualKind,
    VisualToken,
)
from app.services.preview_video_renderer import PreviewVideoArtifacts
from app.services.providers.base import CodingHints, CritiqueHints, PlanningHints
from app.services.providers.openai import ProviderInvocationError
from app.services.skill_catalog import SubjectSkillRegistry

client = TestClient(app)


def _stub_preview_renderer(monkeypatch, tmp_path) -> None:
    def fake_render(**kwargs):
        request_id = kwargs["request_id"]
        output = tmp_path / f"{request_id}.mp4"
        output.write_bytes(b"fake")
        return PreviewVideoArtifacts(
            file_path=output,
            url=f"/media/{output.name}",
            backend="storyboard-fallback",
        )

    monkeypatch.setattr(orchestrator.preview_video_renderer, "render", fake_render)
    monkeypatch.setattr(orchestrator.video_narration_service, "is_available", lambda: False)


def _run_pipeline(payload: dict, monkeypatch, tmp_path) -> dict:
    _stub_preview_renderer(monkeypatch, tmp_path)
    response = client.post("/api/v1/pipeline", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["preview_video_url"]
    return data


def _make_unsafe_math_cir() -> CirDocument:
    return CirDocument(
        title='<img src=x onerror=alert("prompt")>',
        domain=TopicDomain.MATH,
        summary='</script><script>alert(1)</script>',
        steps=[
            CirStep(
                id="step-1",
                title='<svg onload=alert(2)>',
                narration='line <b>narration</b>',
                visual_kind=VisualKind.FORMULA,
                tokens=[
                    VisualToken(
                        id="token-1",
                        label="<b>token</b>",
                        value='<img src=x onerror=alert(3)>',
                        emphasis="primary",
                    )
                ],
                annotations=[],
            )
        ],
    )


def _wait_for_run_status(
    request_id: str,
    *,
    timeout_s: float = 5.0,
    poll_interval_s: float = 0.05,
) -> dict:
    deadline = time.time() + timeout_s
    last_payload: dict | None = None
    while time.time() < deadline:
        response = client.get(f"/api/v1/runs/{request_id}")
        assert response.status_code == 200
        last_payload = response.json()
        if last_payload["status"] in {
            PipelineRunStatus.SUCCEEDED.value,
            PipelineRunStatus.FAILED.value,
        }:
            return last_payload
        time.sleep(poll_interval_s)
    raise AssertionError(f"Timed out waiting for run {request_id}: {last_payload}")


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
    assert "from manim import *" in payload["renderer_script"]
    assert "class GeneratedPreviewScene(Scene):" in payload["renderer_script"]
    assert "_algo_vis_pick_cjk_font" in payload["renderer_script"]
    assert payload["preview_video_url"]
    assert payload["runtime"]["skill"]["id"] == "algorithm-process-viz"
    assert payload["runtime"]["router_provider"]["name"] == "mock"
    assert payload["runtime"]["generation_provider"]["name"] == "mock"
    assert payload["runtime"]["provider"]["name"] == "mock"
    assert payload["runtime"]["sandbox"]["status"] == "passed"
    assert payload["runtime"]["validation"]["status"] == "valid"
    assert payload["runtime"]["repair_count"] == 0
    assert payload["runtime"]["agent_traces"][0]["agent"] == "router"
    video_response = client.get(payload["preview_video_url"])
    assert video_response.status_code == 200
    assert "video/mp4" in video_response.headers["content-type"]


def test_runtime_catalog() -> None:
    # Ensure mock provider is enabled and default providers are cleared for this test
    orchestrator.update_runtime_settings(
        RuntimeSettingsRequest(
            mock_provider_enabled=True,
            default_providers=ProviderDefaultsRequest(
                default_provider=None,
                default_router_provider=None,
                default_generation_provider=None,
            ),
        )
    )

    response = client.get("/api/v1/runtime")
    assert response.status_code == 200

    payload = response.json()
    assert payload["default_provider"] == "mock"
    assert payload["default_router_provider"] == "mock"
    assert payload["default_generation_provider"] == "mock"
    assert payload["sandbox_engine"] == "hybrid-runtime-dry-run"
    assert payload["providers"][0]["name"] == "mock"
    assert payload["providers"][0]["label"] == "Mock Provider"
    assert payload["providers"][1]["name"] == "openai"
    assert payload["providers"][1]["configured"] is False
    assert [skill["domain"] for skill in payload["skills"]] == [
        domain.value for domain in TopicDomain
    ]


def test_render_manim_endpoint_rejects_unsafe_script(monkeypatch) -> None:
    called: list[str] = []

    def fake_render(**kwargs):
        called.append("rendered")
        raise AssertionError("render should not be called")

    monkeypatch.setattr(orchestrator.preview_video_renderer, "render", fake_render)

    response = client.post(
        "/api/v1/manim/render",
        json={
            "source": "from manim import *\nimport os\n\nclass Demo(Scene):\n    def construct(self):\n        self.play(Write(Text('unsafe')))\n        self.wait(0.5)\n",
            "scene_class_name": "Demo",
            "require_real": True,
        },
    )

    assert response.status_code == 400
    assert "os" in response.json()["detail"].lower()
    assert called == []


def test_runtime_catalog_allows_local_dev_cors_origin() -> None:
    response = client.get(
        "/api/v1/runtime",
        headers={"Origin": "http://127.0.0.1:4174"},
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:4174"


def test_runtime_settings_endpoint_updates_tts_configuration() -> None:
    previous_settings = orchestrator.runtime_settings
    restore_payload = RuntimeSettingsRequest(
        mock_provider_enabled=previous_settings.mock_provider_enabled,
        tts=TTSSettingsRequest(
            enabled=previous_settings.tts.enabled,
            backend=previous_settings.tts.backend,
            model=previous_settings.tts.model,
            base_url=previous_settings.tts.base_url,
            api_key=previous_settings.tts.api_key,
            voice=previous_settings.tts.voice,
            rate_wpm=previous_settings.tts.rate_wpm,
            speed=previous_settings.tts.speed,
            max_chars=previous_settings.tts.max_chars,
            timeout_s=previous_settings.tts.timeout_s,
        ),
    )

    try:
        response = client.put(
            "/api/v1/runtime/settings",
            json={
                "mock_provider_enabled": False,
                "tts": {
                    "enabled": True,
                    "backend": "openai_compatible",
                    "model": "mimotts-v2",
                    "base_url": "https://tts.example.com/v1",
                    "api_key": "secret-tts-key",
                    "voice": "calm_female",
                    "rate_wpm": 136,
                    "speed": 0.82,
                    "max_chars": 1800,
                    "timeout_s": 90,
                },
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["mock_provider_enabled"] is False
        assert payload["tts"]["backend"] == "openai_compatible"
        assert payload["tts"]["model"] == "mimotts-v2"
        assert payload["tts"]["base_url"] == "https://tts.example.com/v1"
        assert payload["tts"]["api_key_configured"] is True
        assert payload["tts"]["voice"] == "calm_female"

        runtime_response = client.get("/api/v1/runtime")
        assert runtime_response.status_code == 200
        runtime_payload = runtime_response.json()
        assert runtime_payload["settings"]["mock_provider_enabled"] is False
        assert runtime_payload["settings"]["tts"]["api_key_configured"] is True
        assert all(provider["name"] != "mock" for provider in runtime_payload["providers"])
        assert runtime_payload["default_generation_provider"] == "openai"
    finally:
        orchestrator.update_runtime_settings(restore_payload)


def test_upsert_custom_provider_refreshes_runtime_dependencies(monkeypatch) -> None:
    payload = CustomProviderUpsertRequest(
        name="refresh-stub",
        label="Refresh Stub",
        base_url="https://example.com/v1",
        model="refresh-model",
        api_key="secret",
    )
    descriptor = ProviderDescriptor(
        name="refresh-stub",
        label="Refresh Stub",
        kind=ProviderKind.OPENAI_COMPATIBLE,
        model="refresh-model",
        description="refresh test",
        configured=True,
        is_custom=True,
    )
    calls: list[str] = []

    monkeypatch.setattr(
        orchestrator.provider_registry,
        "upsert_custom_provider",
        lambda value: descriptor,
    )
    monkeypatch.setattr(
        orchestrator,
        "_refresh_runtime_dependencies",
        lambda: calls.append("refreshed"),
    )

    returned = orchestrator.upsert_custom_provider(payload)

    assert returned == descriptor
    assert calls == ["refreshed"]


def test_delete_custom_provider_refreshes_runtime_dependencies_when_deleted(
    monkeypatch,
) -> None:
    calls: list[str] = []

    monkeypatch.setattr(
        orchestrator.provider_registry,
        "delete_custom_provider",
        lambda name: True,
    )
    monkeypatch.setattr(
        orchestrator,
        "_refresh_runtime_dependencies",
        lambda: calls.append("refreshed"),
    )

    deleted = orchestrator.delete_custom_provider("refresh-stub")

    assert deleted is True
    assert calls == ["refreshed"]


def test_generate_prompt_reference_endpoint(monkeypatch) -> None:
    class PromptStubProvider:
        descriptor = ProviderDescriptor(
            name="prompt-stub",
            label="Prompt Stub",
            kind=ProviderKind.OPENAI_COMPATIBLE,
            model="prompt-model-v1",
            description="stub prompt authoring provider",
            configured=True,
        )

        def model_for_stage(self, stage: str) -> str:
            assert stage == "planning"
            return "prompt-model-v1"

        def complete_text(
            self,
            *,
            stage: str,
            system_prompt: str,
            user_prompt: str,
            source_image: str | None = None,
        ) -> tuple[str, str]:
            assert stage == "planning"
            assert "router -> planner -> coder -> critic -> repair" in user_prompt
            return (
                """
# Algorithm Prompt Guidance

## Common
- one
- two
- three
- four

## Planner
- one
- two
- three
- four

## Coder
- one
- two
- three
- four

## Critic
- one
- two
- three
- four

## Repair
- one
- two
- three
- four
                """.strip(),
                "raw markdown output",
            )

    original_get = orchestrator.provider_registry.get

    def fake_get(name: str):
        if name == "prompt-stub":
            return PromptStubProvider()
        return original_get(name)

    monkeypatch.setattr(orchestrator.provider_registry, "get", fake_get)

    response = client.post(
        "/api/v1/prompts/reference",
        json={
            "subject": "algorithm",
            "provider": "prompt-stub",
            "notes": "强调循环不变量和边界同步。",
            "write": False,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["subject"] == "algorithm"
    assert payload["provider"] == "prompt-stub"
    assert payload["model"] == "prompt-model-v1"
    assert payload["wrote_file"] is False
    assert payload["output_path"].endswith(
        "skills/generate-subject-manim-prompts/references/algorithm.md"
    )
    assert payload["markdown"].startswith("# Algorithm Prompt Guidance")


def test_generate_custom_subject_prompt_endpoint(monkeypatch) -> None:
    class PromptStubProvider:
        descriptor = ProviderDescriptor(
            name="prompt-stub",
            label="Prompt Stub",
            kind=ProviderKind.OPENAI_COMPATIBLE,
            model="prompt-model-v1",
            description="stub prompt authoring provider",
            configured=True,
        )

        def model_for_stage(self, stage: str) -> str:
            assert stage == "planning"
            return "prompt-model-v1"

        def complete_text(
            self,
            *,
            stage: str,
            system_prompt: str,
            user_prompt: str,
            source_image: str | None = None,
        ) -> tuple[str, str]:
            assert stage == "planning"
            assert "new subject tool" in user_prompt.lower()
            assert "transport phenomena" in user_prompt.lower()
            return (
                """
# Transport Phenomena Prompt Guidance

## Common
- one
- two
- three
- four

## Planner
- one
- two
- three
- four

## Coder
- one
- two
- three
- four

## Critic
- one
- two
- three
- four

## Repair
- one
- two
- three
- four
                """.strip(),
                "raw markdown output",
            )

    original_get = orchestrator.provider_registry.get

    def fake_get(name: str):
        if name == "prompt-stub":
            return PromptStubProvider()
        return original_get(name)

    monkeypatch.setattr(orchestrator.provider_registry, "get", fake_get)

    response = client.post(
        "/api/v1/prompts/custom-subject",
        json={
            "subject_name": "Transport Phenomena",
            "provider": "prompt-stub",
            "summary": "面向传热、传质、动量传递的教学动画提示词。",
            "notes": "强调守恒量、通量方向与边界条件。",
            "write": False,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["subject_name"] == "Transport Phenomena"
    assert payload["provider"] == "prompt-stub"
    assert payload["model"] == "prompt-model-v1"
    assert payload["slug"].startswith("transport-phenomena-")
    assert payload["wrote_file"] is False
    assert payload["output_path"].endswith(
        f"skills/generated-subject-prompts/{payload['slug']}.md"
    )
    assert payload["markdown"].startswith("# Transport Phenomena Prompt Guidance")


def test_prepare_manim_endpoint_extracts_and_wraps_code() -> None:
    response = client.post(
        "/api/v1/manim/prepare",
        json={
            "source": """
<think>
internal reasoning
</think>

```python3
def construct(self):
    text = Text("hello")
    self.play(Write(text))
```
            """.strip()
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["is_runnable"] is True
    assert payload["scene_class_name"] == "GeneratedScene"
    assert "from manim import *" in payload["code"]
    assert "class GeneratedScene(Scene):" in payload["code"]
    assert "def construct(self):" in payload["code"]
    assert payload["diagnostics"]


def test_render_manim_endpoint_supports_fallback_backend() -> None:
    response = client.post(
        "/api/v1/manim/render",
        json={
            "source": """
```python
from manim import *

class Demo(Scene):
    def construct(self):
        title = Text("hello render")
        self.play(Write(title))
        self.wait(0.5)
```
            """.strip(),
            "require_real": False,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["preview_video_url"]
    assert payload["render_backend"] in {"manim-cli", "storyboard-fallback"}


def test_render_manim_endpoint_uses_embedded_fallback_without_ffmpeg(monkeypatch) -> None:
    fallback_backend = orchestrator.preview_video_renderer.backends["fallback"]
    monkeypatch.setattr(fallback_backend, "ffmpeg_binary", None)

    response = client.post(
        "/api/v1/manim/render",
        json={
            "source": """
```python
from manim import *

class Demo(Scene):
    def construct(self):
        title = Text("hello render")
        self.play(Write(title))
        self.wait(0.5)
```
            """.strip(),
            "require_real": False,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["render_backend"] == "storyboard-fallback"

    video_response = client.get(payload["preview_video_url"])
    assert video_response.status_code == 200
    assert video_response.content


def test_render_manim_endpoint_can_embed_narration(monkeypatch, tmp_path) -> None:
    def fake_render(
        *,
        script: str,
        request_id: str,
        scene_class_name: str,
        require_real: bool,
        ui_theme: str | None = None,
    ):
        output = tmp_path / f"{request_id}.mp4"
        output.write_bytes(b"fake")
        return PreviewVideoArtifacts(
            file_path=output,
            url="/media/fake-render.mp4",
            backend="storyboard-fallback",
        )

    recorded: dict[str, str] = {}

    def fake_embed(*, request_id: str, video_path, narration_text: str):
        recorded["request_id"] = request_id
        recorded["text"] = narration_text
        return type(
            "NarrationArtifacts",
            (),
            {
                "tts_backend": "say",
                "audio_path": tmp_path / f"{request_id}.m4a",
            },
        )()

    monkeypatch.setattr(orchestrator.preview_video_renderer, "render", fake_render)
    monkeypatch.setattr(orchestrator.video_narration_service, "is_available", lambda: True)
    monkeypatch.setattr(orchestrator.video_narration_service, "embed_narration", fake_embed)

    response = client.post(
        "/api/v1/manim/render",
        json={
            "source": """
```python
from manim import *

class Demo(Scene):
    def construct(self):
        title = Text("hello render")
        self.play(Write(title))
        self.wait(0.5)
```
            """.strip(),
            "require_real": False,
            "narration_text": "这是一个测试旁白。",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["preview_video_url"] == "/media/fake-render.mp4"
    assert any("嵌入旁白" in diagnostic for diagnostic in payload["diagnostics"])
    assert recorded["text"] == "这是一个测试旁白。"


def test_pipeline_runs_history_endpoints() -> None:
    pipeline_response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请讲解动态规划中的状态定义与转移。",
            "domain": "algorithm",
            "provider": "mock",
            "sandbox_mode": "dry_run",
            "persist_run": True,
            "source_image": "data:image/png;base64,ZmFrZS1pbWFnZS1ieXRlcw==",
            "source_image_name": "dp.png",
        },
    )
    assert pipeline_response.status_code == 200
    request_id = pipeline_response.json()["request_id"]

    list_response = client.get("/api/v1/runs")
    assert list_response.status_code == 200
    runs = list_response.json()
    run_summary = next(item for item in runs if item["request_id"] == request_id)
    assert run_summary["status"] == "succeeded"
    assert run_summary["output_mode"] == "video"

    detail_response = client.get(f"/api/v1/runs/{request_id}")
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["status"] == "succeeded"
    assert detail["request"]["prompt"] == "请讲解动态规划中的状态定义与转移。"
    assert detail["request"]["domain"] == "algorithm"
    assert detail["request"]["source_image"] is None
    assert detail["request"]["source_image_name"] == "dp.png"
    assert detail["request"]["router_provider"] == "mock"
    assert detail["request"]["generation_provider"] == "mock"
    assert detail["response"]["request_id"] == request_id

    hydrated_detail_response = client.get(
        f"/api/v1/runs/{request_id}?include_source_image=true"
    )
    assert hydrated_detail_response.status_code == 200
    hydrated_detail = hydrated_detail_response.json()
    assert (
        hydrated_detail["request"]["source_image"]
        == "data:image/png;base64,ZmFrZS1pbWFnZS1ieXRlcw=="
    )


def test_pipeline_submit_runs_in_background(monkeypatch, tmp_path) -> None:
    _stub_preview_renderer(monkeypatch, tmp_path)

    submit_response = client.post(
        "/api/v1/pipeline/submit",
        json={
            "prompt": "请讲解快速排序的分区过程。",
            "provider": "mock",
            "sandbox_mode": "dry_run",
            "output_mode": "html",
        },
    )
    assert submit_response.status_code == 200
    payload = submit_response.json()
    assert payload["status"] == "queued"

    request_id = payload["request_id"]
    detail = _wait_for_run_status(request_id)
    assert detail["status"] == "succeeded"
    assert detail["request"]["prompt"] == "请讲解快速排序的分区过程。"
    assert detail["request"]["output_mode"] == "html"
    assert detail["response"]["request_id"] == request_id
    assert detail["response"]["preview_html_url"] is None
    assert detail["response"]["preview_video_url"] is None
    assert detail["response"]["playbook"] is not None
    assert detail["response"]["playbook"]["fps"] == 30
    assert len(detail["response"]["playbook"]["steps"]) > 0

    list_response = client.get("/api/v1/runs")
    assert list_response.status_code == 200
    runs = list_response.json()
    run_summary = next(item for item in runs if item["request_id"] == request_id)
    assert run_summary["status"] == "succeeded"
    assert run_summary["output_mode"] == "html"


def test_pipeline_submit_persists_failure(monkeypatch) -> None:
    def raise_invoke_error(*args, **kwargs):
        raise RuntimeError("provider exploded")

    monkeypatch.setattr(orchestrator.coder, "run", raise_invoke_error)

    submit_response = client.post(
        "/api/v1/pipeline/submit",
        json={
            "prompt": "请讲解哈希表的冲突处理。",
            "provider": "mock",
            "sandbox_mode": "dry_run",
        },
    )
    assert submit_response.status_code == 200
    request_id = submit_response.json()["request_id"]

    detail = _wait_for_run_status(request_id)
    assert detail["status"] == "failed"
    assert "RuntimeError: provider exploded" in detail["error_message"]
    assert "error_id=" in detail["error_message"]
    assert detail["response"] is None


def test_pipeline_unhandled_error_returns_detail_and_error_id(
    monkeypatch,
) -> None:
    def raise_unhandled(*args, **kwargs):
        raise RuntimeError("unexpected renderer failure")

    error_client = TestClient(app, raise_server_exceptions=False)
    monkeypatch.setattr(orchestrator, "run", raise_unhandled)

    response = error_client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请讲解最短路算法。",
            "provider": "mock",
            "sandbox_mode": "dry_run",
        },
    )

    assert response.status_code == 500
    payload = response.json()
    assert payload["detail"] == "RuntimeError: unexpected renderer failure"
    assert payload["error_type"] == "RuntimeError"
    assert len(payload["error_id"]) >= 8
    assert "journalctl -u metaview-api" in payload["log_hint"]


def test_pipeline_run_not_found_returns_error_metadata() -> None:
    response = client.get("/api/v1/runs/not-a-real-run")

    assert response.status_code == 404
    payload = response.json()
    assert payload["detail"] == "Pipeline run not found"
    assert payload["status_code"] == 404
    assert len(payload["error_id"]) >= 8


def test_pipeline_routes_source_code_to_code_domain() -> None:
    response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请根据源码讲解这个算法的状态变化。",
            "provider": "mock",
            "source_code_language": "cpp",
            "source_code": """
#include <vector>
using namespace std;

int binarySearch(vector<int>& nums, int target) {
    int left = 0, right = nums.size() - 1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (nums[mid] == target) return mid;
        if (nums[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1;
}
            """.strip(),
            "sandbox_mode": "dry_run",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["cir"]["domain"] == "code"
    assert payload["runtime"]["skill"]["id"] == "source-code-algorithm-viz"
    assert "binary search" in payload["cir"]["summary"].lower()


def test_pipeline_routes_physics_prompt_to_physics_domain(monkeypatch, tmp_path) -> None:
    payload = _run_pipeline(
        {
            "prompt": "请根据题图讲解斜面上小球的受力、加速度与运动轨迹。",
            "provider": "mock",
            "source_image": "data:image/png;base64,ZmFrZS1pbWFnZS1ieXRlcw==",
            "source_image_name": "inclined-plane.png",
            "sandbox_mode": "dry_run",
            "persist_run": False,
        },
        monkeypatch,
        tmp_path,
    )
    assert payload["cir"]["domain"] == "physics"
    assert payload["runtime"]["skill"]["id"] == "physics-simulation-viz"
    assert payload["runtime"]["skill"]["supports_image_input"] is True
    assert payload["cir"]["steps"][0]["title"] == "题图解析"
    assert payload["cir"]["steps"][1]["title"] == "受力建模"
    assert "静态题图" in payload["cir"]["summary"]


def test_pipeline_routes_chemistry_prompt_to_chemistry_domain(monkeypatch, tmp_path) -> None:
    payload = _run_pipeline(
        {
            "prompt": "请可视化讲解分子结构中化学键的变化以及反应过程。",
            "provider": "mock",
            "sandbox_mode": "dry_run",
            "persist_run": False,
        },
        monkeypatch,
        tmp_path,
    )
    assert payload["cir"]["domain"] == "chemistry"
    assert payload["runtime"]["skill"]["id"] == "molecular-structure-viz"
    assert [step["title"] for step in payload["cir"]["steps"]] == [
        "结构识别",
        "反应推进",
        "结果解释",
    ]
    assert "化学题" in payload["cir"]["summary"]


def test_pipeline_routes_biology_prompt_to_biology_domain(monkeypatch, tmp_path) -> None:
    payload = _run_pipeline(
        {
            "prompt": "请可视化讲解细胞有丝分裂各阶段的结构变化和调控过程。",
            "provider": "mock",
            "sandbox_mode": "dry_run",
            "persist_run": False,
        },
        monkeypatch,
        tmp_path,
    )
    assert payload["cir"]["domain"] == "biology"
    assert payload["runtime"]["skill"]["id"] == "biology-process-viz"
    assert [step["title"] for step in payload["cir"]["steps"]] == [
        "结构定位",
        "过程流转",
        "功能结论",
    ]
    assert "生物题" in payload["cir"]["summary"]


def test_pipeline_routes_geography_prompt_to_geography_domain(monkeypatch, tmp_path) -> None:
    payload = _run_pipeline(
        {
            "prompt": "请可视化讲解水循环中的蒸发、降水与径流如何在区域内演化。",
            "provider": "mock",
            "sandbox_mode": "dry_run",
            "persist_run": False,
        },
        monkeypatch,
        tmp_path,
    )
    assert payload["cir"]["domain"] == "geography"
    assert payload["runtime"]["skill"]["id"] == "geospatial-process-viz"
    assert [step["title"] for step in payload["cir"]["steps"]] == [
        "空间底图",
        "时空演化",
        "区域解释",
    ]
    assert "地理题" in payload["cir"]["summary"]


def test_pipeline_rejects_disabled_domain(monkeypatch) -> None:
    monkeypatch.setattr(
        orchestrator,
        "skill_registry",
        SubjectSkillRegistry(
            enabled_domains=(
                TopicDomain.ALGORITHM,
                TopicDomain.MATH,
                TopicDomain.CODE,
            )
        ),
    )
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
    assert response.status_code == 400
    assert "未启用" in response.json()["detail"]


def test_custom_provider_crud() -> None:
    create_response = client.post(
        "/api/v1/providers/custom",
        json={
            "name": "local-ollama",
            "label": "Local Ollama",
            "base_url": "http://127.0.0.1:11434/v1",
            "model": "qwen2.5-coder",
            "router_model": "qwen2.5-coder:3b",
            "coding_model": "qwen2.5-coder:32b",
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
    assert payload["stage_models"] == {
        "router": "qwen2.5-coder:3b",
        "coding": "qwen2.5-coder:32b",
    }

    runtime_response = client.get("/api/v1/runtime")
    providers = runtime_response.json()["providers"]
    local_provider = next(provider for provider in providers if provider["name"] == "local-ollama")
    assert local_provider["stage_models"] == {
        "router": "qwen2.5-coder:3b",
        "coding": "qwen2.5-coder:32b",
    }

    delete_response = client.delete("/api/v1/providers/custom/local-ollama")
    assert delete_response.status_code == 200


def test_runtime_catalog_prefers_configured_provider_when_mock_disabled() -> None:
    previous_settings = orchestrator.runtime_settings
    restore_payload = RuntimeSettingsRequest(
        mock_provider_enabled=previous_settings.mock_provider_enabled,
        tts=TTSSettingsRequest(
            enabled=previous_settings.tts.enabled,
            backend=previous_settings.tts.backend,
            model=previous_settings.tts.model,
            base_url=previous_settings.tts.base_url,
            api_key=previous_settings.tts.api_key,
            voice=previous_settings.tts.voice,
            rate_wpm=previous_settings.tts.rate_wpm,
            speed=previous_settings.tts.speed,
            max_chars=previous_settings.tts.max_chars,
            timeout_s=previous_settings.tts.timeout_s,
        ),
    )

    create_response = client.post(
        "/api/v1/providers/custom",
        json={
            "name": "primary-ollama",
            "label": "Primary Ollama",
            "base_url": "http://127.0.0.1:11434/v1",
            "model": "qwen2.5-coder:14b",
            "router_model": "qwen2.5-coder:3b",
            "description": "默认主 provider",
            "api_key": "",
            "temperature": 0.2,
            "supports_vision": False,
            "enabled": True,
        },
    )
    assert create_response.status_code == 200

    try:
        update_response = client.put(
            "/api/v1/runtime/settings",
            json={
                "mock_provider_enabled": False,
                "default_providers": {
                    "default_provider": None,
                    "default_router_provider": None,
                    "default_generation_provider": None,
                },
                "tts": restore_payload.tts.model_dump(mode="json"),
            },
        )
        assert update_response.status_code == 200

        runtime_response = client.get("/api/v1/runtime")
        assert runtime_response.status_code == 200
        payload = runtime_response.json()
        assert payload["default_provider"] == "primary-ollama"
        assert payload["default_router_provider"] == "primary-ollama"
        assert payload["default_generation_provider"] == "primary-ollama"
        assert all(provider["name"] != "mock" for provider in payload["providers"])
    finally:
        orchestrator.update_runtime_settings(restore_payload)
        delete_response = client.delete("/api/v1/providers/custom/primary-ollama")
        assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] is True


def test_custom_provider_test_endpoint(monkeypatch) -> None:
    from app.services.providers.openai import OpenAICompatibleProvider

    def fake_test_connection(self):
        return "pong", ("pong raw output " * 80).strip()

    monkeypatch.setattr(OpenAICompatibleProvider, "test_connection", fake_test_connection)

    response = client.post(
        "/api/v1/providers/custom/test",
        json={
            "name": "test-ollama",
            "label": "Test Ollama",
            "base_url": "http://127.0.0.1:11434/v1",
            "model": "qwen2.5-coder",
            "test_model": "qwen2.5-coder:1.5b",
            "api_key": "",
            "description": "测试 provider",
            "temperature": 0.1,
            "supports_vision": False,
            "enabled": True,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["message"] == "pong"
    assert payload["model"] == "qwen2.5-coder:1.5b"
    assert "pong raw output" in payload["raw_excerpt"]
    assert payload["raw_excerpt"].endswith("pong raw output")


def test_custom_provider_addition_preserves_disabled_state() -> None:
    create_response = client.post(
        "/api/v1/providers/custom",
        json={
            "name": "disabled-ollama",
            "label": "Disabled Ollama",
            "base_url": "http://127.0.0.1:11434/v1/",
            "model": "qwen2.5-coder",
            "api_key": "",
            "description": "默认禁用的 provider",
            "temperature": 0.3,
            "supports_vision": False,
            "enabled": False,
        },
    )
    assert create_response.status_code == 200

    payload = create_response.json()
    assert payload["name"] == "disabled-ollama"
    assert payload["configured"] is False
    assert payload["is_custom"] is True
    assert payload["base_url"] == "http://127.0.0.1:11434/v1"

    runtime_response = client.get("/api/v1/runtime")
    assert runtime_response.status_code == 200
    providers = runtime_response.json()["providers"]
    disabled_provider = next(
        provider for provider in providers if provider["name"] == "disabled-ollama"
    )
    assert disabled_provider["configured"] is False
    assert disabled_provider["base_url"] == "http://127.0.0.1:11434/v1"

    pipeline_response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请讲解二分查找。",
            "router_provider": "mock",
            "generation_provider": "disabled-ollama",
            "sandbox_mode": "dry_run",
            "persist_run": False,
        },
    )
    assert pipeline_response.status_code == 400
    assert "Provider disabled-ollama 未配置" in pipeline_response.json()["detail"]

    delete_response = client.delete("/api/v1/providers/custom/disabled-ollama")
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] is True


def test_custom_provider_edit_preserves_existing_api_key() -> None:
    first_response = client.post(
        "/api/v1/providers/custom",
        json={
            "name": "editable-ollama",
            "label": "Editable Ollama",
            "base_url": "http://127.0.0.1:11434/v1",
            "model": "qwen2.5-coder",
            "router_model": "qwen2.5-coder:3b",
            "api_key": "secret-key",
            "description": "原始 provider",
            "temperature": 0.4,
            "supports_vision": False,
            "enabled": True,
        },
    )
    assert first_response.status_code == 200

    second_response = client.post(
        "/api/v1/providers/custom",
        json={
            "name": "editable-ollama",
            "label": "Editable Ollama Updated",
            "base_url": "http://127.0.0.1:11434/v1/",
            "model": "qwen3-coder",
            "api_key": "",
            "router_model": "",
            "planning_model": "qwen3-thinking",
            "description": "更新后的 provider",
            "temperature": 0.6,
            "supports_vision": True,
            "enabled": True,
        },
    )
    assert second_response.status_code == 200

    stored = orchestrator.custom_provider_repository.get("editable-ollama")
    assert stored is not None
    assert stored.api_key == "secret-key"
    assert stored.label == "Editable Ollama Updated"
    assert stored.model == "qwen3-coder"
    assert stored.router_model is None
    assert stored.planning_model == "qwen3-thinking"
    assert stored.supports_vision is True

    delete_response = client.delete("/api/v1/providers/custom/editable-ollama")
    assert delete_response.status_code == 200


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
            self,
            prompt: str,
            source_image: str | None = None,
            source_code: str | None = None,
        ) -> tuple[TopicDomain, AgentTrace]:
            return (
                TopicDomain.MATH,
                AgentTrace(
                    agent="router",
                    provider=self.descriptor.name,
                    model=self.descriptor.model,
                    summary="router stub picked math",
                    raw_output='{"domain":"math","reason":"router stub picked math"}',
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
            source_code: str | None = None,
            source_code_language: str | None = None,
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
                    raw_output='{"focus":"突出函数和切线","concepts":["函数","切线","变化率"]}',
                ),
            )

        def code(self, cir: CirDocument) -> tuple[CodingHints, AgentTrace]:
            return (
                CodingHints(
                    target="python-manim",
                    style_notes=["keep animation deterministic"],
                    renderer_script="""
<analysis>
hidden
</analysis>

```python
from manim import *

class ProviderRenderer(Scene):
    def construct(self):
        title = Text("provider renderer")
        self.play(Write(title))
        self.wait(0.5)
```
                    """.strip(),
                ),
                AgentTrace(
                    agent="coder",
                    provider=self.descriptor.name,
                    model=self.descriptor.model,
                    summary=f"generation stub coded {len(cir.steps)} steps",
                    raw_output="```ts\nprovider renderer raw output\n```",
                ),
            )

        def critique(
            self,
            title: str,
            renderer_script: str,
            domain: TopicDomain,
        ) -> tuple[CritiqueHints, AgentTrace]:
            return (
                CritiqueHints(
                    checks=["check overlap", "check narration density"],
                    warnings=[],
                    blocking_issues=[],
                ),
                AgentTrace(
                    agent="critic",
                    provider=self.descriptor.name,
                    model=self.descriptor.model,
                    summary="generation stub reviewed renderer",
                    raw_output='{"checks":["check overlap"],"warnings":[]}',
                ),
            )

        def repair_code(self, cir: CirDocument, renderer_script: str, issues: list[str]):
            raise AssertionError("generation stub should not need repair for this test")

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
    assert "class ProviderRenderer(Scene):" in payload["renderer_script"]
    assert "provider renderer" in payload["renderer_script"]
    assert traces["router"]["provider"] == "router-stub"
    assert traces["planner"]["provider"] == "generation-stub"
    assert traces["coder"]["provider"] == "generation-stub"
    assert traces["critic"]["provider"] == "generation-stub"
    assert traces["planner"]["raw_output"] is not None
    assert "突出函数和切线" in traces["planner"]["raw_output"]
    assert traces["coder"]["raw_output"] is not None
    assert "provider renderer raw output" in traces["coder"]["raw_output"]


def test_pipeline_returns_502_when_generation_provider_times_out(monkeypatch) -> None:
    class TimeoutGenerationProvider:
        descriptor = ProviderDescriptor(
            name="timeout-stub",
            label="Timeout Stub",
            kind=ProviderKind.OPENAI_COMPATIBLE,
            model="timeout-model-v1",
            description="stub timeout",
            configured=True,
        )

        def route(self, *args, **kwargs):
            raise AssertionError("generation provider should not handle routing")

        def plan(self, *args, **kwargs):
            raise ProviderInvocationError(
                "Provider 请求超时（3s），请检查模型服务是否可达。"
            )

        def code(self, *args, **kwargs):
            raise AssertionError("timeout provider should fail during planning")

        def critique(self, *args, **kwargs):
            raise AssertionError("timeout provider should fail during planning")

    original_get = orchestrator.provider_registry.get

    def fake_get(name: str):
        if name == "timeout-stub":
            return TimeoutGenerationProvider()
        return original_get(name)

    monkeypatch.setattr(orchestrator.provider_registry, "get", fake_get)

    response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请讲解二分查找边界收缩。",
            "router_provider": "mock",
            "generation_provider": "timeout-stub",
            "sandbox_mode": "dry_run",
            "persist_run": False,
        },
    )
    assert response.status_code == 502
    assert "Provider 请求超时" in response.json()["detail"]


def test_pipeline_repairs_critic_blocking_issues_before_render(monkeypatch, tmp_path) -> None:
    class RepairingProvider:
        descriptor = ProviderDescriptor(
            name="repairing-stub",
            label="Repairing Stub",
            kind=ProviderKind.OPENAI_COMPATIBLE,
            model="repair-model-v1",
            description="stub repair flow",
            configured=True,
        )

        def route(self, *args, **kwargs):
            raise AssertionError("generation provider should not handle routing")

        def plan(self, *args, **kwargs):
            return (
                PlanningHints(
                    focus="突出二分查找边界收缩",
                    concepts=["left", "mid", "right"],
                    warnings=[],
                ),
                AgentTrace(
                    agent="planner",
                    provider=self.descriptor.name,
                    model=self.descriptor.model,
                    summary="planned binary search",
                ),
            )

        def code(self, cir: CirDocument):
            return (
                CodingHints(
                    target="python-manim",
                    style_notes=[],
                    renderer_script="""
```python
from manim import *

class BrokenScene(Scene):
    def construct(self):
        title = Text("broken")
        def move_pointer():
            self.play(title.animate.shift(RIGHT * 0.5), run_time=0.1)
        self.play(move_pointer())
        self.wait(0.1)
```
                    """.strip(),
                ),
                AgentTrace(
                    agent="coder",
                    provider=self.descriptor.name,
                    model=self.descriptor.model,
                    summary="generated broken script",
                ),
            )

        def critique(self, title: str, renderer_script: str, domain: TopicDomain):
            if "self.play(move_pointer())" in renderer_script:
                return (
                    CritiqueHints(
                        checks=[
                            (
                                '{"name":"runtime","status":"fail",'
                                '"details":"self.play(move_pointer()) 会报错"}'
                            )
                        ],
                        warnings=[],
                        blocking_issues=["self.play(move_pointer()) 会报错"],
                    ),
                    AgentTrace(
                        agent="critic",
                        provider=self.descriptor.name,
                        model=self.descriptor.model,
                        summary="found blocking runtime issue",
                    ),
                )
            return (
                CritiqueHints(checks=["final script ok"], warnings=[], blocking_issues=[]),
                AgentTrace(
                    agent="critic",
                    provider=self.descriptor.name,
                    model=self.descriptor.model,
                    summary="final script ok",
                ),
            )

        def repair_code(self, cir: CirDocument, renderer_script: str, issues: list[str]):
            assert any("move_pointer" in issue for issue in issues)
            return (
                CodingHints(
                    target="python-manim",
                    style_notes=[],
                    renderer_script="""
```python
from manim import *

class FixedScene(Scene):
    def construct(self):
        title = Text("fixed")
        def move_pointer():
            self.play(title.animate.shift(RIGHT * 0.5), run_time=0.1)
        move_pointer()
        self.wait(0.1)
```
                    """.strip(),
                ),
                AgentTrace(
                    agent="repair",
                    provider=self.descriptor.name,
                    model=self.descriptor.model,
                    summary="repaired script",
                ),
            )

    original_get = orchestrator.provider_registry.get

    def fake_get(name: str):
        if name == "repairing-stub":
            return RepairingProvider()
        return original_get(name)

    def fake_render(
        *,
        script: str,
        request_id: str,
        cir: CirDocument,
        ui_theme: str | None = None,
    ):
        assert "self.play(move_pointer())" not in script
        assert "move_pointer()" in script
        output = tmp_path / f"{request_id}.mp4"
        output.write_bytes(b"fake")
        return PreviewVideoArtifacts(
            file_path=output,
            url="/media/fake.mp4",
            backend="manim-cli",
        )

    monkeypatch.setattr(orchestrator.provider_registry, "get", fake_get)
    monkeypatch.setattr(orchestrator.preview_video_renderer, "render", fake_render)

    response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请讲解二分查找边界收缩。",
            "router_provider": "mock",
            "generation_provider": "repairing-stub",
            "sandbox_mode": "dry_run",
            "persist_run": False,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert "class FixedScene(Scene):" in payload["renderer_script"]
    assert payload["preview_video_url"] == "/media/fake.mp4"
    assert any(trace["agent"] == "repair" for trace in payload["runtime"]["agent_traces"])
    assert any("critic-review" in action for action in payload["runtime"]["repair_actions"])


def test_pipeline_embeds_preview_narration_when_available(monkeypatch, tmp_path) -> None:
    def fake_render(
        *,
        script: str,
        request_id: str,
        cir: CirDocument,
        ui_theme: str | None = None,
    ):
        captured["ui_theme"] = ui_theme or ""
        output = tmp_path / f"{request_id}.mp4"
        output.write_bytes(b"fake")
        return PreviewVideoArtifacts(
            file_path=output,
            url="/media/fake-narrated.mp4",
            backend="storyboard-fallback",
        )

    captured: dict[str, str] = {}

    def fake_build_pipeline_narration(cir: CirDocument) -> str:
        return f"{cir.title} 的自动旁白"

    def fake_embed(*, request_id: str, video_path, narration_text: str):
        captured["request_id"] = request_id
        captured["text"] = narration_text
        return type(
            "NarrationArtifacts",
            (),
            {
                "tts_backend": "say",
                "audio_path": tmp_path / f"{request_id}.m4a",
            },
        )()

    monkeypatch.setattr(orchestrator.preview_video_renderer, "render", fake_render)
    monkeypatch.setattr(
        orchestrator.video_narration_service,
        "build_pipeline_narration",
        fake_build_pipeline_narration,
    )
    monkeypatch.setattr(orchestrator.video_narration_service, "is_available", lambda: True)
    monkeypatch.setattr(orchestrator.video_narration_service, "embed_narration", fake_embed)

    response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请可视化讲解二分查找为什么能在有序数组中快速定位答案。",
            "provider": "mock",
            "ui_theme": "light",
            "sandbox_mode": "dry_run",
            "persist_run": False,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["preview_video_url"] == "/media/fake-narrated.mp4"
    assert any(
        diagnostic["agent"] == "audio" and "嵌入旁白" in diagnostic["message"]
        for diagnostic in payload["diagnostics"]
    )
    assert captured["text"].endswith("自动旁白")
    assert captured["ui_theme"] == "light"


def test_pipeline_skips_preview_narration_when_disabled(monkeypatch, tmp_path) -> None:
    def fake_render(
        *,
        script: str,
        request_id: str,
        cir: CirDocument,
        ui_theme: str | None = None,
    ):
        output = tmp_path / f"{request_id}.mp4"
        output.write_bytes(b"fake")
        return PreviewVideoArtifacts(
            file_path=output,
            url="/media/fake-muted.mp4",
            backend="storyboard-fallback",
        )

    monkeypatch.setattr(orchestrator.preview_video_renderer, "render", fake_render)
    monkeypatch.setattr(
        orchestrator.video_narration_service,
        "build_pipeline_narration",
        lambda cir: (_ for _ in ()).throw(AssertionError("should not build narration")),
    )
    monkeypatch.setattr(
        orchestrator.video_narration_service,
        "embed_narration",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("should not embed narration")),
    )

    response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请讲解二分查找边界收缩。",
            "provider": "mock",
            "enable_narration": False,
            "sandbox_mode": "dry_run",
            "persist_run": False,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["preview_video_url"] == "/media/fake-muted.mp4"
    assert not any(diagnostic["agent"] == "audio" for diagnostic in payload["diagnostics"])


def test_maybe_embed_preview_narration_mentions_mimotts_when_unavailable(
    monkeypatch, tmp_path
) -> None:
    preview_video = tmp_path / "preview.mp4"
    preview_video.write_bytes(b"fake")

    monkeypatch.setattr(orchestrator.video_narration_service, "is_available", lambda: False)

    messages = orchestrator.maybe_embed_preview_narration(
        request_id="demo-request",
        preview_video_path=preview_video,
        narration_text="这是测试旁白。",
    )

    assert len(messages) == 1
    assert "mimotts-v2" in messages[0]
    assert "跳过旁白嵌入" in messages[0]
