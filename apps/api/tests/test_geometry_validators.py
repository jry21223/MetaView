from __future__ import annotations

import math

import pytest

from app.domain.services.geometry_validators import (
    check_monotonic,
    check_orientation,
    check_point_on_curve,
)


class TestCheckOrientation:
    def test_cos_negative_sin_traces_clockwise(self) -> None:
        # The 二阶常微分方程 case from the prior session: narration said
        # "逆时针" but (cos t, -sin t) is mathematically clockwise.
        result = check_orientation("cos(t)", "-sin(t)", 0.0, 2 * math.pi)
        assert result.direction == "clockwise"

    def test_cos_sin_traces_counterclockwise(self) -> None:
        result = check_orientation("cos(t)", "sin(t)", 0.0, 2 * math.pi)
        assert result.direction == "counterclockwise"

    def test_ellipse_ccw(self) -> None:
        result = check_orientation("2*cos(t)", "3*sin(t)", 0.0, 2 * math.pi)
        assert result.direction == "counterclockwise"

    def test_back_and_forth_is_static(self) -> None:
        # Curve degenerates to a line segment (back and forth on x-axis).
        result = check_orientation("cos(t)", "0", 0.0, 2 * math.pi)
        assert result.direction == "static"

    def test_invalid_t_range(self) -> None:
        result = check_orientation("cos(t)", "sin(t)", 1.0, 0.5)
        assert result.direction == "error"

    def test_invalid_expression(self) -> None:
        result = check_orientation("__import__('os')", "sin(t)", 0.0, 1.0)
        assert result.direction == "error"


class TestCheckPointOnCurve:
    def test_unit_circle_initial_point(self) -> None:
        # (cos 0, sin 0) = (1, 0) should be on the unit circle.
        result = check_point_on_curve(
            "cos(t)", "sin(t)", 0.0, 2 * math.pi, target_x=1.0, target_y=0.0
        )
        assert result.passes is True
        assert result.distance is not None and result.distance < 1e-3

    def test_far_point_misses(self) -> None:
        result = check_point_on_curve(
            "cos(t)", "sin(t)", 0.0, 2 * math.pi, target_x=5.0, target_y=5.0
        )
        assert result.passes is False
        assert result.distance is not None and result.distance > 1.0

    def test_parametric_polynomial(self) -> None:
        # (t, t**2) at t=2 → (2, 4) should pass.
        result = check_point_on_curve(
            "t", "t**2", 0.0, 3.0, target_x=2.0, target_y=4.0
        )
        assert result.passes is True

    def test_custom_tolerance(self) -> None:
        # Loose tolerance picks up nearby misses.
        result = check_point_on_curve(
            "cos(t)", "sin(t)", 0.0, 2 * math.pi, target_x=1.01, target_y=0.0, tol=0.05
        )
        assert result.passes is True


class TestCheckMonotonic:
    def test_quadratic_mixed_around_origin(self) -> None:
        result = check_monotonic("x**2", -1.0, 1.0)
        assert result.verdict == "mixed"

    def test_quadratic_increasing_on_positive(self) -> None:
        result = check_monotonic("x**2", 0.1, 2.0)
        assert result.verdict == "increasing"

    def test_caret_exponent_is_supported(self) -> None:
        result = check_monotonic("x^2", 0.1, 2.0)
        assert result.verdict == "increasing"

    def test_quadratic_decreasing_on_negative(self) -> None:
        result = check_monotonic("x**2", -2.0, -0.1)
        assert result.verdict == "decreasing"

    def test_constant(self) -> None:
        result = check_monotonic("3", 0.0, 5.0)
        assert result.verdict == "constant"

    def test_linear(self) -> None:
        result = check_monotonic("2*x + 1", -5.0, 5.0)
        assert result.verdict == "increasing"

    def test_invalid_range(self) -> None:
        result = check_monotonic("x", 5.0, 1.0)
        assert result.verdict == "error"

    def test_invalid_expression(self) -> None:
        result = check_monotonic("$$$", 0.0, 1.0)
        assert result.verdict == "error"

    def test_rejects_attribute_access(self) -> None:
        result = check_monotonic("sin.__globals__", 0.0, 1.0)
        assert result.verdict == "error"

    def test_rejects_unknown_symbol(self) -> None:
        result = check_monotonic("y + 1", 0.0, 1.0)
        assert result.verdict == "error"

    def test_rejects_string_constant(self) -> None:
        result = check_monotonic("sin('x')", 0.0, 1.0)
        assert result.verdict == "error"


@pytest.mark.parametrize(
    "fx,fy,expected",
    [
        ("cos(t)", "sin(t)", "counterclockwise"),
        ("sin(t)", "cos(t)", "clockwise"),
        ("cos(2*t)", "sin(2*t)", "counterclockwise"),
        # CW spiral parametrization (decreasing radius, CW direction):
        ("cos(-t)", "sin(-t)", "clockwise"),
    ],
)
def test_orientation_parametric_sanity(fx: str, fy: str, expected: str) -> None:
    result = check_orientation(fx, fy, 0.0, 2 * math.pi)
    assert result.direction == expected
