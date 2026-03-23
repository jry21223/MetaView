from __future__ import annotations

import base64
import os
import shutil
import subprocess
import tempfile
import textwrap
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from PIL import Image, ImageDraw, ImageFont

from app.schemas import CirDocument, VisualToken
from app.services.manim_script import inspect_manim_script

EMBEDDED_PLACEHOLDER_MP4_BASE64 = (
    "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAABQRtZGF0AAACrwYF//+r3EXpvebZSLeW"
    "LNgg2SPu73gyNjQgLSBjb3JlIDE2NSByMzIyMiBiMzU2MDVhIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENv"
    "cHlsZWZ0IDIwMDMtMjAyNSAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNh"
    "YmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBw"
    "c3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhk"
    "Y3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRz"
    "PTExIGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNl"
    "ZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MyBiX3B5cmFtaWQ9MiBiX2Fk"
    "YXB0PTEgYl9iaWFzPTAgZGlyZWN0PTEgd2VpZ2h0Yj0xIG9wZW5fZ29wPTAgd2VpZ2h0cD0yIGtleWludD0yNTAg"
    "a2V5aW50X21pbj0yNSBzY2VuZWN1dD00MCBpbnRyYV9yZWZyZXNoPTAgcmNfbG9va2FoZWFkPTQwIHJjPWNyZiBt"
    "YnRyZWU9MSBjcmY9MjMuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40"
    "MCBhcT0xOjEuMDAAgAAAAFpliIQAO//+906/AptUwioDklcK9sqkJlm5UmsB8qYAAAMAAAMAAAMAkIRx7muVyT1m"
    "gAAAL2AI2DJhyBRBFxCBHBniWEKHSMoAAAMAAAMAAAMAAAMAAAMA/YEAAAASQZokbEO//qmWAAADAAADAOWAAAAA"
    "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"
    "jYyLjEuMTAz"
)
_CJK_FONT_FAMILY_CANDIDATES = (
    "PingFang SC",
    "Hiragino Sans GB",
    "Noto Sans CJK SC",
    "Noto Serif CJK SC",
    "Noto Sans SC",
    "Noto Serif SC",
    "Source Han Sans SC",
    "Source Han Sans CN",
    "Source Han Serif SC",
    "Sarasa Gothic SC",
    "WenQuanYi Zen Hei",
    "Microsoft YaHei",
    "SimHei",
)
_CJK_FONT_FAMILY_MARKERS = (
    "noto sans cjk",
    "noto serif cjk",
    "source han sans",
    "source han serif",
    "wenquanyi",
    "pingfang",
    "hiragino sans gb",
    "microsoft yahei",
    "simhei",
    "sarasa",
    "noto sans sc",
    "noto serif sc",
)
_CJK_FONT_PATH_CANDIDATES = (
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansSC-Regular.otf",
    "/usr/share/fonts/opentype/noto/NotoSerifSC-Regular.otf",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    "/usr/share/fonts/truetype/sarasa-gothic/Sarasa-Regular.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/PingFang.ttc",
)


class PreviewVideoRenderError(RuntimeError):
    pass


@dataclass(frozen=True)
class PreviewVideoArtifacts:
    file_path: Path
    url: str
    backend: str


class PreviewRenderBackend(Protocol):
    name: str
    is_real: bool

    def is_available(self) -> bool:
        ...

    def render(
        self,
        *,
        script: str,
        output_path: Path,
        scene_class_name: str | None = None,
        cir: CirDocument | None = None,
        ui_theme: str | None = None,
    ) -> None:
        ...


