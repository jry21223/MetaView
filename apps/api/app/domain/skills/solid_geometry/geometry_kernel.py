from __future__ import annotations

import re
from dataclasses import dataclass, field

import sympy as sp

from app.domain.skills.solid_geometry.bodies import (
    BodyGeometry,
    build_cube,
    build_cuboid,
    build_regular_quad_pyramid,
)
from app.domain.skills.solid_geometry.problem_spec import SolidGeometryProblemSpec

Point3 = tuple[sp.Expr, sp.Expr, sp.Expr]

_SAFE_NUMBER_RE = re.compile(r"^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:/[+-]?\d+(?:\.\d+)?)?$")


@dataclass(frozen=True)
class KernelPoint:
    label: str
    math: Point3
    render: tuple[float, float, float]


@dataclass(frozen=True)
class SolidGeometrySolutionStep:
    title: str
    latex: str
    explanation: str
    highlight: list[str]


@dataclass(frozen=True)
class SolidGeometrySolution:
    answer_latex: str
    answer_numeric: float | None
    points: dict[str, KernelPoint]
    edges: list[tuple[str, str]]
    vectors: dict[str, Point3]
    planes: dict[str, tuple[sp.Expr, sp.Expr, sp.Expr, sp.Expr]]
    steps: list[SolidGeometrySolutionStep]
    checks: dict[str, bool]
    faces: dict[str, tuple[str, ...]] = field(default_factory=dict)
    body: str = ""
    query_kind: str = ""
    target_line: tuple[str, str] | None = None
    target_plane: tuple[str, str, str] | None = None
    target_face: tuple[str, ...] | None = None
    answer_expr: sp.Expr | None = None


def vector(p: Point3, q: Point3) -> sp.Matrix:
    return sp.Matrix([q[0] - p[0], q[1] - p[1], q[2] - p[2]])


def plane_from_points(a: Point3, b: Point3, c: Point3) -> tuple[sp.Matrix, sp.Expr]:
    va = sp.Matrix(a)
    normal = vector(a, b).cross(vector(a, c))
    if normal == sp.zeros(3, 1):
        raise ValueError("Plane points must not be collinear")
    d = -normal.dot(va)
    return sp.simplify(normal), sp.simplify(d)


def line_plane_angle(line_vec: sp.Matrix, plane_normal: sp.Matrix) -> sp.Expr:
    ratio = sp.Abs(line_vec.dot(plane_normal)) / (_norm(line_vec) * _norm(plane_normal))
    return sp.trigsimp(sp.asin(sp.simplify(ratio)))


def angle_between_lines(u: sp.Matrix, v: sp.Matrix) -> sp.Expr:
    ratio = sp.Abs(u.dot(v)) / (_norm(u) * _norm(v))
    return sp.trigsimp(sp.acos(sp.simplify(ratio)))


def distance_point_to_plane(
    point: sp.Matrix,
    plane_normal: sp.Matrix,
    d: sp.Expr,
) -> sp.Expr:
    return sp.simplify(sp.Abs(plane_normal.dot(point) + d) / _norm(plane_normal))


def latex_exact(expr: sp.Expr) -> str:
    return sp.latex(sp.trigsimp(sp.simplify(expr)))


def to_three(point: Point3) -> tuple[float, float, float]:
    return tuple(float(sp.N(coord)) for coord in point)  # type: ignore[return-value]


def solve_solid_geometry(spec: SolidGeometryProblemSpec) -> SolidGeometrySolution:
    body = _build_body(spec)
    if spec.query.kind == "line_plane_angle":
        return _solve_line_plane_angle(spec, body)
    if spec.query.kind == "volume":
        return _solve_volume(spec, body)
    raise ValueError(f"Unsupported solid geometry query kind: {spec.query.kind}")


