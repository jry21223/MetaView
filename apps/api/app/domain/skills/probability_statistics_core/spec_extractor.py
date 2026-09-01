from __future__ import annotations

import ast
import re
from decimal import Decimal, InvalidOperation

from app.domain.skills.probability_statistics_core.problem_spec import (
    ProbabilityStatisticsProblemSpec,
)

_NUMBER = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)"
_UNSUPPORTED_TERMS = (
    "回归",
    "regression",
    "假设检验",
    "hypothesis",
    "t检验",
    "卡方",
    "泊松",
    "poisson",
    "指数分布",
)


def try_extract_probability_statistics(prompt: str) -> ProbabilityStatisticsProblemSpec | None:
    text = _normalize(prompt)
    spec = (
        _extract_binomial(text)
        or _extract_normal(text)
        or _extract_union(text)
        or _extract_conditional(text)
        or _extract_contingency(text)
        or _extract_descriptive(text)
    )
    if spec is None:
        return None
    unsupported = [term for term in _UNSUPPORTED_TERMS if term.lower() in text.lower()]
    if unsupported:
        spec.assumptions.append("unsupported:" + ",".join(unsupported))
    return spec


def _normalize(prompt: str) -> str:
    return (
        prompt.replace("（", "(")
        .replace("）", ")")
        .replace("，", ",")
        .replace("。", "")
        .replace("μ", "mu")
        .replace("σ", "sigma")
        .replace("∩", "∩")
        .replace("∪", "∪")
        .replace("≤", "<=")
    )


def _extract_descriptive(text: str) -> ProbabilityStatisticsProblemSpec | None:
    data = _extract_list(text)
    if not data:
        return None
    query: list[str] = []
    lower = text.lower()
    for needle, key in (
        ("均值", "mean"),
        ("平均", "mean"),
        ("mean", "mean"),
        ("中位数", "median"),
        ("median", "median"),
        ("众数", "mode"),
        ("mode", "mode"),
        ("极差", "range"),
        ("方差", "variance"),
        ("variance", "variance"),
        ("标准差", "std"),
    ):
        if (needle in text or needle in lower) and key not in query:
            query.append(key)
    # A bare number list is not a statistics request: without at least one
    # descriptive-statistics keyword this extractor must not claim the prompt
    # (an eigenvalue prompt like "求 A=[[1,2],[3,4]] 的特征值" also contains a
    # bracketed number list). See issue #282.
    if not query:
        return None
    scope = "population" if "总体" in text else "sample" if "样本" in text else None
    assumptions: list[str] = []
    if scope is None and {"variance", "std"} & set(query):
        assumptions.append("unsupported:ambiguous_sample_population_variance")
    return ProbabilityStatisticsProblemSpec(
        kind="descriptive_statistics",
        data=data,
        scope=scope,
        query=query,
        assumptions=assumptions,
    )


def _extract_union(text: str) -> ProbabilityStatisticsProblemSpec | None:
    if "∪" not in text and "union" not in text.lower():
        return None
    pa = _probability(text, "A")
    pb = _probability(text, "B")
    pab = _intersection_probability(text)
    if pa is None or pb is None or pab is None:
        return None
    return ProbabilityStatisticsProblemSpec(
        kind="probability_union",
        parameters={"P(A)": pa, "P(B)": pb, "P(A∩B)": pab},
        query=["P(A∪B)"],
    )


def _extract_conditional(text: str) -> ProbabilityStatisticsProblemSpec | None:
    if "|" not in text and "条件" not in text:
        return None
    pab = _intersection_probability(text)
    pb = _probability(text, "B")
    if pab is None or pb is None:
        return None
    return ProbabilityStatisticsProblemSpec(
        kind="conditional_probability",
        parameters={"P(A∩B)": pab, "P(B)": pb},
        query=["P(A|B)"],
    )


def _extract_contingency(text: str) -> ProbabilityStatisticsProblemSpec | None:
    if "列联" not in text and "contingency" not in text.lower():
        return None
    match = re.search(r"(\[\s*\[.*?\]\s*\])", text)
    if match is None:
        return None
    try:
        raw_table = ast.literal_eval(match.group(1))
    except (SyntaxError, ValueError):
        return None
    if not isinstance(raw_table, list) or not raw_table:
        return None
    table: list[list[Decimal]] = []
    for row in raw_table:
        if not isinstance(row, list) or not row:
            return None
        try:
            table.append([Decimal(str(value)) for value in row])
        except (InvalidOperation, ValueError):
            return None
    return ProbabilityStatisticsProblemSpec(
        kind="contingency_table",
        table=table,
        query=["row_totals", "column_totals"],
    )


def _extract_binomial(text: str) -> ProbabilityStatisticsProblemSpec | None:
    if "二项" not in text and "binomial" not in text.lower():
        return None
    n = _named_number(text, "n")
    p = _named_number(text, "p")
    k = _named_number(text, "k")
    if n is None or p is None or k is None:
        return None
    return ProbabilityStatisticsProblemSpec(
        kind="binomial_probability",
        parameters={"n": n, "p": p, "k": k},
        query=["P(X=k)"],
        assumptions=["independent_trials", "constant_success_probability"],
    )


def _extract_normal(text: str) -> ProbabilityStatisticsProblemSpec | None:
    if "正态" not in text and "z-score" not in text.lower() and "z score" not in text.lower():
        return None
    x = _named_number(text, "x")
    mu = _named_number(text, "mu")
    sigma = _named_number(text, "sigma")
    if x is None or mu is None or sigma is None:
        return None
    return ProbabilityStatisticsProblemSpec(
        kind="z_score_normal_cdf",
        parameters={"x": x, "mu": mu, "sigma": sigma},
        query=["z", "Φ(z)"],
    )


def _extract_list(text: str) -> list[Decimal]:
    match = re.search(r"\[(?P<body>[^\]]+)\]", text)
    if match is None:
        return []
    values = re.findall(_NUMBER, match.group("body"))
    return [Decimal(value) for value in values]


def _probability(text: str, label: str) -> Decimal | None:
    match = re.search(rf"P\s*\(\s*{label}\s*\)\s*=\s*(?P<value>{_NUMBER})", text)
    if match:
        return Decimal(match.group("value"))
    return None


def _intersection_probability(text: str) -> Decimal | None:
    match = re.search(
        rf"P\s*\(\s*A\s*(?:∩|&|and)\s*B\s*\)\s*=\s*(?P<value>{_NUMBER})",
        text,
        flags=re.IGNORECASE,
    )
    if match:
        return Decimal(match.group("value"))
    return None


def _named_number(text: str, name: str) -> Decimal | None:
    match = re.search(rf"{name}\s*=\s*(?P<value>{_NUMBER})", text, flags=re.IGNORECASE)
    if match:
        return Decimal(match.group("value"))
    return None
