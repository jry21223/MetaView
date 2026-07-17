from __future__ import annotations

import re
from dataclasses import dataclass

from app.application.agent.runtime_tool_hub import RuntimeToolHub
from app.domain.animation_tools import list_animation_tools
from app.domain.contracts.quality_contract import PLAYBOOK_VALIDATOR_TOOL_IDS
from app.domain.models.coverage import CoverageDecision, CoverageFallbackPolicy
from app.domain.models.topic import TopicDomain
from app.domain.services.domain_router import route_topic
from app.domain.services.scene_blueprint_schema import scene_blueprint_schema
from app.domain.skills.base import SkillRouteInput, SkillRouteMatch
from app.domain.skills.registry import SkillRegistry, build_default_skill_registry


@dataclass(frozen=True)
class _ControlledCompositionProfile:
    profile_id: str
    allowed_domains: frozenset[str]
    required_tool_ids: tuple[str, ...]
    required_validator_ids: tuple[str, ...]
    required_scene_types: tuple[str, ...]
    required_animation_tool_ids: tuple[str, ...] = ()


_CONTROLLED_PROFILES = (
    _ControlledCompositionProfile(
        profile_id="derivative_tangent",
        allowed_domains=frozenset({TopicDomain.MATH.value}),
        required_tool_ids=(
            "scene_blueprint.compile",
            "geometry.assert_passes_through",
        ),
        required_validator_ids=PLAYBOOK_VALIDATOR_TOOL_IDS,
        required_scene_types=("derivative_tangent", "math_plot"),
    ),
    _ControlledCompositionProfile(
        profile_id="bfs_graph",
        allowed_domains=frozenset({TopicDomain.ALGORITHM.value}),
        required_tool_ids=(
            "scene_blueprint.compile",
            "animation_tool.expand",
        ),
        required_validator_ids=PLAYBOOK_VALIDATOR_TOOL_IDS,
        required_scene_types=("bfs_graph", "graph_scene"),
        required_animation_tool_ids=("algorithm.graph_traversal",),
    ),
    _ControlledCompositionProfile(
        profile_id="recursion_stack",
        allowed_domains=frozenset({TopicDomain.ALGORITHM.value, TopicDomain.CODE.value}),
        required_tool_ids=("scene_blueprint.compile",),
        required_validator_ids=PLAYBOOK_VALIDATOR_TOOL_IDS,
        required_scene_types=("recursion_stack", "call_stack_scene"),
    ),
    _ControlledCompositionProfile(
        profile_id="projectile_motion",
        allowed_domains=frozenset({TopicDomain.PHYSICS.value}),
        required_tool_ids=(
            "scene_blueprint.compile",
            "animation_tool.expand",
        ),
        required_validator_ids=PLAYBOOK_VALIDATOR_TOOL_IDS,
        required_scene_types=("projectile_motion", "physics_force_scene"),
        required_animation_tool_ids=("physics.projectile_motion",),
    ),
)


