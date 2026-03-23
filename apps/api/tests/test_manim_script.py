from app.services import preview_video_renderer as renderer_module
from app.services.manim_script import prepare_manim_script
from app.services.preview_video_renderer import StoryboardFallbackPreviewBackend


def test_prepare_manim_script_injects_cjk_font_fallback() -> None:
    prepared = prepare_manim_script(
        """
from manim import *

class Demo(Scene):
    def construct(self):
        title = Text("中文标题")
        subtitle = MarkupText("<b>中文说明</b>")
        caption = Paragraph("第一行", "第二行")
        self.play(Write(title), FadeIn(subtitle), FadeIn(caption))
        self.wait(0.5)
        """.strip()
    )

    assert "def _algo_vis_pick_cjk_font():" in prepared.code
    assert "title = _algo_vis_text(" in prepared.code
    assert "subtitle = _algo_vis_markup_text(" in prepared.code
    assert "caption = _algo_vis_paragraph(" in prepared.code
    assert "已为 Text/MarkupText/Paragraph 注入 CJK 字体回退。" in prepared.diagnostics


def test_prepare_manim_script_keeps_explicit_font() -> None:
    prepared = prepare_manim_script(
        """
from manim import *

class Demo(Scene):
    def construct(self):
        title = Text("中文标题", font="Fira Code")
        self.play(Write(title))
        self.wait(0.5)
        """.strip()
    )

    assert "def _algo_vis_pick_cjk_font():" not in prepared.code
    assert "_algo_vis_text(" not in prepared.code
    assert "font='Fira Code'" in prepared.code


def test_storyboard_fallback_prefers_cjk_font_from_fontconfig(
    monkeypatch,
    tmp_path,
) -> None:
    font_path = tmp_path / "NotoSansCJK-Regular.ttc"
    font_path.write_bytes(b"font")

    monkeypatch.setattr(
        renderer_module.shutil,
        "which",
        lambda name: "/usr/bin/fc-match" if name == "fc-match" else None,
    )

    def fake_run(command, capture_output, text, check):
        assert command[0] == "/usr/bin/fc-match"
        return type(
            "CompletedProcess",
            (),
            {
                "returncode": 0,
                "stdout": f"Noto Sans CJK SC|{font_path}\n",
                "stderr": "",
            },
        )()

    monkeypatch.setattr(renderer_module.subprocess, "run", fake_run)

    backend = StoryboardFallbackPreviewBackend()

    assert backend._font_path == font_path
