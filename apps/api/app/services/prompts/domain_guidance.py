from __future__ import annotations

from app.schemas import TopicDomain

DOMAIN_PROMPT_GUIDANCE: dict[TopicDomain, str] = {
    TopicDomain.ALGORITHM: (
        "Focus on state variables, invariants, pointer movement, array changes, "
        "and the exact event that advances the algorithm."
    ),
    TopicDomain.MATH: (
        "Preserve symbolic continuity, define notation before transforming it, "
        "and keep formulas numerically consistent with any plotted object."
    ),
    TopicDomain.CODE: (
        "Treat the source code as the ground truth. Extract data structures, control flow, "
        "state updates, and termination conditions directly from the code before planning visuals."
    ),
    TopicDomain.PHYSICS: (
        "Model first: objects, forces, constraints, units, and governing laws must be explicit."
    ),
    TopicDomain.CHEMISTRY: (
        "Track atom identity, bond changes, and reaction conditions with consistent labels."
    ),
    TopicDomain.BIOLOGY: (
        "Make scale, stage order, and causal flow explicit. "
        "Avoid collapsing multiple levels at once."
    ),
    TopicDomain.GEOGRAPHY: (
        "Fix map scope, direction, and legend first, then reveal one spatial pattern at a time."
    ),
}


def guidance_for(domain: TopicDomain | str) -> str:
    if isinstance(domain, str):
        domain = TopicDomain(domain)
    return DOMAIN_PROMPT_GUIDANCE[domain]
