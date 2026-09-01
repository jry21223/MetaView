from __future__ import annotations

import math
import statistics
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction

from app.domain.skills.probability_statistics_core.problem_spec import (
    ProbabilityStatisticsProblemSpec,
)


@dataclass(frozen=True)
class ProbabilityStatisticsSolution:
    kind: str
    results: dict[str, Decimal]
    table_rows: list[list[str]]
    chart_values: list[tuple[str, float]]
    formula_latex: str
    answer_text: str
    data: list[Decimal] = field(default_factory=list)
    assumptions: list[str] = field(default_factory=list)


_DESCRIPTIVE_LABELS = {
    "mean": "均值",
    "median": "中位数",
    "mode": "众数",
    "range": "极差",
    "variance": "方差",
    "std": "标准差",
}


def solve_probability_statistics(
    spec: ProbabilityStatisticsProblemSpec,
) -> ProbabilityStatisticsSolution:
    _raise_if_unsupported(spec.assumptions)
    if spec.kind == "descriptive_statistics":
        return _solve_descriptive(spec)
    if spec.kind == "probability_union":
        return _solve_union(spec)
    if spec.kind == "conditional_probability":
        return _solve_conditional(spec)
    if spec.kind == "contingency_table":
        return _solve_contingency(spec)
    if spec.kind == "binomial_probability":
        return _solve_binomial(spec)
    if spec.kind == "z_score_normal_cdf":
        return _solve_normal(spec)
    raise ValueError("unsupported probability/statistics problem")


def _raise_if_unsupported(assumptions: list[str]) -> None:
    for assumption in assumptions:
        if assumption.startswith("unsupported:"):
            raise ValueError(assumption)


def _solve_descriptive(spec: ProbabilityStatisticsProblemSpec) -> ProbabilityStatisticsSolution:
    data = sorted(spec.data)
    results: dict[str, Decimal] = {}
    if "mean" in spec.query:
        results["mean"] = _mean(data)
    if "median" in spec.query:
        results["median"] = _median(data)
    if "mode" in spec.query:
        results["mode"] = statistics.multimode(data)[0]
    if "range" in spec.query:
        results["range"] = data[-1] - data[0]
    if "variance" in spec.query or "std" in spec.query:
        if spec.scope is None:
            raise ValueError("variance/std require sample or population scope")
        variance = _variance(data, sample=spec.scope == "sample")
        if "variance" in spec.query:
            results["variance"] = variance
        if "std" in spec.query:
            results["std"] = _decimal_sqrt(variance)
    rows = [[key, _display(value)] for key, value in results.items()]
    return ProbabilityStatisticsSolution(
        kind=spec.kind,
        results=results,
        table_rows=rows,
        chart_values=[(str(index + 1), float(value)) for index, value in enumerate(spec.data)],
        formula_latex=r"\bar{x}=\frac{\sum x_i}{n}",
        # Bilingual labels so the final narration shares tokens with the
        # (usually Chinese) prompt — "mean=5" alone never answers 「求均值」.
        answer_text="；".join(
            f"{_DESCRIPTIVE_LABELS.get(key, key)} {key}={_display(value)}"
            for key, value in results.items()
        ),
        data=spec.data,
        assumptions=spec.assumptions,
    )