class ManimCliPreviewBackend:
    name = "manim-cli"
    is_real = True

    def __init__(
        self,
        *,
        python_path: str,
        cli_module: str,
        quality: str,
        output_format: str,
        disable_caching: bool,
        timeout_s: float | None,
    ) -> None:
        self.python_path = Path(python_path)
        self.cli_module = cli_module
        self.quality = quality
        self.output_format = output_format
        self.disable_caching = disable_caching
        self.timeout_s = timeout_s

    def is_available(self) -> bool:
        if not self.python_path.exists():
            return False

        result = subprocess.run(
            [
                str(self.python_path),
                "-c",
                f"import {self.cli_module}",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        return result.returncode == 0

    def render(
        self,
        *,
        script: str,
        output_path: Path,
        scene_class_name: str | None = None,
        cir: CirDocument | None = None,
        ui_theme: str | None = None,
    ) -> None:
        inspection = inspect_manim_script(script)
        if inspection.errors:
            raise PreviewVideoRenderError("；".join(inspection.errors))

        target_scene = scene_class_name or inspection.scene_class_names[0]
        with tempfile.TemporaryDirectory(prefix="manim-render-") as temp_dir_name:
            temp_dir = Path(temp_dir_name)
            script_path = temp_dir / "scene.py"
            media_dir = temp_dir / "media"
            script_path.write_text(script, encoding="utf-8")

            command = [
                str(self.python_path),
                "-m",
                self.cli_module,
                "--media_dir",
                str(media_dir),
                "--format",
                self.output_format,
                "-q",
                self.quality,
            ]
            if self.disable_caching:
                command.append("--disable_caching")
            command.extend([str(script_path), target_scene])

            try:
                result = subprocess.run(
                    command,
                    capture_output=True,
                    text=True,
                    check=False,
                    timeout=self.timeout_s,
                )
            except subprocess.TimeoutExpired as exc:
                raise PreviewVideoRenderError(
                    "manim 渲染超时，请精简动画复杂度或提高渲染超时设置。"
                ) from exc
            if result.returncode != 0:
                stderr = result.stderr.strip()
                stdout = result.stdout.strip()
                excerpt = stderr or stdout or "未知渲染错误。"
                raise PreviewVideoRenderError(f"manim 渲染失败：{excerpt[:4000]}")

            expected_name = f"{target_scene}.{self.output_format}"
            rendered_files = sorted(media_dir.rglob(expected_name))
            if not rendered_files:
                rendered_files = sorted(media_dir.rglob(f"*.{self.output_format}"))
            if not rendered_files:
                raise PreviewVideoRenderError("manim 渲染完成，但未找到输出视频文件。")

            output_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(rendered_files[0], output_path)


class StoryboardFallbackPreviewBackend:
    name = "storyboard-fallback"
    is_real = False

    def __init__(self) -> None:
        self.ffmpeg_binary = shutil.which("ffmpeg")
        self._font_path = self._resolve_font_path()

    def is_available(self) -> bool:
        return True

    def render(
        self,
        *,
        script: str,
        output_path: Path,
        scene_class_name: str | None = None,
        cir: CirDocument | None = None,
        ui_theme: str | None = None,
    ) -> None:
        if not self.ffmpeg_binary:
            self._write_embedded_placeholder_video(output_path)
            return

        with tempfile.TemporaryDirectory(prefix="preview-video-") as temp_dir_name:
            temp_dir = Path(temp_dir_name)
            frame_index = 0
            if cir is not None:
                slides = self._build_slides(cir, ui_theme=ui_theme)
            else:
                slides = self._build_script_slides(
                    script=script,
                    scene_class_name=scene_class_name,
                    ui_theme=ui_theme,
                )

            for slide_number, (image, frame_count) in enumerate(slides):
                slide_path = temp_dir / f"slide_{slide_number:03d}.png"
                image.save(slide_path)
                for _ in range(frame_count):
                    frame_path = temp_dir / f"frame_{frame_index:05d}.png"
                    self._link_or_copy(slide_path, frame_path)
                    frame_index += 1

            if frame_index == 0:
                raise PreviewVideoRenderError("fallback 未生成任何视频帧。")

            input_pattern = temp_dir / "frame_%05d.png"
            self._run_ffmpeg(input_pattern=input_pattern, output_path=output_path)

    def _build_slides(
        self,
        cir: CirDocument,
        *,
        ui_theme: str | None = None,
    ) -> list[tuple[Image.Image, int]]:
        slides: list[tuple[Image.Image, int]] = []
        slides.append((self._render_intro_slide(cir, ui_theme=ui_theme), 36))
        for index, _step in enumerate(cir.steps, start=1):
            slides.append((self._render_step_slide(cir, index, ui_theme=ui_theme), 52))
        slides.append((self._render_outro_slide(cir, ui_theme=ui_theme), 40))
        return slides

    def _build_script_slides(
        self,
        *,
        script: str,
        scene_class_name: str | None,
        ui_theme: str | None = None,
    ) -> list[tuple[Image.Image, int]]:
        inspection = inspect_manim_script(script)
        resolved_scene = scene_class_name or (
            inspection.scene_class_names[0] if inspection.scene_class_names else "UnknownScene"
        )
        return [
            (self._render_script_intro_slide(resolved_scene, ui_theme=ui_theme), 36),
            (self._render_script_body_slide(script, ui_theme=ui_theme), 60),
            (self._render_script_outro_slide(resolved_scene, ui_theme=ui_theme), 40),
        ]

    def _render_intro_slide(self, cir: CirDocument, *, ui_theme: str | None = None) -> Image.Image:
        palette = self._palette(ui_theme)
        image, draw = self._create_canvas(ui_theme=ui_theme)
        title_font = self._load_font(54)
        subtitle_font = self._load_font(24)
        body_font = self._load_font(28)

        self._draw_badge(draw, (72, 58, 302, 104), f"{cir.domain.value.upper()} FALLBACK", palette)
        draw.text((72, 138), cir.title, font=title_font, fill=palette["title"])
        self._draw_wrapped_text(
            draw=draw,
            text=cir.summary,
            font=body_font,
            fill=palette["body"],
            box=(72, 236, 1208, 430),
            line_spacing=14,
        )
        draw.text(
            (72, 620),
            f"{len(cir.steps)} steps · fallback preview · install manim for real rendering",
            font=subtitle_font,
            fill=palette["muted"],
        )
        return image

    def _render_step_slide(
        self,
        cir: CirDocument,
        index: int,
        *,
        ui_theme: str | None = None,
    ) -> Image.Image:
        step = cir.steps[index - 1]
        palette = self._palette(ui_theme)
        image, draw = self._create_canvas(ui_theme=ui_theme)
        title_font = self._load_font(40)
        body_font = self._load_font(24)
        meta_font = self._load_font(20)

        self._draw_badge(draw, (72, 56, 232, 100), f"STEP {index}", palette)
        draw.text((72, 130), step.title, font=title_font, fill=palette["title"])
        draw.text((72, 184), step.visual_kind.value, font=meta_font, fill=palette["accent"])

        panel_box = (72, 226, 1208, 548)
        draw.rounded_rectangle(
            panel_box,
            radius=26,
            fill=palette["panel_fill"],
            outline=palette["panel_outline"],
            width=2,
        )
        self._draw_wrapped_text(
            draw=draw,
            text=step.narration,
            font=body_font,
            fill=palette["body"],
            box=(104, 258, 1176, 392),
            line_spacing=12,
        )

        token_y = 426
        token_x = 104
        for token in step.tokens[:5]:
            token_width = self._draw_token_pill(
                draw,
                token,
                origin=(token_x, token_y),
                font=meta_font,
            )
            token_x += token_width + 14
            if token_x > 1040:
                token_x = 104
                token_y += 52

        if step.annotations:
            annotation_text = f"提示：{step.annotations[0]}"
            self._draw_wrapped_text(
                draw=draw,
                text=annotation_text,
                font=meta_font,
                fill=palette["muted"],
                box=(104, 500, 1176, 586),
                line_spacing=10,
                max_lines=2,
            )

        return image

    def _render_outro_slide(self, cir: CirDocument, *, ui_theme: str | None = None) -> Image.Image:
        palette = self._palette(ui_theme)
        image, draw = self._create_canvas(ui_theme=ui_theme)
        title_font = self._load_font(44)
        body_font = self._load_font(26)

        self._draw_badge(draw, (72, 58, 282, 104), "PREVIEW READY", palette)
        draw.text((72, 150), "当前使用 fallback 预览", font=title_font, fill=palette["title"])
        self._draw_wrapped_text(
            draw=draw,
            text=(
                "真实 Manim 渲染后端当前不可用，因此回退到 storyboard 视频。"
                "只要补齐 manim-cli、字体和 LaTeX 渲染环境，系统会自动切换到真实渲染。"
            ),
            font=body_font,
            fill=palette["body"],
            box=(72, 246, 1208, 420),
            line_spacing=14,
        )
        draw.text((72, 622), f"Title: {cir.title}", font=self._load_font(22), fill=palette["muted"])
        return image

    def _render_script_intro_slide(
        self,
        scene_class_name: str,
        *,
        ui_theme: str | None = None,
    ) -> Image.Image:
        palette = self._palette(ui_theme)
        image, draw = self._create_canvas(ui_theme=ui_theme)
        title_font = self._load_font(48)
        body_font = self._load_font(26)
        self._draw_badge(draw, (72, 58, 322, 104), "SCRIPT FALLBACK", palette)
        draw.text((72, 150), "真实渲染后端不可用", font=title_font, fill=palette["title"])
        self._draw_wrapped_text(
            draw=draw,
            text=(
                f"当前脚本已通过基础解析，目标 Scene 为 {scene_class_name}。"
                "本次视频为 fallback 占位预览，不代表真实 Manim 画面。"
            ),
            font=body_font,
            fill=palette["body"],
            box=(72, 246, 1208, 420),
            line_spacing=14,
        )
        return image

    def _render_script_body_slide(self, script: str, *, ui_theme: str | None = None) -> Image.Image:
        palette = self._palette(ui_theme)
        image, draw = self._create_canvas(ui_theme=ui_theme)
        title_font = self._load_font(38)
        code_font = self._load_font(20)
        self._draw_badge(draw, (72, 58, 262, 104), "SCRIPT", palette)
        draw.text((72, 140), "脚本摘要", font=title_font, fill=palette["title"])
        code_excerpt = "\n".join(script.strip().splitlines()[:16])
        draw.rounded_rectangle(
            (72, 214, 1208, 612),
            radius=24,
            fill=palette["code_fill"],
            outline=palette["panel_outline"],
            width=2,
        )
        self._draw_wrapped_text(
            draw=draw,
            text=code_excerpt,
            font=code_font,
            fill=palette["code_text"],
            box=(100, 244, 1180, 584),
            line_spacing=8,
            max_lines=14,
        )
        return image

    def _render_script_outro_slide(
        self,
        scene_class_name: str,
        *,
        ui_theme: str | None = None,
    ) -> Image.Image:
        palette = self._palette(ui_theme)
        image, draw = self._create_canvas(ui_theme=ui_theme)
        title_font = self._load_font(40)
        body_font = self._load_font(24)
        self._draw_badge(draw, (72, 58, 282, 104), "NEXT STEP", palette)
        draw.text((72, 150), "安装 Manim 后可切换真实渲染", font=title_font, fill=palette["title"])
        self._draw_wrapped_text(
            draw=draw,
            text=(
                f"建议为 Scene {scene_class_name} 启用可用的 manim-cli 运行环境。"
                "完成后系统会优先走 manim-cli 真渲染并输出实际动画视频。"
            ),
            font=body_font,
            fill=palette["body"],
            box=(72, 246, 1208, 420),
            line_spacing=14,
        )
        return image

    def _create_canvas(
        self,
        *,
        ui_theme: str | None = None,
    ) -> tuple[Image.Image, ImageDraw.ImageDraw]:
        palette = self._palette(ui_theme)
        width = 1280
        height = 720
        image = Image.new("RGBA", (width, height), palette["bg"])
        draw = ImageDraw.Draw(image)
        draw.rectangle((0, 0, width, height), fill=palette["bg_overlay"])
        draw.ellipse((-180, -120, 420, 360), fill=palette["orb_a"])
        draw.ellipse((860, -160, 1420, 280), fill=palette["orb_b"])
        draw.rectangle((48, 40, 1232, 680), outline=palette["frame"], width=2)
        return image, draw

    def _draw_badge(
        self,
        draw: ImageDraw.ImageDraw,
        box: tuple[int, int, int, int],
        text: str,
        palette: dict[str, str],
    ) -> None:
        draw.rounded_rectangle(
            box,
            radius=18,
            fill=palette["badge_fill"],
            outline=palette["badge_outline"],
            width=2,
        )
        badge_font = self._load_font(18)
        text_box = draw.textbbox((0, 0), text, font=badge_font)
        text_width = text_box[2] - text_box[0]
        text_height = text_box[3] - text_box[1]
        box_width = box[2] - box[0]
        box_height = box[3] - box[1]
        draw.text(
            (
                box[0] + (box_width - text_width) / 2,
                box[1] + (box_height - text_height) / 2 - 2,
            ),
            text,
            font=badge_font,
            fill=palette["badge_text"],
        )

    def _palette(self, ui_theme: str | None = None) -> dict[str, str]:
        if (ui_theme or "dark").strip().lower() == "light":
            return {
                "bg": "#f8fafb",
                "bg_overlay": "#f2f5f6",
                "orb_a": "#d6ebe5",
                "orb_b": "#e4eee8",
                "frame": "#cbd5d1",
                "title": "#191c1d",
                "body": "#31403c",
                "muted": "#5f6c67",
                "accent": "#43625b",
                "panel_fill": "#ffffff",
                "panel_outline": "#c8d1cd",
                "code_fill": "#eef3f1",
                "code_text": "#23312d",
                "badge_fill": "#d7ebe4",
                "badge_outline": "#43625b",
                "badge_text": "#1f312d",
            }
        return {
            "bg": "#0f1113",
            "bg_overlay": "#121518",
            "orb_a": "#17332c",
            "orb_b": "#1e2d2a",
            "frame": "#27302d",
            "title": "#e2e8f0",
            "body": "#d6e1dc",
            "muted": "#94a3b8",
            "accent": "#45a081",
            "panel_fill": "#171b1ecc",
            "panel_outline": "#31413c",
            "code_fill": "#0e1317",
            "code_text": "#dce8e4",
            "badge_fill": "#163b33",
            "badge_outline": "#45a081",
            "badge_text": "#eefcf8",
        }

    def _draw_wrapped_text(
        self,
        *,
        draw: ImageDraw.ImageDraw,
        text: str,
        font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
        fill: str,
        box: tuple[int, int, int, int],
        line_spacing: int,
        max_lines: int | None = None,
    ) -> None:
        wrapped_lines = self._wrap_text(
            draw=draw,
            text=text,
            font=font,
            max_width=box[2] - box[0],
            max_lines=max_lines,
        )
        current_y = box[1]
        line_height = self._line_height(font)
        for line in wrapped_lines:
            draw.text((box[0], current_y), line, font=font, fill=fill)
            current_y += line_height + line_spacing

    def _draw_token_pill(
        self,
        draw: ImageDraw.ImageDraw,
        token: VisualToken,
        *,
        origin: tuple[int, int],
        font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    ) -> int:
        text = f"{token.label}: {token.value or token.label}"
        text_box = draw.textbbox((0, 0), text, font=font)
        width = text_box[2] - text_box[0] + 28
        height = text_box[3] - text_box[1] + 18
        x, y = origin
        fill = "#0f766e" if token.emphasis == "primary" else "#1d4ed8"
        if token.emphasis == "accent":
            fill = "#c2410c"
        draw.rounded_rectangle(
            (x, y, x + width, y + height),
            radius=16,
            fill=fill,
            outline="#e2e8f0",
            width=1,
        )
        draw.text((x + 14, y + 8), text, font=font, fill="#f8fafc")
        return width

    def _wrap_text(
        self,
        *,
        draw: ImageDraw.ImageDraw,
        text: str,
        font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
        max_width: int,
        max_lines: int | None = None,
    ) -> list[str]:
        normalized = textwrap.dedent(text).strip()
        if not normalized:
            return []

        lines: list[str] = []
        for paragraph in normalized.splitlines():
            current = ""
            for character in paragraph:
                candidate = f"{current}{character}"
                if draw.textlength(candidate, font=font) <= max_width or not current:
                    current = candidate
                    continue
                lines.append(current)
                current = character
                if max_lines is not None and len(lines) >= max_lines:
                    return self._trim_lines(lines, max_lines)
            if current:
                lines.append(current)
                if max_lines is not None and len(lines) >= max_lines:
                    return self._trim_lines(lines, max_lines)
        return self._trim_lines(lines, max_lines)

    def _trim_lines(self, lines: list[str], max_lines: int | None) -> list[str]:
        if max_lines is None or len(lines) <= max_lines:
            return lines
        trimmed = lines[:max_lines]
        trimmed[-1] = f"{trimmed[-1].rstrip()}..."
        return trimmed

    def _line_height(self, font: ImageFont.FreeTypeFont | ImageFont.ImageFont) -> int:
        bbox = font.getbbox("Ag")
        return bbox[3] - bbox[1]

    def _load_font(
        self, size: int
    ) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
        if self._font_path is None:
            return ImageFont.load_default()
        return ImageFont.truetype(str(self._font_path), size=size)

    def _resolve_font_path(self) -> Path | None:
        override_path = (
            os.getenv("ALGO_VIS_CJK_FONT_PATH")
            or os.getenv("ALGO_VIS_PREVIEW_FONT_PATH")
        )
        if override_path:
            candidate = Path(override_path).expanduser()
            if candidate.exists():
                return candidate

        fontconfig_match = self._resolve_font_path_with_fontconfig()
        if fontconfig_match is not None:
            return fontconfig_match

        for raw_path in _CJK_FONT_PATH_CANDIDATES:
            candidate = Path(raw_path)
            if candidate.exists():
                return candidate
        return None

    def _resolve_font_path_with_fontconfig(self) -> Path | None:
        fc_match = shutil.which("fc-match")
        if not fc_match:
            return None

        for family in _CJK_FONT_FAMILY_CANDIDATES:
            result = subprocess.run(
                [fc_match, family, "--format=%{family[0]}|%{file}\n"],
                capture_output=True,
                text=True,
                check=False,
            )
            if result.returncode != 0:
                continue
            resolved_family, _, font_path = result.stdout.strip().partition("|")
            candidate = Path(font_path) if font_path else None
            if (
                resolved_family
                and candidate is not None
                and candidate.exists()
                and self._looks_like_cjk_font_family(resolved_family)
            ):
                return candidate
        return None

    def _looks_like_cjk_font_family(self, family_name: str) -> bool:
        normalized = family_name.casefold()
        return any(marker in normalized for marker in _CJK_FONT_FAMILY_MARKERS)

    def _link_or_copy(self, source: Path, destination: Path) -> None:
        try:
            os.link(source, destination)
        except OSError:
            shutil.copy2(source, destination)

    def _run_ffmpeg(self, *, input_pattern: Path, output_path: Path) -> None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        base_command = [
            self.ffmpeg_binary or "ffmpeg",
            "-y",
            "-framerate",
            "24",
            "-i",
            str(input_pattern),
            "-an",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
        ]
        for codec in ("libx264", "mpeg4"):
            result = subprocess.run(
                [*base_command, "-c:v", codec, str(output_path)],
                capture_output=True,
                text=True,
                check=False,
            )
            if result.returncode == 0:
                return

        stderr = result.stderr.strip()
        stdout = result.stdout.strip()
        raise PreviewVideoRenderError(stderr or stdout or "ffmpeg 渲染 fallback 视频失败。")

    def _write_embedded_placeholder_video(self, output_path: Path) -> None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        encoded = EMBEDDED_PLACEHOLDER_MP4_BASE64
        encoded += "=" * (-len(encoded) % 4)
        output_path.write_bytes(base64.b64decode(encoded))


class PreviewVideoRenderer:
    def __init__(
        self,
        output_root: str,
        url_prefix: str = "/media",
        enabled: bool = True,
        backend_mode: str = "auto",
        manim_python_path: str = ".venv-manim/bin/python",
        manim_cli_module: str = "manim",
        manim_quality: str = "l",
        manim_format: str = "mp4",
        manim_disable_caching: bool = True,
        manim_render_timeout_s: float | None = 180.0,
    ) -> None:
        self.enabled = enabled
        self.output_root = Path(output_root)
        self.url_prefix = url_prefix.rstrip("/")
        self.backend_mode = backend_mode
        self.previews_dir = self.output_root / "previews"
        self.previews_dir.mkdir(parents=True, exist_ok=True)
        self.backends: dict[str, PreviewRenderBackend] = {
            "manim": ManimCliPreviewBackend(
                python_path=manim_python_path,
                cli_module=manim_cli_module,
                quality=manim_quality,
                output_format=manim_format,
                disable_caching=manim_disable_caching,
                timeout_s=manim_render_timeout_s,
            ),
            "fallback": StoryboardFallbackPreviewBackend(),
        }

    def render(
        self,
        *,
        script: str,
        request_id: str,
        cir: CirDocument | None = None,
        scene_class_name: str | None = None,
        require_real: bool = False,
        ui_theme: str | None = None,
    ) -> PreviewVideoArtifacts:
        if not self.enabled:
            raise PreviewVideoRenderError("后端视频渲染已禁用。")

        backend = self._select_backend(require_real=require_real)
        output_path = self.previews_dir / f"{request_id}.mp4"
        backend.render(
            script=script,
            output_path=output_path,
            scene_class_name=scene_class_name,
            cir=cir,
            ui_theme=ui_theme,
        )
        return PreviewVideoArtifacts(
            file_path=output_path,
            url=f"{self.url_prefix}/previews/{output_path.name}",
            backend=backend.name,
        )

    def _select_backend(self, *, require_real: bool) -> PreviewRenderBackend:
        mode = self.backend_mode.lower()
        if mode not in {"auto", "manim", "fallback"}:
            raise PreviewVideoRenderError(f"未知预览渲染后端模式：{self.backend_mode}")

        candidate_names: list[str]
        if mode == "manim":
            candidate_names = ["manim"]
        elif mode == "fallback":
            candidate_names = ["fallback"]
        else:
            candidate_names = ["manim", "fallback"]

        if require_real:
            candidate_names = [name for name in candidate_names if self.backends[name].is_real]

        for name in candidate_names:
            backend = self.backends[name]
            if backend.is_available():
                return backend

        if require_real:
            raise PreviewVideoRenderError("真实 Manim 渲染后端当前不可用。")
        raise PreviewVideoRenderError("没有可用的视频渲染后端。")
