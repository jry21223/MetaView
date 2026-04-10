from __future__ import annotations

import shutil
import subprocess
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import httpx

TTSBackendPreference = Literal["auto", "system", "openai_compatible"]


class TTSError(RuntimeError):
    pass


@dataclass(frozen=True)
class SynthesizedSpeech:
    file_path: Path
    duration_s: float
    backend: str


class BaseTTSService(ABC):
    @property
    @abstractmethod
    def preferred_suffix(self) -> str:
        raise NotImplementedError

    @abstractmethod
    def is_available(self) -> bool:
        raise NotImplementedError

    @abstractmethod
    def synthesize(
        self,
        text: str,
        output_path: Path,
        *,
        voice: str | None = None,
        rate_wpm: int | None = None,
    ) -> SynthesizedSpeech:
        raise NotImplementedError


class SystemTTSService(BaseTTSService):
    def __init__(
        self,
        *,
        default_voice: str = "default",
        default_rate_wpm: int = 150,
    ) -> None:
        self.default_voice = default_voice
        self.default_rate_wpm = default_rate_wpm
        self.say_binary = shutil.which("say")
        self.espeak_binary = shutil.which("espeak-ng") or shutil.which("espeak")

    @property
    def preferred_suffix(self) -> str:
        if self.say_binary:
            return ".aiff"
        return ".wav"

    def is_available(self) -> bool:
        return self.say_binary is not None or self.espeak_binary is not None

    def synthesize(
        self,
        text: str,
        output_path: Path,
        *,
        voice: str | None = None,
        rate_wpm: int | None = None,
    ) -> SynthesizedSpeech:
        normalized = _normalize_tts_text(text)
        if not normalized:
            raise TTSError("旁白文本为空，无法合成语音。")
        if not self.is_available():
            raise TTSError("未检测到可用的本地 TTS 后端。")

        output_path.parent.mkdir(parents=True, exist_ok=True)
        resolved_voice = (voice or self.default_voice).strip()
        resolved_rate = rate_wpm or self.default_rate_wpm

        if self.say_binary:
            return self._synthesize_with_say(
                normalized,
                output_path.with_suffix(".aiff"),
                voice=resolved_voice,
                rate_wpm=resolved_rate,
            )
        return self._synthesize_with_espeak(
            normalized,
            output_path.with_suffix(".wav"),
            voice=resolved_voice,
            rate_wpm=resolved_rate,
        )

    def _synthesize_with_say(
        self,
        text: str,
        output_path: Path,
        *,
        voice: str,
        rate_wpm: int,
    ) -> SynthesizedSpeech:
        command = [self.say_binary or "say", "-o", str(output_path), "-r", str(rate_wpm)]
        if voice and voice.lower() not in {"default", "system"}:
            command.extend(["-v", voice])
        command.append(text)
        self._run_tts_command(command, backend="say")
        return SynthesizedSpeech(
            file_path=output_path,
            duration_s=0.0,
            backend="system:say",
        )

    def _synthesize_with_espeak(
        self,
        text: str,
        output_path: Path,
        *,
        voice: str,
        rate_wpm: int,
    ) -> SynthesizedSpeech:
        command = [
            self.espeak_binary or "espeak",
            "-w",
            str(output_path),
            "-s",
            str(rate_wpm),
        ]
        if voice and voice.lower() not in {"default", "system"}:
            command.extend(["-v", voice])
        command.append(text)
        self._run_tts_command(command, backend="espeak")
        return SynthesizedSpeech(
            file_path=output_path,
            duration_s=0.0,
            backend="system:espeak",
        )

    def _run_tts_command(self, command: list[str], *, backend: str) -> None:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode == 0:
            return

        excerpt = (result.stderr.strip() or result.stdout.strip() or "未知错误。")[:800]
        raise TTSError(f"{backend} 语音合成失败：{excerpt}")


