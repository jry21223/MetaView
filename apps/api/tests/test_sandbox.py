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
// renderer-target: preview-js
export const previewTimeline = [
  {
    id: "step-1",
    title: "问题拆解",
    visualKind: "array",
    tokens: ["输入:left"],
  },
];
        """.strip(),
        cir=build_cir(),
        mode=SandboxMode.DRY_RUN,
    )

    assert report.status == "passed"
    assert not report.errors


def test_sandbox_fails_invalid_script() -> None:
    sandbox = PreviewDryRunSandbox(timeout_ms=500)
    report = sandbox.run(
        script='const broken = "missing export";',
        cir=build_cir(),
        mode=SandboxMode.DRY_RUN,
    )

    assert report.status == "failed"
    assert report.errors
