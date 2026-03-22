from __future__ import annotations

import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from app.schemas import CirDocument
from app.services.tts_service import BaseTTSService, SystemTTSService, TTSError

_DURATION_PATTERN = re.compile(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)")


class VideoNarrationError(RuntimeError):
    pass


@dataclass(frozen=True)
class NarratedVideoArtifacts:
    video_path: Path
    audio_path: Path
    tts_backend: str
    audio_duration_s: float
    video_duration_s: float


class VideoNarrationService:
    def __init__(
        self,
        *,
        output_root: str,
        enabled: bool = True,
        default_voice: str = "default",
        default_rate_wpm: int = 150,
        max_chars: int = 1500,
        ffmpeg_binary: str | None = None,
        tts_service: BaseTTSService | None = None,
    ) -> None:
        self.output_root = Path(output_root)
        self.enabled = enabled
        self.default_voice = default_voice
        self.default_rate_wpm = default_rate_wpm
        self.max_chars = max_chars
        self.ffmpeg_binary = ffmpeg_binary or shutil.which("ffmpeg")
        self.tts_service = tts_service or SystemTTSService(
            default_voice=default_voice,
            default_rate_wpm=default_rate_wpm,
        )
        self.audio_dir = self.output_root / "narration-audio"
        self.audio_dir.mkdir(parents=True, exist_ok=True)

    def is_available(self) -> bool:
        return self.enabled and self.ffmpeg_binary is not None and self.tts_service.is_available()

    def build_pipeline_narration(self, cir: CirDocument) -> str:
        parts: list[str] = [f"下面我们用动画快速梳理，{cir.title}。"]
        if cir.summary.strip():
            parts.append(f"先抓住核心思路。{cir.summary}")

        transitions = ["先看", "接着看", "然后看", "最后看"]
        for index, step in enumerate(cir.steps, start=1):
            lead = transitions[min(index - 1, len(transitions) - 1)]
            parts.append(f"{lead}第{index}步，{step.title}。{step.narration}")

        parts.append("到这里，这次动画讲解的关键过程就梳理完了。")
        return self._trim_text(self._join_parts(parts))

    def embed_narration(
        self,
        *,
        request_id: str,
        video_path: Path,
        narration_text: str,
        voice: str | None = None,
    ) -> NarratedVideoArtifacts:
        if not self.enabled:
            raise VideoNarrationError("旁白嵌入功能已禁用。")
        if not self.ffmpeg_binary:
            raise VideoNarrationError("未检测到 ffmpeg，无法嵌入旁白。")
        if not self.tts_service.is_available():
            raise VideoNarrationError("未检测到可用的 TTS 后端，无法生成旁白。")
        if not video_path.exists():
            raise VideoNarrationError(f"视频文件不存在：{video_path}")

        normalized = self._trim_text(narration_text)
        if not normalized:
            raise VideoNarrationError("旁白文本为空，无法嵌入视频。")

        video_duration_s = self._probe_duration(video_path)
        if video_duration_s <= 0:
            raise VideoNarrationError("无法探测视频时长。")

        with tempfile.TemporaryDirectory(prefix="preview-tts-") as temp_dir_name:
            temp_dir = Path(temp_dir_name)
            try:
                synthesized = self.tts_service.synthesize(
                    normalized,
                    temp_dir / f"{request_id}{self.tts_service.preferred_suffix}",
                    voice=voice or self.default_voice,
                    rate_wpm=self.default_rate_wpm,
                )
            except TTSError as exc:
                raise VideoNarrationError(str(exc)) from exc

            prepared_audio = temp_dir / f"{request_id}.m4a"
            self._prepare_audio_track(
                input_path=synthesized.file_path,
                output_path=prepared_audio,
            )
            prepared_audio_duration_s = self._probe_duration(prepared_audio)

            merged_video = temp_dir / f"{request_id}.mp4"
            self._merge_audio_into_video(
                video_path=video_path,
                audio_path=prepared_audio,
                output_path=merged_video,
                video_duration_s=video_duration_s,
                audio_duration_s=prepared_audio_duration_s,
            )

            persisted_audio = self.audio_dir / f"{request_id}.m4a"
            shutil.copy2(prepared_audio, persisted_audio)
            shutil.move(str(merged_video), video_path)

        return NarratedVideoArtifacts(
            video_path=video_path,
            audio_path=persisted_audio,
            tts_backend=synthesized.backend,
            audio_duration_s=self._probe_duration(persisted_audio),
            video_duration_s=video_duration_s,
        )

    def _prepare_audio_track(
        self,
        *,
        input_path: Path,
        output_path: Path,
    ) -> None:
        command = [
            self.ffmpeg_binary or "ffmpeg",
            "-y",
            "-i",
            str(input_path),
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            str(output_path),
        ]
        self._run_ffmpeg(command, error_prefix="旁白音频预处理失败")

    def _merge_audio_into_video(
        self,
        *,
        video_path: Path,
        audio_path: Path,
        output_path: Path,
        video_duration_s: float,
        audio_duration_s: float,
    ) -> None:
        target_duration_s = max(video_duration_s, audio_duration_s, 0.1)
        video_pad_duration_s = max(target_duration_s - video_duration_s + 0.12, 0.0)
        audio_pad_duration_s = max(target_duration_s - audio_duration_s + 0.02, 0.0)
        filter_parts: list[str] = []
        video_map = "0:v:0"

        if video_pad_duration_s > 0.01:
            filter_parts.append(
                f"[0:v]tpad=stop_mode=clone:stop_duration={video_pad_duration_s:.3f}[narr_video]"
            )
            video_map = "[narr_video]"

        filter_parts.append(f"[1:a]apad=pad_dur={audio_pad_duration_s:.3f}[narr_audio]")
        command = [
            self.ffmpeg_binary or "ffmpeg",
            "-y",
            "-i",
            str(video_path),
            "-i",
            str(audio_path),
        ]
        if filter_parts:
            command.extend(["-filter_complex", ";".join(filter_parts)])
        command.extend(
            [
                "-map",
                video_map,
                "-map",
                "[narr_audio]",
                "-t",
                f"{target_duration_s:.3f}",
                "-shortest",
                "-c:v",
                "copy" if video_map == "0:v:0" else "libx264",
                "-c:a",
                "aac",
                "-b:a",
                "160k",
                "-movflags",
                "+faststart",
                str(output_path),
            ]
        )
        self._run_ffmpeg(command, error_prefix="旁白嵌入视频失败")

    def _probe_duration(self, file_path: Path) -> float:
        command = [
            self.ffmpeg_binary or "ffmpeg",
            "-hide_banner",
            "-i",
            str(file_path),
            "-f",
            "null",
            "-",
        ]
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
        )
        output = f"{result.stdout}\n{result.stderr}"
        match = _DURATION_PATTERN.search(output)
        if not match:
            raise VideoNarrationError(f"无法从 ffmpeg 输出中解析时长：{file_path.name}")

        hours = int(match.group(1))
        minutes = int(match.group(2))
        seconds = float(match.group(3))
        return hours * 3600 + minutes * 60 + seconds

    def _run_ffmpeg(self, command: list[str], *, error_prefix: str) -> None:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode == 0:
            return

        excerpt = (result.stderr.strip() or result.stdout.strip() or "未知错误。")[:1200]
        raise VideoNarrationError(f"{error_prefix}：{excerpt}")

    def _join_parts(self, parts: list[str]) -> str:
        deduped: list[str] = []
        seen: set[str] = set()
        for part in parts:
            normalized = self._normalize_sentence(part)
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            deduped.append(normalized)
        return " ".join(deduped)

    def _normalize_sentence(self, text: str) -> str:
        collapsed = re.sub(r"\s+", " ", text).strip()
        return collapsed.strip("。；;，, ")

    def _trim_text(self, text: str) -> str:
        normalized = self._normalize_sentence(text)
        if len(normalized) <= self.max_chars:
            return normalized
        trimmed = normalized[: self.max_chars].rstrip("，,。;； ")
        return f"{trimmed}。"