class OpenAICompatibleTTSService(BaseTTSService):
    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str = "mimotts-v2",
        default_voice: str = "default",
        default_rate_wpm: int = 150,
        default_speed: float = 0.88,
        timeout_s: float | None = None,
        response_format: str = "mp3",
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key.strip()
        self.model = model.strip()
        self.default_voice = default_voice
        self.default_rate_wpm = default_rate_wpm
        self.default_speed = default_speed
        self.timeout_s = timeout_s
        self.response_format = response_format

    @property
    def preferred_suffix(self) -> str:
        if self.response_format == "wav":
            return ".wav"
        if self.response_format == "aac":
            return ".aac"
        return ".mp3"

    def is_available(self) -> bool:
        return bool(self.base_url and self.api_key and self.model)

    def synthesize(
        self,
        text: str,
        output_path: Path,
        *,
        voice: str | None = None,
        rate_wpm: int | None = None,
    ) -> SynthesizedSpeech:
        normalized = _normalize_tts_text(text)
        if not normalized:
            raise TTSError("旁白文本为空，无法合成语音。")
        if not self.is_available():
            raise TTSError("未配置远程 TTS 后端，无法调用 mimotts-v2。")

        output_path.parent.mkdir(parents=True, exist_ok=True)
        resolved_voice = (voice or self.default_voice).strip()
        resolved_rate = rate_wpm or self.default_rate_wpm
        resolved_speed = self._rate_to_speed(resolved_rate)
        resolved_output_path = output_path.with_suffix(self.preferred_suffix)

        payload: dict[str, object] = {
            "model": self.model,
            "input": normalized,
            "response_format": self.response_format,
            "speed": resolved_speed,
        }
        if resolved_voice and resolved_voice.lower() not in {"default", "system"}:
            payload["voice"] = resolved_voice

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        endpoint = f"{self.base_url}/audio/speech"

        try:
            with httpx.Client(timeout=self.timeout_s) as client:
                response = client.post(
                    endpoint,
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise TTSError(self._build_remote_error(exc)) from exc

        resolved_output_path.write_bytes(response.content)
        return SynthesizedSpeech(
            file_path=resolved_output_path,
            duration_s=0.0,
            backend=f"openai-compatible:{self.model}",
        )

    def _rate_to_speed(self, rate_wpm: int) -> float:
        if rate_wpm <= 0:
            return self.default_speed
        ratio = rate_wpm / 170.0
        speed = self.default_speed * ratio
        return round(min(max(speed, 0.65), 1.05), 2)

    def _build_remote_error(self, exc: httpx.HTTPError) -> str:
        if isinstance(exc, httpx.HTTPStatusError):
            detail = exc.response.text.strip()
            if detail:
                detail = detail[:800]
                return f"远程 TTS 调用失败：{exc.response.status_code} {detail}"
            return f"远程 TTS 调用失败：{exc.response.status_code}"
        return f"远程 TTS 调用失败：{exc}"


def build_tts_service(
    *,
    backend: TTSBackendPreference = "auto",
    default_voice: str = "default",
    default_rate_wpm: int = 150,
    remote_base_url: str | None = None,
    remote_api_key: str | None = None,
    remote_model: str = "mimotts-v2",
    remote_timeout_s: float | None = None,
    remote_speed: float = 0.88,
    fallback_base_url: str | None = None,
    fallback_api_key: str | None = None,
) -> BaseTTSService:
    resolved_remote_base_url = (remote_base_url or "").strip()
    resolved_remote_api_key = (remote_api_key or "").strip()
    resolved_fallback_base_url = (fallback_base_url or "").strip()
    resolved_fallback_api_key = (fallback_api_key or "").strip()

    if backend == "openai_compatible":
        return OpenAICompatibleTTSService(
            base_url=resolved_remote_base_url,
            api_key=resolved_remote_api_key,
            model=remote_model,
            default_voice=default_voice,
            default_rate_wpm=default_rate_wpm,
            default_speed=remote_speed,
            timeout_s=remote_timeout_s,
        )

    if backend == "auto" and resolved_remote_base_url and resolved_remote_api_key:
        return OpenAICompatibleTTSService(
            base_url=resolved_remote_base_url,
            api_key=resolved_remote_api_key,
            model=remote_model,
            default_voice=default_voice,
            default_rate_wpm=default_rate_wpm,
            default_speed=remote_speed,
            timeout_s=remote_timeout_s,
        )

    if backend == "auto" and resolved_fallback_base_url and resolved_fallback_api_key:
        return OpenAICompatibleTTSService(
            base_url=resolved_fallback_base_url,
            api_key=resolved_fallback_api_key,
            model=remote_model,
            default_voice=default_voice,
            default_rate_wpm=default_rate_wpm,
            default_speed=remote_speed,
            timeout_s=remote_timeout_s,
        )

    return SystemTTSService(
        default_voice=default_voice,
        default_rate_wpm=default_rate_wpm,
    )


def _normalize_tts_text(text: str) -> str:
    return " ".join(segment.strip() for segment in text.splitlines() if segment.strip()).strip()