def _solve_union(spec: ProbabilityStatisticsProblemSpec) -> ProbabilityStatisticsSolution:
    pa = spec.parameters["P(A)"]
    pb = spec.parameters["P(B)"]
    pab = spec.parameters["P(A∩B)"]
    _validate_probability(pa, "P(A)")
    _validate_probability(pb, "P(B)")
    _validate_probability(pab, "P(A∩B)")
    if pab > min(pa, pb):
        raise ValueError("intersection probability cannot exceed event probability")
    result = _clean_decimal(pa + pb - pab)
    if result > Decimal("1"):
        raise ValueError("union probability cannot exceed 1")
    return ProbabilityStatisticsSolution(
        kind=spec.kind,
        results={"P(A∪B)": result},
        table_rows=[
            ["P(A)", _display(pa)],
            ["P(B)", _display(pb)],
            ["P(A∩B)", _display(pab)],
            ["P(A∪B)", _display(result)],
        ],
        chart_values=[
            ("P(A)", float(pa)),
            ("P(B)", float(pb)),
            ("P(A∩B)", float(pab)),
            ("P(A∪B)", float(result)),
        ],
        formula_latex=r"P(A\cup B)=P(A)+P(B)-P(A\cap B)",
        answer_text=f"P(A∪B)={_display(result)}",
        assumptions=spec.assumptions,
    )


def _solve_conditional(spec: ProbabilityStatisticsProblemSpec) -> ProbabilityStatisticsSolution:
    pab = spec.parameters["P(A∩B)"]
    pb = spec.parameters["P(B)"]
    _validate_probability(pab, "P(A∩B)")
    _validate_probability(pb, "P(B)")
    if pb <= 0:
        raise ValueError("conditioning event probability must be positive")
    if pab > pb:
        raise ValueError("intersection probability cannot exceed conditioning event")
    result = _clean_decimal(pab / pb)
    return ProbabilityStatisticsSolution(
        kind=spec.kind,
        results={"P(A|B)": result},
        table_rows=[
            ["P(A∩B)", _display(pab)],
            ["P(B)", _display(pb)],
            ["P(A|B)", _display(result)],
        ],
        chart_values=[
            ("P(A∩B)", float(pab)),
            ("P(B)", float(pb)),
            ("P(A|B)", float(result)),
        ],
        formula_latex=r"P(A\mid B)=\frac{P(A\cap B)}{P(B)}",
        answer_text=f"P(A|B)={_display(result)}",
        assumptions=spec.assumptions,
    )


def _solve_contingency(spec: ProbabilityStatisticsProblemSpec) -> ProbabilityStatisticsSolution:
    width = len(spec.table[0])
    if any(len(row) != width for row in spec.table):
        raise ValueError("malformed contingency table")
    row_totals = [sum(row) for row in spec.table]
    column_totals = [sum(row[index] for row in spec.table) for index in range(width)]
    total = sum(row_totals)
    rows = [
        [f"row_{index + 1}", *[_display(value) for value in row], _display(row_totals[index])]
        for index, row in enumerate(spec.table)
    ]
    rows.append(["column_total", *[_display(value) for value in column_totals], _display(total)])
    row_text = "、".join(_display(value) for value in row_totals)
    column_text = "、".join(_display(value) for value in column_totals)
    return ProbabilityStatisticsSolution(
        kind=spec.kind,
        results={
            **{
                f"row_{index + 1}_total": _clean_decimal(value)
                for index, value in enumerate(row_totals)
            },
            **{
                f"column_{index + 1}_total": _clean_decimal(value)
                for index, value in enumerate(column_totals)
            },
            "total": _clean_decimal(total),
        },
        table_rows=rows,
        chart_values=[(f"row {index + 1}", float(value)) for index, value in enumerate(row_totals)],
        formula_latex=r"\text{total}=\sum_i\sum_j n_{ij}",
        # The prompt asks for 行列合计; the narration has to say those words
        # (and the totals), not just the grand total (issue #283 class).
        answer_text=(
            f"各行合计 {row_text}；各列合计 {column_text}；总数 total={_display(total)}"
        ),
        assumptions=spec.assumptions,
    )


