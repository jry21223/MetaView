from __future__ import annotations

from typing import Any

import pytest

from app.application.agent.runtime_tool_hub import RuntimeToolHub
from app.application.services.coverage_resolver import DefaultCoverageResolver
from app.domain.skills.base import SkillRouteInput, SkillRouteMatch
from app.domain.skills.registry import build_default_skill_registry

GOLD_COMPOSABLE_CASES = (
    (
        "用动画解释导数的几何意义：曲线 y=x² 在点 (1,1) 处切线的斜率为什么是 2。",
        "math",
        "derivative_tangent",
    ),
    (
        "用二叉树演示广度优先遍历的访问顺序，逐层点亮节点。",
        "algorithm",
        "bfs_graph",
    ),
    (
        "逐行追踪 factorial(4) 的递归调用栈，展示压栈与回溯返回值。",
        "code",
        "recursion_stack",
    ),
    (
        "演示平抛运动：水平速度不变、竖直加速，画出抛物线轨迹和分速度矢量。",
        "physics",
        "projectile_motion",
    ),
)


@pytest.mark.parametrize(("prompt", "domain", "profile_id"), GOLD_COMPOSABLE_CASES)
def test_gold_templates_use_exact_controlled_composition_profiles(
    prompt: str,
    domain: str,
    profile_id: str,
) -> None:
    decision = DefaultCoverageResolver().resolve(
        prompt=prompt,
        explicit_domain=domain,
        skill_mode_override="generic",
    )

    assert decision.mode == "composable"
    assert decision.domain == domain
    assert decision.fallback_policy == "compose"
    assert decision.missing_capabilities == []
    assert profile_id in decision.reason
    assert "scene_blueprint.compile" in decision.available_tool_ids
    assert "playbook.self_check" in decision.available_tool_ids
    assert not any(tool_id.startswith("skill.") for tool_id in decision.available_tool_ids)
    assert "algorithm.graph_traversal" not in decision.available_tool_ids
    assert "physics.projectile_motion" not in decision.available_tool_ids


@pytest.mark.parametrize(
    ("prompt", "expected_domain"),
    (
        (GOLD_COMPOSABLE_CASES[0][0], "math"),
        (GOLD_COMPOSABLE_CASES[3][0], "physics"),
    ),
)
def test_text_requests_auto_route_without_domain_or_language(
    prompt: str,
    expected_domain: str,
) -> None:
    decision = DefaultCoverageResolver().resolve(
        prompt=prompt,
        explicit_domain=None,
        language=None,
    )

    assert decision.domain == expected_domain
    assert decision.mode == "composable"


def test_code_attachment_routes_from_source_evidence_without_explicit_domain() -> None:
    decision = DefaultCoverageResolver().resolve(
        prompt="讲解这个附件中的程序",
        source_code="def factorial(n):\n    return 1 if n <= 1 else n * factorial(n - 1)",
        language="python",
        explicit_domain=None,
    )

    assert decision.domain == "code"


def test_registered_supported_skill_with_valid_spec_is_specialized() -> None:
    registry = build_default_skill_registry()
    prompt = "质量 2kg 的物体受到 10N 水平拉力，忽略摩擦，求加速度"
    match = registry.heuristic_match(SkillRouteInput(prompt=prompt))
    assert match is not None

    decision = DefaultCoverageResolver(registry).resolve(
        prompt=prompt,
        route_match=match,
    )

    assert decision.mode == "specialized"
    assert decision.domain == "physics"
    assert decision.matched_skill_ids == ["physics_mechanics"]
    assert decision.fallback_policy == "use_skill"
    assert decision.missing_capabilities == []
    assert decision.available_tool_ids == [
        "skill.physics_mechanics.solve",
        "playbook.schema.validate",
        "playbook.self_check",
    ]


def test_registered_deterministic_heuristic_can_resolve_its_manifest_domain() -> None:
    registry = build_default_skill_registry()
    prompt = "正四棱锥 S-ABCD，底面边长为 2，高为 3，求 SA 与底面 ABCD 的线面角"
    match = registry.heuristic_match(SkillRouteInput(prompt=prompt))
    assert match is not None
    assert match.skill_id == "solid_geometry"

    decision = DefaultCoverageResolver(registry).resolve(
        prompt=prompt,
        route_match=match,
    )

    assert decision.mode == "specialized"
    assert decision.domain == "math"


