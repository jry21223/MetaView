from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.domain.services.safe_math_expr import (
    SafeMathExpressionError,
    compile_safe_math_expression,
)

_CONTRACT_PATH = (
    Path(__file__).resolve().parents[3]
    / "eval"
    / "fixtures"
    / "interaction_math_expr_contract.json"
)


def test_safe_math_expression_matches_the_frontend_contract() -> None:
    cases = json.loads(_CONTRACT_PATH.read_text(encoding="utf-8"))
    for case in cases:
        scope = {**case["params"], "x": case["x"]}
        result = compile_safe_math_expression(case["expression"])(scope)
        assert result == pytest.approx(case["expected"], rel=1e-12, abs=1e-12)


@pytest.mark.parametrize(
    "source",
    [
        "__import__('os').system('id')",
        "lambda x: x",
        "2x",
        "unknown_fn(x)",
        "x" * 513,
        "(" * 40 + "x" + ")" * 40,
        "+".join(["x"] * 140),
    ],
)
def test_safe_math_expression_rejects_code_and_excessive_complexity(source: str) -> None:
    with pytest.raises(SafeMathExpressionError):
        compile_safe_math_expression(source)


def test_safe_math_expression_rejects_unknown_variables_at_evaluation() -> None:
    expression = compile_safe_math_expression("x + missing")
    with pytest.raises(SafeMathExpressionError, match="Unknown variable"):
        expression({"x": 1})
