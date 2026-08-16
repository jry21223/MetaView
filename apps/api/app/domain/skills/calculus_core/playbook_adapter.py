from __future__ import annotations

import sympy as sp

from app.domain.models.playbook import (
    IterationTraceItem,
    IterationTraceSceneSnapshot,
    Layer,
    LayerTiming,
    MathFormulaSnapshot,
    MathPlotCurve,
    MathPlotSnapshot,
    MetaStep,
    PlaybookScript,
)
from app.domain.models.topic import TopicDomain
from app.domain.services.playbook_quality import estimate_step_frames
from app.domain.skills.algebra_core import expression_to_source, parse_expression
from app.domain.skills.calculus_core.problem_spec import CalculusCoreProblemSpec

_FPS = 30
_STEP_FRAMES = 95


def build_calculus_core_playbook(
    run_id: str,  # noqa: ARG001
    spec: CalculusCoreProblemSpec,
) -> PlaybookScript:
    if spec.task == "integral_area":
        return _build_integral(spec)
    if spec.task == "limit_1var":
        return _build_limit(spec)
    if spec.task == "series_basic":
        return _build_series(spec)
    return _build_derivative(spec)


def _build_derivative(spec: CalculusCoreProblemSpec) -> PlaybookScript:
    expr, parsed = parse_expression(spec.expression)
    symbol = sp.Symbol(spec.variable)
    derivative = sp.simplify(sp.diff(expr, symbol))
    snapshots = [
        MathFormulaSnapshot(
            formula_latex=rf"f({spec.variable})={parsed.latex}", caption="把输入解析为单变量函数。"
        ),
        MathFormulaSnapshot(
            formula_latex=rf"f'({spec.variable})=\frac{{d}}{{d{spec.variable}}}\left({parsed.latex}\right)",
            caption="导数表示瞬时变化率。",
        ),
        MathFormulaSnapshot(
            formula_latex=rf"f'({spec.variable})={sp.latex(derivative)}",
            caption="使用确定性符号求导。",
        ),
        MathPlotSnapshot(
            curves=[
                MathPlotCurve(
                    expression=expression_to_source(expr), label="f(x)", emphasis="secondary"
                ),
                MathPlotCurve(
                    expression=expression_to_source(derivative), label="f'(x)", emphasis="accent"
                ),
            ],
            x_min=-5,
            x_max=5,
            formula_latex=rf"f'({spec.variable})={sp.latex(derivative)}",
        ),
        IterationTraceSceneSnapshot(
            iterations=_sample_derivative(expr, derivative, symbol),
            metric_name="slope",
            current_index=2,
            formula_latex=rf"f'({spec.variable})={sp.latex(derivative)}",
            caption="用几个采样点对比函数值和导数斜率。",
        ),
    ]
    return _script(spec, "单变量导数", snapshots)


def _build_integral(spec: CalculusCoreProblemSpec) -> PlaybookScript:
    expr, parsed = parse_expression(spec.expression)
    symbol = sp.Symbol(spec.variable)
    lower = sp.sympify(spec.lower)
    upper = sp.sympify(spec.upper)
    value = sp.simplify(sp.integrate(expr, (symbol, lower, upper)))
    integral_latex = (
        rf"\int_{{{sp.latex(lower)}}}^{{{sp.latex(upper)}}} "
        rf"{parsed.latex}\,d{spec.variable}"
    )
    snapshots = [
        MathFormulaSnapshot(
            formula_latex=integral_latex,
            caption="定积分把区间上的累积量表示为面积。",
        ),
        MathPlotSnapshot(
            curves=[
                MathPlotCurve(
                    expression=expression_to_source(expr), label="f(x)", emphasis="primary"
                )
            ],
            x_min=float(lower) - 1,
            x_max=float(upper) + 1,
            shade_from=float(lower),
            shade_to=float(upper),
            formula_latex=rf"f({spec.variable})={parsed.latex}",
        ),
        MathFormulaSnapshot(
            formula_latex=rf"{integral_latex}={sp.latex(value)}",
            caption="符号积分给出精确面积。",
        ),
        IterationTraceSceneSnapshot(
            iterations=_riemann_samples(expr, symbol, float(lower), float(upper)),
            metric_name="partial area",
            current_index=3,
            formula_latex=rf"面积={sp.latex(value)}",
            caption="用分割采样展示面积累积直觉。",
        ),
        MathFormulaSnapshot(formula_latex=rf"\boxed{{{sp.latex(value)}}}", caption="最终结果。"),
    ]
    return _script(spec, "定积分面积", snapshots)


