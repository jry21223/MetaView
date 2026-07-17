from __future__ import annotations

import pytest

from app.application.services.lesson_planner import (
    LessonPlanningError,
    LLMAssistedLessonPlanner,
    RuleBasedLessonPlanner,
    build_rule_based_lesson_plan,
)
from app.domain.models.route_decision import RouteDecision


class _ReturningLLM:
    def __init__(self, response: str) -> None:
        self.response = response
        self.calls: list[tuple[str, str]] = []

    async def complete(self, system: str, user: str) -> str:
        self.calls.append((system, user))
        return self.response


def test_rule_planner_is_deterministic_and_selects_known_capability() -> None:
    kwargs = {
        "prompt": "用 BFS 解释为什么广度优先遍历需要队列",
        "domain": "algorithm",
        "title": "BFS 与队列",
    }

    first = build_rule_based_lesson_plan(**kwargs)
    second = build_rule_based_lesson_plan(**kwargs)

    assert first == second
    assert first.domain == "algorithm"
    assert first.lesson_arc == "state_transition"
    assert first.title == "BFS 与队列"
    assert [scene.strategy for scene in first.scenes] == [
        "intuition",
        "demonstration",
        "state_transition",
        "summary",
    ]
    assert {
        scene.preferred_scene_type
        for scene in first.scenes
        if scene.preferred_scene_type is not None
    } == {"bfs_graph"}
    assert {"breadth_first", "queue", "visited", "order"} <= {
        fact_id for scene in first.scenes for fact_id in scene.required_fact_ids
    }
    assert {"node", "edge", "current_node", "visited", "queue"} <= {
        role for scene in first.scenes for role in scene.required_visual_roles
    }
    assert "先进先出" in first.expected_conclusion


@pytest.mark.asyncio
async def test_rule_planner_infers_domain_without_fixture_io() -> None:
    planner = RuleBasedLessonPlanner()

    plan = await planner.plan(prompt="解释导数与切线斜率的关系")

    assert plan.domain == "math"
    assert plan.scenes[1].preferred_scene_type == "derivative_tangent"
    assert plan.scenes[2].strategy == "derivation"


@pytest.mark.asyncio
async def test_rule_planner_uses_honest_general_domain_for_unknown_topic() -> None:
    planner = RuleBasedLessonPlanner()

    plan = await planner.plan(prompt="解释这个新概念")

    assert plan.domain == "general"
    assert plan.lesson_arc == "problem_to_solution"
    assert all(scene.preferred_scene_type is None for scene in plan.scenes)


def test_rule_planner_uses_resolved_route_capability() -> None:
    route = RouteDecision(
        destination="deterministic_skill",
        domain="math",
        skill_id="calculus_core",
        confidence=0.95,
        matched_capability="calculus_core.derivative",
        problem_spec={
            "task": "derivative",
            "expression": "x^2",
            "variable": "x",
        },
    )

    plan = build_rule_based_lesson_plan(
        prompt="求 d/dx (x^2)",
        domain="math",
        route_decision=route,
    )

    assert {"derivative", "tangent", "slope"} <= {
        fact_id for scene in plan.scenes for fact_id in scene.required_fact_ids
    }
    assert plan.scenes[1].preferred_scene_type == "derivative_tangent"
    assert "导数为 2x" in plan.expected_conclusion


@pytest.mark.parametrize(
    ("prompt", "domain", "scene_type", "facts", "roles", "conclusion_term"),
    [
        (
            "解释导数与切线斜率",
            "math",
            "derivative_tangent",
            {"derivative", "tangent", "slope"},
            {"curve", "target_point", "secant", "tangent", "slope"},
            "切线斜率",
        ),
        (
            "用 BFS 遍历图",
            "algorithm",
            "bfs_graph",
            {"breadth_first", "queue", "visited", "order"},
            {"node", "edge", "current_node", "visited", "queue"},
            "先进先出",
        ),
        (
            "追踪 factorial 的递归调用栈",
            "code",
            "recursion_stack",
            {
                "factorial",
                "base_case",
                "recursive_call",
                "return_unwind",
                "factorial_result",
            },
            {"stack_frame", "active_frame", "code_line", "return_value"},
            "乘法",
        ),
        (
            "解释平抛运动",
            "physics",
            "projectile_motion",
            {"horizontal_velocity", "vertical_velocity", "gravity", "parabolic"},
            {
                "object",
                "trajectory",
                "horizontal_velocity",
                "vertical_velocity",
                "gravity",
            },
            "抛物线",
        ),
    ],
)
def test_rule_planner_adds_capability_semantics(
    prompt: str,
    domain: str,
    scene_type: str,
    facts: set[str],
    roles: set[str],
    conclusion_term: str,
) -> None:
    plan = build_rule_based_lesson_plan(prompt=prompt, domain=domain)

    assert scene_type in {
        scene.preferred_scene_type
        for scene in plan.scenes
        if scene.preferred_scene_type is not None
    }
    assert facts <= {
        fact_id for scene in plan.scenes for fact_id in scene.required_fact_ids
    }
    assert roles <= {
        role for scene in plan.scenes for role in scene.required_visual_roles
    }
    assert conclusion_term in plan.expected_conclusion
    assert len(plan.misconceptions) >= 2


@pytest.mark.asyncio
async def test_llm_assisted_planner_refines_and_validates_rule_draft() -> None:
    draft = build_rule_based_lesson_plan(
        prompt="解释平抛运动",
        domain="physics",
    )
    refined = draft.model_copy(
        update={
            "expected_conclusion": "水平速度保持不变，竖直速度受重力持续改变。",
        }
    )
    llm = _ReturningLLM(f"```json\n{refined.model_dump_json()}\n```")
    planner = LLMAssistedLessonPlanner(llm)

    plan = await planner.plan(prompt="解释平抛运动", domain="physics")

    assert plan.expected_conclusion == refined.expected_conclusion
    assert plan.domain == "physics"
    assert len(llm.calls) == 1
    system, user = llm.calls[0]
    assert "Do not include coordinates" in system
    assert "Deterministic draft" in user
    assert "LessonPlan JSON schema" in user


@pytest.mark.asyncio
async def test_llm_assisted_planner_fails_closed_on_invalid_output() -> None:
    planner = LLMAssistedLessonPlanner(_ReturningLLM("not json"))

    with pytest.raises(LessonPlanningError, match="invalid JSON"):
        await planner.plan(prompt="解释牛顿第二定律", domain="physics")


@pytest.mark.asyncio
async def test_llm_assisted_planner_rejects_domain_drift() -> None:
    draft = build_rule_based_lesson_plan(prompt="解释导数", domain="math")
    changed = draft.model_copy(update={"domain": "physics"})
    planner = LLMAssistedLessonPlanner(_ReturningLLM(changed.model_dump_json()))

    with pytest.raises(LessonPlanningError, match="changed the resolved lesson domain"):
        await planner.plan(prompt="解释导数", domain="math")
