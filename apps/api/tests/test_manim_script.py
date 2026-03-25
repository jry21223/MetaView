from app.schemas import CirDocument, CirStep, TopicDomain, VisualKind
from app.services import preview_video_renderer as renderer_module
from app.services.manim_script import calculate_step_timing, prepare_manim_script
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
    assert "ALGO_VIS_CJK_FONT_PATH" in prepared.code
    assert "register_font_fn = globals().get('register_font')" in prepared.code
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


def test_storyboard_fallback_prefers_explicit_cjk_font_path_env(
    monkeypatch,
    tmp_path,
) -> None:
    font_path = tmp_path / "NotoSansCJK-Regular.ttc"
    font_path.write_bytes(b"font")

    monkeypatch.setenv("ALGO_VIS_CJK_FONT_PATH", str(font_path))

    backend = StoryboardFallbackPreviewBackend()

    assert backend._font_path == font_path


def test_calculate_step_timing_with_source_code() -> None:
    """Test that step_timing uses source_code for line ranges when provided."""
    source_code = """
def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1
""".strip()

    cir = CirDocument(
        title="Binary Search",
        domain=TopicDomain.ALGORITHM,
        summary="Binary search implementation",
        steps=[
            CirStep(
                id="step-1",
                title="初始化指针",
                narration="初始化 left 和 right 指针",
                visual_kind=VisualKind.ARRAY,
            ),
            CirStep(
                id="step-2",
                title="循环条件",
                narration="当 left <= right 时继续循环",
                visual_kind=VisualKind.ARRAY,
            ),
            CirStep(
                id="step-3",
                title="计算中点",
                narration="计算 mid 中点位置",
                visual_kind=VisualKind.ARRAY,
            ),
            CirStep(
                id="step-4",
                title="比较判断",
                narration="如果找到目标则返回",
                visual_kind=VisualKind.ARRAY,
            ),
        ],
    )

    timing = calculate_step_timing(cir, renderer_script="", source_code=source_code)

    assert len(timing) == 4
    # All steps should have line ranges from source code
    for entry in timing:
        assert "step_id" in entry
        assert "start_time" in entry
        assert "end_time" in entry
        assert "start_line" in entry
        assert "end_line" in entry
        # Lines should be 1-indexed
        assert entry["start_line"] >= 1
        assert entry["end_line"] >= entry["start_line"]


def test_calculate_step_timing_fallback_to_renderer_script() -> None:
    """Test that step_timing uses renderer_script when source_code is empty."""
    renderer_script = """
from manim import *

class Demo(Scene):
    def construct(self):
        step_card_1 = RoundedRectangle()
        step_title_1 = Text("Step 1")
        self.play(FadeIn(step_card_1))
        step_card_2 = RoundedRectangle()
        step_title_2 = Text("Step 2")
        self.play(FadeIn(step_card_2))
""".strip()

    cir = CirDocument(
        title="Demo",
        domain=TopicDomain.MATH,
        summary="Demo",
        steps=[
            CirStep(
                id="step-1",
                title="Step 1",
                narration="First step",
                visual_kind=VisualKind.TEXT,
            ),
            CirStep(
                id="step-2",
                title="Step 2",
                narration="Second step",
                visual_kind=VisualKind.TEXT,
            ),
        ],
    )

    timing = calculate_step_timing(cir, renderer_script=renderer_script, source_code="")

    assert len(timing) == 2
    # When source_code is empty, should use renderer_script line ranges
    for entry in timing:
        assert "step_id" in entry
        assert "start_time" in entry
        assert "end_time" in entry
