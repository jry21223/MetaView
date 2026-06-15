from __future__ import annotations

import re

from app.domain.skills.biology_genetics.problem_spec import BiologyGeneticsProblemSpec

_UNSUPPORTED_TERMS = (
    "连锁",
    "linkage",
    "互作",
    "epistasis",
    "伴性",
    "sex-linked",
    "家系",
    "pedigree",
    "不完全显性",
    "共显性",
    "未知显性",
)


def try_extract_biology_genetics(prompt: str) -> BiologyGeneticsProblemSpec | None:
    text = _normalize(prompt)
    parent_match = re.search(
        r"(?P<p1>[A-Za-z]{2,4})\s*(?:x|X|×|\*)\s*(?P<p2>[A-Za-z]{2,4})",
        text,
    )
    if parent_match is None:
        return None
    try:
        parents = [
            _normalize_genotype(parent_match.group("p1")),
            _normalize_genotype(parent_match.group("p2")),
        ]
        trait_count = len(parents[0]) // 2
        loci = _loci_keys(parents[0])
        if _loci_keys(parents[1]) != loci:
            return None
    except ValueError:
        return None

    requested = _requested_outputs(text)
    target = _extract_target(text)
    dominance = _extract_dominance(text, loci)
    assumptions = ["independent_assortment", "complete_dominance"]
    unsupported = [term for term in _UNSUPPORTED_TERMS if term.lower() in text.lower()]
    if unsupported:
        assumptions.append("unsupported:" + ",".join(unsupported))
    if _needs_phenotype(requested, target) and not dominance:
        assumptions.append("unsupported:dominance_not_explicit")

    target_genotype = target if target and _looks_like_genotype(target, loci) else None
    target_phenotype = target if target and not target_genotype else None
    kind = _kind(text, trait_count, target_genotype, target_phenotype)
    return BiologyGeneticsProblemSpec(
        kind=kind,
        parents=parents,
        dominance=dominance,
        target_genotype=target_genotype,
        target_phenotype=target_phenotype,
        requested_outputs=requested,
        assumptions=assumptions,
    )


def _normalize(prompt: str) -> str:
    return (
        prompt.replace("（", "(")
        .replace("）", ")")
        .replace("，", ",")
        .replace("。", "")
        .replace("×", "x")
    )


def _normalize_genotype(raw: str) -> str:
    normalized = raw.strip()
    if len(normalized) not in {2, 4}:
        raise ValueError("unsupported genotype length")
    parts: list[str] = []
    for index in range(0, len(normalized), 2):
        pair = normalized[index : index + 2]
        base = pair[0].upper()
        if pair[1].upper() != base:
            raise ValueError("invalid locus pair")
        uppercase = sum(1 for allele in pair if allele.isupper())
        parts.append(base * uppercase + base.lower() * (2 - uppercase))
    return "".join(parts)


def _loci_keys(genotype: str) -> list[str]:
    keys: list[str] = []
    for index in range(0, len(genotype), 2):
        pair = genotype[index : index + 2]
        if len(pair) != 2 or pair[0].upper() != pair[1].upper():
            raise ValueError("invalid locus pair")
        keys.append(pair[0].upper())
    return keys


def _requested_outputs(text: str) -> list[str]:
    outputs: list[str] = []
    if "基因型" in text:
        outputs.append("genotype_ratio")
    if "表现型" in text or "表型" in text:
        outputs.append("phenotype_ratio")
    if "punnett" in text.lower() or "方格" in text or "表" in text:
        outputs.append("punnett_table")
    if re.search(r"P\s*\(", text):
        outputs.append("probability")
    return outputs or ["genotype_ratio", "phenotype_ratio"]


def _extract_target(text: str) -> str | None:
    match = re.search(r"P\s*\(\s*(?P<target>[^)]+?)\s*\)", text)
    if match:
        return match.group("target").strip()
    return None


def _extract_dominance(text: str, loci: list[str]) -> dict[str, str]:
    if "显性" not in text and "dominant" not in text.lower():
        return {}
    return {locus: locus.lower() for locus in loci}


def _needs_phenotype(requested: list[str], target: str | None) -> bool:
    return "phenotype_ratio" in requested or (target is not None and "_" in target)


def _looks_like_genotype(target: str, loci: list[str]) -> bool:
    letters = target.replace(" ", "")
    if "_" in letters or len(letters) != len(loci) * 2:
        return False
    try:
        return _loci_keys(_normalize_genotype(letters)) == loci
    except ValueError:
        return False


def _kind(
    text: str,
    trait_count: int,
    target_genotype: str | None,
    target_phenotype: str | None,
) -> str:
    lowered = text.lower()
    if "test cross" in lowered or "测交" in text:
        return "test_cross"
    if "punnett" in lowered or "方格" in text:
        return "punnett_table"
    if "表现型" not in text and "表型" not in text and target_genotype:
        return "genotype_probability"
    if target_phenotype:
        return "phenotype_probability"
    if trait_count == 2:
        return "dihybrid_ratio"
    return "monohybrid_ratio"
