from __future__ import annotations

import sympy as sp

from app.domain.models.playbook import (
    Layer,
    LayerTiming,
    MetaStep,
    PlaybookScript,
    SolidGeometryEdge,
    SolidGeometryPlane,
    SolidGeometryPoint,
    SolidGeometrySceneSnapshot,
    SolidGeometryVector,
)
from app.domain.models.topic import TopicDomain
from app.domain.skills.solid_geometry.geometry_kernel import (
    SolidGeometrySolution,
    SolidGeometrySolutionStep,
    latex_exact,
    to_three,
)

_FPS = 30
_STEP_FRAMES = 75


def build_solid_geometry_playbook(
    solution: SolidGeometrySolution,
    *,
    run_id: str,
    prompt: str,
) -> PlaybookScript:
    steps: list[MetaStep] = []
    cumulative = 0
    for index, solution_step in enumerate(solution.steps):
        cumulative += _STEP_FRAMES
        snapshot = _build_snapshot(
            solution,
            solution_step,
            is_final=index == len(solution.steps) - 1,
        )
        steps.append(
            MetaStep(
                step_id=f"solid_geometry_{index + 1:02d}",
                end_frame=cumulative,
                title=solution_step.title,
                voiceover_text=_voiceover(solution_step),
                animation_hint="solid_geometry_scene",
                snapshot=snapshot,
                layers=[
                    Layer(
                        timing=LayerTiming(
                            enter_at=0.0,
                            exit_at=1.0,
                            appear_anim="fade",
                            z_order=0,
                        ),
                        body=snapshot,
                    )
                ],
                tokens=[],
            )
        )

    return PlaybookScript(
        fps=_FPS,
        total_frames=max(cumulative, 1),
        domain=TopicDomain.MATH,
        title=_title_for(solution, prompt),
        summary="使用建系与向量法，由 SymPy kernel 精确计算立体几何结果。",
        steps=steps,
        parameter_controls=[],
        initial_data={},
        algorithm_id=None,
    )


def validate_solution_playbook_consistency(
    solution: SolidGeometrySolution,
    playbook: PlaybookScript,
) -> None:
    if not playbook.steps:
        raise ValueError("solid geometry playbook has no steps")
    final_step = playbook.steps[-1]
    final_formula = ""
    if final_step.snapshot.kind == "solid_geometry_scene":
        final_formula = final_step.snapshot.formula_latex or ""
    answer_in_voiceover = solution.answer_latex in final_step.voiceover_text
    answer_in_formula = solution.answer_latex in final_formula
    if not answer_in_voiceover and not answer_in_formula:
        raise ValueError(
            "solid geometry answer consistency failed: "
            "solution.answer_latex is absent from final voiceover/formula"
        )


def _build_snapshot(
    solution: SolidGeometrySolution,
    step: SolidGeometrySolutionStep,
    *,
    is_final: bool,
) -> SolidGeometrySceneSnapshot:
    highlight = set(step.highlight)
    formula = solution.answer_latex if is_final else step.latex
    return SolidGeometrySceneSnapshot(
        points=[
            SolidGeometryPoint(
                label=point.label,
                position=point.render,
                math_position_latex=tuple(latex_exact(coord) for coord in point.math),
            )
            for point in solution.points.values()
        ],
        edges=[
            SolidGeometryEdge(
                start=start,
                end=end,
                label=f"{start}{end}",
                emphasis="accent" if _edge_highlighted(start, end, highlight) else "secondary",
            )
            for start, end in solution.edges
        ],
        planes=_planes(solution, highlight),
        vectors=_vectors(solution, highlight),
        visible_elements=step.highlight,
        focus_target=_focus_target(step.highlight),
        formula_latex=formula,
        caption=step.explanation,
    )


def _planes(
    solution: SolidGeometrySolution,
    highlight: set[str],
) -> list[SolidGeometryPlane]:
    if solution.target_plane is None:
        return []
    plane_key = "".join(solution.target_plane)
    vertices = list(solution.target_face or solution.target_plane)
    face_key = "".join(vertices)
    emphasized = f"plane:{plane_key}" in highlight or f"plane:{face_key}" in highlight
    return [
        SolidGeometryPlane(
            id=plane_key,
            vertices=vertices,
            label=f"平面 {face_key}",
            emphasis="accent" if emphasized else "muted",
        )
    ]


def _vectors(
    solution: SolidGeometrySolution,
    highlight: set[str],
) -> list[SolidGeometryVector]:
    vectors: list[SolidGeometryVector] = []
    if solution.target_line is not None:
        line_key = "".join(solution.target_line)
        vectors.append(
            SolidGeometryVector(
                id=f"vector:{line_key}",
                start=solution.target_line[0],
                end=solution.target_line[1],
                label=rf"\vec{{{line_key}}}",
                emphasis="accent" if f"vector:{line_key}" in highlight else "secondary",
            )
        )
    if solution.target_plane is not None:
        plane_key = "".join(solution.target_plane)
        normal = solution.vectors.get(f"normal:{plane_key}")
        if normal is not None:
            start = solution.target_plane[0]
            vectors.append(
                SolidGeometryVector(
                    id=f"normal:{plane_key}",
                    start=start,
                    direction=_scaled_direction(normal),
                    label=rf"\vec n_{{{plane_key}}}",
                    emphasis="accent" if f"normal:{plane_key}" in highlight else "secondary",
                )
            )
    return vectors


def _scaled_direction(direction: tuple[sp.Expr, sp.Expr, sp.Expr]) -> tuple[float, float, float]:
    matrix = sp.Matrix(direction)
    norm = sp.sqrt(sp.simplify(matrix.dot(matrix)))
    if norm == 0:
        return (0.0, 0.0, 0.0)
    unit = tuple(sp.simplify(coord / norm) for coord in direction)
    return to_three(unit)


def _voiceover(step: SolidGeometrySolutionStep) -> str:
    if step.latex:
        return f"{step.explanation} {step.latex}"
    return step.explanation


def _title_for(solution: SolidGeometrySolution, prompt: str) -> str:
    if solution.query_kind == "volume":
        return "立体几何：长方体体积"
    if solution.target_line and solution.target_plane:
        line = "".join(solution.target_line)
        plane = "".join(solution.target_plane)
        return f"立体几何：{line} 与平面 {plane} 的线面角"
    return prompt[:40] or "立体几何"


def _edge_highlighted(start: str, end: str, highlight: set[str]) -> bool:
    keys = {
        f"edge:{start}{end}",
        f"edge:{end}{start}",
        f"line:{start}{end}",
        f"line:{end}{start}",
    }
    return bool(keys & highlight)


def _focus_target(highlight: list[str]) -> str | None:
    for item in highlight:
        if item not in {"body", "points", "axes", "answer"}:
            return item
    return None
