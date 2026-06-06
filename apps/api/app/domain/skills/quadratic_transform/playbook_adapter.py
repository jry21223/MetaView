from __future__ import annotations

from app.domain.models.playbook import (
    Layer,
    LayerTiming,
    MathPlotCurve,
    MathPlotSnapshot,
    MetaStep,
    PlaybookScript,
)
from app.domain.models.topic import TopicDomain
from app.domain.skills.quadratic_transform.problem_spec import (
    QuadraticTransformProblemSpec,
    build_quadratic_expression,
    build_quadratic_latex,
    format_number,
)
from app.domain.skills.quadratic_transform.transform_kernel import derive_transforms

_FPS = 30
_STEP_FRAMES = 120


def build_quadratic_transform_playbook(
    run_id: str,  # noqa: ARG001 - reserved for future trace metadata.
    spec: QuadraticTransformProblemSpec,
) -> PlaybookScript:
    transforms = {transform.kind: transform.explanation for transform in derive_transforms(spec)}
    shifted_expression = build_quadratic_expression(1.0, spec.h, 0.0)
    scaled_expression = build_quadratic_expression(spec.a, spec.h, 0.0)

    steps: list[MetaStep] = []

    def add_step(
        title: str,
        voiceover_text: str,
        curves: list[MathPlotCurve],
        formula_latex: str,
        marker_x: float | None = None,
    ) -> None:
        snapshot = MathPlotSnapshot(
            curves=curves,
            x_min=spec.x_min,
            x_max=spec.x_max,
            marker_x=marker_x,
            formula_latex=formula_latex,
        )
        steps.append(
            MetaStep(
                step_id=f"quadratic_transform_{len(steps) + 1:02d}",
                end_frame=(len(steps) + 1) * _STEP_FRAMES,
                title=title,
                voiceover_text=voiceover_text,
                animation_hint="math_plot_transform",
                snapshot=snapshot,
                layers=[Layer(timing=LayerTiming(), body=snapshot)],
                tokens=[],
            )
        )

    add_step(
        "从母函数开始",
        "先看母函数 y 等于 x 的平方。它的顶点在原点，开口向上，是后续变换的参照。",
        [_curve("x^2", "y=x^2", "primary")],
        "y = x^2",
        marker_x=0.0,
    )
    add_step(
        "识别顶点式",
        (
            "目标函数写成 y 等于 a 乘以 x 减 h 的平方再加 k。"
            "a 控制开口和纵向伸缩，h 和 k 控制顶点位置。"
        ),
        [
            _curve("x^2", "母函数", "secondary"),
            _curve(spec.target_expression, "目标函数", "accent"),
        ],
        spec.target_latex,
        marker_x=spec.h,
    )
    add_step(
        "水平平移",
        transforms["horizontal_shift"],
        [
            _curve("x^2", "母函数", "secondary"),
            _curve(shifted_expression, "水平平移后", "primary"),
        ],
        build_quadratic_latex(1.0, spec.h, 0.0),
        marker_x=spec.h,
    )
    add_step(
        "纵向伸缩与开口",
        transforms["vertical_scale"],
        [
            _curve(shifted_expression, "平移后参照", "secondary"),
            _curve(scaled_expression, "调整开口后", "primary"),
        ],
        build_quadratic_latex(spec.a, spec.h, 0.0),
        marker_x=spec.h,
    )
    add_step(
        "竖直平移",
        transforms["vertical_shift"],
        [
            _curve(scaled_expression, "竖直平移前", "secondary"),
            _curve(spec.target_expression, "目标函数", "primary"),
        ],
        spec.target_latex,
        marker_x=spec.h,
    )
    add_step(
        "最终对比与顶点",
        (
            f"最终图像的顶点是 ({format_number(spec.h)}, {format_number(spec.k)})。"
            f"a={format_number(spec.a)} 决定开口方向和宽窄，目标函数是 {spec.target_latex}。"
        ),
        [
            _curve("x^2", "母函数", "secondary"),
            _curve(spec.target_expression, "目标函数", "accent"),
        ],
        (
            f"a={format_number(spec.a)},\\ "
            f"(h,k)=({format_number(spec.h)}, {format_number(spec.k)})"
        ),
        marker_x=spec.h,
    )

    return PlaybookScript(
        fps=_FPS,
        total_frames=len(steps) * _STEP_FRAMES,
        domain=TopicDomain.MATH,
        title="二次函数图像变换",
        summary="用确定性的函数图像步骤解释顶点式二次函数的平移、伸缩和开口变化。",
        steps=steps,
        parameter_controls=[],
        algorithm_id=None,
        initial_data={},
    )


def _curve(expression: str, label: str, emphasis: str) -> MathPlotCurve:
    return MathPlotCurve(expression=expression, label=label, emphasis=emphasis)
