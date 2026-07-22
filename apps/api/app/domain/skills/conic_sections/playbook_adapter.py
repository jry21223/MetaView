from __future__ import annotations

import math

from app.domain.models.playbook import (
    Layer,
    LayerTiming,
    MathSceneAnnotation,
    MathSceneCurve,
    MathScenePoint,
    MathSceneSegment,
    MathSceneSnapshot,
    MetaStep,
    PlaybookScript,
)
from app.domain.models.topic import TopicDomain
from app.domain.skills.conic_sections.problem_spec import ConicEllipseFocusProblemSpec

_FPS = 30
# The canonical quality gate estimates Chinese voice-over duration
# conservatively. Keep one deterministic duration that covers the longest
# narration in this archetype so AgentPipeline output has no timing warnings.
_STEP_FRAMES = 270


def build_ellipse_focus_playbook(
    run_id: str,  # noqa: ARG001 - run identity stays outside the render contract.
    spec: ConicEllipseFocusProblemSpec,
) -> PlaybookScript:
    c = math.sqrt(spec.a * spec.a - spec.b * spec.b)
    focus_1 = (-c, 0.0)
    focus_2 = (c, 0.0)
    stages = [0.15, 0.45, 0.75, 1.0, 1.2, 1.35]
    titles = [
        "确定两个焦点",
        "让点 P 沿椭圆移动",
        "连接 P 与两个焦点",
        "比较两段距离",
        "验证距离和",
        "总结焦点定义",
    ]
    steps: list[MetaStep] = []
    for index, t in enumerate(stages):
        point = (spec.a * math.cos(t), spec.b * math.sin(t))
        distance_1 = math.dist(point, focus_1)
        distance_2 = math.dist(point, focus_2)
        distance_sum = distance_1 + distance_2
        snapshot = _snapshot(
            spec,
            focus_1,
            focus_2,
            point,
            distance_1,
            distance_2,
            stage=index + 1,
        )
        if index == 0:
            narration = (
                f"长半轴 a={_f(spec.a)}、短半轴 b={_f(spec.b)}，"
                f"两个焦点是 F1=(-{_f(c)},0) 与 F2=({_f(c)},0)。"
            )
        elif index == 1:
            narration = "点 P 由椭圆参数方程计算，因此移动过程中始终满足椭圆方程。"
        elif index == 2:
            narration = (
                f"连接 P 与 F1、F2，当前 PF1={_f(distance_1)}，"
                f"PF2={_f(distance_2)}。"
            )
        elif index == 3:
            narration = "P 移动时 PF1 与 PF2 分别变化，但它们的变化会互相补偿。"
        elif index == 4:
            narration = (
                f"当前 PF1+PF2={_f(distance_sum)}，恒等于 2a={_f(2 * spec.a)}。"
            )
        else:
            narration = (
                f"椭圆是到两个焦点距离之和等于常数的点的轨迹；"
                f"本题常数为 2a={_f(2 * spec.a)}，即 PF1+PF2={_f(2 * spec.a)}。"
            )
        steps.append(
            MetaStep(
                step_id=f"conic_ellipse_focus_{index + 1:02d}",
                end_frame=(index + 1) * _STEP_FRAMES,
                title=titles[index],
                voiceover_text=narration,
                animation_hint="math_scene",
                snapshot=snapshot,
                layers=[Layer(timing=LayerTiming(), body=snapshot)],
                tokens=[],
            )
        )

    constant = _f(2 * spec.a)
    return PlaybookScript(
        fps=_FPS,
        total_frames=steps[-1].end_frame,
        domain=TopicDomain.MATH,
        title="椭圆的焦点定义",
        summary=f"椭圆上任一点 P 都满足 PF1+PF2=2a={constant}。",
        steps=steps,
        parameter_controls=[],
        algorithm_id="conic.ellipse.focus-definition",
        initial_data={
            "scene_blueprint": ["conic.ellipse.focus-definition"],
            "archetype_id": ["conic.ellipse.focus-definition"],
            "validated_facts": ["point_on_ellipse", "focal_distance_sum"],
        },
    )


def _snapshot(
    spec: ConicEllipseFocusProblemSpec,
    focus_1: tuple[float, float],
    focus_2: tuple[float, float],
    point: tuple[float, float],
    distance_1: float,
    distance_2: float,
    *,
    stage: int,
) -> MathSceneSnapshot:
    points = [
        MathScenePoint(
            x=focus_1[0],
            y=focus_1[1],
            label="F1",
            emphasis="secondary",
            semantic_role="focus",
        ),
        MathScenePoint(
            x=focus_2[0],
            y=focus_2[1],
            label="F2",
            emphasis="secondary",
            semantic_role="focus",
        ),
    ]
    if stage >= 2:
        points.append(
            MathScenePoint(
                x=point[0],
                y=point[1],
                label="P",
                emphasis="accent",
                semantic_role="moving_point",
            )
        )
    segments: list[MathSceneSegment] = []
    if stage >= 3:
        segments.extend(
            [
                MathSceneSegment(
                    x0=point[0],
                    y0=point[1],
                    x1=focus_1[0],
                    y1=focus_1[1],
                    label=f"PF1={_f(distance_1)}",
                    emphasis="secondary",
                    semantic_role="focal_distance",
                ),
                MathSceneSegment(
                    x0=point[0],
                    y0=point[1],
                    x1=focus_2[0],
                    y1=focus_2[1],
                    label=f"PF2={_f(distance_2)}",
                    emphasis="accent",
                    semantic_role="focal_distance",
                ),
            ]
        )
    annotations = []
    if stage >= 5:
        annotations.append(
            MathSceneAnnotation(
                x=-spec.a,
                y=spec.b + 0.5,
                text=f"$PF_1+PF_2={_f(distance_1 + distance_2)}=2a$",
                align="nw",
                semantic_role="derivation_panel",
            )
        )
    return MathSceneSnapshot(
        x_min=-spec.a - 1.5,
        x_max=spec.a + 1.5,
        y_min=-spec.b - 1.5,
        y_max=spec.b + 1.5,
        curves=[
            MathSceneCurve(
                expression_x=f"{_f(spec.a)}*cos(t)",
                expression_y=f"{_f(spec.b)}*sin(t)",
                t_min=0.0,
                t_max=2 * math.pi,
                label="ellipse",
                emphasis="primary",
                semantic_role="conic_curve",
            )
        ],
        points=points,
        segments=segments,
        annotations=annotations,
        formula_latex=f"PF_1+PF_2=2a={_f(2 * spec.a)}",
        caption="两段焦点距离分别变化，距离和保持不变。",
    )


def _f(value: float) -> str:
    rounded = round(value, 6)
    return str(int(rounded)) if float(rounded).is_integer() else f"{rounded:g}"
