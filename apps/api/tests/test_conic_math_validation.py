from __future__ import annotations

import math

import pytest

from eval.conic_math_validation import validate_conic_parameters, validate_conic_playbook


def _curve(x: str, y: str) -> dict[str, object]:
    return {
        "expression_x": x,
        "expression_y": y,
        "t_min": -1.0,
        "t_max": 1.0,
        "semantic_role": "conic_curve",
    }


def _scene(**items: object) -> dict[str, object]:
    return {
        "kind": "math_scene",
        "curves": items.get("curves", []),
        "points": items.get("points", []),
        "segments": items.get("segments", []),
        "annotations": items.get("annotations", []),
    }


def test_parabola_geometry_checks_focus_directrix_and_equal_distances() -> None:
    params = {"p": 2, "axis": "right"}
    scene = _scene(
        curves=[_curve("2*t^2", "4*t")],
        points=[
            {"x": 2, "y": 0, "semantic_role": "focus"},
            {"x": 2, "y": 4, "semantic_role": "moving_point"},
            {"x": -2, "y": 4, "semantic_role": "projection_foot"},
        ],
        segments=[{"x0": -2, "y0": -8, "x1": -2, "y1": 8, "semantic_role": "directrix"}],
    )
    assert validate_conic_playbook("conic.parabola.focus-directrix", params, [scene]) == []

    scene["points"][2]["x"] = -1  # type: ignore[index]
    issues = validate_conic_playbook("conic.parabola.focus-directrix", params, [scene])
    assert any("projection foot" in issue.message for issue in issues)


def test_hyperbola_geometry_checks_equation_foci_asymptotes_and_distance_difference() -> None:
    params = {"a": 3, "b": 4, "transverseAxis": "x"}
    scene = _scene(
        curves=[_curve("3*cosh(t)", "4*sinh(t)"), _curve("-3*cosh(t)", "4*sinh(t)")],
        points=[
            {"x": -5, "y": 0, "semantic_role": "focus"},
            {"x": 5, "y": 0, "semantic_role": "focus"},
            {"x": 3, "y": 0, "semantic_role": "moving_point"},
        ],
        segments=[
            {"x0": -3, "y0": -4, "x1": 3, "y1": 4, "semantic_role": "asymptote"},
            {"x0": -3, "y0": 4, "x1": 3, "y1": -4, "semantic_role": "asymptote"},
        ],
    )
    assert validate_conic_playbook("conic.hyperbola.asymptotes", params, [scene]) == []

    scene["segments"][0]["y1"] = 3  # type: ignore[index]
    issues = validate_conic_playbook("conic.hyperbola.asymptotes", params, [scene])
    assert any("asymptote slopes" in issue.message for issue in issues)


def test_vertical_line_family_checks_secant_tangent_disjoint_and_discriminant() -> None:
    params = {"a": 5, "b": 3, "lineKind": "vertical", "samples": [4.9, 5, 5.1]}
    scenes = []
    for x, label in [(4.9, "1"), (5.0, "0"), (5.1, "-1")]:
        y = 3 * math.sqrt(max(0.0, 1 - x * x / 25))
        points = []
        if x < 5:
            points = [
                {"x": x, "y": -y, "semantic_role": "intersection_point"},
                {"x": x, "y": y, "semantic_role": "intersection_point"},
            ]
        elif x == 5:
            points = [{"x": 5, "y": 0, "semantic_role": "tangent_point"}]
        scenes.append(
            _scene(
                curves=[_curve("5*cos(t)", "3*sin(t)")],
                points=points,
                segments=[{"x0": x, "y0": -5, "x1": x, "y1": 5, "semantic_role": "moving_line"}],
                annotations=[{"text": f"Δ={label}", "semantic_role": "discriminant_panel"}],
            )
        )
    assert validate_conic_playbook("conic.line-ellipse.position", params, scenes) == []

    scenes[1]["annotations"][0]["text"] = "Δ=1"  # type: ignore[index]
    issues = validate_conic_playbook("conic.line-ellipse.position", params, scenes)
    assert any("discriminant sign" in issue.message for issue in issues)


def test_chord_midpoint_checks_endpoint_average_locus_and_range() -> None:
    params = {"a": 5, "b": 3, "fixedPoint": [1, 0]}
    scene = _scene(
        points=[
            {"x": -5, "y": 0, "semantic_role": "intersection_point"},
            {"x": 5, "y": 0, "semantic_role": "intersection_point"},
            {"x": 0, "y": 0, "semantic_role": "chord_midpoint"},
        ]
    )
    assert validate_conic_playbook("conic.ellipse.chord-midpoint-locus", params, [scene]) == []

    scene["points"][2]["x"] = 1  # type: ignore[index]
    issues = validate_conic_playbook("conic.ellipse.chord-midpoint-locus", params, [scene])
    assert any("endpoint average" in issue.message for issue in issues)


def test_pole_polar_checks_tangent_points_perpendicularity_and_line_equation() -> None:
    pole = (5.0, 3.0)
    base = (40 / 17, 24 / 17)
    scale = 2 * math.sqrt(18) / 17
    tangencies = [
        (base[0] - 3 * scale, base[1] + 5 * scale),
        (base[0] + 3 * scale, base[1] - 5 * scale),
    ]
    scene = _scene(
        curves=[_curve("4*cos(t)", "4*sin(t)")],
        points=[
            {"x": pole[0], "y": pole[1], "semantic_role": "moving_point"},
            *[
                {"x": point[0], "y": point[1], "semantic_role": "tangent_point"}
                for point in tangencies
            ],
        ],
        segments=[
            *[
                {
                    "x0": pole[0],
                    "y0": pole[1],
                    "x1": point[0],
                    "y1": point[1],
                    "semantic_role": "tangent",
                }
                for point in tangencies
            ],
            {"x0": 0, "y0": 16 / 3, "x1": 16 / 5, "y1": 0, "semantic_role": "polar_line"},
        ],
    )
    assert (
        validate_conic_playbook("conic.pole-polar.circle", {"radius": 4, "pole": pole}, [scene])
        == []
    )

    scene["segments"][-1]["y0"] = 5  # type: ignore[index]
    issues = validate_conic_playbook(
        "conic.pole-polar.circle", {"radius": 4, "pole": pole}, [scene]
    )
    assert any("polar line" in issue.message for issue in issues)


@pytest.mark.parametrize(
    ("archetype", "parameters"),
    [
        ("conic.ellipse.focus-definition", {"a": 3, "b": 3, "majorAxis": "x"}),
        ("conic.parabola.focus-directrix", {"p": 0, "axis": "right"}),
        ("conic.pole-polar.circle", {"radius": 4, "pole": [2, 0]}),
    ],
)
def test_invalid_or_degenerate_hidden_parameters_fail_closed(
    archetype: str, parameters: dict[str, object]
) -> None:
    with pytest.raises(ValueError):
        validate_conic_parameters(archetype, parameters)
