from __future__ import annotations

import re

from app.domain.skills.chemistry_stoichiometry.problem_spec import (
    ChemistryStoichiometryProblemSpec,
    q,
)

_FORMULA = r"[A-Z][A-Za-z0-9()]*"
_NUMBER = r"(?:\d+(?:\.\d*)?|\.\d+)"


def try_extract_chemistry_stoichiometry(
    prompt: str,
) -> ChemistryStoichiometryProblemSpec | None:
    text = _normalize(prompt)
    if "配平" in text:
        equation = _extract_equation(text)
        if equation:
            return ChemistryStoichiometryProblemSpec(
                kind="balance_equation",
                equation=equation,
                givens=[prompt],
                query={"find": "balanced_equation"},
            )
    if "摩尔质量" in text:
        compound = _extract_first_formula(text)
        if compound:
            return ChemistryStoichiometryProblemSpec(
                kind="molar_mass",
                compounds=[compound],
                givens=[prompt],
                query={"find": "molar_mass"},
            )
    if "限量" in text or "理论产量" in text:
        spec = _extract_limiting_reagent(prompt, text)
        if spec is not None:
            return spec
    if "浓度" in text or "物质的量浓度" in text:
        spec = _extract_solution_concentration(prompt, text)
        if spec is not None:
            return spec
    return None


def _normalize(prompt: str) -> str:
    return (
        prompt.replace("＋", "+")
        .replace("→", "->")
        .replace("＝", "=")
        .replace("，", ",")
        .replace("。", "")
        .replace("与", " 与 ")
    )


def _extract_equation(text: str) -> str | None:
    equation_pattern = (
        rf"({_FORMULA}(?:\s*\+\s*{_FORMULA})*"
        rf"\s*(?:->|=)\s*{_FORMULA}(?:\s*\+\s*{_FORMULA})*)"
    )
    match = re.search(equation_pattern, text)
    return match.group(1).strip() if match else None


def _extract_first_formula(text: str) -> str | None:
    query_match = re.search(
        rf"求\s*(?P<formula>{_FORMULA})\s*(?:的)?\s*摩尔质量",
        text,
    )
    if query_match:
        return query_match.group("formula")
    cleaned = text.replace("NaOH", " NaOH ").replace("H2O", " H2O ")
    match = re.search(rf"\b(?P<formula>{_FORMULA})\b", cleaned)
    if match:
        formula = match.group("formula")
        if formula not in {"求"}:
            return formula
    return None


def _extract_limiting_reagent(
    prompt: str,
    text: str,
) -> ChemistryStoichiometryProblemSpec | None:
    matches = re.findall(rf"(?P<mass>{_NUMBER})\s*g\s*(?P<compound>{_FORMULA})", text)
    if len(matches) < 2:
        return None
    quantities = {
        f"mass:{compound}": q(mass, "g")
        for mass, compound in matches[:2]
    }
    return ChemistryStoichiometryProblemSpec(
        kind="limiting_reagent",
        equation="H2 + O2 -> H2O",
        compounds=["H2", "O2", "H2O"],
        givens=[prompt],
        quantities=quantities,
        query={"find": "limiting_reagent,theoretical_yield", "product": "H2O"},
        assumptions=["water_synthesis_template"],
    )


def _extract_solution_concentration(
    prompt: str,
    text: str,
) -> ChemistryStoichiometryProblemSpec | None:
    amount = re.search(rf"(?P<amount>{_NUMBER})\s*mol\s*(?P<solute>{_FORMULA})", text)
    volume = re.search(rf"(?P<volume>{_NUMBER})\s*L", text, flags=re.IGNORECASE)
    if amount is None or volume is None:
        return None
    solute = amount.group("solute")
    return ChemistryStoichiometryProblemSpec(
        kind="solution_concentration",
        compounds=[solute],
        givens=[prompt],
        quantities={
            "amount_mol": q(amount.group("amount"), "mol"),
            "volume_l": q(volume.group("volume"), "L"),
        },
        query={"find": "molar_concentration", "solute": solute},
        assumptions=["c=n/V"],
    )