class DefaultCoverageResolver:
    """Resolve safe production coverage without executing a SkillPack or tool.

    ``available_tool_ids`` is the minimum relevant evidence captured from
    RuntimeToolHub discovery. It is not an execution whitelist and this
    resolver never invokes a tool.
    """

    def __init__(
        self,
        skill_registry: SkillRegistry | None = None,
        runtime_tool_hub: RuntimeToolHub | None = None,
        *,
        min_confidence: float = 0.72,
        refine_confidence: float = 0.55,
    ) -> None:
        if not 0.0 <= refine_confidence <= min_confidence <= 1.0:
            raise ValueError(
                "coverage confidence thresholds must satisfy "
                "0 <= refine_confidence <= min_confidence <= 1"
            )
        self._skill_registry = skill_registry or build_default_skill_registry()
        self._runtime_tool_hub = runtime_tool_hub or RuntimeToolHub(self._skill_registry)
        self._min_confidence = min_confidence
        self._refine_confidence = refine_confidence

    def resolve(
        self,
        *,
        prompt: str,
        source_code: str | None = None,
        language: str | None = None,
        explicit_domain: str | None = None,
        skill_mode_override: str | None = None,
        route_match: SkillRouteMatch | None = None,
    ) -> CoverageDecision:
        route_input = SkillRouteInput(
            prompt=prompt,
            source_code=source_code,
            language=language,
        )
        heuristic_matches = _unique_matches(
            *(skill.heuristic_match(route_input) for skill in self._skill_registry.all())
        )
        heuristic_match = _same_skill_match(route_match, heuristic_matches)
        domain = _resolved_domain(
            prompt=prompt,
            source_code=source_code,
            explicit_domain=explicit_domain,
        )
        if domain is None:
            domain = self._trusted_heuristic_domain(heuristic_matches)
        tool_inventory = self._tool_inventory()
        matched_skill_ids = [route_match.skill_id] if route_match is not None else []

        for unsupported_match in (
            match for match in (route_match, *heuristic_matches) if match is not None
        ):
            explicit_unsupported = self._explicit_unsupported_missing(
                unsupported_match,
                resolved_domain=domain,
            )
            if explicit_unsupported:
                return CoverageDecision(
                    mode="unsupported",
                    domain=domain,
                    confidence=unsupported_match.confidence,
                    matched_skill_ids=[unsupported_match.skill_id],
                    available_tool_ids=[],
                    missing_capabilities=explicit_unsupported,
                    fallback_policy="reject",
                    reason=(
                        "The matched SkillPack explicitly declares this capability unsupported."
                    ),
                )

        specialized_missing = self._specialized_missing(
            route_match=route_match,
            resolved_domain=domain,
            tool_inventory=tool_inventory,
            skill_mode_override=skill_mode_override,
            heuristic_match=heuristic_match,
        )
        if route_match is not None and not specialized_missing:
            solve_tool_id = f"skill.{route_match.skill_id}.solve"
            return CoverageDecision(
                mode="specialized",
                domain=domain,
                confidence=route_match.confidence,
                matched_skill_ids=matched_skill_ids,
                available_tool_ids=_available_evidence(
                    (solve_tool_id, *PLAYBOOK_VALIDATOR_TOOL_IDS),
                    tool_inventory,
                ),
                missing_capabilities=[],
                fallback_policy="use_skill",
                reason=(
                    "A registered SkillPack, supported capability, validated "
                    "ProblemSpec, and solve tool cover this request."
                ),
            )

        profile = _controlled_profile_for(
            prompt=prompt,
            source_code=source_code,
            domain=domain,
        )
        if profile is not None:
            profile_missing = self._profile_missing(
                profile,
                tool_inventory=tool_inventory,
            )
            if not profile_missing:
                return CoverageDecision(
                    mode="composable",
                    domain=domain,
                    confidence=max(0.82, self._min_confidence),
                    matched_skill_ids=matched_skill_ids,
                    available_tool_ids=_available_evidence(
                        (*profile.required_tool_ids, *profile.required_validator_ids),
                        tool_inventory,
                    ),
                    missing_capabilities=[],
                    fallback_policy="compose",
                    reason=(
                        f"Controlled composition profile {profile.profile_id} is "
                        "fully backed by canonical tools, validators, and scene types."
                    ),
                )
            missing = _unique([*specialized_missing, *profile_missing])
            fallback_policy: CoverageFallbackPolicy = (
                "limited_visual"
                if all(item.startswith("validator:") for item in profile_missing)
                else "text_only"
            )
            return CoverageDecision(
                mode="experimental",
                domain=domain,
                confidence=self._experimental_confidence(route_match),
                matched_skill_ids=matched_skill_ids,
                available_tool_ids=_experimental_evidence(
                    tool_inventory,
                    allow_scene_compile=fallback_policy == "limited_visual",
                ),
                missing_capabilities=missing,
                fallback_policy=fallback_policy,
                reason=(
                    f"Controlled composition profile {profile.profile_id} matched, "
                    "but one or more required capabilities are unavailable."
                ),
            )

        if domain is not None:
            missing = _unique(
                [
                    *specialized_missing,
                    f"capability:controlled_composition:{domain}",
                ]
            )
            return CoverageDecision(
                mode="experimental",
                domain=domain,
                confidence=self._experimental_confidence(route_match),
                matched_skill_ids=matched_skill_ids,
                available_tool_ids=_experimental_evidence(
                    tool_inventory,
                    allow_scene_compile=False,
                ),
                missing_capabilities=missing,
                fallback_policy="text_only",
                reason=(
                    "The domain can be explained, but no verified SkillPack or exact "
                    "controlled composition profile covers the request."
                ),
            )

        return CoverageDecision(
            mode="unsupported",
            domain=None,
            confidence=0.0,
            matched_skill_ids=matched_skill_ids,
            available_tool_ids=[],
            missing_capabilities=_unique(
                [
                    *specialized_missing,
                    "capability:domain_resolution",
                ]
            ),
            fallback_policy="reject",
            reason=(
                "The request has no reliably resolved domain or verified execution "
                "capability, so generation is rejected."
            ),
        )

    def _tool_inventory(self) -> dict[str, bool]:
        try:
            return {
                tool.name: bool(tool.deterministic) for tool in self._runtime_tool_hub.list_tools()
            }
        except Exception:  # noqa: BLE001 - discovery failure becomes capability evidence.
            return {}

    def _trusted_heuristic_domain(
        self,
        heuristic_matches: list[SkillRouteMatch],
    ) -> str | None:
        domains: set[str] = set()
        for match in heuristic_matches:
            skill = self._skill_registry.get(match.skill_id)
            if (
                skill is None
                or match.domain != skill.manifest.domain
                or match.capability_id is None
                or match.problem_spec is None
                or match.needs_refinement
                or match.confidence < self._min_confidence
            ):
                continue
            capability = next(
                (
                    item
                    for item in skill.manifest.capabilities
                    if item.capability_id == match.capability_id
                ),
                None,
            )
            if capability is None or not capability.supported:
                continue
            try:
                validated = skill.validate_problem_spec(match.problem_spec)
            except Exception:  # noqa: BLE001 - invalid evidence cannot resolve a domain.
                continue
            if validated is not None and not _unsupported_spec_reasons(validated):
                domains.add(skill.manifest.domain)
        if len(domains) == 1:
            return next(iter(domains))
        return None

    def _explicit_unsupported_missing(
        self,
        route_match: SkillRouteMatch,
        *,
        resolved_domain: str | None,
    ) -> list[str]:
        skill = self._skill_registry.get(route_match.skill_id)
        if skill is None or route_match.capability_id is None:
            return []
        if route_match.domain != skill.manifest.domain or resolved_domain != skill.manifest.domain:
            return []
        capability = next(
            (
                item
                for item in skill.manifest.capabilities
                if item.capability_id == route_match.capability_id
            ),
            None,
        )
        if capability is not None and not capability.supported:
            return [f"capability:{route_match.capability_id}:unsupported"]
        if route_match.problem_spec is not None:
            try:
                validated = skill.validate_problem_spec(route_match.problem_spec)
            except Exception:  # noqa: BLE001 - invalid negative evidence is ignored here.
                validated = None
            unsupported_reasons = _unsupported_spec_reasons(validated)
            if unsupported_reasons:
                return [
                    f"problem_spec:{route_match.skill_id}:unsupported:{reason}"
                    for reason in unsupported_reasons
                ]
        if route_match.needs_refinement and route_match.capability_id.endswith(".unsupported"):
            return [
                f"capability:{route_match.capability_id}:unsupported",
                f"problem_spec:{route_match.skill_id}:missing",
            ]
        return []

    def _specialized_missing(
        self,
        *,
        route_match: SkillRouteMatch | None,
        resolved_domain: str | None,
        tool_inventory: dict[str, bool],
        skill_mode_override: str | None,
        heuristic_match: SkillRouteMatch | None,
    ) -> list[str]:
        if route_match is None:
            return []

        missing: list[str] = []
        skill_id = route_match.skill_id
        capability_id = route_match.capability_id
        override = (skill_mode_override or "auto").strip().lower()
        if override == "generic":
            missing.append(f"skill:{skill_id}:blocked_by_generic_override")

        skill = self._skill_registry.get(skill_id)
        if skill is None:
            return _unique([*missing, f"skill:{skill_id}:not_registered"])

        manifest = skill.manifest
        if route_match.domain != manifest.domain:
            missing.append(f"skill:{skill_id}:route_domain_mismatch")
        if resolved_domain != manifest.domain:
            missing.append(f"skill:{skill_id}:topic_domain_mismatch")

        capability = next(
            (item for item in manifest.capabilities if item.capability_id == capability_id),
            None,
        )
        if capability_id is None:
            missing.append(f"capability:{skill_id}:missing")
        elif capability is None:
            missing.append(f"capability:{capability_id}:not_declared")
        elif not capability.supported:
            missing.append(f"capability:{capability_id}:unsupported")

        if route_match.needs_refinement:
            missing.append(f"problem_spec:{skill_id}:needs_refinement")
        if route_match.confidence < self._min_confidence:
            suffix = (
                "needs_refinement"
                if route_match.confidence >= self._refine_confidence
                else "low_confidence"
            )
            missing.append(f"capability:{capability_id or skill_id}:{suffix}")

        heuristic_validated = None
        if heuristic_match is None or heuristic_match.skill_id != skill_id:
            missing.append(f"problem_spec:{skill_id}:heuristic_evidence_missing")
        elif heuristic_match.capability_id != capability_id:
            missing.append(f"problem_spec:{skill_id}:capability_mismatch")
        elif heuristic_match.problem_spec is None:
            missing.append(f"problem_spec:{skill_id}:heuristic_spec_missing")
        else:
            try:
                heuristic_validated = skill.validate_problem_spec(heuristic_match.problem_spec)
            except Exception:  # noqa: BLE001 - invalid router data is capability evidence.
                heuristic_validated = None
            if heuristic_validated is None:
                missing.append(f"problem_spec:{skill_id}:heuristic_spec_invalid")

        route_validated = None
        if route_match.problem_spec is not None:
            try:
                route_validated = skill.validate_problem_spec(route_match.problem_spec)
            except Exception:  # noqa: BLE001 - invalid router data is capability evidence.
                route_validated = None
            if route_validated is None:
                missing.append(f"problem_spec:{skill_id}:invalid")
        elif heuristic_validated is None:
            missing.append(f"problem_spec:{skill_id}:missing")

        if route_validated is not None and heuristic_validated is not None:
            route_dump = route_validated.model_dump(mode="json")
            heuristic_dump = heuristic_validated.model_dump(mode="json")
            route_shape = route_match.problem_spec or {}
            if _project_to_shape(route_dump, route_shape) != _project_to_shape(
                heuristic_dump,
                route_shape,
            ):
                missing.append(f"problem_spec:{skill_id}:semantic_mismatch")

        solve_tool_id = f"skill.{skill_id}.solve"
        if solve_tool_id not in tool_inventory:
            missing.append(f"tool:{solve_tool_id}")
        elif not tool_inventory[solve_tool_id]:
            missing.append(f"tool:{solve_tool_id}:not_deterministic")
        for validator_id in PLAYBOOK_VALIDATOR_TOOL_IDS:
            if validator_id not in tool_inventory:
                missing.append(f"validator:{validator_id}")
            elif not tool_inventory[validator_id]:
                missing.append(f"validator:{validator_id}:not_deterministic")
        return _unique(missing)

    def _profile_missing(
        self,
        profile: _ControlledCompositionProfile,
        *,
        tool_inventory: dict[str, bool],
    ) -> list[str]:
        missing = [
            f"tool:{tool_id}"
            for tool_id in profile.required_tool_ids
            if tool_id not in tool_inventory
        ]
        missing.extend(
            f"tool:{tool_id}:not_deterministic"
            for tool_id in profile.required_tool_ids
            if tool_id in tool_inventory and not tool_inventory[tool_id]
        )
        missing.extend(
            f"validator:{validator_id}"
            for validator_id in profile.required_validator_ids
            if validator_id not in tool_inventory
        )
        missing.extend(
            f"validator:{validator_id}:not_deterministic"
            for validator_id in profile.required_validator_ids
            if validator_id in tool_inventory and not tool_inventory[validator_id]
        )

        scene_types = _scene_types()
        missing.extend(
            f"scene_type:{scene_type}"
            for scene_type in profile.required_scene_types
            if scene_type not in scene_types
        )

        animation_tool_ids = {tool.name for tool in list_animation_tools()}
        missing.extend(
            f"tool:{tool_id}"
            for tool_id in profile.required_animation_tool_ids
            if tool_id not in animation_tool_ids
        )
        return _unique(missing)

    def _experimental_confidence(self, route_match: SkillRouteMatch | None) -> float:
        if route_match is None:
            return self._refine_confidence
        return min(route_match.confidence, self._refine_confidence)


