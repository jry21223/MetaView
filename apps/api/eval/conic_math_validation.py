"""Deterministic mathematical checks for hidden conic Gold variants.

Dispatch is keyed by the shared archetype identifier, never by a hidden case
identifier. The module consumes only validated parameters and serialized
``MathScene`` snapshots and has no model, UI, or network dependency.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Any, Literal

import numpy as np
import sympy as sp
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.domain.services.geometry_validators import _compile, _parse, _safe_eval

_T = sp.Symbol("t", real=True)


@dataclass(frozen=True)
class ConicMathDiagnostic:
    path: str
    message: str


class _EllipseParameters(BaseModel):
    model_config = ConfigDict(extra="forbid")

    a: float = Field(gt=0)
    b: float = Field(gt=0)
    majorAxis: Literal["x", "y"] = "x"

    @model_validator(mode="after")
    def validate_axes(self) -> "_EllipseParameters":
        if self.a <= self.b:
            raise ValueError("ellipse parameters require a > b > 0")
        return self


class _StringConstructionParameters(BaseModel):
    """Rope-length ellipse construction: rope 2a between pins at (+/-c, 0)."""

    model_config = ConfigDict(extra="forbid")

    a: float = Field(gt=0)
    c: float = Field(ge=0)

    @model_validator(mode="after")
    def validate_rope(self) -> "_StringConstructionParameters":
        if self.a <= self.c:
            raise ValueError(
                "string construction requires 2a > 2c (rope longer than pin distance)"
            )
        return self


class _EllipseDerivationParameters(_StringConstructionParameters):
    """Standard-equation derivation: same a/c contract as the rope build."""


class _EllipseShapeParameters(_StringConstructionParameters):
    """Axes/eccentricity lesson: same a/c contract as the rope build."""


class _ParabolaParameters(BaseModel):
    model_config = ConfigDict(extra="forbid")

    p: float = Field(gt=0)
    axis: Literal["right", "up"]


class _HyperbolaParameters(BaseModel):
    model_config = ConfigDict(extra="forbid")

    a: float = Field(gt=0)
    b: float = Field(gt=0)
    transverseAxis: Literal["x", "y"]


class _LineEllipseParameters(_EllipseParameters):
    lineKind: Literal["vertical"] | None = None
    samples: list[float] | None = Field(default=None, min_length=3)
    nearTangent: bool | None = None
    lineFamily: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_line_evidence(self) -> "_LineEllipseParameters":
        if self.lineKind == "vertical" and self.samples is not None:
            states = {
                _sign_state(1 - sample * sample / (self.a * self.a)) for sample in self.samples
            }
            if states != {"positive", "zero", "negative"}:
                raise ValueError("vertical samples must cover secant, tangent, and disjoint states")
            return self
        if self.nearTangent and self.lineFamily:
            slope = float(self.lineFamily.get("slope", 0))
            intercepts = self.lineFamily.get("intercepts")
            if not isinstance(intercepts, list) or len(intercepts) < 3:
                raise ValueError("near-tangent line family requires at least three intercepts")
            tangent = math.sqrt(self.b * self.b + slope * slope * self.a * self.a)
            states = {_sign_state(tangent * tangent - float(q) ** 2) for q in intercepts}
            if states != {"positive", "zero", "negative"}:
                raise ValueError("near-tangent samples must straddle the tangent boundary")
            return self
        raise ValueError("line/ellipse variants require an explicit sampled line family")


class _ChordParameters(_EllipseParameters):
    fixedPoint: tuple[float, float] | None = None
    slope: float | None = None

    @model_validator(mode="after")
    def validate_family(self) -> "_ChordParameters":
        if (self.fixedPoint is None) == (self.slope is None):
            raise ValueError("chord variants require exactly one line-family definition")
        if self.fixedPoint is not None:
            x, y = self.fixedPoint
            if x * x / (self.a * self.a) + y * y / (self.b * self.b) >= 1:
                raise ValueError("fixed chord point must lie strictly inside the ellipse")
        return self


class _PolePolarParameters(BaseModel):
    model_config = ConfigDict(extra="forbid")

    radius: float = Field(gt=0)
    pole: tuple[float, float] | None = None
    poleFamily: tuple[str, float] | None = None
    familySamples: list[float] | None = None

    @model_validator(mode="after")
    def validate_pole(self) -> "_PolePolarParameters":
        if (self.pole is None) == (self.poleFamily is None):
            raise ValueError("pole/polar variants require exactly one pole definition")
        if self.pole is not None and math.hypot(*self.pole) <= self.radius:
            raise ValueError("a concrete pole must lie strictly outside the circle")
        if self.poleFamily is not None and not self.familySamples:
            raise ValueError("a pole family requires numeric samples across its boundary")
        if self.poleFamily is not None and self.familySamples:
            _, fixed = self.poleFamily
            states = {
                _sign_state(sample * sample + fixed * fixed - self.radius * self.radius)
                for sample in self.familySamples
            }
            if states != {"positive", "zero", "negative"}:
                raise ValueError("pole family samples must cover outside, boundary, and inside")
        return self


_PARAMETER_MODELS: dict[str, type[BaseModel]] = {
    "conic.ellipse.string-construction": _StringConstructionParameters,
    "conic.ellipse.standard-equation": _EllipseDerivationParameters,
    "conic.ellipse.parameters-eccentricity": _EllipseShapeParameters,
    "conic.ellipse.focus-definition": _EllipseParameters,
    "conic.parabola.focus-directrix": _ParabolaParameters,
    "conic.hyperbola.asymptotes": _HyperbolaParameters,
    "conic.line-ellipse.position": _LineEllipseParameters,
    "conic.ellipse.chord-midpoint-locus": _ChordParameters,
    "conic.pole-polar.circle": _PolePolarParameters,
}


def _sign_state(value: float, tolerance: float = 1e-8) -> str:
    if abs(value) <= tolerance:
        return "zero"
    return "positive" if value > 0 else "negative"


def validate_conic_parameters(archetype_id: str, parameters: dict[str, Any]) -> dict[str, Any]:
    model = _PARAMETER_MODELS.get(archetype_id)
    if model is None:
        raise ValueError(f"unsupported conic archetype: {archetype_id}")
    return model.model_validate(parameters).model_dump(mode="json", exclude_none=True)


def validate_conic_playbook(
    archetype_id: str,
    parameters: dict[str, Any],
    snapshots: list[dict[str, Any]],
    *,
    tolerance: float = 1e-5,
) -> list[ConicMathDiagnostic]:
    try:
        validated = validate_conic_parameters(archetype_id, parameters)
    except ValueError as exc:
        return [ConicMathDiagnostic("$.expectation.parameters", str(exc))]
    scenes = [item for item in snapshots if item.get("kind") == "math_scene"]
    if not scenes:
        return [ConicMathDiagnostic("$.steps[*].snapshot", "math_scene evidence is absent")]
    if archetype_id in {
        "conic.ellipse.string-construction",
        "conic.ellipse.standard-equation",
        "conic.ellipse.parameters-eccentricity",
    }:
        return _validate_string_construction(validated, scenes, tolerance)
    if archetype_id == "conic.ellipse.focus-definition":
        return _validate_ellipse(validated, scenes, tolerance)
    if archetype_id == "conic.parabola.focus-directrix":
        return _validate_parabola(validated, scenes, tolerance)
    if archetype_id == "conic.hyperbola.asymptotes":
        return _validate_hyperbola(validated, scenes, tolerance)
    if archetype_id == "conic.line-ellipse.position":
        return _validate_line_ellipse(validated, scenes, tolerance)
    if archetype_id == "conic.ellipse.chord-midpoint-locus":
        return _validate_chord_locus(validated, scenes, tolerance)
    if archetype_id == "conic.pole-polar.circle":
        return _validate_pole_polar(validated, scenes, tolerance)
    return [ConicMathDiagnostic("$.expectation.validator", "unsupported conic validator")]


def _validate_string_construction(
    parameters: dict[str, Any],
    scenes: list[dict[str, Any]],
    tolerance: float,
) -> list[ConicMathDiagnostic]:
    """The rope construction traces exactly the ellipse with b^2 = a^2 - c^2,
    so all curve/foci/focal-distance evidence is checked by the shared
    ellipse validator on the derived semi-axes."""
    a = float(parameters["a"])
    c = float(parameters["c"])
    b = math.sqrt(a * a - c * c)
    return _validate_ellipse({"a": a, "b": b, "majorAxis": "x"}, scenes, tolerance)


def _validate_ellipse(
    parameters: dict[str, Any],
    scenes: list[dict[str, Any]],
    tolerance: float,
) -> list[ConicMathDiagnostic]:
    a = float(parameters["a"])
    b = float(parameters["b"])
    major_axis = str(parameters["majorAxis"])
    c = math.sqrt(a * a - b * b)
    expected_foci = [(-c, 0.0), (c, 0.0)] if major_axis == "x" else [(0.0, -c), (0.0, c)]
    diagnostics: list[ConicMathDiagnostic] = []

    curves = _objects(scenes, "curves", "conic_curve")
    if not curves:
        diagnostics.append(
            ConicMathDiagnostic("$.steps[*].snapshot.curves", "conic curve is absent")
        )
    for index, curve in enumerate(curves):
        samples = _curve_samples(curve)
        if samples is None:
            diagnostics.append(
                ConicMathDiagnostic(
                    f"$.steps[*].snapshot.curves[{index}]",
                    "conic curve expression is unsafe, invalid, or non-finite",
                )
            )
        elif any(abs(_ellipse_residual(x, y, a, b, major_axis)) > tolerance for x, y in samples):
            diagnostics.append(
                ConicMathDiagnostic(
                    f"$.steps[*].snapshot.curves[{index}]",
                    "conic curve samples do not satisfy the expected ellipse equation",
                )
            )

    focuses = _objects(scenes, "points", "focus")
    actual_focuses = {_rounded_point(_xy(point), tolerance) for point in focuses}
    required_focuses = {_rounded_point(point, tolerance) for point in expected_foci}
    if not required_focuses <= actual_focuses:
        diagnostics.append(
            ConicMathDiagnostic(
                "$.steps[*].snapshot.points",
                "ellipse requires two distinct expected foci",
            )
        )
    for index, point in enumerate(focuses):
        actual = (float(point["x"]), float(point["y"]))
        if min(math.dist(actual, expected) for expected in expected_foci) > tolerance:
            diagnostics.append(
                ConicMathDiagnostic(
                    f"$.steps[*].snapshot.points[{index}]",
                    f"focus {actual!r} does not match the ellipse focal coordinates",
                )
            )

    for index, point in enumerate(_objects(scenes, "points", "moving_point")):
        if (
            abs(_ellipse_residual(float(point["x"]), float(point["y"]), a, b, major_axis))
            > tolerance
        ):
            diagnostics.append(
                ConicMathDiagnostic(
                    f"$.steps[*].snapshot.points[{index}]",
                    "moving point does not lie on the expected ellipse",
                )
            )
    has_complete_focal_segments = False
    for scene in scenes:
        moving = _role_items(scene, "points", "moving_point")
        segments = _role_items(scene, "segments", "focal_distance")
        if moving and segments and len(segments) != 2:
            diagnostics.append(
                ConicMathDiagnostic(
                    "$.steps[*].snapshot.segments",
                    "ellipse focal-distance evidence must contain exactly two segments",
                )
            )
        if moving and len(segments) >= 2:
            moving_point = _xy(moving[0])
            matched_foci: set[tuple[int, int]] = set()
            lengths = [
                math.hypot(
                    float(segment["x1"]) - float(segment["x0"]),
                    float(segment["y1"]) - float(segment["y0"]),
                )
                for segment in segments[:2]
            ]
            for segment in segments[:2]:
                ends = [
                    (float(segment["x0"]), float(segment["y0"])),
                    (float(segment["x1"]), float(segment["y1"])),
                ]
                if math.dist(ends[0], moving_point) <= tolerance:
                    other = ends[1]
                elif math.dist(ends[1], moving_point) <= tolerance:
                    other = ends[0]
                else:
                    continue
                if min(math.dist(other, focus) for focus in expected_foci) <= tolerance:
                    matched_foci.add(_rounded_point(other, tolerance))
            complete = required_focuses <= matched_foci
            has_complete_focal_segments = has_complete_focal_segments or complete
            if not complete:
                diagnostics.append(
                    ConicMathDiagnostic(
                        "$.steps[*].snapshot.segments",
                        "focal-distance segments must connect P to both expected foci",
                    )
                )
            elif abs(sum(lengths) - 2 * a) > tolerance:
                diagnostics.append(
                    ConicMathDiagnostic(
                        "$.steps[*].snapshot.segments",
                        "focal segment lengths do not sum to 2a",
                    )
                )
    if not has_complete_focal_segments:
        diagnostics.append(
            ConicMathDiagnostic(
                "$.steps[*].snapshot.segments",
                "ellipse requires both focal-distance segments from P to F1 and F2",
            )
        )
    return list(dict.fromkeys(diagnostics))


def _ellipse_residual(x: float, y: float, a: float, b: float, major_axis: str) -> float:
    if major_axis == "x":
        return x * x / (a * a) + y * y / (b * b) - 1.0
    return x * x / (b * b) + y * y / (a * a) - 1.0


def _validate_parabola(
    parameters: dict[str, Any], scenes: list[dict[str, Any]], tolerance: float
) -> list[ConicMathDiagnostic]:
    p = float(parameters["p"])
    axis = str(parameters["axis"])
    expected_focus = (p, 0.0) if axis == "right" else (0.0, p)
    diagnostics = _validate_curves(
        scenes,
        lambda x, y: y * y - 4 * p * x if axis == "right" else x * x - 4 * p * y,
        tolerance,
        "parabola",
    )
    focuses = _objects(scenes, "points", "focus")
    if not any(math.dist(_xy(point), expected_focus) <= tolerance for point in focuses):
        diagnostics.append(
            ConicMathDiagnostic(
                "$.steps[*].snapshot.points", "expected parabola focus is absent"
            )
        )
    for point in focuses:
        if math.dist(_xy(point), expected_focus) > tolerance:
            diagnostics.append(
                ConicMathDiagnostic(
                    "$.steps[*].snapshot.points", "focus does not match the parabola parameter"
                )
            )
    for point in _objects(scenes, "points", "moving_point"):
        x, y = _xy(point)
        residual = y * y - 4 * p * x if axis == "right" else x * x - 4 * p * y
        if abs(residual) > tolerance:
            diagnostics.append(
                ConicMathDiagnostic(
                    "$.steps[*].snapshot.points",
                    "moving point does not lie on the expected parabola",
                )
            )
    directrices = _objects(scenes, "segments", "directrix")
    if not directrices:
        diagnostics.append(
            ConicMathDiagnostic("$.steps[*].snapshot.segments", "parabola directrix is absent")
        )
    for segment in directrices:
        if axis == "right":
            valid = (
                abs(float(segment["x0"]) + p) <= tolerance
                and abs(float(segment["x1"]) + p) <= tolerance
            )
        else:
            valid = (
                abs(float(segment["y0"]) + p) <= tolerance
                and abs(float(segment["y1"]) + p) <= tolerance
            )
        if not valid:
            diagnostics.append(
                ConicMathDiagnostic(
                    "$.steps[*].snapshot.segments",
                    "directrix is inconsistent with the parabola focus",
                )
            )
    feet = _objects(scenes, "points", "projection_foot")
    for foot in feet:
        x, y = _xy(foot)
        if (axis == "right" and abs(x + p) > tolerance) or (
            axis == "up" and abs(y + p) > tolerance
        ):
            diagnostics.append(
                ConicMathDiagnostic(
                    "$.steps[*].snapshot.points", "projection foot is not on the directrix"
                )
            )
    for scene in scenes:
        moving = _role_items(scene, "points", "moving_point")
        scene_feet = _role_items(scene, "points", "projection_foot")
        if moving and scene_feet:
            pf = math.dist(_xy(moving[0]), expected_focus)
            ph = math.dist(_xy(moving[0]), _xy(scene_feet[0]))
            if abs(pf - ph) > tolerance:
                diagnostics.append(
                    ConicMathDiagnostic(
                        "$.steps[*].snapshot", "focus and directrix distances are not equal"
                    )
                )
    return _unique(diagnostics)


def _validate_hyperbola(
    parameters: dict[str, Any], scenes: list[dict[str, Any]], tolerance: float
) -> list[ConicMathDiagnostic]:
    a = float(parameters["a"])
    b = float(parameters["b"])
    axis = str(parameters["transverseAxis"])
    c = math.sqrt(a * a + b * b)
    expected_foci = [(-c, 0.0), (c, 0.0)] if axis == "x" else [(0.0, -c), (0.0, c)]
    residual = (
        (lambda x, y: x * x / (a * a) - y * y / (b * b) - 1)
        if axis == "x"
        else (lambda x, y: y * y / (a * a) - x * x / (b * b) - 1)
    )
    diagnostics = _validate_curves(scenes, residual, tolerance, "hyperbola")
    focuses = _objects(scenes, "points", "focus")
    actual_focuses = {_rounded_point(_xy(point), tolerance) for point in focuses}
    required_focuses = {_rounded_point(point, tolerance) for point in expected_foci}
    if not required_focuses <= actual_focuses:
        diagnostics.append(
            ConicMathDiagnostic(
                "$.steps[*].snapshot.points",
                "hyperbola requires two distinct expected foci",
            )
        )
    for point in focuses:
        actual = _xy(point)
        if min(math.dist(actual, expected) for expected in expected_foci) > tolerance:
            diagnostics.append(
                ConicMathDiagnostic(
                    "$.steps[*].snapshot.points", "focus does not match the hyperbola parameters"
                )
            )
    for point in _objects(scenes, "points", "moving_point"):
        actual = _xy(point)
        if abs(residual(*actual)) > tolerance:
            diagnostics.append(
                ConicMathDiagnostic(
                    "$.steps[*].snapshot.points",
                    "moving point does not lie on the expected hyperbola",
                )
            )
        elif (
            abs(
                abs(math.dist(actual, expected_foci[0]) - math.dist(actual, expected_foci[1]))
                - 2 * a
            )
            > tolerance
        ):
            diagnostics.append(
                ConicMathDiagnostic(
                    "$.steps[*].snapshot.points", "focal distance difference is not 2a"
                )
            )
    expected_slopes = (
        {round(b / a, 8), round(-b / a, 8)} if axis == "x" else {round(a / b, 8), round(-a / b, 8)}
    )
    actual_slopes: set[float] = set()
    for segment in _objects(scenes, "segments", "asymptote"):
        dx = float(segment["x1"]) - float(segment["x0"])
        dy = float(segment["y1"]) - float(segment["y0"])
        if abs(dx) <= tolerance:
            diagnostics.append(
                ConicMathDiagnostic(
                    "$.steps[*].snapshot.segments",
                    "asymptote cannot be vertical for this standard hyperbola",
                )
            )
        else:
            actual_slopes.add(round(dy / dx, 8))
    if not expected_slopes <= actual_slopes:
        diagnostics.append(
            ConicMathDiagnostic(
                "$.steps[*].snapshot.segments",
                "asymptote slopes do not include the two expected asymptotes",
            )
        )
    return _unique(diagnostics)


def _validate_line_ellipse(
    parameters: dict[str, Any], scenes: list[dict[str, Any]], tolerance: float
) -> list[ConicMathDiagnostic]:
    a = float(parameters["a"])
    b = float(parameters["b"])
    diagnostics = _validate_curves(
        scenes, lambda x, y: x * x / (a * a) + y * y / (b * b) - 1, tolerance, "ellipse"
    )
    observed_states: set[str] = set()
    for scene in scenes:
        lines = _role_items(scene, "segments", "moving_line")
        if not lines:
            continue
        line = lines[-1]
        state, line_error = _ellipse_line_state(line, a, b, tolerance)
        if line_error:
            diagnostics.append(ConicMathDiagnostic("$.steps[*].snapshot.segments", line_error))
            continue
        observed_states.add(state)
        points = [
            *_role_items(scene, "points", "intersection_point"),
            *_role_items(scene, "points", "tangent_point"),
        ]
        expected_count = {"secant": 2, "tangent": 1, "disjoint": 0}[state]
        unique_points = {_rounded_point(_xy(point), tolerance) for point in points}
        if len(unique_points) != expected_count:
            diagnostics.append(
                ConicMathDiagnostic(
                    "$.steps[*].snapshot.points",
                    f"{state} line requires {expected_count} distinct intersection point(s)",
                )
            )
        for point in points:
            x, y = _xy(point)
            if abs(x * x / (a * a) + y * y / (b * b) - 1) > tolerance or not _point_on_segment_line(
                (x, y), line, tolerance
            ):
                diagnostics.append(
                    ConicMathDiagnostic(
                        "$.steps[*].snapshot.points",
                        "intersection point is not on both the line and ellipse",
                    )
                )
        for annotation in _role_items(scene, "annotations", "discriminant_panel"):
            text = str(annotation.get("text", ""))
            numeric = re.search(r"(?:Δ|delta)\s*=\s*([-+]?\d+(?:\.\d+)?)", text, re.IGNORECASE)
            if numeric:
                value = float(numeric.group(1))
                stated = (
                    "tangent" if abs(value) <= tolerance else "secant" if value > 0 else "disjoint"
                )
                if stated != state:
                    diagnostics.append(
                        ConicMathDiagnostic(
                            "$.steps[*].snapshot.annotations",
                            "discriminant sign disagrees with the rendered line position",
                        )
                    )
    expected_states = {"secant", "tangent", "disjoint"}
    if parameters.get("lineKind") == "vertical" and not expected_states <= observed_states:
        diagnostics.append(
            ConicMathDiagnostic(
                "$.steps[*].snapshot",
                "vertical sampled family must demonstrate secant, tangent, and disjoint states",
            )
        )
    if parameters.get("nearTangent") and "tangent" not in observed_states:
        diagnostics.append(
            ConicMathDiagnostic(
                "$.steps[*].snapshot",
                "near-tangent family must include a tolerance-classified tangent state",
            )
        )
    return _unique(diagnostics)


def _validate_chord_locus(
    parameters: dict[str, Any], scenes: list[dict[str, Any]], tolerance: float
) -> list[ConicMathDiagnostic]:
    a = float(parameters["a"])
    b = float(parameters["b"])
    diagnostics: list[ConicMathDiagnostic] = []
    max_distinct_endpoints = 0
    has_midpoint = False
    has_chord = False
    has_locus_trail = False
    has_theoretical_locus = False
    for scene in scenes:
        endpoints = _role_items(scene, "points", "intersection_point")
        midpoints = _role_items(scene, "points", "chord_midpoint")
        max_distinct_endpoints = max(
            max_distinct_endpoints,
            len({_rounded_point(_xy(point), tolerance) for point in endpoints}),
        )
        has_midpoint = has_midpoint or bool(midpoints)
        has_chord = has_chord or bool(_role_items(scene, "segments", "chord"))
        has_locus_trail = has_locus_trail or bool(
            _role_items(scene, "points", "locus_trail")
        )
        has_theoretical_locus = has_theoretical_locus or bool(
            _role_items(scene, "points", "theoretical_locus")
            or _role_items(scene, "curves", "theoretical_locus")
        )
        if len(endpoints) >= 2 and midpoints:
            p1, p2, midpoint = _xy(endpoints[0]), _xy(endpoints[1]), _xy(midpoints[0])
            if math.dist(p1, p2) <= tolerance:
                diagnostics.append(
                    ConicMathDiagnostic(
                        "$.steps[*].snapshot.points", "chord endpoints collapse to a repeated point"
                    )
                )
            for endpoint in (p1, p2):
                if abs(endpoint[0] ** 2 / a**2 + endpoint[1] ** 2 / b**2 - 1) > tolerance:
                    diagnostics.append(
                        ConicMathDiagnostic(
                            "$.steps[*].snapshot.points",
                            "chord endpoint does not lie on the ellipse",
                        )
                    )
            expected_midpoint = ((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2)
            if math.dist(midpoint, expected_midpoint) > tolerance:
                diagnostics.append(
                    ConicMathDiagnostic(
                        "$.steps[*].snapshot.points", "chord midpoint is not the endpoint average"
                    )
                )
            if not _midpoint_on_expected_locus(midpoint, parameters, tolerance):
                diagnostics.append(
                    ConicMathDiagnostic(
                        "$.steps[*].snapshot.points",
                        "chord midpoint violates the theoretical locus or range",
                    )
                )
            for chord in _role_items(scene, "segments", "chord"):
                chord_ends = [
                    (float(chord["x0"]), float(chord["y0"])),
                    (float(chord["x1"]), float(chord["y1"])),
                ]
                if not all(
                    min(math.dist(end, endpoint) for endpoint in (p1, p2)) <= tolerance
                    for end in chord_ends
                ):
                    diagnostics.append(
                        ConicMathDiagnostic(
                            "$.steps[*].snapshot.segments",
                            "chord segment endpoints disagree with intersections",
                        )
                    )
        for point in [
            *_role_items(scene, "points", "locus_trail"),
            *_role_items(scene, "points", "theoretical_locus"),
        ]:
            if not _midpoint_on_expected_locus(_xy(point), parameters, tolerance * 20):
                diagnostics.append(
                    ConicMathDiagnostic(
                        "$.steps[*].snapshot.points",
                        "locus evidence violates the derived midpoint equation",
                    )
                )
        for curve in _role_items(scene, "curves", "theoretical_locus"):
            samples = _curve_samples(curve)
            if samples is None or any(
                not _midpoint_on_expected_locus(point, parameters, tolerance * 20)
                for point in (samples or [])
            ):
                diagnostics.append(
                    ConicMathDiagnostic(
                        "$.steps[*].snapshot.curves",
                        "theoretical locus curve violates the derived midpoint equation",
                    )
                )
    if max_distinct_endpoints < 2:
        diagnostics.append(
            ConicMathDiagnostic(
                "$.steps[*].snapshot.points", "chord requires two distinct intersection endpoints"
            )
        )
    if not has_midpoint:
        diagnostics.append(
            ConicMathDiagnostic("$.steps[*].snapshot.points", "chord midpoint is absent")
        )
    if not has_chord:
        diagnostics.append(
            ConicMathDiagnostic("$.steps[*].snapshot.segments", "chord segment is absent")
        )
    if not has_locus_trail:
        diagnostics.append(
            ConicMathDiagnostic("$.steps[*].snapshot.points", "midpoint locus trail is absent")
        )
    if not has_theoretical_locus:
        diagnostics.append(
            ConicMathDiagnostic(
                "$.steps[*].snapshot", "theoretical midpoint locus is absent"
            )
        )
    return _unique(diagnostics)


def _validate_pole_polar(
    parameters: dict[str, Any], scenes: list[dict[str, Any]], tolerance: float
) -> list[ConicMathDiagnostic]:
    radius = float(parameters["radius"])
    diagnostics = _validate_curves(
        scenes, lambda x, y: x * x + y * y - radius * radius, tolerance, "circle"
    )
    max_tangent_points = 0
    max_tangents = 0
    has_polar = False
    for scene in scenes:
        poles = _role_items(scene, "points", "moving_point")
        tangencies = _role_items(scene, "points", "tangent_point")
        tangents = _role_items(scene, "segments", "tangent")
        polars = _role_items(scene, "segments", "polar_line")
        if not poles:
            continue
        pole = _xy(poles[0])
        outside = math.hypot(*pole) > radius + tolerance
        if not outside and (tangencies or tangents or polars):
            diagnostics.append(
                ConicMathDiagnostic(
                    "$.steps[*].snapshot",
                    "pole is on or inside the circle, so tangent and polar geometry "
                    "must fail closed",
                )
            )
            continue
        max_tangent_points = max(
            max_tangent_points,
            len({_rounded_point(_xy(point), tolerance) for point in tangencies}),
        )
        max_tangents = max(max_tangents, len(tangents))
        has_polar = has_polar or bool(polars)
        for point in tangencies:
            tangent_point = _xy(point)
            if abs(tangent_point[0] ** 2 + tangent_point[1] ** 2 - radius**2) > tolerance:
                diagnostics.append(
                    ConicMathDiagnostic(
                        "$.steps[*].snapshot.points", "tangent point is not on the circle"
                    )
                )
        for tangent in tangents:
            ends = [
                (float(tangent["x0"]), float(tangent["y0"])),
                (float(tangent["x1"]), float(tangent["y1"])),
            ]
            tangent_point = min(
                (_xy(point) for point in tangencies),
                key=lambda point: min(math.dist(point, end) for end in ends),
                default=None,
            )
            if (
                tangent_point is None
                or not any(math.dist(pole, end) <= tolerance for end in ends)
                or not any(math.dist(tangent_point, end) <= tolerance for end in ends)
            ):
                diagnostics.append(
                    ConicMathDiagnostic(
                        "$.steps[*].snapshot.segments",
                        "tangent segment does not connect the pole to a tangent point",
                    )
                )
            if (
                abs(
                    tangent_point[0] * (pole[0] - tangent_point[0])
                    + tangent_point[1] * (pole[1] - tangent_point[1])
                )
                > tolerance
            ):
                diagnostics.append(
                    ConicMathDiagnostic(
                        "$.steps[*].snapshot.points", "tangent is not perpendicular to the radius"
                    )
                )
        for polar in polars:
            for point in (
                (float(polar["x0"]), float(polar["y0"])),
                (float(polar["x1"]), float(polar["y1"])),
            ):
                if abs(pole[0] * point[0] + pole[1] * point[1] - radius**2) > tolerance:
                    diagnostics.append(
                        ConicMathDiagnostic(
                            "$.steps[*].snapshot.segments",
                            "polar line does not satisfy x0*x+y0*y=r^2",
                        )
                    )
    if max_tangent_points < 2:
        diagnostics.append(
            ConicMathDiagnostic(
                "$.steps[*].snapshot.points",
                "pole/polar construction requires two distinct tangent points",
            )
        )
    if max_tangents < 2:
        diagnostics.append(
            ConicMathDiagnostic(
                "$.steps[*].snapshot.segments",
                "pole/polar construction requires two tangent segments",
            )
        )
    if not has_polar:
        diagnostics.append(
            ConicMathDiagnostic(
                "$.steps[*].snapshot.segments", "pole/polar construction requires a polar line"
            )
        )
    return _unique(diagnostics)


def _curve_samples(curve: dict[str, Any]) -> list[tuple[float, float]] | None:
    expression_x = curve.get("expression_x") or "t"
    expression_y = curve.get("expression_y")
    if not isinstance(expression_x, str) or not isinstance(expression_y, str):
        return None
    parsed_x = _parse(expression_x, _T)
    parsed_y = _parse(expression_y, _T)
    if parsed_x is None or parsed_y is None:
        return None
    compiled_x = _compile(parsed_x, _T)
    compiled_y = _compile(parsed_y, _T)
    if compiled_x is None or compiled_y is None:
        return None
    lower = float(curve.get("t_min") if curve.get("t_min") is not None else -1.0)
    upper = float(curve.get("t_max") if curve.get("t_max") is not None else 1.0)
    if not math.isfinite(lower) or not math.isfinite(upper) or upper <= lower:
        return None
    ts = np.linspace(lower, upper, 9)
    xs = _safe_eval(compiled_x, ts)
    ys = _safe_eval(compiled_y, ts)
    if xs is None or ys is None:
        return None
    return list(zip(xs.tolist(), ys.tolist(), strict=True))


def _objects(
    scenes: list[dict[str, Any]], collection: str, semantic_role: str
) -> list[dict[str, Any]]:
    return [
        item
        for scene in scenes
        for item in scene.get(collection, [])
        if isinstance(item, dict) and item.get("semantic_role") == semantic_role
    ]


def _role_items(scene: dict[str, Any], collection: str, semantic_role: str) -> list[dict[str, Any]]:
    return [
        item
        for item in scene.get(collection, [])
        if isinstance(item, dict) and item.get("semantic_role") == semantic_role
    ]


def _xy(item: dict[str, Any]) -> tuple[float, float]:
    return float(item["x"]), float(item["y"])


def _unique(items: list[ConicMathDiagnostic]) -> list[ConicMathDiagnostic]:
    return list(dict.fromkeys(items))


def _validate_curves(
    scenes: list[dict[str, Any]],
    residual: Any,
    tolerance: float,
    curve_name: str,
) -> list[ConicMathDiagnostic]:
    diagnostics: list[ConicMathDiagnostic] = []
    curves = _objects(scenes, "curves", "conic_curve")
    if not curves:
        return [ConicMathDiagnostic("$.steps[*].snapshot.curves", f"{curve_name} curve is absent")]
    for curve in curves:
        samples = _curve_samples(curve)
        if samples is None:
            diagnostics.append(
                ConicMathDiagnostic(
                    "$.steps[*].snapshot.curves",
                    f"{curve_name} curve expression is unsafe, invalid, or non-finite",
                )
            )
        elif any(abs(float(residual(x, y))) > tolerance for x, y in samples):
            diagnostics.append(
                ConicMathDiagnostic(
                    "$.steps[*].snapshot.curves",
                    f"curve samples do not satisfy the expected {curve_name} equation",
                )
            )
    return diagnostics


def _ellipse_line_state(
    line: dict[str, Any], a: float, b: float, tolerance: float
) -> tuple[str, str | None]:
    x0, y0 = float(line["x0"]), float(line["y0"])
    x1, y1 = float(line["x1"]), float(line["y1"])
    dx, dy = x1 - x0, y1 - y0
    if math.hypot(dx, dy) <= tolerance:
        return "disjoint", "moving line is degenerate"
    if abs(dx) <= tolerance:
        discriminant = 1 - x0 * x0 / (a * a)
    else:
        slope = dy / dx
        intercept = y0 - slope * x0
        qa = 1 / (a * a) + slope * slope / (b * b)
        qb = 2 * slope * intercept / (b * b)
        qc = intercept * intercept / (b * b) - 1
        discriminant = qb * qb - 4 * qa * qc
    if abs(discriminant) <= tolerance:
        return "tangent", None
    return ("secant", None) if discriminant > 0 else ("disjoint", None)


def _point_on_segment_line(
    point: tuple[float, float], line: dict[str, Any], tolerance: float
) -> bool:
    x0, y0 = float(line["x0"]), float(line["y0"])
    x1, y1 = float(line["x1"]), float(line["y1"])
    dx, dy = x1 - x0, y1 - y0
    scale = max(1.0, math.hypot(dx, dy))
    return abs((point[0] - x0) * dy - (point[1] - y0) * dx) <= tolerance * scale


def _rounded_point(point: tuple[float, float], tolerance: float) -> tuple[int, int]:
    quantum = max(tolerance, 1e-9)
    return round(point[0] / quantum), round(point[1] / quantum)


def _midpoint_on_expected_locus(
    midpoint: tuple[float, float], parameters: dict[str, Any], tolerance: float
) -> bool:
    x, y = midpoint
    a = float(parameters["a"])
    b = float(parameters["b"])
    if x * x / a**2 + y * y / b**2 > 1 + tolerance:
        return False
    fixed = parameters.get("fixedPoint")
    if fixed is not None:
        qx, qy = float(fixed[0]), float(fixed[1])
        residual = x * x / a**2 + y * y / b**2 - x * qx / a**2 - y * qy / b**2
    else:
        slope = float(parameters["slope"])
        residual = b * b * x + slope * a * a * y
    return abs(residual) <= tolerance
