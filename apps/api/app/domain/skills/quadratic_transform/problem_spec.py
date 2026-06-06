from __future__ import annotations

from pydantic import BaseModel


class QuadraticTransformProblemSpec(BaseModel):
    language: str = "zh-CN"
    original_prompt: str
    a: float = 1.0
    h: float = 0.0
    k: float = 0.0
    target_expression: str
    target_latex: str
    x_min: float = -6.0
    x_max: float = 6.0


def format_number(value: float) -> str:
    if value == 0:
        return "0"
    if float(value).is_integer():
        return str(int(value))
    return f"{value:.6g}"


def build_quadratic_expression(a: float, h: float, k: float) -> str:
    body = _quadratic_body(h)
    prefix = _coefficient_prefix(a)
    expr = f"{prefix}{body}"
    if k > 0:
        expr += f"+{format_number(k)}"
    elif k < 0:
        expr += f"-{format_number(abs(k))}"
    return expr


def build_quadratic_latex(a: float, h: float, k: float) -> str:
    body = _quadratic_body(h, latex=True)
    if a == 1:
        expr = body
    elif a == -1:
        expr = f"-{body}"
    else:
        expr = f"{format_number(a)}{body}"
    if k > 0:
        expr += f" + {format_number(k)}"
    elif k < 0:
        expr += f" - {format_number(abs(k))}"
    return f"y = {expr}"


def _quadratic_body(h: float, *, latex: bool = False) -> str:
    exponent = "^{2}" if latex else "^2"
    if h == 0:
        return f"x{exponent}"
    sign = "-" if h > 0 else "+"
    return f"(x{sign}{format_number(abs(h))}){exponent}"


def _coefficient_prefix(a: float) -> str:
    if a == 1:
        return ""
    if a == -1:
        return "-"
    return f"{format_number(a)}*"