def _resolved_domain(
    *,
    prompt: str,
    source_code: str | None,
    explicit_domain: str | None,
) -> str | None:
    topic_route = route_topic(
        prompt,
        explicit_domain=explicit_domain,
        source_code=source_code,
    )
    if topic_route.domain is not None:
        return topic_route.domain.value
    return None


def _controlled_profile_for(
    *,
    prompt: str,
    source_code: str | None,
    domain: str | None,
) -> _ControlledCompositionProfile | None:
    for profile in _CONTROLLED_PROFILES:
        if domain not in profile.allowed_domains:
            continue
        if _profile_matches(profile.profile_id, prompt, source_code=source_code):
            return profile
    return None


def _profile_matches(profile_id: str, prompt: str, *, source_code: str | None) -> bool:
    if profile_id == "derivative_tangent":
        return _matches_derivative_tangent(prompt)
    if profile_id == "bfs_graph":
        return _matches_bfs_graph(prompt)
    if profile_id == "recursion_stack":
        return _matches_recursion_stack(prompt, source_code=source_code)
    if profile_id == "projectile_motion":
        return _matches_projectile_motion(prompt)
    return False


def _matches_derivative_tangent(prompt: str) -> bool:
    text = _compact(prompt)
    has_derivative = "导数" in text or "derivative" in text
    has_tangent = "切线" in text or "tangent" in text
    has_equation = re.search(r"(?:y|f\(x\))=x(?:\^?2)", text) is not None
    has_point = "(1,1)" in text
    has_slope = (
        re.search(
            r"(?:斜率(?:为什么)?(?:为|是|=)?2|slope(?:is|=|whyis)?2)",
            text,
        )
        is not None
    )
    return has_derivative and has_tangent and has_equation and has_point and has_slope


