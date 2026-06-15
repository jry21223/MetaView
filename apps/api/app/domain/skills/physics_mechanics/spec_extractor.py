from __future__ import annotations

import re
from decimal import Decimal

from app.domain.skills.physics_mechanics.problem_spec import (
    PhysicsMechanicsProblemSpec,
    QuantityValue,
    q,
)

_NUMBER = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)"
_G_DEFAULT = Decimal("9.8")
_UNSUPPORTED_TERMS = (
    "空气阻力",
    "阻力",
    "弹簧",
    "碰撞",
    "多体",
    "滑轮",
    "摩擦系数",
)


def try_extract_physics_mechanics(prompt: str) -> PhysicsMechanicsProblemSpec | None:
    text = _normalize(prompt)
    unsupported = [term for term in _UNSUPPORTED_TERMS if term in text]

    spec = (
        _extract_uniform_acceleration(prompt, text)
        or _extract_projectile(prompt, text)
        or _extract_newton_second_law(prompt, text)
        or _extract_incline(prompt, text)
    )
    if spec is None:
        return None
    if unsupported:
        spec.assumptions.append("unsupported:" + ",".join(unsupported))
    return spec


def _extract_uniform_acceleration(
    prompt: str,
    text: str,
) -> PhysicsMechanicsProblemSpec | None:
    if "加速度" not in text or not ("秒" in text or "s" in text.lower()):
        return None
    acceleration = _find_quantity(text, ("加速度",), ("m/s²", "m/s^2", "m每二次方秒"))
    time = _find_time(text)
    if acceleration is None or time is None:
        return None
    initial_velocity = _find_initial_velocity(text)
    if initial_velocity is None:
        if "静止" not in text:
            return None
        initial_velocity = q("0", "m/s")
    return PhysicsMechanicsProblemSpec(
        kind="uniform_acceleration_1d",
        givens=[prompt],
        query={"find": "final_velocity,displacement"},
        values={
            "initial_velocity": initial_velocity,
            "acceleration": acceleration,
            "time": time,
        },
        assumptions=["constant_acceleration"],
    )


def _extract_projectile(prompt: str, text: str) -> PhysicsMechanicsProblemSpec | None:
    if "抛" not in text:
        return None
    speed = _find_speed(text)
    if speed is None:
        return None
    values = {"initial_speed": speed, "g": q(_G_DEFAULT, "m/s^2")}
    query = {"find": "time,horizontal_range"}
    assumptions = ["no_air_resistance", "g=9.8m/s^2"]
    height = _find_quantity(text, ("高度",), ("m", "米"))
    angle = _find_angle(text)
    if "水平抛" in text:
        if height is None:
            return None
        values["height"] = height
        values["horizontal_velocity"] = speed
        query = {"find": "time,horizontal_range"}
    elif angle is not None:
        values["angle_deg"] = angle
        query = {"find": "max_height,range"}
    else:
        return None
    return PhysicsMechanicsProblemSpec(
        kind="projectile_motion",
        givens=[prompt],
        query=query,
        values=values,
        assumptions=assumptions,
    )


def _extract_newton_second_law(prompt: str, text: str) -> PhysicsMechanicsProblemSpec | None:
    if "质量" not in text or not ("力" in text or "拉力" in text):
        return None
    mass = _find_quantity(text, ("质量",), ("kg", "千克"))
    force = _find_quantity(text, ("受到", "拉力", "合力"), ("N", "牛"))
    if mass is None or force is None:
        return None
    return PhysicsMechanicsProblemSpec(
        kind="newton_second_law",
        givens=[prompt],
        query={"find": "acceleration"},
        values={"mass": mass, "force": force},
        assumptions=["single_body", "net_force_known"],
    )


def _extract_incline(prompt: str, text: str) -> PhysicsMechanicsProblemSpec | None:
    if "斜面" not in text or "倾角" not in text:
        return None
    angle = _find_angle(text)
    if angle is None:
        return None
    mass = _find_quantity(text, ("质量",), ("kg", "千克")) or q("1", "kg")
    return PhysicsMechanicsProblemSpec(
        kind="incline_force",
        givens=[prompt],
        query={"find": "acceleration_along_incline"},
        values={"angle_deg": angle, "mass": mass, "g": q(_G_DEFAULT, "m/s^2")},
        assumptions=["frictionless_incline" if "忽略摩擦" in text else "friction_not_supported"],
    )


def _normalize(prompt: str) -> str:
    return (
        prompt.replace("（", "(")
        .replace("）", ")")
        .replace("，", ",")
        .replace("。", "")
        .replace("²", "^2")
        .replace("／", "/")
        .replace("０", "0")
        .replace("１", "1")
        .replace("２", "2")
        .replace("３", "3")
        .replace("４", "4")
        .replace("５", "5")
        .replace("６", "6")
        .replace("７", "7")
        .replace("８", "8")
        .replace("９", "9")
    )


def _find_quantity(
    text: str,
    labels: tuple[str, ...],
    units: tuple[str, ...],
) -> QuantityValue | None:
    unit_pattern = "|".join(re.escape(unit) for unit in units)
    for label in labels:
        patterns = [
            rf"{re.escape(label)}\s*(?:为|是|=|等于)?\s*(?P<value>{_NUMBER})\s*(?P<unit>{unit_pattern})",
            rf"(?P<value>{_NUMBER})\s*(?P<unit>{unit_pattern})\s*(?:的)?{re.escape(label)}",
        ]
        for pattern in patterns:
            match = re.search(pattern, text, flags=re.IGNORECASE)
            if match:
                return q(match.group("value"), _canonical_unit(match.group("unit")))
    return None


def _find_time(text: str) -> QuantityValue | None:
    match = re.search(rf"(?P<value>{_NUMBER})\s*(?:秒|s)", text, flags=re.IGNORECASE)
    if match:
        return q(match.group("value"), "s")
    return None


def _find_initial_velocity(text: str) -> QuantityValue | None:
    return _find_quantity(text, ("初速度",), ("m/s", "米/秒"))


def _find_speed(text: str) -> QuantityValue | None:
    return _find_quantity(text, ("初速度", "速度", "以"), ("m/s", "米/秒"))


def _find_angle(text: str) -> QuantityValue | None:
    match = re.search(rf"(?P<value>{_NUMBER})\s*(?:°|度)", text)
    if match:
        return q(match.group("value"), "deg")
    return None


def _canonical_unit(raw: str) -> str:
    unit = raw.lower().replace("米/秒", "m/s").replace("千克", "kg").replace("牛", "N")
    if unit in {"m/s²", "m/s^2", "m每二次方秒"}:
        return "m/s^2"
    return unit

