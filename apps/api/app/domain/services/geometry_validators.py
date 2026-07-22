"""Deterministic geometry checks the agent calls back during generation.

These functions are pure: they receive raw expression strings (the same
character set MathPlotRenderer accepts) plus numeric bounds, and return a
small dataclass with the verdict. They never raise on bad input — instead
they return ``"error"`` verdicts so the agent can decide what to do next.

The validators are exposed via ``apps/api/app/presentation/router_agent.py``
so the Node sidecar can POST to them; they are also unit-testable in
isolation here.
"""

from __future__ import annotations

import ast
import math
from dataclasses import dataclass
from typing import Any, Callable, Final, Literal

import numpy as np
import sympy as sp

_X, _Y, _T = sp.symbols("x y t", real=True)
_ALLOWED_FUNCS: Final[dict[str, Any]] = {
    "sin": sp.sin,
    "cos": sp.cos,
    "tan": sp.tan,
    "sinh": sp.sinh,
    "cosh": sp.cosh,
    "asin": sp.asin,
    "acos": sp.acos,
    "atan": sp.atan,
    "exp": sp.exp,
    "log": sp.log,
    "ln": sp.log,
    "sqrt": sp.sqrt,
    "cbrt": sp.cbrt,
    "abs": sp.Abs,
    "floor": sp.floor,
    "ceiling": sp.ceiling,
    "ceil": sp.ceiling,
    "Abs": sp.Abs,
    "pi": sp.pi,
    "e": sp.E,
}
_ALLOWED_CALLS: Final[frozenset[str]] = frozenset(
    name for name, value in _ALLOWED_FUNCS.items() if callable(value)
)
_ALLOWED_FUNCTIONS: Final[frozenset[Any]] = frozenset(
    value for value in _ALLOWED_FUNCS.values() if callable(value)
)
_MAX_EXPR_CHARS: Final = 512
_MAX_AST_NODES: Final = 80
_NUMPY_MODULES: Final[dict[str, Any]] = {
    "sin": np.sin,
    "cos": np.cos,
    "tan": np.tan,
    "sinh": np.sinh,
    "cosh": np.cosh,
    "asin": np.arcsin,
    "acos": np.arccos,
    "atan": np.arctan,
    "exp": np.exp,
    "log": np.log,
    "sqrt": np.sqrt,
    "cbrt": np.cbrt,
    "Abs": np.abs,
    "abs": np.abs,
    "floor": np.floor,
    "ceiling": np.ceil,
    "ceil": np.ceil,
}

OrientationVerdict = Literal["clockwise", "counterclockwise", "static", "error"]
MonotonicVerdict = Literal["increasing", "decreasing", "mixed", "constant", "error"]


@dataclass(frozen=True)
class OrientationResult:
    direction: OrientationVerdict
    reason: str


@dataclass(frozen=True)
class PointOnCurveResult:
    passes: bool
    closest_t: float | None
    distance: float | None
    reason: str


@dataclass(frozen=True)
class MonotonicResult:
    verdict: MonotonicVerdict
    reason: str


class _UnsafeExpression(ValueError):
    """Raised when an expression uses syntax outside the math-only subset."""


class _ExpressionGuard(ast.NodeVisitor):
    """Validate untrusted math expressions before handing them to SymPy.

    ``sympify``/``lambdify`` are not treated as a sandbox. The guard keeps the
    accepted language to numeric constants, one declared variable, arithmetic
    operators, and direct calls to whitelisted math functions. Attribute access,
    subscripting, comprehensions, strings, lambdas, and unknown names are
    rejected before SymPy sees the text.
    """

    def __init__(self, symbol: sp.Symbol) -> None:
        self._allowed_names = frozenset((*_ALLOWED_FUNCS.keys(), str(symbol)))
        self._node_count = 0

    def generic_visit(self, node: ast.AST) -> None:
        self._node_count += 1
        if self._node_count > _MAX_AST_NODES:
            raise _UnsafeExpression("expression is too complex")
        allowed_nodes = (
            ast.Expression,
            ast.BinOp,
            ast.UnaryOp,
            ast.Call,
            ast.Name,
            ast.Load,
            ast.Constant,
            ast.Add,
            ast.Sub,
            ast.Mult,
            ast.Div,
            ast.Pow,
            ast.USub,
            ast.UAdd,
        )
        if not isinstance(node, allowed_nodes):
            raise _UnsafeExpression(f"unsupported syntax: {node.__class__.__name__}")
        super().generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:
        self._node_count += 1
        if self._node_count > _MAX_AST_NODES:
            raise _UnsafeExpression("expression is too complex")
        if not isinstance(node.func, ast.Name) or node.func.id not in _ALLOWED_CALLS:
            raise _UnsafeExpression("only whitelisted math functions may be called")
        if node.keywords:
            raise _UnsafeExpression("keyword arguments are not supported")
        for arg in node.args:
            self.visit(arg)

    def visit_Name(self, node: ast.Name) -> None:
        self._node_count += 1
        if self._node_count > _MAX_AST_NODES:
            raise _UnsafeExpression("expression is too complex")
        if node.id not in self._allowed_names:
            raise _UnsafeExpression(f"unknown name: {node.id}")

    def visit_Constant(self, node: ast.Constant) -> None:
        self._node_count += 1
        if self._node_count > _MAX_AST_NODES:
            raise _UnsafeExpression("expression is too complex")
        if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
            raise _UnsafeExpression("only numeric constants are supported")


