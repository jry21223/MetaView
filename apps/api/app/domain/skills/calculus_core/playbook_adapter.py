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
from app.domain.skills.algebra_core import expression_to_source, parse_expression, parse_number
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
    # A derivative lesson always teaches through the secant→tangent arc (the
    # LessonPlan demands tangent/secant/target_point visuals even without an
    # explicit point); without one we pick a well-defined demonstration point.
    if spec.point is None:
        spec = spec.model_copy(update={"point": _default_tangent_point(expr, derivative, symbol)})
    return _build_derivative_tangent(spec, expr, parsed.latex, symbol, derivative)


def _default_tangent_point(
    expr: sp.Expr,
    derivative: sp.Expr,
    symbol: sp.Symbol,
) -> float | int:
    for candidate in (1, sp.Rational(1, 2), 2, -1, 0):
        try:
            value = expr.subs(symbol, candidate)
            slope = derivative.subs(symbol, candidate)
        except Exception:  # noqa: BLE001
            continue
        if value.is_real and slope.is_real and value.is_finite and slope.is_finite:
            return int(candidate) if candidate == int(candidate) else float(candidate)
    return 1


def _build_derivative_tangent(
    spec: CalculusCoreProblemSpec,
    expr: sp.Expr,
    expression_latex: str,
    symbol: sp.Symbol,
    derivative: sp.Expr,
) -> PlaybookScript:
    point = parse_number(spec.point)
    point_value = sp.simplify(expr.subs(symbol, point))
    tangent_slope = sp.simplify(derivative.subs(symbol, point))
    tangent_line = sp.expand(tangent_slope * (symbol - point) + point_value)
    curve = MathPlotCurve(
        expression=expression_to_source(expr),
        label=f"f({spec.variable})",
        emphasis="primary",
        semantic_role="curve",
    )

    def plot(
        *extra_curves: MathPlotCurve,
        formula_latex: str,
        caption: str,
    ) -> MathPlotSnapshot:
        point_float = float(point)
        return MathPlotSnapshot(
            pack_id="math-basic",
            asset_id="derivative-tangent-preset",
            curves=[curve, *extra_curves],
            x_min=point_float - 2,
            x_max=point_float + 2,
            marker_x=point_float,
            formula_latex=formula_latex,
            caption=caption,
        )

    secant_far, secant_far_slope = _secant_line(expr, symbol, point, point_value, sp.Integer(1))
    secant_near, secant_near_slope = _secant_line(
        expr,
        symbol,
        point,
        point_value,
        sp.Rational(1, 4),
    )
    tangent_curve = MathPlotCurve(
        expression=expression_to_source(tangent_line),
        label="切线 tangent",
        emphasis="accent",
        semantic_role="tangent",
    )
    snapshots = [
        plot(
            formula_latex=rf"f({spec.variable})={expression_latex}",
            caption=(
                f"先观察曲线，并标出目标点 "
                f"({_display(point)},{_display(point_value)})。"
            ),
        ),
        plot(
            MathPlotCurve(
                expression=expression_to_source(secant_far),
                label="割线 secant",
                emphasis="secondary",
                semantic_role="secant",
            ),
            formula_latex=rf"m_{{\mathrm{{sec}}}}={sp.latex(secant_far_slope)}",
            caption=(
                "连接目标点和第二个曲线点得到割线，"
                f"此时割线斜率为 {_display(secant_far_slope)}。"
            ),
        ),
        plot(
            MathPlotCurve(
                expression=expression_to_source(secant_near),
                label="割线 secant",
                emphasis="secondary",
                semantic_role="secant",
            ),
            formula_latex=(
                rf"h\to 0,\quad m_{{\mathrm{{sec}}}}\to {sp.latex(tangent_slope)}"
            ),
            caption=(
                "让第二个点沿曲线靠近目标点，割线斜率趋近 "
                f"{_display(tangent_slope)}。"
            ),
        ),
        plot(
            tangent_curve,
            formula_latex=(
                rf"f'({_display(point)})={sp.latex(tangent_slope)}"
            ),
            caption=(
                "当第二个点趋近目标点时，割线趋近切线；"
                f"这个极限就是导数 {_display(tangent_slope)}。"
            ),
        ),
        plot(
            MathPlotCurve(
                expression=expression_to_source(secant_near),
                label="割线 secant",
                emphasis="secondary",
                semantic_role="secant",
            ),
            tangent_curve,
            formula_latex=(
                rf"f'({_display(point)})={sp.latex(tangent_slope)}="
                rf"m_{{\mathrm{{tangent}}}}"
            ),
            caption=(
                f"曲线在目标点处的导数等于 {_display(tangent_slope)}，"
                f"因此该点的切线斜率也等于 {_display(tangent_slope)}。"
            ),
        ),
        MathFormulaSnapshot(
            formula_latex=rf"f'({spec.variable})={sp.latex(derivative)}",
            caption="切线斜率随目标点移动，就得到整条导函数。",
        ),
    ]
    answer_text = (
        f"所以 d/d{spec.variable} ({expression_to_source(expr)}) = "
        f"{expression_to_source(derivative)}；在 {spec.variable}={_display(point)} 处，"
        f"切线斜率为 {_display(tangent_slope)}。"
    )
    return _script(spec, "导数的几何意义", snapshots, answer_text=answer_text)


