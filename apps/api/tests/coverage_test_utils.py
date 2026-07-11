from __future__ import annotations

from typing import Any

from app.domain.models.coverage import CoverageDecision
from app.domain.services.domain_router import route_topic


class ComposableCoverageResolver:
    """Test seam for cases exercising behavior after capability resolution.

    Coverage resolution itself is covered by dedicated contract, resolver, and
    pipeline-integration tests. Downstream unit tests inject this resolver so a
    deliberately vague fixture prompt does not stop before the behavior under
    test (provider, reviewer, Director, timeout, or persistence) is reached.
    """

    def __init__(self, default_domain: str = "algorithm") -> None:
        self.default_domain = default_domain

    def resolve(self, **kwargs: Any) -> CoverageDecision:
        route_match = kwargs.get("route_match")
        topic = route_topic(
            kwargs.get("prompt", ""),
            explicit_domain=kwargs.get("explicit_domain"),
            source_code=kwargs.get("source_code"),
        )
        domain = (
            kwargs.get("explicit_domain")
            or getattr(route_match, "domain", None)
            or (topic.domain.value if topic.domain is not None else None)
            or self.default_domain
        )
        return CoverageDecision(
            mode="composable",
            domain=domain,
            confidence=0.99,
            matched_skill_ids=[],
            available_tool_ids=["playbook.schema.validate"],
            missing_capabilities=[],
            fallback_policy="compose",
            reason="Test fixture bypasses capability resolution for downstream behavior.",
        )


__all__ = ["ComposableCoverageResolver"]