def _normalize_expression(expr: str) -> str:
    # Users and LLMs often write ``x^2`` for exponentiation. Convert it before
    # Python AST validation so the renderer-compatible notation still works.
    return expr.replace("^", "**")


def _validate_expression(expr: str, symbol: sp.Symbol) -> str:
    normalized = _normalize_expression(expr.strip())
    if not normalized or len(normalized) > _MAX_EXPR_CHARS:
        raise _UnsafeExpression("expression is empty or too long")
    tree = ast.parse(normalized, mode="eval")
    _ExpressionGuard(symbol).visit(tree)
    return normalized


def _uses_only_allowed_functions(expr: sp.Expr) -> bool:
    return all(func.func in _ALLOWED_FUNCTIONS for func in expr.atoms(sp.Function))


def _parse(expr: str, symbol: sp.Symbol) -> sp.Expr | None:
    """Parse an expression string with whitelisted math syntax.

    Returns ``None`` on parse error or when the expression escapes the supported
    subset. This is a pre-validation layer around SymPy, not a general-purpose
    code execution sandbox.
    """
    try:
        normalized = _validate_expression(expr, symbol)
        parsed = sp.sympify(normalized, locals={**_ALLOWED_FUNCS, str(symbol): symbol})
    except (SyntaxError, TypeError, ValueError, sp.SympifyError):
        return None
    if not isinstance(parsed, sp.Expr):
        return None
    if parsed.free_symbols - {symbol}:
        return None
    if not _uses_only_allowed_functions(parsed):
        return None
    if parsed.has(sp.zoo, sp.oo, -sp.oo, sp.nan):
        return None
    return parsed


def _compile(expr: sp.Expr, symbol: sp.Symbol) -> Callable[[np.ndarray], np.ndarray] | None:
    """Lambdify a validated sympy expression to a numpy-vectorized callable."""
    try:
        fn = sp.lambdify(symbol, expr, modules=[_NUMPY_MODULES])
    except (TypeError, ValueError, AttributeError, SyntaxError):
        return None
    return fn


def _safe_eval(fn: Callable[[np.ndarray], np.ndarray], samples: np.ndarray) -> np.ndarray | None:
    """Evaluate a lambdified expression at the sample grid. Constant
    expressions yield a Python scalar — broadcast it to the sample shape so
    the caller always gets a 1-D array of finite floats (or ``None`` on
    error)."""
    try:
        out = fn(samples)
    except (TypeError, ValueError, AttributeError, ZeroDivisionError):
        return None
    arr = np.asarray(out, dtype=float)
    if arr.ndim == 0:
        arr = np.full_like(samples, float(arr))
    if not np.all(np.isfinite(arr)):
        return None
    return arr


def check_orientation(
    expression_x: str,
    expression_y: str,
    t_min: float,
    t_max: float,
) -> OrientationResult:
    """Decide whether a parametric curve ``(f(t), g(t))`` traces clockwise or
    counterclockwise on the interval ``[t_min, t_max]``.

    The verdict comes from the sign of the cross product
    ``(x - x_c) * y' - (y - y_c) * x'`` integrated over the interval, where
    ``(x_c, y_c)`` is the geometric centre. Positive → counterclockwise (CCW),
    negative → clockwise (CW), near-zero → static / degenerate.
    """
    fx = _parse(expression_x, _T)
    fy = _parse(expression_y, _T)
    if fx is None or fy is None:
        return OrientationResult("error", "could not parse expression")
    if t_max <= t_min:
        return OrientationResult("error", "t_max must be > t_min")

    cx_fn = _compile(fx, _T)
    cy_fn = _compile(fy, _T)
    if cx_fn is None or cy_fn is None:
        return OrientationResult("error", "could not compile expression")

    samples = 64
    ts = np.linspace(t_min, t_max, samples + 1)
    xs = _safe_eval(cx_fn, ts)
    ys = _safe_eval(cy_fn, ts)
    if xs is None or ys is None:
        return OrientationResult("error", "expression produced non-finite samples")

    cx = float(xs.mean())
    cy = float(ys.mean())
    dx = xs - cx
    dy = ys - cy
    # Signed-area accumulator: Σ (dx[i] * dy[i+1] − dx[i+1] * dy[i]).
    signed_area = float(np.sum(dx[:-1] * dy[1:] - dx[1:] * dy[:-1]))
    eps = 1e-6 * max(1.0, (xs.max() - xs.min()) * (ys.max() - ys.min()))
    if abs(signed_area) < eps:
        return OrientationResult(
            "static",
            "curve does not enclose signed area — degenerate or back-and-forth",
        )
    if signed_area > 0:
        return OrientationResult(
            "counterclockwise",
            f"signed area = {signed_area:.4f} > 0 (CCW)",
        )
    return OrientationResult(
        "clockwise",
        f"signed area = {signed_area:.4f} < 0 (CW)",
    )