def _matches_bfs_graph(prompt: str) -> bool:
    text = prompt.lower()
    if "bfs" not in text and "广度优先" not in prompt:
        return False

    unsafe_terms = (
        "动态图",
        "动态树",
        "动态边",
        "加权",
        "权重",
        "优先队列",
        "优先级",
        "爬虫",
        "网页抓取",
        "网站抓取",
        "邻接表",
        "邻接矩阵",
        "边列表",
        "边集合",
        "图数据",
        "实时图",
        "增量图",
        "dynamic graph",
        "dynamic edge",
        "weighted",
        "priority",
        "priority queue",
        "priority traversal",
        "crawler",
        "crawl",
        "web crawl",
        "web spider",
        "adjacency list",
        "adjacency matrix",
        "edge list",
        "graph data",
        "streaming graph",
        "incremental graph",
    )
    if any(term in text for term in unsafe_terms):
        return False

    has_tree = any(
        term in text
        for term in (
            "二叉树",
            "树结构",
            "树遍历",
            "binary tree",
            "tree structure",
            "tree traversal",
        )
    )
    has_traversal_lesson = any(
        term in text
        for term in (
            "遍历",
            "访问顺序",
            "逐层",
            "层序",
            "队列",
            "点亮节点",
            "traversal",
            "visit order",
            "level order",
            "level-by-level",
            "queue",
            "highlight nodes",
        )
    )
    if not has_tree or not has_traversal_lesson:
        return False

    explicit_graph_data_patterns = (
        r"(?<![A-Za-z0-9_])[A-Za-z]\d*\s*(?:->|--?|→|—|–)\s*"
        r"[A-Za-z]\d*(?![A-Za-z0-9_])",
        r"(?-i:\b[A-Z][A-Z0-9_]*\s*(?:->|--?|→|—|–)\s*"
        r"[A-Z][A-Z0-9_]*\b)",
        r"\b[A-Za-z][A-Za-z0-9_]*\s*:\s*\[[^\]]+\]",
        r"\b[A-Za-z][A-Za-z0-9_]*\s*:\s*[A-Za-z][A-Za-z0-9_]*"
        r"(?:\s*,\s*[A-Za-z][A-Za-z0-9_]*)+",
        r"[\"']?(?:nodes|edges)[\"']?\s*[:=]\s*[\[{]",
    )
    return not any(
        re.search(pattern, prompt, flags=re.IGNORECASE) for pattern in explicit_graph_data_patterns
    )


