from app.schemas import (
    CirDocument,
    CirStep,
    SandboxMode,
    TopicDomain,
    VisualKind,
    VisualToken,
)
from app.services.sandbox import PreviewDryRunSandbox

HTML_SCAFFOLD_RUNTIME = """
<!DOCTYPE html>
<html lang=\"zh-CN\" data-metaview-runtime=\"scaffold\">
  <head>
    <meta charset=\"UTF-8\" />
    <script src=\"https://cdn.jsdelivr.net/npm/gsap@3.13/dist/gsap.min.js\"></script>
    <script src=\"https://cdn.jsdelivr.net/npm/p5@1.11.8/lib/p5.min.js\"></script>
  </head>
  <body>
    <script>
      const animationPayload = {"title": "测试", "summary": "", "steps": [{"id": "s1", "title": "一步", "narration": "说明", "visual_kind": "text", "tokens": []}], "params": []};
      const runtime = { state: { currentStep: 0, totalSteps: 1, autoplay: false, speed: 1, paused: true, params: {} } };
      window.addEventListener("message", () => {});
      document.addEventListener("DOMContentLoaded", () => {
        window.parent.postMessage({ type: "ready", totalSteps: 1 }, "*");
        window.parent.postMessage({ type: "step", index: 0 }, "*");
      });
    </script>
  </body>
</html>
"""

HTML_NOTIFY_PARENT_RUNTIME = """
<!DOCTYPE html>
<html lang=\"zh-CN\" data-metaview-runtime=\"scaffold\">
  <head>
    <meta charset=\"UTF-8\" />
    <script src=\"https://cdn.jsdelivr.net/npm/gsap@3.13/dist/gsap.min.js\"></script>
    <script src=\"https://cdn.jsdelivr.net/npm/p5@1.11.8/lib/p5.min.js\"></script>
  </head>
  <body>
    <script>
      const runtime = {
        notifyParent(type, payload = {}) {
          window.parent.postMessage({ type, ...payload }, \"*\");
        },
      };
      const api = {
        notifyParent(type, payload = {}) {
          window.parent.postMessage({ type, ...payload }, \"*\");
        },
      };
      window.addEventListener(\"message\", () => {});
      document.addEventListener(\"DOMContentLoaded\", () => {
        runtime.notifyParent(\"ready\", { totalSteps: 1 });
        api.notifyParent(\"step\", { index: 0 });
      });
    </script>
  </body>
</html>
"""

HTML_LOGIC_FLOW_RUNTIME = """
<!DOCTYPE html>
<html lang=\"zh-CN\" data-metaview-runtime=\"scaffold\">
  <head>
    <meta charset=\"UTF-8\" />
    <script src=\"https://cdn.jsdelivr.net/npm/gsap@3.13/dist/gsap.min.js\"></script>
    <script src=\"https://cdn.jsdelivr.net/npm/p5@1.11.8/lib/p5.min.js\"></script>
  </head>
  <body>
    <script>
      const animationPayload = {
        kind: \"logic_flow\",
        title: \"流程图\",
        summary: \"测试 logic_flow 运行时\",
        steps: [{ id: \"s1\", title: \"一步\", narration: \"说明\", visual_kind: \"flow\", tokens: [] }],
        params: [],
        flow_nodes: [
          { id: \"n1\", x: 400, y: 80, label: \"开始\", kind: \"start\" },
          { id: \"n2\", x: 400, y: 220, label: \"判断\", kind: \"decision\" }
        ],
        flow_links: [{ id: \"l1\", from: \"n1\", to: \"n2\", label: \"进入判断\" }],
        flow_steps: [
          { id: \"fs1\", message: \"初始化\", highlight_node: \"n1\", pulse_link_ids: [], activate_node_ids: [\"n1\"], duration_ms: 700 },
          { id: \"fs2\", message: \"进入判断\", highlight_node: \"n2\", pulse_link_ids: [\"l1\"], activate_node_ids: [\"n1\", \"n2\"], duration_ms: 760 }
        ]
      };
      const runtime = { state: { currentStep: 0, totalSteps: 2, autoplay: false, speed: 1, paused: true, params: {} } };
      window.addEventListener(\"message\", () => {});
      document.addEventListener(\"DOMContentLoaded\", () => {
        window.parent.postMessage({ type: \"ready\", totalSteps: 2 }, \"*\");
        window.parent.postMessage({ type: \"step\", index: 0 }, \"*\");
      });
    </script>
  </body>
</html>
"""


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
    sandbox = PreviewDryRunSandbox()
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
    sandbox = PreviewDryRunSandbox()
    report = sandbox.run(
        script='print("missing manim scene")',
        cir=build_cir(),
        mode=SandboxMode.DRY_RUN,
    )

    assert report.status == "failed"
    assert report.errors