def check_point_on_curve(
    expression_x: str,
    expression_y: str,
    t_min: float,
    t_max: float,
    target_x: float,
    target_y: float,
    tol: float = 1e-2,
) -> PointOnCurveResult:
    """Numerically test whether ``(target_x, target_y)`` lies on the parametric
    curve over ``[t_min, t_max]`` within ``tol`` Euclidean distance.
    """
    fx = _parse(expression_x, _T)
    fy = _parse(expression_y, _T)
    if fx is None or fy is None:
        return PointOnCurveResult(False, None, None, "could not parse expression")
    if t_max <= t_min:
        return PointOnCurveResult(False, None, None, "t_max must be > t_min")

    cx_fn = _compile(fx, _T)
    cy_fn = _compile(fy, _T)
    if cx_fn is None or cy_fn is None:
        return PointOnCurveResult(False, None, None, "could not compile expression")

    def _scan(t_lo: float, t_hi: float, n: int) -> tuple[float, float]:
        """Return (best_t, best_distance) over a uniform sample of [t_lo, t_hi]."""
        if n <= 0 or t_hi <= t_lo:
            return t_lo, math.inf
        ts = np.linspace(t_lo, t_hi, n + 1)
        xs = _safe_eval(cx_fn, ts)
        ys = _safe_eval(cy_fn, ts)
        if xs is None or ys is None:
            return t_lo, math.inf
        dists = np.hypot(xs - target_x, ys - target_y)
        best_idx = int(dists.argmin())
        return float(ts[best_idx]), float(dists[best_idx])

    # Coarse pass over the whole interval, then a fine-grained refinement
    # around the best coarse sample so we can clear sub-tolerance distances
    # without paying for thousands of evaluations.
    coarse_samples = 128
    best_t, best_dist = _scan(t_min, t_max, coarse_samples)
    if best_dist == math.inf:
        return PointOnCurveResult(False, None, None, "no valid samples produced")

    coarse_step = (t_max - t_min) / coarse_samples
    fine_t, fine_dist = _scan(
        max(t_min, best_t - coarse_step),
        min(t_max, best_t + coarse_step),
        n=64,
    )
    if fine_dist < best_dist:
        best_t, best_dist = fine_t, fine_dist
    return PointOnCurveResult(
        passes=best_dist <= tol,
        closest_t=best_t,
        distance=best_dist,
        reason=f"closest sample t={best_t:.4f}, distance={best_dist:.4g}, tol={tol}",
    )


def check_monotonic(
    expression: str,
    x_min: float,
    x_max: float,
) -> MonotonicResult:
    """Decide whether a 1-D function ``y = f(x)`` is increasing, decreasing,
    mixed, or constant over ``[x_min, x_max]``.
    """
    f = _parse(expression, _X)
    if f is None:
        return MonotonicResult("error", "could not parse expression")
    if x_max <= x_min:
        return MonotonicResult("error", "x_max must be > x_min")

    try:
        df = sp.diff(f, _X)
    except (sp.SympifyError, TypeError, ValueError):
        return MonotonicResult("error", "could not differentiate expression")

    df_fn = _compile(df, _X)
    if df_fn is None:
        return MonotonicResult("error", "could not compile derivative")

    samples = 64
    xs = np.linspace(x_min, x_max, samples + 1)
    diffs = _safe_eval(df_fn, xs)
    if diffs is None:
        return MonotonicResult("error", "no valid derivative samples")

    threshold = 1e-8
    pos = int(np.sum(diffs > threshold))
    neg = int(np.sum(diffs < -threshold))
    total = int(diffs.size)
    if pos and not neg:
        return MonotonicResult(
            "increasing", f"derivative positive on {pos}/{total} samples"
        )
    if neg and not pos:
        return MonotonicResult(
            "decreasing", f"derivative negative on {neg}/{total} samples"
        )
    if not pos and not neg:
        return MonotonicResult("constant", "derivative ~ 0 across the interval")
    return MonotonicResult(
        "mixed",
        f"derivative changes sign: {pos} positive, {neg} negative samples",
    )
