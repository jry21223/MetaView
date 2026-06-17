"""Golden fixture for a deterministic Animation Tool Registry generation path."""

from app.domain.animation_tools import safe_expand_cir_animation_calls_with_issues
from app.domain.models.cir import AnimationCall, CirDocument, CirStep, LayerKind, VisualKind
from app.domain.models.topic import TopicDomain
from app.domain.services.playbook_builder import build_playbook


def test_quadratic_tangent_fixture_expands_to_renderable_playbook_layer() -> None:
    cir = CirDocument(
        title="y=x^2 的图像和 x=2 处切线",
        domain=TopicDomain.MATH,
        summary="解释二次函数图像，并在 x=2 处观察切线斜率。",
        steps=[
            CirStep(
                id="quadratic-tangent",
                title="画出函数和切线",
                narration="先画出 y=x^2，再叠加 x=2 处的切线 y=4x-4。",
                visual_kind=VisualKind.FUNCTION,
                animation_calls=[
                    AnimationCall(
                        tool="math.show_tangent",
                        args={
                            "expression": "x^2",
                            "x0": 2,
                            "tangent_expression": "4*x - 4",
                            "formula_latex": "y=x^2,\\ y=4x-4",
                            "caption": "切线在 x=2 处贴住曲线，斜率为 4。",
                            "x_min": -3,
                            "x_max": 5,
                        },
                    )
                ],
            )
        ],
    )

    expanded = safe_expand_cir_animation_calls_with_issues(cir)

    assert expanded.issues == []
    expanded_step = expanded.cir.steps[0]
    assert expanded_step.animation_calls == []
    assert expanded_step.layers[0].kind == LayerKind.MATH_PLOT
    assert expanded_step.layers[0].plot is not None
    assert [curve.expression for curve in expanded_step.layers[0].plot.curves] == [
        "x^2",
        "4*x - 4",
    ]

    playbook = build_playbook(cir, execution_map=None)
    layer = playbook.steps[0].layers[0]

    assert layer.body.kind == "math_plot"
    assert layer.body.marker_x == 2
    assert [curve.expression for curve in layer.body.curves] == ["x^2", "4*x - 4"]