def _secant_line(
    expr: sp.Expr,
    symbol: sp.Symbol,
    point: sp.Expr,
    point_value: sp.Expr,
    offset: sp.Expr,
) -> tuple[sp.Expr, sp.Expr]:
    other_point = point + offset
    other_value = sp.simplify(expr.subs(symbol, other_point))
    slope = sp.simplify((other_value - point_value) / offset)
    return sp.expand(slope * (symbol - point) + point_value), slope


def _display(value: sp.Expr) -> str:
    simplified = sp.simplify(value)
    if getattr(simplified, "is_Float", False):
        return str(round(float(simplified), 4))
    return sp.sstr(simplified)


def _build_integral(spec: CalculusCoreProblemSpec) -> PlaybookScript:
    expr, parsed = parse_expression(spec.expression)
    symbol = sp.Symbol(spec.variable)
    lower = parse_number(spec.lower)
    upper = parse_number(spec.upper)
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
        MathFormulaSnapshot(
            formula_latex=rf"{integral_latex}=\boxed{{{sp.latex(value)}}}",
            caption="阴影区域的面积就是这个定积分的值。",
        ),
    ]
    answer_text = (
        f"所以 int_{_display(lower)}^{_display(upper)} {expression_to_source(expr)} "
        f"d{spec.variable} = {_display(value)}，曲线下这块面积等于 {_display(value)}。"
    )
    return _script(spec, "定积分面积", snapshots, answer_text=answer_text)


def _build_limit(spec: CalculusCoreProblemSpec) -> PlaybookScript:
    expr, parsed = parse_expression(spec.expression)
    symbol = sp.Symbol(spec.variable)
    point = parse_number(spec.point)
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
        MathFormulaSnapshot(
            formula_latex=rf"{limit_latex}=\boxed{{{sp.latex(value)}}}",
            caption="两侧取样与符号计算给出同一个极限值。",
        ),
    ]
    answer_text = (
        f"所以 lim {spec.variable}->{_display(point)} {expression_to_source(expr)} "
        f"= {_display(value)}，极限等于 {_display(value)}。"
    )
    return _script(spec, "单变量极限", snapshots, answer_text=answer_text)


def _build_series(spec: CalculusCoreProblemSpec) -> PlaybookScript:
    expr, parsed = parse_expression(spec.expression)
    symbol = sp.Symbol(spec.variable)
    point = parse_number(spec.point if spec.point is not None else 0)
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
    answer_text = (
        f"所以 {expression_to_source(expr)} 在该点的泰勒多项式为 "
        f"{expression_to_source(series)}。"
    )
    return _script(spec, "泰勒展开", snapshots, answer_text=answer_text)


def _script(
    spec: CalculusCoreProblemSpec,
    title: str,
    snapshots: list[MathFormulaSnapshot | MathPlotSnapshot | IterationTraceSceneSnapshot],
    *,
    answer_text: str | None = None,
) -> PlaybookScript:
    steps: list[MetaStep] = []
    frame_cursor = 0
    kept = snapshots[:6]
    for index, snapshot in enumerate(kept):
        voiceover_text = getattr(snapshot, "caption", None) or "执行微积分步骤。"
        if answer_text and index == len(kept) - 1:
            # The final step must state the requested conclusion in narration —
            # a \boxed{} formula alone never answers the prompt (issue #283).
            voiceover_text = f"{voiceover_text} {answer_text}".strip()
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