def test_router_match_without_spec_reuses_same_skill_heuristic_spec() -> None:
    registry = build_default_skill_registry()
    prompt = "质量 2kg 的物体受到 10N 水平拉力，忽略摩擦，求加速度"
    heuristic_match = registry.heuristic_match(SkillRouteInput(prompt=prompt))
    assert heuristic_match is not None

    decision = DefaultCoverageResolver(registry).resolve(
        prompt=prompt,
        route_match=heuristic_match.model_copy(update={"problem_spec": None}),
    )

    assert decision.mode == "specialized"
    assert decision.missing_capabilities == []


def test_route_capability_must_match_independent_heuristic_capability() -> None:
    registry = build_default_skill_registry()
    prompt = "以 10m/s 水平抛出小球，高度 20m，求落地时间和水平射程"
    heuristic_match = registry.heuristic_match(SkillRouteInput(prompt=prompt))
    assert heuristic_match is not None
    assert heuristic_match.capability_id == "physics_mechanics.projectile_motion"

    route_match = heuristic_match.model_copy(
        update={
            "capability_id": "physics_mechanics.newton_second_law",
        }
    )
    decision = DefaultCoverageResolver(registry).resolve(
        prompt=prompt,
        route_match=route_match,
    )

    assert decision.mode != "specialized"
    assert "problem_spec:physics_mechanics:capability_mismatch" in (decision.missing_capabilities)


def test_route_problem_spec_must_match_independent_heuristic_semantics() -> None:
    registry = build_default_skill_registry()
    prompt = "质量 2kg 的物体受到 10N 水平拉力，忽略摩擦，求加速度"
    heuristic_match = registry.heuristic_match(SkillRouteInput(prompt=prompt))
    assert heuristic_match is not None
    assert heuristic_match.problem_spec is not None

    route_match = heuristic_match.model_copy(
        update={
            "problem_spec": {
                **heuristic_match.problem_spec,
                "kind": "projectile_motion",
            },
        }
    )
    decision = DefaultCoverageResolver(registry).resolve(
        prompt=prompt,
        route_match=route_match,
    )

    assert decision.mode != "specialized"
    assert "problem_spec:physics_mechanics:semantic_mismatch" in (decision.missing_capabilities)


def test_route_spec_can_omit_metadata_rederived_by_the_same_skill() -> None:
    registry = build_default_skill_registry()
    prompt = "正四棱锥 S-ABCD，底面边长为 2，高为 3，求 SA 与底面 ABCD 的线面角"
    heuristic_match = registry.heuristic_match(SkillRouteInput(prompt=prompt))
    assert heuristic_match is not None

    route_match = heuristic_match.model_copy(
        update={
            "problem_spec": {
                "body": "regular_quad_pyramid",
                "dimensions": {"base": "2", "height": "3"},
                "query": {
                    "kind": "line_plane_angle",
                    "line": {"through": ["S", "A"]},
                    "plane": {"through": ["A", "B", "C"]},
                },
            }
        }
    )
    decision = DefaultCoverageResolver(registry).resolve(
        prompt=prompt,
        route_match=route_match,
    )

    assert decision.mode == "specialized"


@pytest.mark.parametrize(
    "route_match",
    [
        SkillRouteMatch(
            skill_id="not_registered",
            domain="physics",
            confidence=0.95,
            capability_id="physics_mechanics.newton_second_law",
            problem_spec={"mass": 2, "force": 10},
        ),
        SkillRouteMatch(
            skill_id="physics_mechanics",
            domain="physics",
            confidence=0.95,
            capability_id="physics_mechanics.not_declared",
            problem_spec={"mass": 2, "force": 10},
        ),
        SkillRouteMatch(
            skill_id="physics_mechanics",
            domain="physics",
            confidence=0.95,
            capability_id="physics_mechanics.newton_second_law",
            problem_spec={"invalid": True},
        ),
        SkillRouteMatch(
            skill_id="physics_mechanics",
            domain="physics",
            confidence=0.95,
            capability_id="physics_mechanics.newton_second_law",
            problem_spec={"kind": "newton_second_law"},
            needs_refinement=True,
        ),
    ],
)
def test_unverified_skill_matches_never_become_specialized(
    route_match: SkillRouteMatch,
) -> None:
    decision = DefaultCoverageResolver().resolve(
        prompt="解释物体受力与加速度",
        explicit_domain="physics",
        route_match=route_match,
    )

    assert decision.mode != "specialized"
    assert decision.missing_capabilities


def test_unregistered_route_domain_does_not_resolve_an_unknown_prompt() -> None:
    route_match = SkillRouteMatch(
        skill_id="not_registered",
        domain="physics",
        confidence=0.99,
        capability_id="not_registered.anything",
        problem_spec={"kind": "anything"},
    )

    decision = DefaultCoverageResolver().resolve(
        prompt="讲解这个主题，但没有给出主题或上下文",
        route_match=route_match,
    )

    assert decision.mode == "unsupported"
    assert decision.domain is None
    assert "skill:not_registered:not_registered" in decision.missing_capabilities
    assert "capability:domain_resolution" in decision.missing_capabilities