def _solve_line_plane_angle(
    spec: SolidGeometryProblemSpec,
    body: BodyGeometry,
) -> SolidGeometrySolution:
    if spec.query.line is None or spec.query.plane is None:
        raise ValueError("line_plane_angle requires both line and plane references")

    line = _validate_line(spec.query.line.through, body)
    plane = _validate_plane(spec.query.plane.through, body)
    line_key = "".join(line)
    plane_key = "".join(plane)

    line_vec = vector(body.points[line[0]], body.points[line[1]])
    normal, d = plane_from_points(*(body.points[label] for label in plane))
    angle = sp.trigsimp(sp.simplify(line_plane_angle(line_vec, normal)))
    answer_latex = rf"\theta = {latex_exact(angle)}"
    target_face = _find_face(body.faces, plane)

    vectors = {
        f"vector:{line_key}": _matrix_to_point3(line_vec),
        f"normal:{plane_key}": _matrix_to_point3(normal),
    }
    planes = {
        f"plane:{plane_key}": (
            sp.simplify(normal[0]),
            sp.simplify(normal[1]),
            sp.simplify(normal[2]),
            sp.simplify(d),
        )
    }
    steps = _line_plane_steps(
        spec=spec,
        line=line,
        plane=plane,
        target_face=target_face,
        line_vec=line_vec,
        normal=normal,
        angle=angle,
        answer_latex=answer_latex,
    )

    solution = SolidGeometrySolution(
        answer_latex=answer_latex,
        answer_numeric=float(sp.N(angle)),
        points=_kernel_points(body.points),
        edges=body.edges,
        vectors=vectors,
        planes=planes,
        faces=body.faces,
        steps=steps,
        checks={"answer_consistency": answer_latex in steps[-1].latex},
        body=spec.body,
        query_kind=spec.query.kind,
        target_line=line,
        target_plane=plane,
        target_face=target_face,
        answer_expr=angle,
    )
    if not solution.checks["answer_consistency"]:
        raise AssertionError("Kernel answer did not reach the final solution step")
    return solution


def _solve_volume(
    spec: SolidGeometryProblemSpec,
    body: BodyGeometry,
) -> SolidGeometrySolution:
    if spec.body != "cuboid":
        raise ValueError("V1 volume solver only supports cuboid")
    length = _dimension(spec, "length", "长")
    width = _dimension(spec, "width", "宽")
    height = _dimension(spec, "height", "高")
    volume = sp.simplify(length * width * height)
    answer_latex = rf"V = {latex_exact(volume)}"

    steps = [
        SolidGeometrySolutionStep(
            title="题目理解",
            latex=rf"l={latex_exact(length)},\ w={latex_exact(width)},\ h={latex_exact(height)}",
            explanation="识别为长方体体积问题，先固定三条互相垂直的棱长。",
            highlight=["body"],
        ),
        SolidGeometrySolutionStep(
            title="建立坐标系",
            latex=rf"A(0,0,0),\ B({latex_exact(length)},0,0),\ D(0,{latex_exact(width)},0)",
            explanation="以 A 为原点，把长、宽、高分别放在 x、y、z 轴方向。",
            highlight=["point:A", "line:AB", "line:AD", "line:AA1"],
        ),
        SolidGeometrySolutionStep(
            title="写出长宽高",
            latex=(
                rf"AB={latex_exact(length)},\ "
                rf"AD={latex_exact(width)},\ "
                rf"AA_1={latex_exact(height)}"
            ),
            explanation="长方体体积只依赖这三条互相垂直的棱。",
            highlight=["line:AB", "line:AD", "line:AA1"],
        ),
        SolidGeometrySolutionStep(
            title="代入体积公式",
            latex=(
                rf"V=lwh={latex_exact(length)}\cdot "
                rf"{latex_exact(width)}\cdot {latex_exact(height)}"
            ),
            explanation="使用长方体体积公式 V = lwh，并把尺寸代入。",
            highlight=["body"],
        ),
        SolidGeometrySolutionStep(
            title="总结答案",
            latex=answer_latex,
            explanation=f"因此长方体体积为 {answer_latex}。",
            highlight=["body", "answer"],
        ),
    ]

    solution = SolidGeometrySolution(
        answer_latex=answer_latex,
        answer_numeric=float(sp.N(volume)),
        points=_kernel_points(body.points),
        edges=body.edges,
        vectors={},
        planes={},
        faces=body.faces,
        steps=steps,
        checks={"answer_consistency": answer_latex in steps[-1].latex},
        body=spec.body,
        query_kind=spec.query.kind,
        answer_expr=volume,
    )
    if not solution.checks["answer_consistency"]:
        raise AssertionError("Kernel answer did not reach the final solution step")
    return solution