def test_sandbox_rejects_dangerous_imports() -> None:
    sandbox = PreviewDryRunSandbox()
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
    sandbox = PreviewDryRunSandbox()
    report = sandbox.run(
        script="""
from manim import *

class Demo(Scene):
    def construct(self):
        eval(\"print(1)\")
        self.play(Write(Text(\"unsafe\")))
        self.wait(0.5)
        """.strip(),
        cir=build_cir(),
        mode=SandboxMode.DRY_RUN,
    )

    assert report.status == "failed"
    assert any("eval" in error.lower() for error in report.errors)


def test_sandbox_passes_valid_html_runtime() -> None:
    sandbox = PreviewDryRunSandbox()
    report = sandbox.run(
        script=HTML_SCAFFOLD_RUNTIME,
        cir=build_cir(),
        mode=SandboxMode.DRY_RUN,
    )

    assert report.status == "passed"
    assert report.engine == "html-interactive-runtime"
    assert not report.errors


def test_sandbox_passes_valid_logic_flow_html_runtime() -> None:
    sandbox = PreviewDryRunSandbox()
    report = sandbox.run(
        script=HTML_LOGIC_FLOW_RUNTIME,
        cir=build_cir(),
        mode=SandboxMode.DRY_RUN,
    )

    assert report.status == "passed"
    assert report.engine == "html-interactive-runtime"
    assert not report.errors


def test_sandbox_accepts_notify_parent_ready_and_step_markers() -> None:
    sandbox = PreviewDryRunSandbox()
    report = sandbox.run(
        script=HTML_NOTIFY_PARENT_RUNTIME,
        cir=build_cir(),
        mode=SandboxMode.DRY_RUN,
    )

    assert report.status == "passed"
    assert report.engine == "html-interactive-runtime"
    assert not report.errors
    assert not any("ready" in warning.lower() for warning in report.warnings)
    assert not any("step" in warning.lower() for warning in report.warnings)


def test_sandbox_rejects_empty_cir() -> None:
    sandbox = PreviewDryRunSandbox()
    report = sandbox.run(
        script=HTML_SCAFFOLD_RUNTIME,
        cir=CirDocument(
            title="空 CIR",
            domain=TopicDomain.ALGORITHM,
            summary="没有步骤",
            steps=[],
        ),
        mode=SandboxMode.DRY_RUN,
    )

    assert report.status == "failed"
    assert any("cir 为空" in error.lower() for error in report.errors)


    sandbox = PreviewDryRunSandbox()
    report = sandbox.run(
        script="""
<!DOCTYPE html>
<html lang=\"zh-CN\">
  <body>
    <script>
      document.addEventListener(\"DOMContentLoaded\", () => {
        console.log(\"broken\");
      });
    </script>
  </body>
</html>
""".strip(),
        cir=build_cir(),
        mode=SandboxMode.DRY_RUN,
    )

    assert report.status == "passed"
    assert report.engine == "html-interactive-runtime"
    assert not report.errors
    assert any(
        "runtime" in warning.lower() or "ready" in warning.lower()
        for warning in report.warnings
    )