def test_default_registry_does_not_register_a_generalist_composer() -> None:
    skill_ids = {skill.manifest.skill_id for skill in build_default_skill_registry().all()}

    assert len(skill_ids) == 13
    assert not any("generalist" in skill_id or "composer" in skill_id for skill_id in skill_ids)


def test_generic_override_never_forces_a_registered_skill() -> None:
    registry = build_default_skill_registry()
    prompt = "质量 2kg 的物体受到 10N 水平拉力，忽略摩擦，求加速度"
    match = registry.heuristic_match(SkillRouteInput(prompt=prompt))
    assert match is not None

    decision = DefaultCoverageResolver(registry).resolve(
        prompt=prompt,
        skill_mode_override="generic",
        route_match=match,
    )

    assert decision.mode == "experimental"
    assert decision.domain == "physics"
    assert decision.fallback_policy == "text_only"
    assert "skill:physics_mechanics:blocked_by_generic_override" in (decision.missing_capabilities)


def test_binary_search_dataset_cannot_become_statistics_specialized() -> None:
    registry = build_default_skill_registry()
    prompt = "用二分查找在 [2,4,7,11,18,25,31] 中查找 18"

    # Since issue #282 the statistics extractor no longer claims a bare number
    # list, so the false match is gone at the source.
    false_match = registry.heuristic_match(SkillRouteInput(prompt=prompt))
    assert false_match is None or false_match.skill_id != "probability_statistics_core"

    # The resolver's downstream defense must still hold if a mis-route ever
    # reappears: a statistics claim on an algorithm prompt degrades to
    # experimental with an explicit domain mismatch.
    forged_match = SkillRouteMatch(
        skill_id="probability_statistics_core",
        domain="math",
        confidence=0.9,
        capability_id="probability_statistics_core.descriptive_statistics",
        reason="forged false positive for downstream-defense coverage",
        problem_spec=None,
    )
    decision = DefaultCoverageResolver(registry).resolve(
        prompt=prompt,
        route_match=forged_match,
    )

    assert decision.mode == "experimental"
    assert decision.domain == "algorithm"
    assert decision.matched_skill_ids == ["probability_statistics_core"]
    assert "skill:probability_statistics_core:topic_domain_mismatch" in (
        decision.missing_capabilities
    )


def test_manifest_declared_unsupported_capability_is_rejected() -> None:
    match = SkillRouteMatch(
        skill_id="solid_geometry",
        domain="math",
        confidence=0.91,
        capability_id="solid_geometry.dihedral_angle",
        reason="The router found an explicitly unsupported solid geometry query.",
        needs_refinement=True,
    )

    decision = DefaultCoverageResolver().resolve(
        prompt="求二面角",
        explicit_domain="math",
        route_match=match,
    )

    assert decision.mode == "unsupported"
    assert decision.fallback_policy == "reject"
    assert decision.missing_capabilities == ["capability:solid_geometry.dihedral_angle:unsupported"]


@pytest.mark.parametrize(
    ("prompt", "reason"),
    [
        (
            "质量 2kg 的物体受到 10N 水平拉力，摩擦系数 0.2，求加速度",
            "摩擦系数",
        ),
        (
            "物体从倾角 30 度的斜面下滑，求加速度",
            "friction_not_supported",
        ),
    ],
)
def test_problem_spec_unsupported_assumptions_are_rejected(
    prompt: str,
    reason: str,
) -> None:
    registry = build_default_skill_registry()
    match = registry.heuristic_match(SkillRouteInput(prompt=prompt))
    assert match is not None

    decision = DefaultCoverageResolver(registry).resolve(
        prompt=prompt,
        route_match=match,
    )

    assert decision.mode == "unsupported"
    assert decision.fallback_policy == "reject"
    assert any(reason in item for item in decision.missing_capabilities)


def test_router_cannot_omit_independent_unsupported_assumptions() -> None:
    registry = build_default_skill_registry()
    prompt = "质量 2kg 的物体受到 10N 水平拉力，摩擦系数 0.2，求加速度"
    heuristic_match = registry.heuristic_match(SkillRouteInput(prompt=prompt))
    assert heuristic_match is not None
    assert heuristic_match.problem_spec is not None
    route_spec = {
        key: value
        for key, value in heuristic_match.problem_spec.items()
        if key != "assumptions"
    }

    decision = DefaultCoverageResolver(registry).resolve(
        prompt=prompt,
        route_match=heuristic_match.model_copy(update={"problem_spec": route_spec}),
    )

    assert decision.mode == "unsupported"
    assert "problem_spec:physics_mechanics:unsupported:摩擦系数" in (
        decision.missing_capabilities
    )