def _matches_recursion_stack(prompt: str, *, source_code: str | None) -> bool:
    if source_code and source_code.strip():
        return False
    text = prompt.lower()
    calls = re.findall(r"factorial\s*\(\s*([^)]*?)\s*\)", text)
    if not calls or any(call.strip() != "4" for call in calls):
        return False
    return any(term in text for term in ("递归", "调用栈", "recursion", "call stack"))


def _matches_projectile_motion(prompt: str) -> bool:
    text = prompt.lower()
    if "平抛" not in prompt and not re.search(r"horizontal\s+(?:projectile|launch)", text):
        return False
    if re.search(r"\d", text):
        return False

    unsafe = text
    for safe_phrase in (
        "忽略空气阻力",
        "不计空气阻力",
        "无空气阻力",
        "without air resistance",
        "no air resistance",
    ):
        unsafe = unsafe.replace(safe_phrase, "")
    return not any(
        term in unsafe
        for term in (
            "空气阻力",
            "阻力",
            "碰撞",
            "air resistance",
            "drag",
            "collision",
        )
    )


def _compact(value: str) -> str:
    return (
        re.sub(r"\s+", "", value.lower())
        .replace("（", "(")
        .replace("）", ")")
        .replace("，", ",")
        .replace("²", "^2")
    )


