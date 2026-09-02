from __future__ import annotations

import pytest
import sympy as sp
import sympy.parsing.sympy_parser as sympy_parser

from app.domain.skills.algebra_core import (
    UnsafeExpressionError,
    parse_equation,
    parse_expression,
    parse_number,
)
from app.domain.skills.algebra_core import parser as algebra_parser
from app.domain.skills.base import SkillRouteInput
from app.domain.skills.calculus_core.playbook_adapter import build_calculus_core_playbook
from app.domain.skills.calculus_core.spec_extractor import try_extract_calculus_core
from app.domain.skills.elementary_algebra.spec_extractor import try_extract_elementary_algebra
from app.domain.skills.linear_algebra.playbook_adapter import build_linear_algebra_playbook
from app.domain.skills.linear_algebra.skill_pack import LinearAlgebraSkillPack

# ``parse_expr`` is ``eval`` over transformed source. The text that reaches it
# comes from user prompts (routing runs before any auth in the self edition)
# and from agent tool calls with a free-form ``problem_spec``. The guard must
# reject anything outside plain algebra *before* ``eval`` — the same posture
# ``geometry_validators`` already takes (``test_rejects_attribute_access``).

_X, _Y, _R = sp.symbols("x y r")

_HOSTILE_SOURCES = [
    "x.__class__.__name__",
    "(1).__class__.__base__.__subclasses__()",
    "x.__class__.__init__.__globals__",
    "__import__('os').system('id')",
    "sin.__globals__",
    "N(x)",
    "Lambda(x, x)",
    "lambda: 1",
    "x[0]",
    "[x]",
    "x if 1 else 2",
    "open('/etc/passwd')",
    "sin",  # a bare function object is not an expression
]


@pytest.fixture
def eval_tap(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Record every code string the algebra parser hands to ``eval``."""
    calls: list[str] = []
    original = algebra_parser.eval_expr

    def tap(code: str, local_dict: dict, global_dict: dict):
        calls.append(code)
        return original(code, local_dict, global_dict)

    monkeypatch.setattr(algebra_parser, "eval_expr", tap)
    return calls


@pytest.fixture
def sympy_eval_tap(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Record ``eval`` calls made by SymPy itself (``sympify`` on strings)."""
    calls: list[str] = []
    original = sympy_parser.eval_expr

    def tap(code: str, local_dict: dict, global_dict: dict):
        calls.append(code)
        return original(code, local_dict, global_dict)

    monkeypatch.setattr(sympy_parser, "eval_expr", tap)
    return calls


@pytest.mark.parametrize("source", _HOSTILE_SOURCES)
def test_hostile_source_is_rejected_before_eval(source: str, eval_tap: list[str]) -> None:
    with pytest.raises(UnsafeExpressionError):
        parse_expression(source)
    assert eval_tap == []


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("2x+3", 2 * _X + 3),
        ("x^2-5x+6", _X**2 - 5 * _X + 6),
        ("sin(x)*2", 2 * sp.sin(_X)),
        ("0.5x", sp.Float("0.5") * _X),
        ("3/4", sp.Rational(3, 4)),
        ("sqrt(2)+pi*r^2", sp.sqrt(2) + sp.pi * _R**2),
        ("5!", sp.Integer(120)),
        ("2x+3y", 2 * _X + 3 * _Y),
        ("-x+1", 1 - _X),
        ("abs(x)", sp.Abs(_X)),
        ("(x+1)(x-1)", (_X + 1) * (_X - 1)),
        ("ln(x)/x", sp.log(_X) / _X),
    ],
)
def test_benign_algebra_still_parses(source: str, expected: sp.Expr, eval_tap: list[str]) -> None:
    expr, parsed = parse_expression(source)
    assert sp.simplify(expr - expected) == 0
    assert parsed.source
    assert len(eval_tap) == 1


def test_sympy_globals_are_plain_symbols_now(eval_tap: list[str]) -> None:
    # ``from sympy import *`` used to leak the singleton registry, infinity,
    # the numeric evaluator and friends into user text; only pi and E stay
    # special. Unknown multi-letter names get SymPy's usual implicit split.
    assert parse_expression("S")[0] == sp.Symbol("S")
    assert parse_expression("oo")[0] == sp.Symbol("o") ** 2
    assert parse_expression("E+1")[0] == sp.E + 1


def test_sympy_callables_outside_the_allowlist_are_never_invoked(eval_tap: list[str]) -> None:
    # ``preview`` shells out to LaTeX; under the restricted namespace it is not
    # a callable any more, just letters multiplied together like ``2ab``.
    expr, _ = parse_expression("preview(x)")
    assert expr.is_Mul
    assert sp.Symbol("x") in expr.free_symbols
    assert all("preview" not in code for code in eval_tap)


def test_equation_with_attribute_chain_is_rejected(eval_tap: list[str]) -> None:
    with pytest.raises(ValueError):
        parse_equation("x.__class__.__name__=1")
    assert eval_tap == []


def test_elementary_algebra_prompt_never_reaches_eval(eval_tap: list[str]) -> None:
    # The routing path: heuristic_match -> extractor -> parse_equation.
    assert try_extract_elementary_algebra("解方程 x.__class__.__name__=1") is None
    assert eval_tap == []
    assert try_extract_elementary_algebra("解方程 2x+3=11") is not None


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (2, sp.Integer(2)),
        (1.5, sp.Float(1.5)),
        ("1.5", sp.Float("1.5")),
        ("-3", sp.Integer(-3)),
        ("1/2", sp.Rational(1, 2)),
        ("2e3", sp.Float("2e3")),
    ],
)
def test_parse_number_accepts_numeric_literals(value: object, expected: sp.Expr) -> None:
    assert parse_number(value) == expected  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "value",
    ["x.__class__", "__import__('os')", "1+1", "", "nan", "pi", True, None],
)
def test_parse_number_rejects_anything_but_literals(value: object) -> None:
    with pytest.raises(ValueError):
        parse_number(value)  # type: ignore[arg-type]


def test_calculus_spec_numeric_fields_are_not_evaluated(eval_tap: list[str]) -> None:
    spec = try_extract_calculus_core("求 lim_{x->0} sin(x)/x")
    assert spec is not None
    # An agent-supplied spec skips the regex that produced ``point``.
    hostile = spec.model_copy(update={"point": "__import__('os').system('id')"})
    with pytest.raises(ValueError):
        build_calculus_core_playbook("guard", hostile)
    assert all("__import__" not in code for code in eval_tap)


def test_linear_algebra_matrix_entries_are_not_sympified(sympy_eval_tap: list[str]) -> None:
    skill = LinearAlgebraSkillPack()
    match = skill.heuristic_match(SkillRouteInput(prompt="求 A=[[1,2],[3,4]] 的特征值"))
    assert match is not None
    spec = skill.validate_problem_spec(match.problem_spec or {})
    assert spec is not None
    hostile = spec.model_copy(update={"matrix": [["__import__('os').system('id')", 2], [3, 4]]})
    with pytest.raises(ValueError):
        build_linear_algebra_playbook("guard", hostile)
    assert all("__import__" not in code for code in sympy_eval_tap)
