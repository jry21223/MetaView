from __future__ import annotations

from typing import Literal

from app.domain.models.route_decision import RouteDecision
from app.domain.models.topic import TopicDomain
from app.domain.services.domain_router import SkillMode, TopicRoute, route_topic

RouterMode = Literal["off", "heuristic", "llm", "hybrid"]


def heuristic_route(
    *,
    prompt: str,
    source_code: str | None = None,
    explicit_domain: str | None = None,
    skill_mode_override: str | None = None,
) -> RouteDecision:
    topic_route = _resolve_topic_route(
        prompt=prompt,
        explicit_domain=explicit_domain,
        source_code=source_code,
        skill_mode_override=skill_mode_override,
    )
    confidence = 0.62 if topic_route.domain is not None else 0.0
    return RouteDecision(
        destination="generic_cir",
        domain=topic_route.domain.value if topic_route.domain else None,
        confidence=confidence,
        reason=topic_route.reason or "heuristic_topic_route",
        matched_capability=",".join(topic_route.matched_keywords) or None,
    )


def topic_route_from_decision(route: RouteDecision) -> TopicRoute:
    domain = _coerce_topic_domain(route.domain)
    if domain is None:
        return TopicRoute(
            skill_mode=SkillMode.GENERIC,
            domain=None,
            reason=route.reason or "route_decision_no_domain",
        )
    return TopicRoute(
        skill_mode=SkillMode.SPECIALIZED,
        domain=domain,
        matched_keywords=((route.matched_capability,) if route.matched_capability else ()),
        reason=route.reason or "route_decision_domain_hint",
    )


def _resolve_topic_route(
    *,
    prompt: str,
    explicit_domain: str | None,
    source_code: str | None,
    skill_mode_override: str | None,
) -> TopicRoute:
    route = route_topic(prompt, explicit_domain=explicit_domain, source_code=source_code)
    override = (skill_mode_override or "auto").lower()

    if override == "generic":
        return TopicRoute(
            skill_mode=SkillMode.GENERIC,
            domain=None,
            reason="skill_mode_override_generic",
        )

    if override == "specialized":
        if route.domain is not None:
            return TopicRoute(
                skill_mode=SkillMode.SPECIALIZED,
                domain=route.domain,
                matched_keywords=route.matched_keywords,
                explicit=route.explicit,
                reason="skill_mode_override_specialized",
            )
        return TopicRoute(
            skill_mode=SkillMode.GENERIC,
            domain=None,
            matched_keywords=route.matched_keywords,
            explicit=route.explicit,
            reason="skill_mode_override_specialized_no_domain",
        )

    return route


def _coerce_topic_domain(value: str | None) -> TopicDomain | None:
    if value is None:
        return None
    try:
        return TopicDomain(value)
    except ValueError:
        return None
