from __future__ import annotations

import ast
import re
from collections.abc import Iterable
from tokenize import TokenError
from typing import Any, Final

import sympy as sp
from sympy.parsing.sympy_parser import (
    convert_xor,
    eval_expr,
    implicit_multiplication_application,
    standard_transformations,
    stringify_expr,
)

from app.domain.skills.algebra_core.models import AlgebraEquation, AlgebraSystem, ParsedExpression
from app.domain.skills.algebra_core.normalization import compact_math_text, normalize_math_text

_TRANSFORMATIONS = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
)


class UnsafeExpressionError(ValueError):
    """Raised when prompt-derived text falls outside the sandboxed algebra grammar."""


# SymPy's ``parse_expr`` is ``eval`` on the transformed source: ``x.__class__``
# survives tokenisation as ``Symbol('x').__class__`` and runs. The text we parse
# comes from user prompts (routing runs before any auth in the self edition)
# and from agent tool calls (``skill.<id>.solve`` accepts a free-form
# ``problem_spec``), so it is treated exactly like ``geometry_validators`` treats
# its inputs: the transformed code must pass an AST allowlist before evaluation.
_MAX_SOURCE_CHARS: Final = 512
_MAX_AST_NODES: Final = 160
_SYMBOL_NAME_RE: Final = re.compile(r"[A-Za-z][A-Za-z0-9_]{0,15}")
_NUMBER_TEXT_RE: Final = re.compile(r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?")
_FRACTION_TEXT_RE: Final = re.compile(r"(?P<num>[-+]?\d+)/(?P<den>\d+)")

_FUNCTIONS: Final[dict[str, Any]] = {
    "sin": sp.sin,
    "cos": sp.cos,
    "tan": sp.tan,
    "cot": sp.cot,
    "sec": sp.sec,
    "csc": sp.csc,
    "asin": sp.asin,
    "acos": sp.acos,
    "atan": sp.atan,
    "acot": sp.acot,
    "sinh": sp.sinh,
    "cosh": sp.cosh,
    "tanh": sp.tanh,
    "asinh": sp.asinh,
    "acosh": sp.acosh,
    "atanh": sp.atanh,
    "exp": sp.exp,
    "log": sp.log,
    "ln": sp.log,
    "sqrt": sp.sqrt,
    "cbrt": sp.cbrt,
    "root": sp.root,
    "Abs": sp.Abs,
    "abs": sp.Abs,
    "floor": sp.floor,
    "ceiling": sp.ceiling,
    "ceil": sp.ceiling,
    "factorial": sp.factorial,
    "binomial": sp.binomial,
    "Max": sp.Max,
    "Min": sp.Min,
    "max": sp.Max,
    "min": sp.Min,
    "sign": sp.sign,
}
_CONSTANTS: Final[dict[str, Any]] = {"pi": sp.pi, "E": sp.E}
# The tokens SymPy's own transformations emit for literals and free names.
_CONSTRUCTORS: Final[dict[str, Any]] = {
    "Symbol": sp.Symbol,
    "Integer": sp.Integer,
    "Float": sp.Float,
    "Rational": sp.Rational,
}
_NAMESPACE: Final[dict[str, Any]] = {**_FUNCTIONS, **_CONSTANTS, **_CONSTRUCTORS}
_ALLOWED_OPERATORS: Final = (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow, ast.USub, ast.UAdd)


class _AlgebraGuard(ast.NodeVisitor):
    """Allowlist walker over the code ``stringify_expr`` produced.

    Accepts arithmetic over numeric literals, ``Symbol('name')`` for free
    variables, the constants above and direct calls to the math functions
    above. Attribute access, subscripts, lambdas, comparisons, strings outside
    a constructor and every other name are rejected before ``eval`` runs.
    """

    def __init__(self) -> None:
        self._nodes = 0

    def _count(self) -> None:
        self._nodes += 1
        if self._nodes > _MAX_AST_NODES:
            raise UnsafeExpressionError("expression is too complex")

    def generic_visit(self, node: ast.AST) -> None:
        self._count()
        allowed = (ast.Expression, ast.BinOp, ast.UnaryOp, ast.Load, *_ALLOWED_OPERATORS)
        if not isinstance(node, allowed):
            raise UnsafeExpressionError(f"unsupported syntax: {node.__class__.__name__}")
        super().generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:
        self._count()
        if not isinstance(node.func, ast.Name):
            raise UnsafeExpressionError(
                "only direct calls to whitelisted math functions are allowed"
            )
        if node.keywords:
            raise UnsafeExpressionError("keyword arguments are not supported")
        name = node.func.id
        if name in _CONSTRUCTORS:
            self._check_constructor(name, node.args)
            return
        if name not in _FUNCTIONS:
            raise UnsafeExpressionError(f"unknown function: {name}")
        for arg in node.args:
            self.visit(arg)

    def visit_Name(self, node: ast.Name) -> None:
        self._count()
        if node.id not in _CONSTANTS:
            raise UnsafeExpressionError(f"unknown name: {node.id}")

    def visit_Constant(self, node: ast.Constant) -> None:
        self._count()
        if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
            raise UnsafeExpressionError("only numeric constants are supported")

    def _check_constructor(self, name: str, args: list[ast.expr]) -> None:
        if name == "Symbol":
            if (
                len(args) != 1
                or not isinstance(args[0], ast.Constant)
                or not isinstance(args[0].value, str)
                or not _SYMBOL_NAME_RE.fullmatch(args[0].value)
                or "__" in args[0].value
            ):
                raise UnsafeExpressionError("unsupported symbol name")
            self._count()
            return
        if not 1 <= len(args) <= 2:
            raise UnsafeExpressionError(f"{name} expects one or two numeric arguments")
        for arg in args:
            self._check_numeric_literal(arg)

    def _check_numeric_literal(self, node: ast.expr) -> None:
        self._count()
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
            self._check_numeric_literal(node.operand)
            return
        if isinstance(node, ast.Constant):
            value = node.value
            if isinstance(value, bool):
                raise UnsafeExpressionError("only numeric constants are supported")
            if isinstance(value, (int, float)):
                return
            if isinstance(value, str) and _NUMBER_TEXT_RE.fullmatch(value):
                return
            raise UnsafeExpressionError("only numeric constants are supported")
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id in {"Integer", "Rational", "Float"}
        ):
            self._check_constructor(node.func.id, node.args)
            return
        raise UnsafeExpressionError("only numeric constants are supported")


