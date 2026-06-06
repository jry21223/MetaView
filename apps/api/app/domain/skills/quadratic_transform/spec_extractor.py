from __future__ import annotations

import re

from app.domain.skills.quadratic_transform.problem_spec import (
    QuadraticTransformProblemSpec,
    build_quadratic_expression,
    build_quadratic_latex,
)

_NUMBER = r"(?:\d+(?:\.\d*)?|\.\d+)"
_EQUATION_RE = re.compile(r"(?:y|f\(x\))=(?P<rhs>[0-9x+\-*/().^]+)")
_VERTEX_QUADRATIC_RE = re.compile(
    rf"^(?P<a>[+-]?(?:{_NUMBER})?)\*?"
    rf"(?:\((?P<inner_paren>x(?P<shift_paren>[+-]{_NUMBER})?)\)"
    rf"|(?P<inner_plain>x))"
    rf"\^2(?P<k>[+-]{_NUMBER})?$"
)
_NEGATIVE_INTENT_KEYWORDS = (
    "求导",
    "导数",
    "积分",
    "极限",
    "切线",
    "斜率",
    "解方程",
    "零点",
)


def try_extract_quadratic_transform(prompt: str) -> QuadraticTransformProblemSpec | None:
    normalized = _normalize(prompt)
    if not normalized or any(keyword in normalized for keyword in _NEGATIVE_INTENT_KEYWORDS):
        return None

    rhs = _extract_rhs(normalized)
    if rhs is None:
        return None
    return _extract_vertex_quadratic(rhs, prompt)


def _normalize(prompt: str) -> str:
    replacements = {
        " ": "",
        "\t": "",
        "\n": "",
        "（": "(",
        "）": ")",
        "＝": "=",
        "＋": "+",
        "－": "-",
        "−": "-",
        "﹣": "-",
        "＊": "*",
        "×": "*",
        "＾": "^",
        "²": "^2",
        "**": "^",
        "X": "x",
    }
    out = prompt.strip()
    for old, new in replacements.items():
        out = out.replace(old, new)
    return out


def _extract_rhs(normalized: str) -> str | None:
    match = _EQUATION_RE.search(normalized)
    if match is None:
        return None
    return match.group("rhs").strip()


def _extract_vertex_quadratic(
    rhs: str,
    prompt: str,
) -> QuadraticTransformProblemSpec | None:
    match = _VERTEX_QUADRATIC_RE.match(rhs)
    if match is None:
        return None

    a = _parse_coefficient(match.group("a"))
    h = _parse_shift(match.group("shift_paren"))
    k = _parse_signed_number(match.group("k"))
    target_expression = build_quadratic_expression(a, h, k)
    x_min = min(-6.0, h - 4.0)
    x_max = max(6.0, h + 4.0)

    return QuadraticTransformProblemSpec(
        original_prompt=prompt,
        a=a,
        h=h,
        k=k,
        target_expression=target_expression,
        target_latex=build_quadratic_latex(a, h, k),
        x_min=x_min,
        x_max=x_max,
    )


def _parse_coefficient(raw: str | None) -> float:
    if raw in (None, "", "+"):
        return 1.0
    if raw == "-":
        return -1.0
    return float(raw)


def _parse_shift(raw: str | None) -> float:
    if not raw:
        return 0.0
    return -float(raw)


def _parse_signed_number(raw: str | None) -> float:
    if not raw:
        return 0.0
    return float(raw)