@pytest.mark.parametrize(
    ("include_router_match", "skill_mode_override"),
    [(False, None), (True, "generic")],
)
def test_independent_unsupported_scan_survives_generic_or_router_off(
    include_router_match: bool,
    skill_mode_override: str | None,
) -> None:
    registry = build_default_skill_registry()
    prompt = "立体几何中求二面角"
    heuristic_match = registry.heuristic_match(SkillRouteInput(prompt=prompt))
    assert heuristic_match is not None
    assert heuristic_match.capability_id == "solid_geometry.unsupported"

    decision = DefaultCoverageResolver(registry).resolve(
        prompt=prompt,
        skill_mode_override=skill_mode_override,
        route_match=heuristic_match if include_router_match else None,
    )

    assert decision.mode == "unsupported"
    assert decision.fallback_policy == "reject"
    assert "capability:solid_geometry.unsupported:unsupported" in (decision.missing_capabilities)


def test_wrong_domain_unsupported_route_does_not_reject_safe_bfs_profile() -> None:
    false_match = SkillRouteMatch(
        skill_id="solid_geometry",
        domain="math",
        confidence=0.97,
        capability_id="solid_geometry.dihedral_angle",
        needs_refinement=True,
    )

    decision = DefaultCoverageResolver().resolve(
        prompt="用二叉树演示广度优先遍历的访问顺序，逐层点亮节点。",
        explicit_domain="algorithm",
        route_match=false_match,
    )

    assert decision.mode == "composable"
    assert decision.fallback_policy == "compose"


def test_known_domain_without_verified_profile_is_experimental() -> None:
    decision = DefaultCoverageResolver().resolve(
        prompt="解释高斯散度定理的思想",
        explicit_domain="math",
    )

    assert decision.mode == "experimental"
    assert decision.fallback_policy == "text_only"
    assert decision.missing_capabilities == ["capability:controlled_composition:math"]


@pytest.mark.parametrize(
    "prompt",
    [
        "用 BFS 遍历动态图，节点和边会实时增加，并展示队列状态。",
        "用加权二叉树和优先队列演示 BFS 遍历。",
        "用 BFS 构建网页爬虫，展示访问队列。",
        "用邻接表表示二叉树并演示 BFS 遍历。",
        "给定二叉树的邻接矩阵，用 BFS 展示访问顺序。",
        "用二叉树演示 BFS 遍历，边为 A-B, A-C。",
        '用 BFS 遍历显式图数据：{"nodes": ["A", "B"], "edges": [["A", "B"]]}。',
        "用动画演示任意图的 BFS 访问顺序。",
    ],
)
def test_bfs_composable_rejects_uncontrolled_graph_profiles(prompt: str) -> None:
    decision = DefaultCoverageResolver().resolve(
        prompt=prompt,
        explicit_domain="algorithm",
        skill_mode_override="generic",
    )

    assert decision.mode == "experimental"
    assert decision.fallback_policy == "text_only"
    assert "bfs_graph" not in decision.reason


def test_bfs_composable_accepts_controlled_tree_traversal_lesson() -> None:
    decision = DefaultCoverageResolver().resolve(
        prompt=(
            "Use a binary tree to demonstrate BFS traversal order with a queue, "
            "highlight nodes level-by-level."
        ),
        explicit_domain="algorithm",
        skill_mode_override="generic",
    )

    assert decision.mode == "composable"
    assert "bfs_graph" in decision.reason


def test_code_without_controlled_scene_is_text_only_experimental() -> None:
    decision = DefaultCoverageResolver().resolve(
        prompt="逐行解释一段异步 TypeScript 代码的事件循环",
        explicit_domain="code",
    )

    assert decision.mode == "experimental"
    assert decision.fallback_policy == "text_only"


def test_unknown_domain_is_rejected_instead_of_claiming_generic_quality() -> None:
    decision = DefaultCoverageResolver().resolve(
        prompt="讲解这个主题，但没有提供主题名称或任何上下文",
    )

    assert decision.mode == "unsupported"
    assert decision.domain is None
    assert decision.confidence == 0.0
    assert decision.fallback_policy == "reject"
    assert decision.missing_capabilities == ["capability:domain_resolution"]


