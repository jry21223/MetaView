"""Physics animation tools for force and motion visuals."""

from __future__ import annotations

import math

from pydantic import BaseModel, Field

from app.domain.animation_tools.registry import register
from app.domain.models.cir import (
    KaTeXOverlaySpec,
    LayerKind,
    LayerSpec,
    LayerTimingSpec,
    NarrationCardSpec,
    SceneAnnotation,
    SceneSegment,
    SceneSpec,
)
from app.domain.models.playbook import (
    MotionKeyframe,
    MotionPointObject,
    MotionSceneSnapshot,
    MotionSceneViewport,
    MotionSceneWorld,
    MotionSegmentObject,
    MotionTrack,
)


class ForceVectorArgs(BaseModel):
    name: str = Field(min_length=1)
    magnitude: float = Field(gt=0)
    angle_deg: float


class PhysicsForceDiagramArgs(BaseModel):
    forces: list[ForceVectorArgs] = Field(min_length=1)
    x_min: float = -5.0
    x_max: float = 5.0
    y_min: float = -5.0
    y_max: float = 5.0
    formula_latex: str | None = None
    caption: str | None = None


class PhysicsProjectileMotionArgs(BaseModel):
    v0: float = Field(gt=0)
    angle_deg: float
    g: float = Field(default=9.8, gt=0)
    duration: float | None = Field(default=None, gt=0)
    x_min: float = 0.0
    x_max: float | None = None
    y_min: float = 0.0
    y_max: float | None = None
    formula_latex: str | None = None
    caption: str | None = None


@register("physics.force_diagram", PhysicsForceDiagramArgs)
def force_diagram(args: dict) -> list[LayerSpec]:
    parsed = PhysicsForceDiagramArgs.model_validate(args)
    segments: list[SceneSegment] = []
    annotations: list[SceneAnnotation] = []
    scale = _force_scale(parsed.forces)
    for force in parsed.forces:
        angle = math.radians(force.angle_deg)
        x1 = scale * force.magnitude * math.cos(angle)
        y1 = scale * force.magnitude * math.sin(angle)
        segments.append(
            SceneSegment(
                x0=0.0,
                y0=0.0,
                x1=round(x1, 4),
                y1=round(y1, 4),
                arrow=True,
                label=force.name,
                emphasis="primary",
            )
        )
        annotations.append(
            SceneAnnotation(
                x=round(x1, 4),
                y=round(y1, 4),
                text=f"{force.name}={force.magnitude:g}",
            )
        )
    scene = SceneSpec(
        x_min=parsed.x_min,
        x_max=parsed.x_max,
        y_min=parsed.y_min,
        y_max=parsed.y_max,
        segments=segments,
        annotations=annotations,
        formula_latex=parsed.formula_latex,
        caption=parsed.caption,
    )
    return [
        LayerSpec(
            kind=LayerKind.MATH_SCENE,
            scene=scene,
            timing=LayerTimingSpec(z_order=0),
        ),
        *_optional_overlays(parsed.formula_latex, parsed.caption, parsed.x_max, parsed.y_max),
    ]


@register("physics.projectile_motion", PhysicsProjectileMotionArgs)
def projectile_motion(args: dict) -> list[LayerSpec]:
    parsed = PhysicsProjectileMotionArgs.model_validate(args)
    angle = math.radians(parsed.angle_deg)
    vx = parsed.v0 * math.cos(angle)
    vy = parsed.v0 * math.sin(angle)
    duration = parsed.duration or max(1.0, 2 * vy / parsed.g)
    x_end = max(0.0, vx * duration)
    y_peak = max(0.0, (vy * vy) / (2 * parsed.g))
    x_max = parsed.x_max if parsed.x_max is not None else max(10.0, x_end * 1.1)
    y_max = parsed.y_max if parsed.y_max is not None else max(5.0, y_peak * 1.3)
    snapshot = MotionSceneSnapshot(
        viewport=MotionSceneViewport(
            width=640,
            height=360,
            world=MotionSceneWorld(
                xMin=parsed.x_min,
                xMax=x_max,
                yMin=parsed.y_min,
                yMax=y_max,
            ),
        ),
        objects=[
            MotionPointObject(id="projectile", x=0.0, y=0.0, label="projectile", style="accent"),
            MotionSegmentObject(
                id="ground",
                x1=parsed.x_min,
                y1=0.0,
                x2=x_max,
                y2=0.0,
                style="muted",
            ),
        ],
        tracks=[
            MotionTrack(
                target="projectile",
                property="x",
                keyframes=[
                    MotionKeyframe(t=0.0, value=0.0),
                    MotionKeyframe(t=1.0, value=round(x_end, 4)),
                ],
                easing="linear",
            ),
            MotionTrack(
                target="projectile",
                property="y",
                keyframes=[
                    MotionKeyframe(t=0.0, value=0.0),
                    MotionKeyframe(t=0.5, value=round(y_peak, 4)),
                    MotionKeyframe(t=1.0, value=0.0),
                ],
                easing="easeInOut",
            ),
        ],
    )
    return [
        LayerSpec(
            kind=LayerKind.MOTION_SCENE,
            motion_scene=snapshot,
            timing=LayerTimingSpec(z_order=0),
        ),
        *_optional_overlays(parsed.formula_latex, parsed.caption, x_max, y_max),
    ]


def _force_scale(forces: list[ForceVectorArgs]) -> float:
    max_magnitude = max(force.magnitude for force in forces)
    return 3.5 / max_magnitude


def _optional_overlays(
    formula_latex: str | None,
    caption: str | None,
    x: float,
    y: float,
) -> list[LayerSpec]:
    layers: list[LayerSpec] = []
    if caption:
        layers.append(
            LayerSpec(
                kind=LayerKind.NARRATION_CARD,
                timing=LayerTimingSpec(enter_at=0.2, exit_at=1.0, z_order=1),
                narration_card=NarrationCardSpec(text=caption, position="bottom"),
            )
        )
    if formula_latex:
        layers.append(
            LayerSpec(
                kind=LayerKind.KATEX_OVERLAY,
                timing=LayerTimingSpec(enter_at=0.3, exit_at=1.0, z_order=2),
                katex_overlay=KaTeXOverlaySpec(x=x, y=y, latex=formula_latex),
            )
        )
    return layers