def parse_number(value: int | float | str) -> sp.Expr:
    """Turn a numeric literal from a ProblemSpec into a SymPy number without ``eval``.

    Spec fields such as ``point``/``lower``/``upper`` or matrix entries may be
    strings (regex captures, or free-form agent input); only plain decimal,
    scientific and ``p/q`` forms are accepted.
    """
    if isinstance(value, bool):
        raise UnsafeExpressionError("boolean is not a number")
    if isinstance(value, int):
        return sp.Integer(value)
    if isinstance(value, float):
        return sp.Float(value)
    if not isinstance(value, str):
        raise UnsafeExpressionError(f"unsupported numeric literal type: {type(value).__name__}")
    text = value.strip()
    fraction = _FRACTION_TEXT_RE.fullmatch(text)
    if fraction is not None:
        return sp.Rational(int(fraction.group("num")), int(fraction.group("den")))
    if not _NUMBER_TEXT_RE.fullmatch(text):
        raise UnsafeExpressionError(f"unsupported numeric literal: {value!r}")
    if any(marker in text for marker in (".", "e", "E")):
        return sp.Float(text)
    return sp.Integer(int(text))


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
    if not source.strip() or len(source) > _MAX_SOURCE_CHARS:
        raise UnsafeExpressionError("expression is empty or too long")
    # A fresh namespace per parse: ``eval`` writes ``__builtins__`` into its
    # globals, and the empty override keeps builtins out of reach even if the
    # guard were ever bypassed.
    global_dict: dict[str, Any] = {**_NAMESPACE, "__builtins__": {}}
    local_dict: dict[str, Any] = {}
    try:
        code = stringify_expr(source, local_dict, global_dict, _TRANSFORMATIONS)
        tree = ast.parse(code, mode="eval")
    except (TokenError, SyntaxError, ValueError) as exc:
        raise UnsafeExpressionError(f"cannot parse expression: {source!r}") from exc
    _AlgebraGuard().visit(tree)
    try:
        expr = eval_expr(code, local_dict, global_dict)
    except (TypeError, ValueError, ZeroDivisionError, AttributeError, sp.SympifyError) as exc:
        raise UnsafeExpressionError(f"cannot evaluate expression: {source!r}") from exc
    if not isinstance(expr, sp.Expr):
        raise UnsafeExpressionError("expression did not produce a SymPy expression")
    return expr


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
