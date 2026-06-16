from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from fractions import Fraction
from functools import reduce
from itertools import product
from math import gcd, lcm

from app.domain.skills.biology_genetics.problem_spec import BiologyGeneticsProblemSpec


@dataclass(frozen=True)
class GeneticsSolution:
    kind: str
    parents: list[str]
    loci: list[str]
    genotype_counts: dict[str, Fraction]
    phenotype_counts: dict[str, Fraction]
    genotype_ratio: str
    phenotype_ratio: str
    probabilities: dict[str, Fraction]
    table_rows: list[list[str]]
    chart_values: list[tuple[str, float]]
    formula_latex: str
    answer_text: str
    assumptions: list[str] = field(default_factory=list)


def solve_genetics_problem(spec: BiologyGeneticsProblemSpec) -> GeneticsSolution:
    _raise_if_unsupported(spec.assumptions)
    loci = _loci_keys(spec.parents[0])
    if _phenotype_requested(spec) and set(spec.dominance) != set(loci):
        raise ValueError("phenotype questions require explicit dominance assumptions")

    parent_gametes = [_gamete_distribution(parent) for parent in spec.parents]
    genotype_counts: Counter[str] = Counter()
    for gamete_a, probability_a in parent_gametes[0].items():
        for gamete_b, probability_b in parent_gametes[1].items():
            genotype = _offspring_genotype(gamete_a, gamete_b)
            genotype_counts[genotype] += probability_a * probability_b

    ordered_genotypes = _ordered_genotypes(loci)
    genotype_distribution = {
        genotype: Fraction(genotype_counts.get(genotype, Fraction(0)))
        for genotype in ordered_genotypes
        if genotype_counts.get(genotype, 0) > 0
    }
    phenotype_distribution = _phenotype_distribution(genotype_distribution, loci)
    probabilities = dict(genotype_distribution)
    probabilities.update(phenotype_distribution)

    genotype_ratio = _ratio([genotype_distribution[key] for key in genotype_distribution])
    phenotype_order = _phenotype_order(loci)
    phenotype_ratio = _ratio([
        phenotype_distribution[key] for key in phenotype_order if key in phenotype_distribution
    ])
    target_text = _target_text(spec, probabilities)
    answer_text = (
        f"基因型比例 {genotype_ratio}；表现型比例 {phenotype_ratio}"
        + (f"；{target_text}" if target_text else "")
    )
    return GeneticsSolution(
        kind=spec.kind,
        parents=spec.parents,
        loci=loci,
        genotype_counts=genotype_distribution,
        phenotype_counts=phenotype_distribution,
        genotype_ratio=genotype_ratio,
        phenotype_ratio=phenotype_ratio,
        probabilities=probabilities,
        table_rows=_punnett_rows(parent_gametes),
        chart_values=[
            (key, float(phenotype_distribution[key]))
            for key in phenotype_order
            if key in phenotype_distribution
        ],
        formula_latex=_formula_latex(spec, genotype_ratio, phenotype_ratio, probabilities),
        answer_text=answer_text,
        assumptions=spec.assumptions,
    )


def _raise_if_unsupported(assumptions: list[str]) -> None:
    for assumption in assumptions:
        if assumption.startswith("unsupported:"):
            raise ValueError(assumption)


def _phenotype_requested(spec: BiologyGeneticsProblemSpec) -> bool:
    return (
        "phenotype_ratio" in spec.requested_outputs
        or spec.target_phenotype is not None
        or spec.kind in {"monohybrid_ratio", "dihybrid_ratio", "phenotype_probability"}
    )


def _loci_keys(genotype: str) -> list[str]:
    return [genotype[index].upper() for index in range(0, len(genotype), 2)]


def _gamete_distribution(parent: str) -> dict[str, Fraction]:
    allele_options: list[list[str]] = []
    for index in range(0, len(parent), 2):
        pair = parent[index : index + 2]
        if pair[0] == pair[1]:
            allele_options.append([pair[0]])
        else:
            allele_options.append(sorted(pair, key=lambda allele: (allele.islower(), allele)))
    gametes = ["".join(parts) for parts in product(*allele_options)]
    counts = Counter(gametes)
    total = sum(counts.values())
    return {gamete: Fraction(count, total) for gamete, count in sorted(counts.items())}


def _offspring_genotype(gamete_a: str, gamete_b: str) -> str:
    parts: list[str] = []
    for allele_a, allele_b in zip(gamete_a, gamete_b, strict=True):
        pair = sorted([allele_a, allele_b], key=lambda allele: (allele.islower(), allele))
        parts.append("".join(pair))
    return "".join(parts)


def _ordered_genotypes(loci: list[str]) -> list[str]:
    per_locus = [[locus * 2, locus + locus.lower(), locus.lower() * 2] for locus in loci]
    return ["".join(parts) for parts in product(*per_locus)]


def _phenotype_distribution(
    genotype_distribution: dict[str, Fraction],
    loci: list[str],
) -> dict[str, Fraction]:
    counts: Counter[str] = Counter()
    for genotype, probability in genotype_distribution.items():
        counts[_phenotype_key(genotype, loci)] += probability
    return {key: Fraction(value) for key, value in counts.items()}


def _phenotype_key(genotype: str, loci: list[str]) -> str:
    keys: list[str] = []
    for locus_index, locus in enumerate(loci):
        pair = genotype[locus_index * 2 : locus_index * 2 + 2]
        if any(allele.isupper() for allele in pair):
            keys.append(f"{locus}_")
        else:
            keys.append(locus.lower() * 2)
    return "".join(keys)


def _phenotype_order(loci: list[str]) -> list[str]:
    per_locus = [[f"{locus}_", locus.lower() * 2] for locus in loci]
    return ["".join(parts) for parts in product(*per_locus)]


def _ratio(values: list[Fraction]) -> str:
    if not values:
        return ""
    denominator = reduce(lcm, (value.denominator for value in values), 1)
    integers = [int(value * denominator) for value in values]
    divisor = reduce(gcd, integers)
    return ":".join(str(value // divisor) for value in integers)


def _target_text(spec: BiologyGeneticsProblemSpec, probabilities: dict[str, Fraction]) -> str:
    target = spec.target_genotype or spec.target_phenotype
    if not target:
        return ""
    probability = probabilities.get(target)
    if probability is None:
        raise ValueError("target probability is outside the supported cross")
    return f"P({target})={probability}"


def _formula_latex(
    spec: BiologyGeneticsProblemSpec,
    genotype_ratio: str,
    phenotype_ratio: str,
    probabilities: dict[str, Fraction],
) -> str:
    target = spec.target_genotype or spec.target_phenotype
    if target:
        probability = probabilities[target]
        return rf"P({target})={probability.numerator}/{probability.denominator}"
    return rf"\text{{genotype}}={genotype_ratio},\quad \text{{phenotype}}={phenotype_ratio}"


def _punnett_rows(parent_gametes: list[dict[str, Fraction]]) -> list[list[str]]:
    row_gametes = list(parent_gametes[0])
    column_gametes = list(parent_gametes[1])
    rows = [[""] + column_gametes]
    for row_gamete in row_gametes:
        rows.append([
            row_gamete,
            *[_offspring_genotype(row_gamete, column_gamete) for column_gamete in column_gametes],
        ])
    return rows