def _line_plane_steps(
    *,
    spec: SolidGeometryProblemSpec,
    line: tuple[str, str],
    plane: tuple[str, str, str],
    target_face: tuple[str, ...] | None,
    line_vec: sp.Matrix,
    normal: sp.Matrix,
    angle: sp.Expr,
    answer_latex: str,
) -> list[SolidGeometrySolutionStep]:
    line_key = "".join(line)
    plane_key = "".join(plane)
    face_key = "".join(target_face) if target_face else plane_key
    vector_label = _vector_label(line)
    normal_label = rf"\vec n_{{{plane_key}}}"
    highlight_line = [f"line:{line_key}", f"vector:{line_key}"]
    highlight_plane = [f"plane:{plane_key}", f"plane:{face_key}", f"normal:{plane_key}"]
    body_name = {
        "cube": "正方体",
        "cuboid": "长方体",
        "regular_quad_pyramid": "正四棱锥",
    }.get(spec.body, "立体几何体")

    return [
        SolidGeometrySolutionStep(
            title="题目理解",
            latex=(
                rf"\text{{求 }} {line[0]}{line[1]} "
                rf"\text{{ 与平面 }} {plane_key} \text{{ 的线面角}}"
            ),
            explanation=(
                f"题目给出{body_name}，目标是求直线 "
                f"{line_key} 与平面 {plane_key} 所成的角。"
            ),
            highlight=["body", *highlight_line, *highlight_plane],
        ),
        SolidGeometrySolutionStep(
            title="建立坐标系",
            latex=_coordinate_summary(spec),
            explanation="把几何体放入三维直角坐标系，所有顶点坐标由 kernel 精确生成。",
            highlight=["axes", "points"],
        ),
        SolidGeometrySolutionStep(
            title="写出目标向量和平面法向量",
            latex=(
                rf"{vector_label}={sp.latex(line_vec.T)},"
                rf"\quad {normal_label}={sp.latex(normal.T)}"
            ),
            explanation="目标线段给出方向向量；平面内两条不共线向量的叉积给出法向量。",
            highlight=[*highlight_line, *highlight_plane],
        ),
        SolidGeometrySolutionStep(
            title="计算线面角",
            latex=(
                rf"\sin\theta="
                rf"\frac{{|{vector_label}\cdot {normal_label}|}}"
                rf"{{|{vector_label}|\,|{normal_label}|}}"
                rf"={latex_exact(sp.sin(angle))}"
            ),
            explanation="线面角等于直线方向向量与平面法向量夹角的余角，因此用正弦公式计算。",
            highlight=[*highlight_line, *highlight_plane],
        ),
        SolidGeometrySolutionStep(
            title="总结答案",
            latex=answer_latex,
            explanation=f"由精确计算得到 {answer_latex}，这是 kernel 输出的最终答案。",
            highlight=[*highlight_line, *highlight_plane, "answer"],
        ),
    ]


def _build_body(spec: SolidGeometryProblemSpec) -> BodyGeometry:
    if spec.body == "cube":
        return build_cube(_dimension(spec, "side", "edge", "棱长"))
    if spec.body == "cuboid":
        return build_cuboid(
            _dimension(spec, "length", "长"),
            _dimension(spec, "width", "宽"),
            _dimension(spec, "height", "高"),
        )
    if spec.body == "regular_quad_pyramid":
        return build_regular_quad_pyramid(
            _dimension(spec, "base", "base_side", "底面边长"),
            _dimension(spec, "height", "高"),
        )
    raise ValueError(f"Unsupported solid geometry body: {spec.body}")


