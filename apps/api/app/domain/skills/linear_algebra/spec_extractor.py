from __future__ import annotations

import ast
import re

from app.domain.skills.algebra_core import parse_equation_list, system_to_matrix
from app.domain.skills.algebra_core.normalization import normalize_math_text
from app.domain.skills.linear_algebra.problem_spec import LinearAlgebraProblemSpec

_MATRIX_START = "[["
_EIGEN_KEYWORDS = ("特征值", "eigen")
_RREF_KEYWORDS = ("rref", "行变换", "高斯", "消元")
_DET_RANK_KEYWORDS = ("行列式", "det", "秩", "rank")
_SYSTEM_KEYWORDS = ("方程组", "system")
_EQUATION_SEGMENT_RE = re.compile(r"[A-Za-z0-9_+\-*/().^]+=[A-Za-z0-9_+\-*/().^]+")


def try_extract_linear_algebra(prompt: str) -> LinearAlgebraProblemSpec | None:
    normalized = normalize_math_text(prompt)
    matrix = _extract_matrix(normalized)
    if matrix is not None:
        task = _task_from_prompt(normalized)
        return LinearAlgebraProblemSpec(
            original_prompt=prompt,
            task=task,
            matrix=matrix,
        )

    if any(keyword in normalized.lower() for keyword in _SYSTEM_KEYWORDS) or _looks_like_system(
        normalized
    ):
        try:
            segments = _extract_equation_segments(normalized)
            system = parse_equation_list(";".join(segments) if segments else normalized)
            matrix_sym, rhs_sym, variables = system_to_matrix(system)
        except Exception:  # noqa: BLE001
            return None
        if len(system.equations) < 2:
            return None
        return LinearAlgebraProblemSpec(
            original_prompt=prompt,
            task="solve_system",
            matrix=_matrix_to_json(matrix_sym),
            rhs=[_cell(value) for value in list(rhs_sym)],
            variable_names=variables,
        )
    return None


def _task_from_prompt(prompt: str) -> str:
    lower = prompt.lower()
    if any(keyword in lower for keyword in _EIGEN_KEYWORDS):
        return "eigen_basic"
    if any(keyword in lower for keyword in _DET_RANK_KEYWORDS):
        return "det_rank"
    if any(keyword in lower for keyword in _RREF_KEYWORDS):
        return "rref"
    return "rref"


def _extract_matrix(text: str) -> list[list[float | int | str]] | None:
    start = text.find(_MATRIX_START)
    if start < 0:
        return None
    depth = 0
    end = None
    for index, char in enumerate(text[start:], start=start):
        if char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                end = index + 1
                break
    if end is None:
        return None
    try:
        value = ast.literal_eval(text[start:end])
    except Exception:  # noqa: BLE001
        return None
    if not isinstance(value, list) or not all(isinstance(row, list) for row in value):
        return None
    return [[_cell(cell) for cell in row] for row in value]


def _looks_like_system(text: str) -> bool:
    return len(re.findall(r"=", text)) >= 2 and ("," in text or ";" in text)


def _extract_equation_segments(text: str) -> list[str]:
    return _EQUATION_SEGMENT_RE.findall(text.replace(" ", ""))


def _matrix_to_json(matrix) -> list[list[float | int | str]]:  # noqa: ANN001
    return [[_cell(value) for value in row] for row in matrix.tolist()]


def _cell(value) -> float | int | str:  # noqa: ANN001
    try:
        if getattr(value, "is_Integer", False):
            return int(value)
        if getattr(value, "is_Rational", False):
            return str(value)
        number = float(value)
        if number.is_integer():
            return int(number)
        return number
    except Exception:  # noqa: BLE001
        return str(value)
