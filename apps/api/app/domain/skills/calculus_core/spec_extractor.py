from __future__ import annotations

import re

from app.domain.skills.algebra_core import extract_expression_after
from app.domain.skills.algebra_core.normalization import compact_math_text, normalize_math_text
from app.domain.skills.calculus_core.problem_spec import CalculusCoreProblemSpec

_DDX_RE = re.compile(r"d/d(?P<var>[A-Za-z])\((?P<expr>.+)\)")
_INT_RE = re.compile(
    r"(?:int|integral)_(?P<lower>[-+]?\d+(?:\.\d+)?)\\?(?:\^|to)(?P<upper>[-+]?\d+(?:\.\d+)?)(?P<expr>.+?)d(?P<var>[A-Za-z])"
)
_LIMIT_RE = re.compile(
    r"(?:lim|limit)(?:_\{?)?(?P<var>[A-Za-z])(?:->|to)(?P<point>[-+]?\d+(?:\.\d+)?)(?:\}?)?(?P<expr>.+)"
)
_SERIES_RE = re.compile(r"(?:series|泰勒|taylor).*?(?P<expr>[A-Za-z0-9_+\-*/().^]+)")


def try_extract_calculus_core(prompt: str) -> CalculusCoreProblemSpec | None:
    normalized = normalize_math_text(prompt)
    compact = compact_math_text(normalized)

    integral = _INT_RE.search(compact)
    if integral:
        return CalculusCoreProblemSpec(
            original_prompt=prompt,
            task="integral_area",
            expression=_clean_expr(integral.group("expr")),
            variable=integral.group("var"),
            lower=integral.group("lower"),
            upper=integral.group("upper"),
        )

    derivative = _DDX_RE.search(compact)
    if derivative:
        return CalculusCoreProblemSpec(
            original_prompt=prompt,
            task="derivative",
            expression=_clean_expr(derivative.group("expr")),
            variable=derivative.group("var"),
        )
    if "求导" in normalized or "导数" in normalized or "derivative" in normalized.lower():
        expression = extract_expression_after(normalized, ("求导", "导数", "derivative"))
        if expression:
            return CalculusCoreProblemSpec(
                original_prompt=prompt,
                task="derivative",
                expression=expression,
                variable="x",
            )

    limit = _LIMIT_RE.search(compact)
    if limit:
        return CalculusCoreProblemSpec(
            original_prompt=prompt,
            task="limit_1var",
            expression=_clean_expr(limit.group("expr")),
            variable=limit.group("var"),
            point=limit.group("point"),
        )

    series = _SERIES_RE.search(normalized.lower())
    if series:
        return CalculusCoreProblemSpec(
            original_prompt=prompt,
            task="series_basic",
            expression=series.group("expr"),
            variable="x",
            point=0,
            order=5,
        )
    return None


def _clean_expr(expr: str) -> str:
    out = expr.strip()
    while out.startswith("(") and out.endswith(")"):
        out = out[1:-1].strip()
    out = re.sub(r"(sin|cos|tan|log|ln|exp|sqrt)([A-Za-z])", r"\1(\2)", out)
    return out