def _dimension(spec: SolidGeometryProblemSpec, *keys: str) -> sp.Expr:
    for key in keys:
        if key in spec.dimensions:
            return _safe_number(spec.dimensions[key])
    raise ValueError(f"Missing required dimension. Tried keys: {', '.join(keys)}")


def _safe_number(value: str | int | float) -> sp.Expr:
    if isinstance(value, int):
        out = sp.Integer(value)
    elif isinstance(value, float):
        out = sp.Rational(str(value))
    elif isinstance(value, str):
        text = value.strip()
        if not _SAFE_NUMBER_RE.fullmatch(text):
            raise ValueError(f"Unsupported dimension literal: {value!r}")
        out = sp.Rational(text)
    else:
        raise ValueError(f"Unsupported dimension type: {type(value).__name__}")
    if out <= 0:
        raise ValueError("Solid geometry dimensions must be positive")
    return sp.simplify(out)


def _validate_line(line: tuple[str, str], body: BodyGeometry) -> tuple[str, str]:
    for label in line:
        if label not in body.points:
            raise ValueError(f"Unknown point reference: {label}")
    if line[0] == line[1]:
        raise ValueError("A line requires two distinct points")
    return line


def _validate_plane(plane: tuple[str, str, str], body: BodyGeometry) -> tuple[str, str, str]:
    for label in plane:
        if label not in body.points:
            raise ValueError(f"Unknown point reference: {label}")
    if len(set(plane)) != 3:
        raise ValueError("A plane requires three distinct points")
    plane_from_points(*(body.points[label] for label in plane))
    return plane


def _find_face(
    faces: dict[str, tuple[str, ...]],
    plane: tuple[str, str, str],
) -> tuple[str, ...] | None:
    plane_set = set(plane)
    for vertices in faces.values():
        if plane_set.issubset(vertices):
            return vertices
    return None


def _kernel_points(points: dict[str, Point3]) -> dict[str, KernelPoint]:
    return {
        label: KernelPoint(label=label, math=coords, render=to_three(coords))
        for label, coords in points.items()
    }


def _matrix_to_point3(matrix: sp.Matrix) -> Point3:
    return (sp.simplify(matrix[0]), sp.simplify(matrix[1]), sp.simplify(matrix[2]))


def _norm(matrix: sp.Matrix) -> sp.Expr:
    return sp.sqrt(sp.simplify(matrix.dot(matrix)))


def _vector_label(line: tuple[str, str]) -> str:
    return rf"\vec{{{_point_latex(line[0])}{_point_latex(line[1])}}}"


def _point_latex(label: str) -> str:
    if len(label) > 1 and label[-1].isdigit():
        return rf"{label[:-1]}_{label[-1]}"
    return label


def _coordinate_summary(spec: SolidGeometryProblemSpec) -> str:
    if spec.body == "regular_quad_pyramid":
        base = _dimension(spec, "base", "base_side", "底面边长")
        height = _dimension(spec, "height", "高")
        half = latex_exact(base / 2)
        return rf"A(-{half},-{half},0),\ B({half},-{half},0),\ S(0,0,{latex_exact(height)})"
    if spec.body == "cube":
        side = _dimension(spec, "side", "edge", "棱长")
        return rf"A(0,0,0),\ B({latex_exact(side)},0,0),\ A_1(0,0,{latex_exact(side)})"
    if spec.body == "cuboid":
        length = _dimension(spec, "length", "长")
        width = _dimension(spec, "width", "宽")
        height = _dimension(spec, "height", "高")
        return (
            rf"A(0,0,0),\ B({latex_exact(length)},0,0),\ "
            rf"D(0,{latex_exact(width)},0),\ A_1(0,0,{latex_exact(height)})"
        )
    return ""
