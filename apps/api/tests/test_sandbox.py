from app.schemas import (
    CirDocument,
    CirStep,
    SandboxMode,
    TopicDomain,
    VisualKind,
    VisualToken,
)
from app.services.sandbox import PreviewDryRunSandbox


def build_cir() -> CirDocument:
    return CirDocument(
        title="二分查找",
        domain=TopicDomain.ALGORITHM,
        summary="测试用 CIR",
        steps=[
            CirStep(
                id="step-1",
                title="问题拆解",
                narration="说明边界。",
                visual_kind=VisualKind.ARRAY,
                tokens=[VisualToken(id="token-1", label="输入", value="left")],
            )
        ],
    )


def test_sandbox_passes_valid_script() -> None:
    sandbox = PreviewDryRunSandbox(timeout_ms=500)
    report = sandbox.run(
        script="""
from manim import *

class Demo(Scene):
    def construct(self):
        text = Text("二分查找")
        self.play(Write(text))
        self.wait(0.5)
        """.strip(),
        cir=build_cir(),
        mode=SandboxMode.DRY_RUN,
    )

    assert report.status == "passed"
    assert not report.errors


def test_sandbox_fails_invalid_script() -> None:
    sandbox = PreviewDryRunSandbox(timeout_ms=500)
    report = sandbox.run(
        script='print("missing manim scene")',
        cir=build_cir(),
        mode=SandboxMode.DRY_RUN,
    )

    assert report.status == "failed"
    assert report.errors


def test_sandbox_rejects_dangerous_imports() -> None:
    sandbox = PreviewDryRunSandbox(timeout_ms=500)
    report = sandbox.run(
        script="""
from manim import *
import os

class Demo(Scene):
    def construct(self):
        self.play(Write(Text("unsafe")))
        self.wait(0.5)
        """.strip(),
        cir=build_cir(),
        mode=SandboxMode.DRY_RUN,
    )

    assert report.status == "failed"
    assert any("os" in error.lower() for error in report.errors)


def test_sandbox_rejects_dangerous_calls() -> None:
    sandbox = PreviewDryRunSandbox(timeout_ms=500)
    report = sandbox.run(
        script="""
from manim import *

class Demo(Scene):
    def construct(self):
        eval("print(1)")
        self.play(Write(Text("unsafe")))
        self.wait(0.5)
        """.strip(),
        cir=build_cir(),
        mode=SandboxMode.DRY_RUN,
    )

    assert report.status == "failed"
    assert any("eval" in error.lower() for error in report.errors)
