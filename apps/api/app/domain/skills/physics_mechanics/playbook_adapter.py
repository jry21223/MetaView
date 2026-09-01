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
    PhysicsForceSceneSnapshot,
    PlaybookScript,
    TableSceneSnapshot,
)
from app.domain.models.topic import TopicDomain
from app.domain.services.playbook_quality import estimate_step_frames
from app.domain.services.scene_blueprint_compiler import compile_scene_blueprint_to_playbook
from app.domain.skills.physics_mechanics.mechanics_kernel import PhysicsMechanicsSolution

_FPS = 30
_STEP_FRAMES = 90


def build_physics_mechanics_playbook(
    run_id: str,  # noqa: ARG001
    solution: PhysicsMechanicsSolution,
) -> PlaybookScript:
    snapshots = _snapshots(solution)
    steps: list[MetaStep] = []
    frame_cursor = 0
    for index, snapshot in enumerate(snapshots):
        voiceover_text = getattr(snapshot, "caption", None) or solution.answer_text
        frame_cursor += max(_STEP_FRAMES, estimate_step_frames(voiceover_text, _FPS))
        steps.append(
            MetaStep(
                step_id=f"physics_mechanics_{index + 1:02d}",
                end_frame=frame_cursor,
                title=_title(index, snapshot),
                voiceover_text=voiceover_text,
                animation_hint=snapshot.kind,
                snapshot=snapshot,
                layers=[Layer(timing=LayerTiming(), body=snapshot)],
                tokens=[],
            )
        )
    return PlaybookScript(
        fps=_FPS,
        total_frames=frame_cursor,
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
) -> list[
    MotionSceneSnapshot | PhysicsForceSceneSnapshot | MathFormulaSnapshot | TableSceneSnapshot
]:
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
        return [formula, _projectile_force_snapshot(solution), table, answer]
    if solution.kind == "uniform_acceleration_1d":
        return [motion, formula, table, answer]
    return [formula, motion, table, answer]


def _projectile_force_snapshot(solution: PhysicsMechanicsSolution) -> PhysicsForceSceneSnapshot:
    playbook = compile_scene_blueprint_to_playbook(
        {
            "id": "projectile_motion",
            "subject": "physics",
            "sceneType": "projectile_motion",
            "title": "抛体运动资产视图",
            "caption": solution.answer_text,
            "packId": "physics-basic",
            "visualIntent": ["asset_backed_projectile", "vector_decomposition"],
            "emphasisPoints": ["projectile", "trajectory", "velocity", "gravity"],
        }
    )
    snapshot = playbook.steps[0].snapshot
    if not isinstance(snapshot, PhysicsForceSceneSnapshot):
        raise TypeError("projectile_motion blueprint did not produce physics_force_scene")
    return snapshot


def _motion_snapshot(solution: PhysicsMechanicsSolution) -> MotionSceneSnapshot:
    if solution.kind == "incline_force":
        return _incline_motion_snapshot(solution)
    # The direction label lives at the arrow tip, not on the segment itself:
    # a segment label sits at the midpoint, exactly where the animated body's
    # own label passes, and the two collide mid-step (issue #286).
    objects = [
        MotionSegmentObject(
            id="axis",
            x1=-4,
            y1=0,
            x2=4,
            y2=0,
            arrow=True,
            style="muted",
        ),
        MotionTextObject(id="axis-label", x=3.4, y=0.55, text="运动方向", style="label"),
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


def _incline_motion_snapshot(solution: PhysicsMechanicsSolution) -> MotionSceneSnapshot:
    """Draw the ramp at the real incline angle with the body sliding down it.

    The generic horizontal scene used to be reused verbatim here, so the
    narration said 沿斜面下滑 while the picture showed level motion (#286).
    """
    import math

    angle_value = solution.values.get("angle_deg")
    angle_deg = angle_value.numeric if angle_value is not None else 30.0
    angle = math.radians(max(5.0, min(80.0, angle_deg)))
    base = (3.8, -2.2)
    ramp_length = min(6.5, 7.6 / math.cos(angle), 4.6 / math.sin(angle))
    top = (base[0] - ramp_length * math.cos(angle), base[1] + ramp_length * math.sin(angle))
    # Down-slope unit direction, and the outward normal used to float the
    # velocity arrow above the surface, clear of the body's path.
    down = (math.cos(angle), -math.sin(angle))
    normal = (math.sin(angle), math.cos(angle))
    start = (top[0] + 0.4 * down[0], top[1] + 0.4 * down[1])
    end = (base[0] - 0.6 * down[0], base[1] - 0.6 * down[1])
    velocity_start = (start[0] + 0.35 * normal[0], start[1] + 0.35 * normal[1])
    velocity_end = (velocity_start[0] + 1.8 * down[0], velocity_start[1] + 1.8 * down[1])
    objects = [
        MotionSegmentObject(id="ground", x1=-4.2, y1=base[1], x2=4.2, y2=base[1], style="muted"),
        MotionSegmentObject(
            id="ramp",
            x1=round(top[0], 3),
            y1=round(top[1], 3),
            x2=base[0],
            y2=base[1],
            style="secondary",
        ),
        MotionTextObject(
            id="angle-label",
            x=base[0] - 1.5,
            y=base[1] + 0.3,
            text=f"θ={angle_deg:g}°",
            style="label",
        ),
        MotionPointObject(
            id="body",
            x=round(start[0], 3),
            y=round(start[1], 3),
            r=0.16,
            label="物体",
            style="primary",
        ),
        MotionSegmentObject(
            id="velocity",
            x1=round(velocity_start[0], 3),
            y1=round(velocity_start[1], 3),
            x2=round(velocity_end[0], 3),
            y2=round(velocity_end[1], 3),
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
            keyframes=[
                MotionKeyframe(t=0, value=round(start[0], 3)),
                MotionKeyframe(t=1, value=round(end[0], 3)),
            ],
            easing="easeInOut",
        ),
        MotionTrack(
            target="body",
            property="y",
            keyframes=[
                MotionKeyframe(t=0, value=round(start[1], 3)),
                MotionKeyframe(t=1, value=round(end[1], 3)),
            ],
            easing="easeInOut",
        ),
        MotionTrack(
            target="velocity",
            property="drawProgress",
            keyframes=[MotionKeyframe(t=0, value=0), MotionKeyframe(t=1, value=1)],
            easing="linear",
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
    snapshot: MotionSceneSnapshot
    | PhysicsForceSceneSnapshot
    | MathFormulaSnapshot
    | TableSceneSnapshot,
) -> str:
    if snapshot.kind == "physics_force_scene":
        return "资产化受力视图"
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
