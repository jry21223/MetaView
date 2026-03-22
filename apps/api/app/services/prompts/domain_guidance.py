from __future__ import annotations

from app.schemas import TopicDomain

DOMAIN_PROMPT_GUIDANCE: dict[TopicDomain, str] = {
    TopicDomain.ALGORITHM: (
        "Focus on concrete state transitions: active variables, invariants, advancing events, "
        "termination conditions, and why the algorithm can move to the next step."
    ),
    TopicDomain.MATH: (
        "Preserve symbolic continuity, define notation before using it, and keep formulas, "
        "diagrams, and plotted values mutually consistent."
    ),
    TopicDomain.CODE: (
        "Treat the source code as ground truth. Extract structure, control flow, state updates, "
        "and termination directly from the code before choosing visuals."
    ),
    TopicDomain.PHYSICS: (
        "Model first: objects, reference frame, known quantities, constraints, units, "
        "and governing "
        "laws must be explicit before motion or equations appear."
    ),
    TopicDomain.CHEMISTRY: (
        "Track species identity, bond changes, charge, phase, and reaction conditions "
        "with stable labels."
    ),
    TopicDomain.BIOLOGY: (
        "Make biological scale, stage order, and causal flow explicit, and avoid mixing multiple "
        "levels of organization in one unexplained jump."
    ),
    TopicDomain.GEOGRAPHY: (
        "Fix map scope, orientation, legend, and time anchor first, then reveal one "
        "spatial pattern "
        "or regional contrast at a time."
    ),
}


def guidance_for(domain: TopicDomain | str) -> str:
    if isinstance(domain, str):
        domain = TopicDomain(domain)
    return DOMAIN_PROMPT_GUIDANCE[domain]