def _solve_binomial(spec: ProbabilityStatisticsProblemSpec) -> ProbabilityStatisticsSolution:
    raw_n = spec.parameters["n"]
    raw_k = spec.parameters["k"]
    if raw_n != raw_n.to_integral_value() or raw_k != raw_k.to_integral_value():
        raise ValueError("binomial n and k must be integers")
    n = int(raw_n)
    k = int(raw_k)
    p = spec.parameters["p"]
    if n < 0 or k < 0 or k > n or not (Decimal("0") <= p <= Decimal("1")):
        raise ValueError("invalid binomial parameters")
    probability = Decimal(math.comb(n, k)) * (p**k) * ((Decimal("1") - p) ** (n - k))
    probability = _clean_decimal(probability)
    distribution = [
        (
            str(value),
            float(
                _clean_decimal(
                    Decimal(math.comb(n, value))
                    * (p**value)
                    * ((Decimal("1") - p) ** (n - value))
                )
            ),
        )
        for value in range(n + 1)
    ]
    return ProbabilityStatisticsSolution(
        kind=spec.kind,
        results={f"P(X={k})": probability},
        table_rows=[
            ["n", str(n)],
            ["p", _display(p)],
            ["k", str(k)],
            [f"P(X={k})", _display(probability)],
        ],
        chart_values=distribution,
        formula_latex=rf"P(X={k})=\binom{{{n}}}{{{k}}}p^{k}(1-p)^{{{n-k}}}",
        answer_text=f"P(X={k})={_display(probability)}",
        assumptions=spec.assumptions,
    )


def _solve_normal(spec: ProbabilityStatisticsProblemSpec) -> ProbabilityStatisticsSolution:
    x = spec.parameters["x"]
    mu = spec.parameters["mu"]
    sigma = spec.parameters["sigma"]
    z = _clean_decimal((x - mu) / sigma)
    cdf = Decimal(str(round(0.5 * (1 + math.erf(float(z) / math.sqrt(2))), 4)))
    return ProbabilityStatisticsSolution(
        kind=spec.kind,
        results={"z": z, "Φ(z)": cdf},
        table_rows=[
            ["x", _display(x)],
            ["mu", _display(mu)],
            ["sigma", _display(sigma)],
            ["z", _display(z)],
            ["Φ(z)", _display(cdf)],
        ],
        chart_values=[("z", float(z)), ("Φ(z)", float(cdf))],
        formula_latex=(
            r"z=\frac{x-\mu}{\sigma},\quad "
            r"\Phi(z)=\frac{1}{2}\left(1+\operatorname{erf}"
            r"\frac{z}{\sqrt{2}}\right)"
        ),
        answer_text=f"z={_display(z)}，Φ(z)≈{_display(cdf)}",
        assumptions=spec.assumptions,
    )


def _mean(data: list[Decimal]) -> Decimal:
    return _clean_decimal(sum(data) / Decimal(len(data)))


def _median(data: list[Decimal]) -> Decimal:
    middle = len(data) // 2
    if len(data) % 2 == 1:
        return data[middle]
    return _clean_decimal((data[middle - 1] + data[middle]) / Decimal("2"))


def _variance(data: list[Decimal], *, sample: bool) -> Decimal:
    if sample and len(data) < 2:
        raise ValueError("sample variance requires at least two values")
    mean = _mean(data)
    denominator = len(data) - 1 if sample else len(data)
    return _clean_decimal(sum((value - mean) ** 2 for value in data) / Decimal(denominator))


def _decimal_sqrt(value: Decimal) -> Decimal:
    return _clean_decimal(Decimal(str(math.sqrt(float(value)))))


def _clean_decimal(value: Decimal) -> Decimal:
    if value == value.to_integral_value():
        return value.quantize(Decimal("1"))
    quantized = value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    return quantized.normalize()


def _display(value: Decimal) -> str:
    cleaned = _clean_decimal(value)
    fraction = Fraction(cleaned)
    if fraction.denominator in {2, 4, 5, 10, 20, 25, 50, 100, 1000, 10000}:
        return format(cleaned, "f")
    return str(cleaned)


def _validate_probability(value: Decimal, label: str) -> None:
    if not Decimal("0") <= value <= Decimal("1"):
        raise ValueError(f"{label} must be between 0 and 1")
