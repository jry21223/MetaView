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

import math
from dataclasses import dataclass
from typing import Final, Literal

import sympy as sp

_X, _Y, _T = sp.symbols("x y t", real=True)
_ALLOWED_FUNCS: Final[dict[str, sp.Function]] = {
    "sin": sp.sin,
    "cos": sp.cos,
    "tan": sp.tan,
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


def _parse(expr: str, symbol: sp.Symbol) -> sp.Expr | None:
    """Parse an expression string with whitelisted functions and a single
    declared variable. Returns ``None`` on parse error.
    """
    try:
        # ``sympify`` with ``locals=_ALLOWED_FUNCS`` blocks arbitrary attribute
        # access (no ``__import__`` / ``getattr`` here) while still resolving
        # the common math vocabulary the player expects.
        return sp.sympify(expr, locals={**_ALLOWED_FUNCS, str(symbol): symbol})
    except (sp.SympifyError, SyntaxError, TypeError, ValueError):
        return None


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

    samples = 64
    step = (t_max - t_min) / samples
    xs: list[float] = []
    ys: list[float] = []
    for i in range(samples + 1):
        ti = t_min + i * step
        try:
            xs.append(float(fx.subs(_T, ti)))
            ys.append(float(fy.subs(_T, ti)))
        except (TypeError, ValueError, AttributeError):
            # AttributeError covers ``sympify`` results that aren't proper
            # numeric expressions (e.g. parsed function calls that don't
            # implement subs cleanly); treat all parse-time / eval-time
            # failures as "error" rather than crashing.
            return OrientationResult("error", f"non-numeric value at t={ti}")

    # Geometric centre and cross-product accumulation
    cx = sum(xs) / len(xs)
    cy = sum(ys) / len(ys)
    signed_area = 0.0
    for i in range(samples):
        x0 = xs[i] - cx
        y0 = ys[i] - cy
        x1 = xs[i + 1] - cx
        y1 = ys[i + 1] - cy
        signed_area += x0 * y1 - x1 * y0
    # Static / degenerate threshold (tight; covers numerical zero noise).
    eps = 1e-6 * max(1.0, (max(xs) - min(xs)) * (max(ys) - min(ys)))
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

    def _scan(t_lo: float, t_hi: float, n: int) -> tuple[float, float]:
        """Return (best_t, best_distance) over a uniform sample of [t_lo, t_hi]."""
        local_best_t = t_lo
        local_best = math.inf
        if n <= 0:
            return local_best_t, local_best
        local_step = (t_hi - t_lo) / n if n > 0 else 0.0
        for i in range(n + 1):
            ti = t_lo + i * local_step
            try:
                xi = float(fx.subs(_T, ti))
                yi = float(fy.subs(_T, ti))
            except (TypeError, ValueError, AttributeError):
                continue
            d = math.hypot(xi - target_x, yi - target_y)
            if d < local_best:
                local_best = d
                local_best_t = ti
        return local_best_t, local_best

    # Coarse pass over the whole interval, then a fine-grained refinement
    # around the best coarse sample so we can clear sub-tolerance distances
    # without paying for thousands of sympy.subs() calls.
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

    samples = 64
    step = (x_max - x_min) / samples
    diffs: list[float] = []
    try:
        df = sp.diff(f, _X)
    except (sp.SympifyError, TypeError, ValueError):
        return MonotonicResult("error", "could not differentiate expression")
    for i in range(samples + 1):
        xi = x_min + i * step
        try:
            v = float(df.subs(_X, xi))
        except (TypeError, ValueError, AttributeError):
            continue
        diffs.append(v)

    if not diffs:
        return MonotonicResult("error", "no valid derivative samples")
    threshold = 1e-8
    pos = sum(1 for v in diffs if v > threshold)
    neg = sum(1 for v in diffs if v < -threshold)
    if pos and not neg:
        return MonotonicResult(
            "increasing", f"derivative positive on {pos}/{len(diffs)} samples"
        )
    if neg and not pos:
        return MonotonicResult(
            "decreasing", f"derivative negative on {neg}/{len(diffs)} samples"
        )
    if not pos and not neg:
        return MonotonicResult("constant", "derivative ~ 0 across the interval")
    return MonotonicResult(
        "mixed",
        f"derivative changes sign: {pos} positive, {neg} negative samples",
    )
