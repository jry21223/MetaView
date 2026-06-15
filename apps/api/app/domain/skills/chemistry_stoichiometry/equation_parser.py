from __future__ import annotations

import math
import re
from collections import Counter
from functools import reduce

import sympy as sp

from app.domain.skills.chemistry_stoichiometry.chemistry_constants import ATOMIC_WEIGHTS

_FORMULA_RE = re.compile(r"^[A-Z][A-Za-z0-9()]*$")
_TOKEN_RE = re.compile(r"([A-Z][a-z]?|\(|\)|\d+)")


def parse_formula(formula: str) -> dict[str, int]:
    if not _FORMULA_RE.match(formula):
        raise ValueError(f"unsupported_formula:{formula}")
    stack: list[Counter[str]] = [Counter()]
    tokens = _TOKEN_RE.findall(formula)
    if "".join(tokens) != formula:
        raise ValueError(f"unsupported_formula:{formula}")
    index = 0
    while index < len(tokens):
        token = tokens[index]
        if token == "(":
            if len(stack) > 1:
                raise ValueError("nested_parentheses_not_supported")
            stack.append(Counter())
            index += 1
        elif token == ")":
            if len(stack) == 1:
                raise ValueError("unmatched_parenthesis")
            group = stack.pop()
            multiplier = 1
            if index + 1 < len(tokens) and tokens[index + 1].isdigit():
                multiplier = int(tokens[index + 1])
                index += 1
            for element, count in group.items():
                stack[-1][element] += count * multiplier
            index += 1
        elif token.isdigit():
            raise ValueError("unexpected_subscript")
        else:
            if token not in ATOMIC_WEIGHTS:
                raise ValueError(f"unsupported_element:{token}")
            count = 1
            if index + 1 < len(tokens) and tokens[index + 1].isdigit():
                count = int(tokens[index + 1])
                index += 1
            stack[-1][token] += count
            index += 1
    if len(stack) != 1:
        raise ValueError("unmatched_parenthesis")
    return dict(stack[0])


def molar_mass(formula: str) -> float:
    counts = parse_formula(formula)
    return sum(ATOMIC_WEIGHTS[element] * count for element, count in counts.items())


def parse_equation(equation: str) -> tuple[list[str], list[str]]:
    normalized = equation.replace("→", "->").replace("=", "->")
    if "->" not in normalized:
        raise ValueError("missing_reaction_arrow")
    left, right = normalized.split("->", 1)
    reactants = [_clean_compound(part) for part in left.split("+") if part.strip()]
    products = [_clean_compound(part) for part in right.split("+") if part.strip()]
    if not reactants or not products:
        raise ValueError("empty_reaction_side")
    for compound in [*reactants, *products]:
        parse_formula(compound)
    return reactants, products


def balance_equation(equation: str) -> tuple[list[int], list[str], list[str]]:
    reactants, products = parse_equation(equation)
    compounds = [*reactants, *products]
    elements = sorted({element for compound in compounds for element in parse_formula(compound)})
    rows: list[list[int]] = []
    for element in elements:
        row = []
        for compound in reactants:
            row.append(parse_formula(compound).get(element, 0))
        for compound in products:
            row.append(-parse_formula(compound).get(element, 0))
        rows.append(row)
    nullspace = sp.Matrix(rows).nullspace()
    if not nullspace:
        raise ValueError("equation_not_balanceable")
    vector = nullspace[0]
    lcm = sp.ilcm(*[term.q for term in vector])
    coefficients = [int(term * lcm) for term in vector]
    if all(coef < 0 for coef in coefficients):
        coefficients = [-coef for coef in coefficients]
    gcd = reduce(math.gcd, [abs(coef) for coef in coefficients])
    coefficients = [coef // gcd for coef in coefficients]
    if any(coef <= 0 for coef in coefficients):
        raise ValueError("invalid_balance_coefficients")
    return coefficients, reactants, products


def format_balanced_equation(
    coefficients: list[int],
    reactants: list[str],
    products: list[str],
) -> str:
    left_count = len(reactants)
    left = _format_side(coefficients[:left_count], reactants)
    right = _format_side(coefficients[left_count:], products)
    return f"{left} -> {right}"


def _format_side(coefficients: list[int], compounds: list[str]) -> str:
    return " + ".join(
        f"{'' if coefficient == 1 else coefficient}{compound}"
        for coefficient, compound in zip(coefficients, compounds, strict=True)
    )


def _clean_compound(raw: str) -> str:
    return re.sub(r"^\d+", "", raw.strip())