def _scene_types() -> set[str]:
    values = scene_blueprint_schema().get("properties", {}).get("sceneType", {}).get("enum", [])
    return {str(value) for value in values}


def _available_evidence(
    relevant_tool_ids: tuple[str, ...],
    tool_inventory: dict[str, bool],
) -> list[str]:
    return [tool_id for tool_id in relevant_tool_ids if tool_inventory.get(tool_id) is True]


def _experimental_evidence(
    tool_inventory: dict[str, bool],
    *,
    allow_scene_compile: bool,
) -> list[str]:
    relevant = list(PLAYBOOK_VALIDATOR_TOOL_IDS)
    if allow_scene_compile:
        relevant.append("scene_blueprint.compile")
    return _available_evidence(tuple(relevant), tool_inventory)


def _unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys(values))


def _project_to_shape(value: object, shape: object) -> object:
    if isinstance(shape, dict):
        if not isinstance(value, dict):
            return None
        return {
            key: _project_to_shape(value.get(key), child_shape)
            for key, child_shape in shape.items()
        }
    if isinstance(shape, list):
        return value if isinstance(value, list) else None
    return value


def _unsupported_spec_reasons(validated: object | None) -> list[str]:
    if validated is None or not hasattr(validated, "model_dump"):
        return []
    payload = validated.model_dump(mode="json")
    assumptions = payload.get("assumptions")
    if not isinstance(assumptions, list):
        return []
    reasons: list[str] = []
    for value in assumptions:
        if not isinstance(value, str):
            continue
        normalized = value.strip().lower()
        if normalized.startswith("unsupported:"):
            reasons.append(normalized.removeprefix("unsupported:") or "assumption")
        elif normalized.endswith("_not_supported"):
            reasons.append(normalized)
    return _unique(reasons)


def _unique_matches(
    *matches: SkillRouteMatch | None,
) -> list[SkillRouteMatch]:
    unique: list[SkillRouteMatch] = []
    seen: set[tuple[str, str | None, str]] = set()
    for match in matches:
        if match is None:
            continue
        key = (match.skill_id, match.capability_id, match.domain)
        if key in seen:
            continue
        seen.add(key)
        unique.append(match)
    return unique


def _same_skill_match(
    route_match: SkillRouteMatch | None,
    heuristic_matches: list[SkillRouteMatch],
) -> SkillRouteMatch | None:
    if route_match is None:
        return None
    return next(
        (match for match in heuristic_matches if match.skill_id == route_match.skill_id),
        None,
    )


__all__ = ["DefaultCoverageResolver"]
