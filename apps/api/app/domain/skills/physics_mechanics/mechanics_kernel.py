from __future__ import annotations

import math
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

from app.domain.skills.physics_mechanics.problem_spec import PhysicsMechanicsProblemSpec


@dataclass(frozen=True)
class MechanicsValue:
    display: str
    numeric: float
    unit: str


@dataclass(frozen=True)
class PhysicsMechanicsStep:
    title: str
    formula_latex: str
    caption: str


@dataclass(frozen=True)
class PhysicsMechanicsSolution:
    kind: str
    steps: list[PhysicsMechanicsStep]
    values: dict[str, MechanicsValue]
    answer_latex: str
    answer_text: str
    checks: dict[str, bool] = field(default_factory=dict)


def solve_mechanics(spec: PhysicsMechanicsProblemSpec) -> PhysicsMechanicsSolution:
    if _has_unsupported_assumption(spec):
        raise ValueError("unsupported_mechanics_assumption")
    if spec.kind == "uniform_acceleration_1d":
        return _solve_uniform(spec)
    if spec.kind == "projectile_motion":
        return _solve_projectile(spec)
    if spec.kind == "newton_second_law":
        return _solve_newton(spec)
    if spec.kind == "incline_force":
        return _solve_incline(spec)
    raise ValueError("unsupported_mechanics_kind")


def _solve_uniform(spec: PhysicsMechanicsProblemSpec) -> PhysicsMechanicsSolution:
    v0 = _value(spec, "initial_velocity")
    a = _value(spec, "acceleration")
    t = _value(spec, "time")
    v = v0 + a * t
    s = v0 * t + Decimal("0.5") * a * t * t
    values = {
        "final_velocity": _mechanics_value(v, "m/s"),
        "displacement": _mechanics_value(s, "m"),
    }
    return PhysicsMechanicsSolution(
        kind=spec.kind,
        steps=[
            PhysicsMechanicsStep("列出已知量", "v_0,a,t", "把题目转成一维匀加速模型。"),
            PhysicsMechanicsStep("速度公式", "v=v_0+at", "末速度由初速度和速度增量相加。"),
            PhysicsMechanicsStep(
                "位移公式", r"s=v_0t+\frac{1}{2}at^2", "位移来自初速度位移和加速位移。"
            ),
        ],
        values=values,
        answer_latex=(
            rf"v=v_0+at={_fmt(v)}\,\text{{m/s}},\quad "
            rf"s=v_0t+\frac{{1}}{{2}}at^2={_fmt(s)}\,\text{{m}}"
        ),
        answer_text=(
            f"末速度 {values['final_velocity'].display}，"
            f"位移 {values['displacement'].display}。"
        ),
        checks={"constant_acceleration": True},
    )


# The projectile LessonPlan requires evidence for the gravity and parabolic
# facts; the narration has to say them, a number table never does.
_PROJECTILE_MECHANISM = "水平速度保持不变，竖直方向由重力加速，两个分运动合成抛物线轨迹。"


def _solve_projectile(spec: PhysicsMechanicsProblemSpec) -> PhysicsMechanicsSolution:
    g = _value(spec, "g")
    if "height" in spec.values:
        height = _value(spec, "height")
        vx = _value(spec, "horizontal_velocity")
        time = (Decimal("2") * height / g).sqrt()
        horizontal_range = vx * time
        values = {
            "time": _mechanics_value(time, "s"),
            "horizontal_range": _mechanics_value(horizontal_range, "m"),
        }
        answer_latex = (
            rf"t=\sqrt{{\frac{{2h}}{{g}}}}={_fmt(time)}\,\text{{s}},\quad "
            rf"x=v_xt={_fmt(horizontal_range)}\,\text{{m}}"
        )
        text = (
            f"落地时间 {values['time'].display}，"
            f"水平位移 {values['horizontal_range'].display}。{_PROJECTILE_MECHANISM}"
        )
        vertical_latex = r"y=h-\frac{1}{2}gt^2"
        vertical_caption = "竖直方向由重力产生加速度 g，从高度 h 落到地面的时间由它决定。"
        horizontal_latex = "x=v_xt"
    else:
        speed = float(_value(spec, "initial_speed"))
        angle = math.radians(float(_value(spec, "angle_deg")))
        g_float = float(g)
        max_height = Decimal(str((speed * math.sin(angle)) ** 2 / (2 * g_float)))
        horizontal_range = Decimal(str(speed**2 * math.sin(2 * angle) / g_float))
        values = {
            "max_height": _mechanics_value(max_height, "m"),
            "range": _mechanics_value(horizontal_range, "m"),
        }
        answer_latex = (
            rf"H=\frac{{v_0^2\sin^2\theta}}{{2g}}={_fmt(max_height)}\,\text{{m}},\quad "
            rf"R=\frac{{v_0^2\sin 2\theta}}{{g}}={_fmt(horizontal_range)}\,\text{{m}}"
        )
        text = (
            f"最大高度 {values['max_height'].display}，"
            f"射程 {values['range'].display}。{_PROJECTILE_MECHANISM}"
        )
        # An angled launch starts from the ground with an upward velocity
        # component; the horizontal-launch formula y=h-½gt² does not apply.
        vertical_latex = r"y=v_0\sin\theta\,t-\frac{1}{2}gt^2"
        vertical_caption = (
            "竖直方向先减速上升再加速下落，由重力产生加速度 g，决定最大高度与飞行时间。"
        )
        horizontal_latex = r"x=v_0\cos\theta\,t"
    return PhysicsMechanicsSolution(
        kind=spec.kind,
        steps=[
            PhysicsMechanicsStep(
                "分解运动",
                "x,y",
                "水平与竖直方向独立处理：水平方向不受力、保持匀速，竖直方向只受重力、匀加速。",
            ),
            PhysicsMechanicsStep("竖直方向", vertical_latex, vertical_caption),
            PhysicsMechanicsStep(
                "水平方向",
                horizontal_latex,
                "水平方向匀速运动给出位移，两个分运动合成抛物线轨迹。",
            ),
        ],
        values=values,
        answer_latex=answer_latex,
        answer_text=text,
        checks={"no_air_resistance": True},
    )


