from __future__ import annotations

import sympy as sp

from app.domain.models.playbook import (
    Layer,
    LayerTiming,
    MathFormulaSnapshot,
    MetaStep,
    PlaybookScript,
    TableSceneSnapshot,
)
from app.domain.models.topic import TopicDomain
from app.domain.services.playbook_quality import estimate_step_frames
from app.domain.skills.algebra_core import (
    parse_equation,
    parse_expression,
    solve_equation,
    solve_inequality,
)
from app.domain.skills.elementary_algebra.problem_spec import ElementaryAlgebraProblemSpec

_FPS = 30
_STEP_FRAMES = 90


def build_elementary_algebra_playbook(
    run_id: str,  # noqa: ARG001 - reserved for trace metadata.
    spec: ElementaryAlgebraProblemSpec,
) -> PlaybookScript:
    if spec.task == "factor_expression":
        return _build_factor_playbook(spec)
    if spec.equation is None:
        raise ValueError("equation task requires equation")
    _, equation = parse_equation(spec.equation)
    if spec.task == "inequality":
        result, core_steps = solve_inequality(equation, spec.variable)
        snapshots = [
            MathFormulaSnapshot(formula_latex=step.formula_latex, caption=step.caption)
            for step in core_steps
        ]
        snapshots.append(
            TableSceneSnapshot(
                columns=["对象", "结果"],
                rows=[["变量", spec.variable], ["解集", sp.latex(result)]],
                active_rows=[1],
                caption="不等式的解用区间或逻辑条件表示。",
            )
        )
        return _script(spec, "一元不等式", snapshots)

    solutions, core_steps = solve_equation(equation, spec.variable)
    snapshots: list[MathFormulaSnapshot | TableSceneSnapshot] = [
        MathFormulaSnapshot(formula_latex=step.formula_latex, caption=step.caption)
        for step in core_steps
    ]
    snapshots.append(
        MathFormulaSnapshot(
            formula_latex=_verify_latex(
                equation.lhs_source, equation.rhs_source, spec.variable, solutions
            ),
            caption="把解代回原式，检查左右两边是否一致。",
        )
    )
    snapshots.append(
        TableSceneSnapshot(
            columns=["变量", "解"],
            rows=[[spec.variable, _solutions_text(solutions)]],
            active_rows=[0],
            active_columns=[1],
            caption="最终解只来自符号求解和回代验证。",
        )
    )
    title = "一元一次方程" if spec.task == "linear_equation" else "一元二次方程"
    return _script(spec, title, snapshots)


def _build_factor_playbook(spec: ElementaryAlgebraProblemSpec) -> PlaybookScript:
    if spec.expression is None:
        raise ValueError("factor task requires expression")
    expr, parsed = parse_expression(spec.expression)
    factored = sp.factor(expr)
    roots = sp.solve(sp.Eq(expr, 0), sp.Symbol(spec.variable))
    snapshots: list[MathFormulaSnapshot | TableSceneSnapshot] = [
        MathFormulaSnapshot(
            formula_latex=parsed.latex,
            caption="先把表达式转换成标准符号表达式。",
        ),
        MathFormulaSnapshot(
            formula_latex=rf"{sp.latex(expr)} = {sp.latex(factored)}",
            caption="使用确定性的多项式因式分解。",
        ),
        TableSceneSnapshot(
            columns=["因式", "说明"],
            rows=[[sp.latex(factor), "乘积中的一项"] for factor in _factor_list(factored)],
            active_rows=[0],
            caption="因式表帮助后续解释零点。",
        ),
        MathFormulaSnapshot(
            formula_latex=_roots_latex(spec.variable, roots),
            caption="若令原式等于 0，每个一次因式给出一个零点。",
        ),
        MathFormulaSnapshot(
            formula_latex=sp.latex(factored),
            caption="最终输出保持为规范化因式乘积。",
        ),
    ]
    return _script(spec, "多项式因式分解", snapshots)


def _script(
    spec: ElementaryAlgebraProblemSpec,
    title: str,
    snapshots: list[MathFormulaSnapshot | TableSceneSnapshot],
) -> PlaybookScript:
    steps: list[MetaStep] = []
    captions = [
        "识别题型",
        "规范化表达",
        "执行核心代数步骤",
        "验证中间结论",
        "整理最终结果",
    ]
    while len(snapshots) < 5:
        snapshots.append(snapshots[-1])
    frame_cursor = 0
    for index, snapshot in enumerate(snapshots[:6]):
        label = captions[index] if index < len(captions) else "补充说明"
        voiceover_text = _voiceover(label, snapshot)
        frame_cursor += max(_STEP_FRAMES, estimate_step_frames(voiceover_text, _FPS))
        steps.append(
            MetaStep(
                step_id=f"elementary_algebra_{index + 1:02d}",
                end_frame=frame_cursor,
                title=label,
                voiceover_text=voiceover_text,
                animation_hint=snapshot.kind,
                snapshot=snapshot,
                layers=[Layer(timing=LayerTiming(), body=snapshot)],
                tokens=[],
            )
        )
    return PlaybookScript(
        fps=_FPS,
        total_frames=frame_cursor,
        domain=TopicDomain.MATH,
        title=title,
        summary="使用共享 algebra_core 完成确定性解析、求解和步骤化解释。",
        steps=steps,
        parameter_controls=[],
        algorithm_id=None,
        initial_data={},
    )


def _voiceover(title: str, snapshot: MathFormulaSnapshot | TableSceneSnapshot) -> str:
    caption = getattr(snapshot, "caption", None)
    return f"{title}。{caption or ''}".strip()


def _solutions_text(solutions: list[sp.Expr]) -> str:
    if not solutions:
        return "无解"
    return ", ".join(sp.latex(solution) for solution in solutions)


def _roots_latex(variable: str, roots: list[sp.Expr]) -> str:
    if not roots:
        return rf"{variable} \in \varnothing"
    joined = ", ".join(sp.latex(root) for root in roots)
    return rf"{variable} \in \left\{{{joined}\right\}}"


def _verify_latex(lhs_source: str, rhs_source: str, variable: str, solutions: list[sp.Expr]) -> str:
    if not solutions:
        return r"\text{无候选解可回代}"
    value = solutions[0]
    return rf"{variable}={sp.latex(value)}:\quad {lhs_source} = {rhs_source}"


def _factor_list(factored: sp.Expr) -> list[sp.Expr]:
    if isinstance(factored, sp.Mul):
        return list(factored.args)
    return [factored]
