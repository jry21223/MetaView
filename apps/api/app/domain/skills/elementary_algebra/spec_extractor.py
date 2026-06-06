from __future__ import annotations

import re

from app.domain.skills.algebra_core import equation_degree, extract_expression_after, parse_equation
from app.domain.skills.algebra_core.normalization import normalize_math_text
from app.domain.skills.elementary_algebra.problem_spec import ElementaryAlgebraProblemSpec

_EQUATION_SEGMENT_RE = re.compile(r"[A-Za-z0-9_+\-*/().^]+(?:<=|>=|=|<|>)[A-Za-z0-9_+\-*/().^]+")
_CALCULUS_KEYWORDS = ("求导", "导数", "积分", "极限", "切线", "lim", "int_", "d/d")
_GRAPH_TRANSFORM_KEYWORDS = ("图像变换", "开口", "平移", "顶点式")


def try_extract_elementary_algebra(prompt: str) -> ElementaryAlgebraProblemSpec | None:
    normalized = normalize_math_text(prompt)
    compact = normalized.replace(" ", "")
    if any(keyword in compact for keyword in _CALCULUS_KEYWORDS):
        return None
    if "y=" in compact and any(keyword in compact for keyword in _GRAPH_TRANSFORM_KEYWORDS):
        return None

    if "因式分解" in normalized or "factor" in normalized.lower():
        expression = extract_expression_after(normalized, ("因式分解", "factor"))
        if expression is None:
            return None
        return ElementaryAlgebraProblemSpec(
            original_prompt=prompt,
            task="factor_expression",
            expression=expression,
            variable=_first_variable(expression),
        )

    equation_text = _extract_equation_segment(compact)
    if equation_text is None:
        return None
    try:
        _, equation = parse_equation(equation_text)
    except Exception:  # noqa: BLE001 - unsupported syntax falls back.
        return None
    variable = equation.variables[0] if equation.variables else "x"
    if equation.relation != "=":
        return ElementaryAlgebraProblemSpec(
            original_prompt=prompt,
            task="inequality",
            equation=equation_text,
            variable=variable,
        )

    degree = equation_degree(equation, variable)
    if degree == 1:
        task = "linear_equation"
    elif degree == 2:
        task = "quadratic_equation"
    else:
        return None
    return ElementaryAlgebraProblemSpec(
        original_prompt=prompt,
        task=task,
        equation=equation_text,
        variable=variable,
    )


def _extract_equation_segment(compact: str) -> str | None:
    match = _EQUATION_SEGMENT_RE.search(compact)
    if match is None:
        return None
    return match.group(0)


def _first_variable(expression: str) -> str:
    match = re.search(r"[A-Za-z]", expression)
    return match.group(0) if match else "x"