def _solve_newton(spec: PhysicsMechanicsProblemSpec) -> PhysicsMechanicsSolution:
    force = _value(spec, "force")
    mass = _value(spec, "mass")
    acceleration = force / mass
    value = _mechanics_value(acceleration, "m/s^2")
    return PhysicsMechanicsSolution(
        kind=spec.kind,
        steps=[
            PhysicsMechanicsStep("识别合力", "F", "题目给出单个物体的水平合力。"),
            PhysicsMechanicsStep("牛顿第二定律", "F=ma", "加速度等于合力除以质量。"),
            PhysicsMechanicsStep("代入计算", "a=F/m", "用已知质量和力求加速度。"),
        ],
        values={"acceleration": value},
        answer_latex=rf"a=\frac{{F}}{{m}}={_fmt(acceleration)}\,\text{{m/s}}^2",
        answer_text=f"加速度 {value.display}。",
        checks={"single_body": True},
    )


def _solve_incline(spec: PhysicsMechanicsProblemSpec) -> PhysicsMechanicsSolution:
    if "frictionless_incline" not in spec.assumptions:
        raise ValueError("incline_requires_frictionless_assumption")
    g = float(_value(spec, "g"))
    angle = float(_value(spec, "angle_deg"))
    acceleration = Decimal(str(g * math.sin(math.radians(angle))))
    value = _mechanics_value(acceleration, "m/s^2")
    return PhysicsMechanicsSolution(
        kind=spec.kind,
        steps=[
            PhysicsMechanicsStep(
                "建立斜面坐标",
                r"\parallel,\perp",
                "沿斜面方向和垂直斜面方向分解。",
            ),
            PhysicsMechanicsStep("重力分解", r"mg\sin\theta", "沿斜面分力提供下滑加速度。"),
            PhysicsMechanicsStep("忽略摩擦", r"a=g\sin\theta", "质量约掉，结果只由角度和 g 决定。"),
        ],
        values={
            "acceleration": value,
            # The motion-scene adapter draws the ramp at the real angle.
            "angle_deg": _mechanics_value(Decimal(str(angle)), "°"),
        },
        answer_latex=rf"a=g\sin\theta={_fmt(acceleration)}\,\text{{m/s}}^2",
        answer_text=f"沿斜面下滑加速度 {value.display}。",
        checks={"frictionless": True},
    )


def _has_unsupported_assumption(spec: PhysicsMechanicsProblemSpec) -> bool:
    return any(item.startswith("unsupported:") for item in spec.assumptions)


def _value(spec: PhysicsMechanicsProblemSpec, key: str) -> Decimal:
    try:
        return spec.values[key].value
    except KeyError as exc:
        raise ValueError(f"missing_quantity:{key}") from exc


def _mechanics_value(value: Decimal, unit: str) -> MechanicsValue:
    return MechanicsValue(display=f"{_fmt(value)} {unit}", numeric=float(value), unit=unit)


def _fmt(value: Decimal) -> str:
    rounded = value.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP).normalize()
    if rounded == rounded.to_integral():
        return str(int(rounded))
    return format(rounded, "f")