def test_matched_profile_with_missing_tool_is_text_only_experimental() -> None:
    registry = build_default_skill_registry()
    discovered = RuntimeToolHub(registry).list_tools()
    hub = _DiscoveryOnlyHub(
        [tool for tool in discovered if tool.name != "geometry.assert_passes_through"]
    )

    decision = DefaultCoverageResolver(registry, hub).resolve(
        prompt=("用动画解释导数的几何意义：曲线 y=x² 在点 (1,1) 处切线的斜率为什么是 2。"),
        explicit_domain="math",
    )

    assert decision.mode == "experimental"
    assert decision.fallback_policy == "text_only"
    assert decision.missing_capabilities == ["tool:geometry.assert_passes_through"]
    assert decision.available_tool_ids == [
        "playbook.schema.validate",
        "playbook.self_check",
    ]


def test_specialized_requires_deterministic_solve_and_quality_validators() -> None:
    registry = build_default_skill_registry()
    prompt = "质量 2kg 的物体受到 10N 水平拉力，忽略摩擦，求加速度"
    match = registry.heuristic_match(SkillRouteInput(prompt=prompt))
    assert match is not None
    discovered = RuntimeToolHub(registry).list_tools()
    hub = _DiscoveryOnlyHub(
        [
            tool.model_copy(update={"deterministic": False})
            if tool.name == "skill.physics_mechanics.solve"
            else tool
            for tool in discovered
            if tool.name != "playbook.self_check"
        ]
    )

    decision = DefaultCoverageResolver(registry, hub).resolve(
        prompt=prompt,
        route_match=match,
    )

    assert decision.mode == "experimental"
    assert "tool:skill.physics_mechanics.solve:not_deterministic" in (decision.missing_capabilities)
    assert "validator:playbook.self_check" in decision.missing_capabilities
    assert "skill.physics_mechanics.solve" not in decision.available_tool_ids
    assert decision.available_tool_ids == [
        "playbook.schema.validate",
    ]


def test_exact_profile_with_only_missing_validator_allows_limited_visual() -> None:
    registry = build_default_skill_registry()
    discovered = RuntimeToolHub(registry).list_tools()
    hub = _DiscoveryOnlyHub([tool for tool in discovered if tool.name != "playbook.self_check"])

    decision = DefaultCoverageResolver(registry, hub).resolve(
        prompt=("用动画解释导数的几何意义：曲线 y=x² 在点 (1,1) 处切线的斜率为什么是 2。"),
        explicit_domain="math",
    )

    assert decision.mode == "experimental"
    assert decision.fallback_policy == "limited_visual"
    assert decision.missing_capabilities == ["validator:playbook.self_check"]
    assert decision.available_tool_ids == [
        "playbook.schema.validate",
        "scene_blueprint.compile",
    ]


def test_known_domain_does_not_imply_a_safe_scene_family() -> None:
    decision = DefaultCoverageResolver().resolve(
        prompt="用动画讲解基尔霍夫电路定律",
        explicit_domain="physics",
    )

    assert decision.mode == "experimental"
    assert decision.fallback_policy == "text_only"
    assert "scene_blueprint.compile" not in decision.available_tool_ids


def test_unsupported_decision_does_not_advertise_tools() -> None:
    decision = DefaultCoverageResolver().resolve(
        prompt="没有主题或上下文",
    )

    assert decision.mode == "unsupported"
    assert decision.available_tool_ids == []


def test_tool_discovery_order_does_not_change_the_decision() -> None:
    registry = build_default_skill_registry()
    tools = RuntimeToolHub(registry).list_tools()
    prompt = "用二叉树演示广度优先遍历的访问顺序，逐层点亮节点。"

    forward = DefaultCoverageResolver(registry, _DiscoveryOnlyHub(tools)).resolve(
        prompt=prompt, explicit_domain="algorithm"
    )
    reversed_order = DefaultCoverageResolver(
        registry, _DiscoveryOnlyHub(list(reversed(tools)))
    ).resolve(prompt=prompt, explicit_domain="algorithm")

    assert forward == reversed_order


@pytest.mark.parametrize(
    ("minimum", "refine"),
    [(-0.1, 0.0), (0.6, 0.7), (1.1, 0.5)],
)
def test_resolver_rejects_invalid_confidence_thresholds(
    minimum: float,
    refine: float,
) -> None:
    with pytest.raises(ValueError, match="confidence thresholds"):
        DefaultCoverageResolver(
            min_confidence=minimum,
            refine_confidence=refine,
        )


class _DiscoveryOnlyHub:
    def __init__(self, tools: list[Any]) -> None:
        self._tools = tools

    def list_tools(self) -> list[Any]:
        return self._tools
