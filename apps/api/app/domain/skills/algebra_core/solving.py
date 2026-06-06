from __future__ import annotations

import sympy as sp

from app.domain.skills.algebra_core.models import AlgebraEquation, AlgebraStep, AlgebraSystem
from app.domain.skills.algebra_core.parser import expression_to_source, parse_equation


def to_latex(value: object) -> str:
    return sp.latex(value)


def equation_to_latex(equation: AlgebraEquation) -> str:
    return equation.latex


def equation_degree(equation: AlgebraEquation, variable: str | None = None) -> int | None:
    expr, parsed = parse_equation(equation.normalized)
    symbol_name = variable or (parsed.variables[0] if parsed.variables else None)
    if symbol_name is None:
        return None
    symbol = sp.Symbol(symbol_name)
    try:
        return int(sp.Poly(expr, symbol).degree())
    except Exception:  # noqa: BLE001 - non-polynomial expressions have no degree.
        return None


def solve_equation(
    equation: AlgebraEquation, variable: str | None = None
) -> tuple[list[sp.Expr], list[AlgebraStep]]:
    expr, parsed = parse_equation(equation.normalized)
    symbol_name = variable or (parsed.variables[0] if parsed.variables else None)
    if symbol_name is None:
        raise ValueError("equation has no variable")
    symbol = sp.Symbol(symbol_name)
    simplified = sp.simplify(expr)
    solutions = [sp.simplify(item) for item in sp.solve(sp.Eq(simplified, 0), symbol)]
    steps = [
        AlgebraStep(
            title="识别等式",
            formula_latex=equation.latex,
            caption="把原始输入转换成可计算的符号等式。",
        ),
        AlgebraStep(
            title="移到同一边",
            formula_latex=rf"{sp.latex(simplified)} = 0",
            caption="把右边移到左边，形成标准的零点问题。",
        ),
        AlgebraStep(
            title="求解变量",
            formula_latex=_solution_latex(symbol_name, solutions),
            caption="由确定性符号求解器给出候选解。",
        ),
    ]
    return solutions, steps


def solve_inequality(
    equation: AlgebraEquation, variable: str | None = None
) -> tuple[sp.Expr, list[AlgebraStep]]:
    expr, parsed = parse_equation(equation.normalized)
    symbol_name = variable or (parsed.variables[0] if parsed.variables else None)
    if symbol_name is None:
        raise ValueError("inequality has no variable")
    symbol = sp.Symbol(symbol_name)
    rel_expr = _relational_from_equation(equation, expr)
    result = sp.solve_univariate_inequality(rel_expr, symbol)
    return result, [
        AlgebraStep(title="识别不等式", formula_latex=equation.latex),
        AlgebraStep(
            title="求解区间",
            formula_latex=sp.latex(result),
            caption="保持不等号方向，得到满足条件的变量范围。",
        ),
    ]


def system_to_matrix(system: AlgebraSystem) -> tuple[sp.Matrix, sp.Matrix, list[str]]:
    symbols = [sp.Symbol(name) for name in system.variables]
    exprs = [parse_equation(eq.normalized)[0] for eq in system.equations]
    matrix, rhs = sp.linear_eq_to_matrix(exprs, symbols)
    return matrix, rhs, [str(symbol) for symbol in symbols]


def expression_source(value: sp.Expr) -> str:
    return expression_to_source(value)


def _solution_latex(symbol_name: str, solutions: list[sp.Expr]) -> str:
    if not solutions:
        return rf"{symbol_name} \in \varnothing"
    if len(solutions) == 1:
        return rf"{symbol_name} = {sp.latex(solutions[0])}"
    joined = ", ".join(sp.latex(item) for item in solutions)
    return rf"{symbol_name} \in \left\{{{joined}\right\}}"


def _relational_from_equation(equation: AlgebraEquation, expr: sp.Expr) -> sp.Rel:
    if equation.relation == "<":
        return sp.StrictLessThan(expr, 0)
    if equation.relation == ">":
        return sp.StrictGreaterThan(expr, 0)
    if equation.relation == "<=":
        return sp.LessThan(expr, 0)
    if equation.relation == ">=":
        return sp.GreaterThan(expr, 0)
    return sp.Eq(expr, 0)
