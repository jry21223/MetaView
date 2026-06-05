from __future__ import annotations

import sympy as sp

from app.domain.skills.solid_geometry.geometry_kernel import solve_solid_geometry
from app.domain.skills.solid_geometry.problem_spec import (
    LineRef,
    PlaneRef,
    SolidGeometryProblemSpec,
    SolidGeometryQuery,
)
from app.domain.skills.solid_geometry.spec_extractor import extract_solid_geometry_spec


def test_regular_quad_pyramid_line_plane_angle_exact() -> None:
    spec = SolidGeometryProblemSpec(
        body="regular_quad_pyramid",
        dimensions={"base": "2", "height": "3"},
        query=SolidGeometryQuery(
            kind="line_plane_angle",
            line=LineRef(through=("S", "A")),
            plane=PlaneRef(through=("A", "B", "C")),
        ),
    )

    solution = solve_solid_geometry(spec)

    assert solution.checks["answer_consistency"] is True
    assert solution.answer_expr is not None
    assert sp.simplify(sp.sin(solution.answer_expr) - sp.Rational(3, 1) / sp.sqrt(11)) == 0
    assert solution.points["S"].math == (0, 0, 3)
    assert solution.points["S"].render == (0.0, 0.0, 3.0)
    assert solution.target_face == ("A", "B", "C", "D")


def test_cube_line_plane_angle_refs_and_answer_present() -> None:
    spec = extract_solid_geometry_spec(
        "正方体 ABCD-A1B1C1D1，棱长 2，求 A1B 与平面 ABCD 的夹角"
    )

    assert spec is not None
    solution = solve_solid_geometry(spec)

    assert solution.answer_latex
    assert solution.answer_expr == sp.pi / 4
    assert solution.target_line == ("A1", "B")
    assert solution.target_plane == ("A", "B", "C")


def test_cuboid_volume_exact_and_formula_step() -> None:
    spec = extract_solid_geometry_spec("长方体长 2 宽 3 高 4，求体积")

    assert spec is not None
    solution = solve_solid_geometry(spec)

    assert solution.answer_expr == 24
    assert solution.answer_latex == "V = 24"
    assert any("V=lwh" in step.latex for step in solution.steps)


def test_unparseable_prompt_returns_none() -> None:
    assert extract_solid_geometry_spec("解释一下概率密度函数的图像") is None
