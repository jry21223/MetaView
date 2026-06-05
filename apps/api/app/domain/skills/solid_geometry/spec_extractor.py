from __future__ import annotations

import re

from app.domain.skills.solid_geometry.problem_spec import (
    LineRef,
    PlaneRef,
    SolidGeometryProblemSpec,
    SolidGeometryQuery,
)

_NUMBER = r"([0-9]+(?:\.[0-9]+)?(?:/[0-9]+(?:\.[0-9]+)?)?)"
_LABEL_RE = re.compile(r"[A-Z][0-9]?")
_NORMALIZE = str.maketrans({
    "，": ",",
    "。": ".",
    "：": ":",
    "；": ";",
    "（": "(",
    "）": ")",
    "－": "-",
    "–": "-",
    "—": "-",
    "　": " ",
})


def extract_solid_geometry_spec(prompt: str) -> SolidGeometryProblemSpec | None:
    text = _clean(prompt)
    lowered = text.lower()

    if _looks_like_volume(text, lowered):
        return _extract_cuboid_volume(text)
    if "正四棱锥" in text or "regular quad pyramid" in lowered:
        return _extract_regular_quad_pyramid_line_plane(text)
    if "正方体" in text or "cube" in lowered:
        return _extract_cube_line_plane(text)
    return None


def _extract_regular_quad_pyramid_line_plane(text: str) -> SolidGeometryProblemSpec | None:
    if not _contains_line_plane_query(text):
        return None
    base = _number_after(text, ("底面边长", "底边长", "base side", "base edge"))
    height = _number_after(text, ("高", "height"))
    line = _extract_query_line(text)
    plane = _extract_query_plane(text)
    if base is None or height is None or line is None or plane is None:
        return None
    return SolidGeometryProblemSpec(
        body="regular_quad_pyramid",
        dimensions={"base": base, "height": height},
        givens=[text],
        query=SolidGeometryQuery(
            kind="line_plane_angle",
            line=LineRef(through=line),
            plane=PlaneRef(through=plane[:3]),
        ),
    )


def _extract_cube_line_plane(text: str) -> SolidGeometryProblemSpec | None:
    if not _contains_line_plane_query(text):
        return None
    side = _number_after(text, ("棱长", "边长", "side", "edge"))
    line = _extract_query_line(text)
    plane = _extract_query_plane(text)
    if side is None or line is None or plane is None:
        return None
    return SolidGeometryProblemSpec(
        body="cube",
        dimensions={"side": side},
        givens=[text],
        query=SolidGeometryQuery(
            kind="line_plane_angle",
            line=LineRef(through=line),
            plane=PlaneRef(through=plane[:3]),
        ),
    )


def _extract_cuboid_volume(text: str) -> SolidGeometryProblemSpec | None:
    length = _number_after(text, ("长", "length"))
    width = _number_after(text, ("宽", "width"))
    height = _number_after(text, ("高", "height"))
    if length is None or width is None or height is None:
        return None
    return SolidGeometryProblemSpec(
        body="cuboid",
        dimensions={"length": length, "width": width, "height": height},
        givens=[text],
        query=SolidGeometryQuery(kind="volume"),
    )


def _clean(prompt: str) -> str:
    return " ".join(prompt.translate(_NORMALIZE).split())


def _looks_like_volume(text: str, lowered: str) -> bool:
    return ("长方体" in text or "cuboid" in lowered) and ("体积" in text or "volume" in lowered)


def _contains_line_plane_query(text: str) -> bool:
    return (
        "线面角" in text
        or "平面" in text
        or "底面" in text
        or "line-plane angle" in text.lower()
    )


def _number_after(text: str, labels: tuple[str, ...]) -> str | None:
    for label in labels:
        match = re.search(rf"{re.escape(label)}(?:为|是|=|:)?\s*{_NUMBER}", text, re.IGNORECASE)
        if match:
            return match.group(1)
    return None


def _extract_query_line(text: str) -> tuple[str, str] | None:
    patterns = [
        r"求\s*([A-Z][0-9]?[A-Z][0-9]?)\s*(?:与|和|and)",
        r"([A-Z][0-9]?[A-Z][0-9]?)\s*(?:与|和|and)\s*(?:平面|底面|plane)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if not match:
            continue
        labels = tuple(_LABEL_RE.findall(match.group(1).upper()))
        if len(labels) == 2:
            return labels  # type: ignore[return-value]
    return None


def _extract_query_plane(text: str) -> tuple[str, str, str] | None:
    match = re.search(r"(?:平面|底面|plane)\s*([A-Z0-9]{3,8})", text, re.IGNORECASE)
    if not match:
        return None
    labels = tuple(_LABEL_RE.findall(match.group(1).upper()))
    if len(labels) >= 3:
        return labels[:3]  # type: ignore[return-value]
    return None