def _build_limit(spec: CalculusCoreProblemSpec) -> PlaybookScript:
    expr, parsed = parse_expression(spec.expression)
    symbol = sp.Symbol(spec.variable)
    point = sp.sympify(spec.point)
    value = sp.simplify(sp.limit(expr, symbol, point))
    limit_latex = rf"\lim_{{{spec.variable}\to {sp.latex(point)}}} {parsed.latex}"
    snapshots = [
        MathFormulaSnapshot(
            formula_latex=limit_latex,
            caption="识别单变量极限。",
        ),
        MathPlotSnapshot(
            curves=[
                MathPlotCurve(
                    expression=expression_to_source(expr), label="f(x)", emphasis="primary"
                )
            ],
            x_min=float(point) - 4,
            x_max=float(point) + 4,
            marker_x=float(point),
            formula_latex=rf"f({spec.variable})={parsed.latex}",
        ),
        IterationTraceSceneSnapshot(
            iterations=_approach_samples(expr, symbol, float(point)),
            metric_name="f(x)",
            current_index=2,
            formula_latex=rf"x\to {sp.latex(point)}",
            caption="从两侧取样观察函数值趋向。",
        ),
        MathFormulaSnapshot(
            formula_latex=rf"{limit_latex}={sp.latex(value)}",
            caption="符号极限给出最终值。",
        ),
        MathFormulaSnapshot(formula_latex=rf"\boxed{{{sp.latex(value)}}}", caption="整理答案。"),
    ]
    return _script(spec, "单变量极限", snapshots)


def _build_series(spec: CalculusCoreProblemSpec) -> PlaybookScript:
    expr, parsed = parse_expression(spec.expression)
    symbol = sp.Symbol(spec.variable)
    point = sp.sympify(spec.point or 0)
    series = sp.series(expr, symbol, point, spec.order).removeO()
    snapshots = [
        MathFormulaSnapshot(
            formula_latex=rf"f({spec.variable})={parsed.latex}", caption="解析原函数。"
        ),
        MathFormulaSnapshot(
            formula_latex=rf"T_{{{spec.order - 1}}}({spec.variable})={sp.latex(series)}",
            caption="在指定点展开泰勒多项式。",
        ),
        MathPlotSnapshot(
            curves=[
                MathPlotCurve(
                    expression=expression_to_source(expr), label="f(x)", emphasis="secondary"
                ),
                MathPlotCurve(
                    expression=expression_to_source(series), label="Taylor", emphasis="accent"
                ),
            ],
            x_min=-4,
            x_max=4,
            formula_latex=sp.latex(series),
        ),
        IterationTraceSceneSnapshot(
            iterations=[
                IterationTraceItem(
                    index=i, value=str(sp.series(expr, symbol, point, i + 1).removeO())
                )
                for i in range(1, min(spec.order, 5))
            ],
            metric_name="order",
            current_index=min(spec.order, 5) - 2,
            formula_latex=sp.latex(series),
            caption="逐阶增加项数，观察近似增强。",
        ),
        MathFormulaSnapshot(formula_latex=sp.latex(series), caption="最终近似多项式。"),
    ]
    return _script(spec, "泰勒展开", snapshots)


def _script(
    spec: CalculusCoreProblemSpec,
    title: str,
    snapshots: list[MathFormulaSnapshot | MathPlotSnapshot | IterationTraceSceneSnapshot],
) -> PlaybookScript:
    steps: list[MetaStep] = []
    frame_cursor = 0
    for index, snapshot in enumerate(snapshots[:6]):
        voiceover_text = getattr(snapshot, "caption", None) or "执行微积分步骤。"
        frame_cursor += max(_STEP_FRAMES, estimate_step_frames(voiceover_text, _FPS))
        steps.append(
            MetaStep(
                step_id=f"calculus_core_{index + 1:02d}",
                end_frame=frame_cursor,
                title=["建立函数", "视觉解释", "符号计算", "数值观察", "总结"][min(index, 4)],
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
        summary="使用共享 algebra_core 解析表达式，再由 SymPy kernel 完成微积分计算。",
        steps=steps,
        parameter_controls=[],
        algorithm_id=None,
        initial_data={},
    )


def _sample_derivative(
    expr: sp.Expr, derivative: sp.Expr, symbol: sp.Symbol
) -> list[IterationTraceItem]:
    items: list[IterationTraceItem] = []
    for index, x_value in enumerate([-2, -1, 0, 1, 2]):
        slope = sp.N(derivative.subs(symbol, x_value), 5)
        items.append(
            IterationTraceItem(
                index=index, value=f"x={x_value}", error=float(slope), label=f"斜率 {slope}"
            )
        )
    return items


def _riemann_samples(
    expr: sp.Expr, symbol: sp.Symbol, lower: float, upper: float
) -> list[IterationTraceItem]:
    items: list[IterationTraceItem] = []
    total = 0.0
    width = (upper - lower) / 4
    for index in range(4):
        x_value = lower + (index + 0.5) * width
        total += float(sp.N(expr.subs(symbol, x_value))) * width
        items.append(
            IterationTraceItem(
                index=index, value=f"{total:.4g}", error=abs(total), label=f"第 {index + 1} 段"
            )
        )
    return items


def _approach_samples(expr: sp.Expr, symbol: sp.Symbol, point: float) -> list[IterationTraceItem]:
    offsets = [-1, -0.5, -0.1, 0.1, 0.5, 1]
    items: list[IterationTraceItem] = []
    for index, offset in enumerate(offsets):
        x_value = point + offset
        try:
            y_value = float(sp.N(expr.subs(symbol, x_value)))
        except Exception:  # noqa: BLE001
            y_value = float("nan")
        items.append(
            IterationTraceItem(
                index=index, value=f"x={x_value:.3g}", error=y_value, label=f"f(x)={y_value:.4g}"
            )
        )
    return items
