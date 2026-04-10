import httpx

from app.main import orchestrator
from app.schemas import (
    CirDocument,
    CirStep,
    LayoutInstruction,
    RuntimeSettingsRequest,
    TTSSettingsRequest,
    VisualKind,
)
from app.services.providers.openai import OpenAICompatibleProvider
from app.services.tts_service import (
    OpenAICompatibleTTSService,
    SystemTTSService,
    build_tts_service,
)
from app.services.video_narration import VideoNarrationService


def test_build_tts_service_prefers_remote_backend_when_configured() -> None:
    service = build_tts_service(
        backend="auto",
        remote_base_url="https://example.com/v1",
        remote_api_key="secret",
        remote_model="mimotts-v2",
    )
    assert isinstance(service, OpenAICompatibleTTSService)
    assert service.base_url == "https://example.com/v1"
    assert service.api_key == "secret"
    assert service.model == "mimotts-v2"


def test_build_tts_service_falls_back_to_provider_backend_without_reusing_custom_remote_url() -> None:
    service = build_tts_service(
        backend="auto",
        remote_base_url="https://tts.example.com/v1",
        remote_api_key=None,
        fallback_base_url="https://api.openai.com/v1",
        fallback_api_key="fallback-secret",
        remote_model="mimotts-v2",
    )

    assert isinstance(service, OpenAICompatibleTTSService)
    assert service.base_url == "https://api.openai.com/v1"
    assert service.api_key == "fallback-secret"


def test_build_tts_service_uses_fallback_provider_when_remote_config_missing() -> None:
    service = build_tts_service(
        backend="auto",
        remote_base_url=None,
        remote_api_key=None,
        fallback_base_url="https://api.openai.com/v1",
        fallback_api_key="fallback-secret",
        remote_model="mimotts-v2",
    )

    assert isinstance(service, OpenAICompatibleTTSService)
    assert service.base_url == "https://api.openai.com/v1"
    assert service.api_key == "fallback-secret"
    assert service.model == "mimotts-v2"


class _ProviderStub(OpenAICompatibleProvider):
    def __init__(self, *, base_url: str | None, api_key: str | None) -> None:
        self.base_url = base_url
        self.api_key = api_key


def test_orchestrator_narration_service_keeps_custom_tts_credentials_paired() -> None:
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
        orchestrator.update_runtime_settings(
            RuntimeSettingsRequest(
                mock_provider_enabled=previous_settings.mock_provider_enabled,
                tts=TTSSettingsRequest(
                    enabled=True,
                    backend="auto",
                    model="mimotts-v2",
                    base_url="https://tts.example.com/v1",
                    api_key=None,
                    voice="default",
                    rate_wpm=150,
                    speed=0.88,
                    max_chars=1500,
                    timeout_s=120.0,
                ),
            )
        )

        service = orchestrator._narration_service_for_provider(
            _ProviderStub(base_url="https://provider.example.com/v1", api_key="provider-secret")
        )

        remote_service = service.tts_service
        assert isinstance(remote_service, SystemTTSService)
    finally:
        orchestrator.update_runtime_settings(restore_payload)


def test_openai_compatible_tts_service_synthesize_audio(monkeypatch, tmp_path) -> None:
    captured: dict[str, object] = {}

    class FakeClient:
        def __init__(self, *, timeout):
            captured["timeout"] = timeout

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return None

        def post(self, url: str, *, headers: dict[str, str], json: dict[str, object]):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            request = httpx.Request("POST", url)
            return httpx.Response(200, content=b"audio-bytes", request=request)

    monkeypatch.setattr("app.services.tts_service.httpx.Client", FakeClient)

    service = OpenAICompatibleTTSService(
        base_url="https://example.com/v1",
        api_key="secret",
        model="mimotts-v2",
        default_voice="default",
        default_rate_wpm=150,
        default_speed=0.88,
    )
    result = service.synthesize("这是一个测试旁白。", tmp_path / "demo.mp3")

    assert result.file_path.read_bytes() == b"audio-bytes"
    assert result.backend == "openai-compatible:mimotts-v2"
    assert captured["url"] == "https://example.com/v1/audio/speech"
    assert captured["json"]["model"] == "mimotts-v2"
    assert captured["json"]["response_format"] == "mp3"
    assert float(captured["json"]["speed"]) <= 1.0
    assert "voice" not in captured["json"]


def test_video_narration_builds_more_natural_pipeline_copy(tmp_path) -> None:
    service = VideoNarrationService(
        output_root=str(tmp_path),
        enabled=True,
        ffmpeg_binary="ffmpeg",
    )
    cir = CirDocument(
        title="二分查找边界收缩",
        domain="algorithm",
        summary="算法题会被拆成状态建模、过程推进与复杂度收束三个镜头。",
        steps=[
            CirStep(
                id="step-1",
                title="输入建模",
                narration="先明确有序数组、目标值以及要跟踪的边界。",
                visual_kind=VisualKind.ARRAY,
                layout=LayoutInstruction(),
                tokens=[],
                annotations=[],
            ),
            CirStep(
                id="step-2",
                title="状态推进",
                narration="根据 mid 和 target 的比较结果更新左右边界。",
                visual_kind=VisualKind.FLOW,
                layout=LayoutInstruction(),
                tokens=[],
                annotations=[],
            ),
        ],
    )

    narration = service.build_pipeline_narration(cir)
    assert narration.startswith("下面我们用动画快速梳理")
    assert "先看第1步" in narration
    assert "接着看第2步" in narration
    assert narration.endswith("关键过程就梳理完了")


def test_video_narration_extends_video_instead_of_speeding_audio(monkeypatch, tmp_path) -> None:
    service = VideoNarrationService(
        output_root=str(tmp_path),
        enabled=True,
        ffmpeg_binary="ffmpeg",
    )
    captured: dict[str, object] = {}

    def fake_run_ffmpeg(command: list[str], *, error_prefix: str) -> None:
        captured["command"] = command
        captured["error_prefix"] = error_prefix

    monkeypatch.setattr(service, "_run_ffmpeg", fake_run_ffmpeg)

    service._merge_audio_into_video(
        video_path=tmp_path / "video.mp4",
        audio_path=tmp_path / "audio.m4a",
        output_path=tmp_path / "merged.mp4",
        video_duration_s=4.0,
        audio_duration_s=6.4,
    )

    command = captured["command"]
    command_text = " ".join(command)
    assert "tpad=stop_mode=clone" in command_text
    assert "atempo" not in command_text
    assert "libx264" in command
