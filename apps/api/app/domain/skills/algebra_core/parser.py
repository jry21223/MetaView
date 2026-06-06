from __future__ import annotations

import re
from collections.abc import Iterable

import sympy as sp
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

from app.domain.skills.algebra_core.models import AlgebraEquation, AlgebraSystem, ParsedExpression
from app.domain.skills.algebra_core.normalization import compact_math_text, normalize_math_text

_TRANSFORMATIONS = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
)
_RELATION_RE = re.compile(r"(?P<lhs>.+?)(?P<rel><=|>=|=|<|>)(?P<rhs>.+)")
_EXPR_TOKEN_RE = re.compile(r"[A-Za-z0-9_+\-*/().^]+")
_LATEX_FRAC_RE = re.compile(r"\\frac\{([^{}]+)\}\{([^{}]+)\}")


def parse_expression(raw: str) -> tuple[sp.Expr, ParsedExpression]:
    normalized = _normalize_expression_source(raw)
    expr = _parse_sympy(normalized)
    variables = sorted(str(symbol) for symbol in expr.free_symbols)
    return expr, ParsedExpression(
        original=raw,
        normalized=normalize_math_text(raw),
        source=normalized,
        variables=variables,
        latex=sp.latex(expr),
    )


def parse_equation(raw: str) -> tuple[sp.Expr, AlgebraEquation]:
    normalized = compact_math_text(raw)
    match = _RELATION_RE.fullmatch(normalized)
    if match is None:
        raise ValueError(f"not an equation or inequality: {raw}")

    lhs_source = _normalize_expression_source(match.group("lhs"))
    rhs_source = _normalize_expression_source(match.group("rhs"))
    lhs = _parse_sympy(lhs_source)
    rhs = _parse_sympy(rhs_source)
    relation = match.group("rel")
    variables = sorted(str(symbol) for symbol in (lhs.free_symbols | rhs.free_symbols))
    equation = AlgebraEquation(
        original=raw,
        normalized=normalized,
        lhs_source=lhs_source,
        rhs_source=rhs_source,
        relation=relation,  # type: ignore[arg-type]
        variables=variables,
        latex=_relation_latex(lhs, relation, rhs),
    )
    return lhs - rhs, equation


def parse_equation_list(raw: str) -> AlgebraSystem:
    normalized = normalize_math_text(raw)
    candidates = [part.strip() for part in re.split(r"[,;，；]", normalized) if part.strip()]
    equations: list[AlgebraEquation] = []
    symbols: set[str] = set()
    for candidate in candidates:
        try:
            _, equation = parse_equation(candidate)
        except ValueError:
            continue
        if equation.relation != "=":
            continue
        equations.append(equation)
        symbols.update(equation.variables)
    if not equations:
        raise ValueError("no supported equation found")
    return AlgebraSystem(
        original=raw,
        equations=equations,
        variables=sorted(symbols),
    )


def extract_expression_after(prompt: str, keywords: Iterable[str]) -> str | None:
    normalized = normalize_math_text(prompt)
    for keyword in keywords:
        idx = normalized.find(keyword)
        if idx >= 0:
            rest = normalized[idx + len(keyword) :].strip(" :：")
            token = _longest_expr_token(rest)
            if token:
                return token
    token = _longest_expr_token(normalized)
    return token


def expression_to_source(expr: sp.Expr) -> str:
    return str(expr).replace("**", "^")


def _normalize_expression_source(raw: str) -> str:
    source = compact_math_text(_latex_subset_to_plain(raw))
    if source.startswith("y="):
        source = source[2:]
    return source


def _parse_sympy(source: str) -> sp.Expr:
    return parse_expr(
        source,
        transformations=_TRANSFORMATIONS,
        evaluate=True,
    )


def _relation_latex(lhs: sp.Expr, relation: str, rhs: sp.Expr) -> str:
    rel = {"<=": r"\le", ">=": r"\ge"}.get(relation, relation)
    return f"{sp.latex(lhs)} {rel} {sp.latex(rhs)}"


def _latex_subset_to_plain(raw: str) -> str:
    out = raw
    out = _LATEX_FRAC_RE.sub(r"(\1)/(\2)", out)
    out = out.replace(r"\left", "").replace(r"\right", "")
    out = out.replace(r"\cdot", "*")
    out = out.replace(r"\times", "*")
    out = out.replace(r"\pi", "pi")
    out = re.sub(r"\^\{([^{}]+)\}", r"^(\1)", out)
    return out


def _longest_expr_token(text: str) -> str | None:
    matches = _EXPR_TOKEN_RE.findall(text.replace(" ", ""))
    if not matches:
        return None
    return max(matches, key=len)
