from __future__ import annotations

from app.domain.models.playbook import (
    Layer,
    LayerTiming,
    MathFormulaSnapshot,
    MetaStep,
    MotionCameraKeyframe,
    MotionCameraTrack,
    MotionKeyframe,
    MotionPointObject,
    MotionSceneSnapshot,
    MotionSceneViewport,
    MotionSceneWorld,
    MotionSegmentObject,
    MotionTextObject,
    MotionTrack,
    PlaybookScript,
    TableSceneSnapshot,
)
from app.domain.models.topic import TopicDomain
from app.domain.skills.physics_mechanics.mechanics_kernel import PhysicsMechanicsSolution

_FPS = 30
_STEP_FRAMES = 90


def build_physics_mechanics_playbook(
    run_id: str,  # noqa: ARG001
    solution: PhysicsMechanicsSolution,
) -> PlaybookScript:
    snapshots = _snapshots(solution)
    steps = [
        MetaStep(
            step_id=f"physics_mechanics_{index + 1:02d}",
            end_frame=(index + 1) * _STEP_FRAMES,
            title=_title(index, snapshot),
            voiceover_text=getattr(snapshot, "caption", None) or solution.answer_text,
            animation_hint=snapshot.kind,
            snapshot=snapshot,
            layers=[Layer(timing=LayerTiming(), body=snapshot)],
            tokens=[],
        )
        for index, snapshot in enumerate(snapshots)
    ]
    return PlaybookScript(
        fps=_FPS,
        total_frames=len(steps) * _STEP_FRAMES,
        domain=TopicDomain.PHYSICS,
        title=_playbook_title(solution.kind),
        summary="使用确定性力学 kernel 构建可渲染的物理步骤。",
        steps=steps,
        parameter_controls=[],
        algorithm_id=None,
        initial_data={},
    )


def _snapshots(
    solution: PhysicsMechanicsSolution,
) -> list[MotionSceneSnapshot | MathFormulaSnapshot | TableSceneSnapshot]:
    motion = _motion_snapshot(solution)
    formula = MathFormulaSnapshot(
        formula_latex=solution.steps[-1].formula_latex,
        caption=solution.steps[-1].caption,
        annotations=[step.formula_latex for step in solution.steps],
    )
    table = TableSceneSnapshot(
        columns=["量", "值"],
        rows=[[key, value.display] for key, value in solution.values.items()],
        active_columns=[1],
        caption="把计算得到的物理量整理成带单位的结果表。",
    )
    answer = MathFormulaSnapshot(
        formula_latex=solution.answer_latex,
        caption=solution.answer_text,
        highlights=[solution.answer_latex],
    )
    if solution.kind == "projectile_motion":
        return [formula, motion, table, answer]
    if solution.kind == "uniform_acceleration_1d":
        return [motion, formula, table, answer]
    return [formula, motion, table, answer]


def _motion_snapshot(solution: PhysicsMechanicsSolution) -> MotionSceneSnapshot:
    objects = [
        MotionSegmentObject(
            id="axis",
            x1=-4,
            y1=0,
            x2=4,
            y2=0,
            arrow=True,
            label="运动方向",
            style="muted",
        ),
        MotionPointObject(id="body", x=-3.2, y=0, r=0.16, label="物体", style="primary"),
        MotionSegmentObject(
            id="velocity",
            x1=-3.2,
            y1=0.35,
            x2=-1.2,
            y2=0.35,
            arrow=True,
            label="v",
            style="accent",
        ),
        MotionTextObject(id="summary", x=-3.7, y=2.2, text=solution.answer_text, style="caption"),
    ]
    tracks = [
        MotionTrack(
            target="body",
            property="x",
            keyframes=[MotionKeyframe(t=0, value=-3.2), MotionKeyframe(t=1, value=2.8)],
            easing="easeOut",
        ),
        MotionTrack(
            target="velocity",
            property="drawProgress",
            keyframes=[MotionKeyframe(t=0, value=0), MotionKeyframe(t=1, value=1)],
            easing="linear",
        ),
    ]
    if solution.kind == "projectile_motion":
        objects = [
            MotionSegmentObject(
                id="ground",
                x1=-4,
                y1=-2,
                x2=4,
                y2=-2,
                label="地面",
                style="muted",
            ),
            MotionSegmentObject(
                id="height",
                x1=-3.5,
                y1=1.8,
                x2=-3.5,
                y2=-2,
                label="h",
                style="secondary",
            ),
            MotionPointObject(
                id="projectile",
                x=-3.5,
                y=1.8,
                r=0.14,
                label="抛体",
                style="primary",
            ),
            MotionSegmentObject(
                id="vx",
                x1=-3.5,
                y1=2.15,
                x2=-1.6,
                y2=2.15,
                arrow=True,
                label="v_x",
                style="accent",
            ),
            MotionTextObject(
                id="summary",
                x=-3.8,
                y=2.6,
                text=solution.answer_text,
                style="caption",
            ),
        ]
        tracks = [
            MotionTrack(
                target="projectile",
                property="x",
                keyframes=[MotionKeyframe(t=0, value=-3.5), MotionKeyframe(t=1, value=3.0)],
                easing="linear",
            ),
            MotionTrack(
                target="projectile",
                property="y",
                keyframes=[MotionKeyframe(t=0, value=1.8), MotionKeyframe(t=1, value=-2.0)],
                easing="easeInOut",
            ),
        ]
    return MotionSceneSnapshot(
        viewport=MotionSceneViewport(
            width=960,
            height=540,
            world=MotionSceneWorld(xMin=-4.5, xMax=4.5, yMin=-3.0, yMax=3.0),
        ),
        objects=objects,
        tracks=tracks,
        camera=MotionCameraTrack(
            keyframes=[
                MotionCameraKeyframe(t=0, x=0, y=0, zoom=1),
                MotionCameraKeyframe(t=1, x=0, y=0, zoom=1),
            ],
            easing="linear",
        ),
    )


def _title(
    index: int,
    snapshot: MotionSceneSnapshot | MathFormulaSnapshot | TableSceneSnapshot,
) -> str:
    if snapshot.kind == "motion_scene":
        return "可视化运动"
    if snapshot.kind == "table_scene":
        return "整理结果"
    return ["建立模型", "代入公式", "得到答案"][min(index, 2)]


def _playbook_title(kind: str) -> str:
    return {
        "uniform_acceleration_1d": "匀加速直线运动",
        "projectile_motion": "抛体运动",
        "newton_second_law": "牛顿第二定律",
        "incline_force": "斜面受力分析",
    }.get(kind, "力学讲解")
