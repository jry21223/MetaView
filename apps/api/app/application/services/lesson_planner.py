from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass

from pydantic import ValidationError

from app.application.ports.lesson_planner import ILessonPlanner
from app.application.ports.llm_provider import ILLMProvider
from app.domain.models.lesson_plan import LessonPlan, SceneIntent
from app.domain.models.route_decision import RouteDecision
from app.domain.models.topic import TopicDomain
from app.domain.services.domain_router import route_topic


@dataclass(frozen=True)
class _DomainTemplate:
    arc: str
    prerequisite: str
    misconception: str
    primary_role: str
    process_role: str


@dataclass(frozen=True)
class _CapabilityTemplate:
    scene_type: str
    terms: tuple[str, ...]
    fact_ids: tuple[str, ...]
    visual_roles: tuple[str, ...]
    expected_conclusion: str
    misconception: str


_DOMAIN_TEMPLATES: dict[str, _DomainTemplate] = {
    TopicDomain.ALGORITHM.value: _DomainTemplate(
        arc="state_transition",
        prerequisite="理解基本数据结构和按步骤执行的含义。",
        misconception="算法步骤只描述结果，不需要展示中间状态。",
        primary_role="data_structure",
        process_role="algorithm_state_transition",
    ),
    TopicDomain.CODE.value: _DomainTemplate(
        arc="state_transition",
        prerequisite="能识别函数、变量和控制流。",
        misconception="只读代码文本就能完整理解运行时状态。",
        primary_role="code_structure",
        process_role="runtime_state_transition",
    ),
    TopicDomain.MATH.value: _DomainTemplate(
        arc="intuition_to_abstraction",
        prerequisite="掌握题目涉及的基础符号和运算。",
        misconception="记住公式就等于理解公式对应的几何或数量关系。",
        primary_role="concrete_math_example",
        process_role="math_relation",
    ),
    TopicDomain.PHYSICS.value: _DomainTemplate(
        arc="problem_to_solution",
        prerequisite="能区分物理量、方向和单位。",
        misconception="公式中的各个量可以脱离受力或运动情境直接代入。",
        primary_role="physical_phenomenon",
        process_role="mechanism_or_vector_relation",
    ),
    TopicDomain.CHEMISTRY.value: _DomainTemplate(
        arc="state_transition",
        prerequisite="能识别基本物质、粒子或反应式。",
        misconception="化学变化只是符号替换，不需要检查粒子和守恒关系。",
        primary_role="chemical_structure_or_reactant",
        process_role="reaction_transition",
    ),
    TopicDomain.BIOLOGY.value: _DomainTemplate(
        arc="state_transition",
        prerequisite="能区分生物结构、功能和过程。",
        misconception="结构名称本身就足以解释其功能和过程。",
        primary_role="biological_structure",
        process_role="biological_process",
    ),
    TopicDomain.GEOGRAPHY.value: _DomainTemplate(
        arc="comparison",
        prerequisite="能识别基本空间位置和时间尺度。",
        misconception="地理现象只有单一成因，且在所有区域和时间都相同。",
        primary_role="spatial_context",
        process_role="cause_effect_comparison",
    ),
    "general": _DomainTemplate(
        arc="problem_to_solution",
        prerequisite="理解题目中的基本术语。",
        misconception="只给结论而不展示证据和推理过程也算完整解释。",
        primary_role="concept_context",
        process_role="evidence_relation",
    ),
}

_CAPABILITY_TEMPLATES: tuple[_CapabilityTemplate, ...] = (
    _CapabilityTemplate(
        scene_type="bfs_graph",
        terms=("bfs", "广度优先"),
        fact_ids=("breadth_first", "queue", "visited", "order"),
        visual_roles=("node", "edge", "current_node", "visited", "queue"),
        expected_conclusion=(
            "BFS 使用先进先出的队列逐层访问图节点：每次处理队首节点，"
            "再把尚未访问的相邻节点加入队尾。"
        ),
        misconception="把 BFS 当成沿单一路径深入的 DFS，或忽略 visited 而重复入队。",
    ),
    _CapabilityTemplate(
        scene_type="recursion_stack",
        terms=("递归", "factorial", "调用栈"),
        fact_ids=(
            "factorial",
            "base_case",
            "recursive_call",
            "return_unwind",
            "factorial_result",
        ),
        visual_roles=("stack_frame", "active_frame", "code_line", "return_value"),
        expected_conclusion=(
            "factorial 通过递归建立等待相乘的栈帧，基例停止继续调用，"
            "返回值随后沿调用栈逐层回溯并完成乘法。"
        ),
        misconception="把压栈顺序与回溯返回顺序混为一谈，或忽略终止递归所需的基例。",
    ),
    _CapabilityTemplate(
        scene_type="derivative_tangent",
        terms=("导数", "切线", "derivative", "tangent"),
        fact_ids=("derivative", "tangent", "slope"),
        visual_roles=("curve", "target_point", "secant", "tangent", "slope"),
        expected_conclusion=(
            "当割线的第二点趋近目标点时，割线斜率趋近该点的导数；"
            "这个极限也就是曲线在该点的切线斜率。"
        ),
        misconception="把任意一条割线斜率直接当成导数，或只记公式而不能对应到切线。",
    ),
    _CapabilityTemplate(
        scene_type="projectile_motion",
        terms=("平抛", "抛体", "projectile"),
        fact_ids=("horizontal_velocity", "vertical_velocity", "gravity", "parabolic"),
        visual_roles=(
            "object",
            "trajectory",
            "horizontal_velocity",
            "vertical_velocity",
            "gravity",
        ),
        expected_conclusion=(
            "平抛运动的水平速度保持不变，竖直方向具有由重力产生的加速度，"
            "因此重力使物体竖直加速、竖直速度不断改变，"
            "两个分运动合成抛物线轨迹。"
        ),
        misconception="认为重力会改变水平速度，或把竖直加速度恒定误解为竖直速度不变。",
    ),
)

_OTHER_CAPABILITY_SCENES: tuple[tuple[tuple[str, ...], str], ...] = (
    (("二分", "binary search"), "binary_search"),
    (("东亚季风", "east asia monsoon"), "east_asia_monsoon"),
    (("dna复制", "dna replication"), "dna_replication"),
    (("细胞结构", "cell structure"), "cell_structure"),
)


class LessonPlanningError(RuntimeError):
    """Raised when an assisted planner cannot produce a valid LessonPlan."""


class RuleBasedLessonPlanner:
    async def plan(
        self,
        *,
        prompt: str,
        domain: str | None = None,
        title: str | None = None,
        route_decision: RouteDecision | None = None,
        source_code: str | None = None,
        language: str | None = None,
    ) -> LessonPlan:
        return build_rule_based_lesson_plan(
            prompt=prompt,
            domain=domain,
            title=title,
            route_decision=route_decision,
            source_code=source_code,
            language=language,
        )


class LLMAssistedLessonPlanner:
    def __init__(
        self,
        llm: ILLMProvider,
        *,
        base_planner: ILessonPlanner | None = None,
    ) -> None:
        self._llm = llm
        self._base_planner = base_planner or RuleBasedLessonPlanner()

    async def plan(
        self,
        *,
        prompt: str,
        domain: str | None = None,
        title: str | None = None,
        route_decision: RouteDecision | None = None,
        source_code: str | None = None,
        language: str | None = None,
    ) -> LessonPlan:
        draft = await self._base_planner.plan(
            prompt=prompt,
            domain=domain,
            title=title,
            route_decision=route_decision,
            source_code=source_code,
            language=language,
        )
        system, user = _lesson_planner_prompt(prompt, draft)
        try:
            raw = await self._llm.complete(system, user)
            candidate = LessonPlan.model_validate_json(_strip_markdown_fences(raw))
        except (ValidationError, ValueError, TypeError) as exc:
            raise LessonPlanningError(
                "LLM-assisted lesson planning returned invalid JSON."
            ) from exc
        if candidate.domain != draft.domain:
            raise LessonPlanningError(
                "LLM-assisted lesson planning changed the resolved lesson domain."
            )
        return candidate


def build_rule_based_lesson_plan(
    *,
    prompt: str,
    domain: str | None = None,
    title: str | None = None,
    route_decision: RouteDecision | None = None,
    source_code: str | None = None,
    language: str | None = None,
) -> LessonPlan:
    del language
    topic = _lesson_title(title or prompt)
    resolved_domain = _resolve_domain(prompt, domain)
    template = _DOMAIN_TEMPLATES[resolved_domain]
    capability = _capability_template(prompt, route_decision=route_decision)
    preferred_scene_type = (
        capability.scene_type if capability is not None else _other_preferred_scene_type(prompt)
    )
    fact_ids = list(capability.fact_ids) if capability is not None else []
    if source_code and resolved_domain == TopicDomain.CODE.value:
        fact_ids = _unique([*fact_ids, "source_code"])
    capability_roles = list(capability.visual_roles) if capability is not None else []
    core_roles = _unique([template.primary_role, template.process_role, *capability_roles])
    process_roles = _unique([template.process_role, *capability_roles])
    scenes = [
        SceneIntent(
            scene_id="lesson_context",
            teaching_goal=f"建立对“{topic}”的直观问题情境。",
            strategy="intuition",
            required_fact_ids=[],
            required_visual_roles=[template.primary_role],
            preferred_scene_type=None,
            narration_goal="说明为什么需要理解这个问题，并连接已有经验。",
        ),
        SceneIntent(
            scene_id="lesson_core",
            teaching_goal=f"展示“{topic}”的核心对象和关系。",
            strategy="demonstration",
            required_fact_ids=fact_ids,
            required_visual_roles=core_roles,
            preferred_scene_type=preferred_scene_type,
            narration_goal="用一个具体、可观察的例子指出关键对象和当前状态。",
        ),
        SceneIntent(
            scene_id="lesson_reasoning",
            teaching_goal=f"解释“{topic}”从条件到结论的关键变化。",
            strategy=_reasoning_strategy(resolved_domain),
            required_fact_ids=fact_ids,
            required_visual_roles=process_roles,
            preferred_scene_type=preferred_scene_type,
            narration_goal="逐步连接事实、状态或公式，避免跳过关键推理。",
        ),
        SceneIntent(
            scene_id="lesson_summary",
            teaching_goal=f"复核并总结“{topic}”的结论与适用边界。",
            strategy="summary",
            required_fact_ids=fact_ids,
            required_visual_roles=_unique(["conclusion", *capability_roles]),
            preferred_scene_type=None,
            narration_goal="直接回答原问题，并指出结论依赖的核心证据。",
        ),
    ]
    return LessonPlan(
        schema_version="1.0.0",
        domain=resolved_domain,
        title=topic,
        learning_objectives=[
            f"理解“{topic}”的核心对象和关系。",
            f"能沿着可视过程解释“{topic}”的关键推理。",
            f"能用证据复核关于“{topic}”的结论。",
        ],
        prerequisites=[template.prerequisite],
        misconceptions=_unique([
            template.misconception,
            *([capability.misconception] if capability is not None else []),
        ]),
        expected_conclusion=(
            _expected_conclusion(prompt, capability, route_decision=route_decision)
            if capability is not None
            else f"用已解析事实和可视过程完整回答：{topic}"
        ),
        lesson_arc=template.arc,
        scenes=scenes,
    )


def _resolve_domain(prompt: str, domain: str | None) -> str:
    if domain:
        normalized = domain.strip().lower()
        try:
            return TopicDomain(normalized).value
        except ValueError:
            return "general"
    routed = route_topic(prompt)
    return routed.domain.value if routed.domain is not None else "general"


def _lesson_title(value: str) -> str:
    first_line = next((line.strip() for line in value.splitlines() if line.strip()), "课程讲解")
    return first_line if len(first_line) <= 80 else f"{first_line[:79]}…"


def _capability_template(
    prompt: str,
    *,
    route_decision: RouteDecision | None = None,
) -> _CapabilityTemplate | None:
    routing_terms = ""
    if route_decision is not None:
        routing_terms = " ".join(
            value
            for value in (
                route_decision.skill_id,
                route_decision.matched_capability,
            )
            if value
        )
    normalized = "".join(f"{prompt} {routing_terms}".lower().split())
    for capability in _CAPABILITY_TEMPLATES:
        if any(
            "".join(term.lower().split()) in normalized for term in capability.terms
        ):
            return capability
    return None


def _expected_conclusion(
    prompt: str,
    capability: _CapabilityTemplate,
    *,
    route_decision: RouteDecision | None,
) -> str:
    if capability.scene_type == "derivative_tangent":
        x_squared = re.search(r"(?:y\s*=\s*)?x(?:\^?2|²)", prompt, flags=re.IGNORECASE)
        point = re.search(
            r"(?:点|point)?\s*[（(]\s*(-?\d+(?:\.\d+)?)\s*[,，]\s*"
            r"(-?\d+(?:\.\d+)?)\s*[）)]",
            prompt,
            flags=re.IGNORECASE,
        )
        if x_squared and point:
            x0 = float(point.group(1))
            y0 = float(point.group(2))
            slope = 2 * x0
            return (
                f"曲线 y=x² 在点 ({_format_number(x0)},{_format_number(y0)}) 处的"
                f"导数等于 {_format_number(slope)}，因此该点的切线斜率也等于 "
                f"{_format_number(slope)}。"
            )
        problem_spec = route_decision.problem_spec if route_decision is not None else None
        if isinstance(problem_spec, dict):
            expression = str(problem_spec.get("expression") or "").replace(" ", "")
            variable = str(problem_spec.get("variable") or "x")
            if expression in {f"{variable}^2", f"{variable}**2", f"{variable}²"}:
                return (
                    f"函数 {expression} 对 {variable} 的导数为 2{variable}；"
                    "这个导数给出各点的瞬时变化率，并在指定点等于切线斜率。"
                )
    if capability.scene_type == "recursion_stack":
        factorial_match = re.search(r"factorial\s*[（(]\s*(\d+)\s*[）)]", prompt, re.I)
        if factorial_match:
            n = int(factorial_match.group(1))
            if 0 <= n <= 12:
                return (
                    f"factorial({n}) 先建立等待相乘的递归栈帧，基例返回后逐层"
                    f"回溯并完成乘法，最终 factorial({n})={math.factorial(n)}。"
                )
    return capability.expected_conclusion


def _format_number(value: float) -> str:
    return str(int(value)) if value.is_integer() else str(value)


def _other_preferred_scene_type(prompt: str) -> str | None:
    normalized = "".join(prompt.lower().split())
    for terms, scene_type in _OTHER_CAPABILITY_SCENES:
        if any("".join(term.lower().split()) in normalized for term in terms):
            return scene_type
    return None


def _unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys(values))


def _reasoning_strategy(domain: str) -> str:
    if domain in {TopicDomain.ALGORITHM.value, TopicDomain.CODE.value, TopicDomain.BIOLOGY.value}:
        return "state_transition"
    if domain == TopicDomain.GEOGRAPHY.value:
        return "comparison"
    if domain == TopicDomain.MATH.value:
        return "derivation"
    return "demonstration"


def _lesson_planner_prompt(prompt: str, draft: LessonPlan) -> tuple[str, str]:
    schema = json.dumps(LessonPlan.model_json_schema(), ensure_ascii=False, indent=2)
    draft_json = draft.model_dump_json(indent=2)
    system = """You refine a MetaView LessonPlan for an educational visualization.
Return one JSON object matching the supplied LessonPlan schema and nothing else.
Preserve the resolved domain. Improve only teaching decisions: objectives,
prerequisites, misconceptions, expected conclusion, lesson arc, and SceneIntent.
Do not include coordinates, frames, SVG, asset paths, renderer-private fields,
React structures, arbitrary code, or a PlaybookScript."""
    user = f"""Original teaching request:
{prompt}

Deterministic draft:
{draft_json}

LessonPlan JSON schema:
{schema}

Return the refined LessonPlan JSON only."""
    return system, user


def _strip_markdown_fences(text: str) -> str:
    stripped = text.strip()
    if not stripped.startswith("```"):
        return stripped
    lines = stripped.splitlines()[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()


__all__ = [
    "LLMAssistedLessonPlanner",
    "LessonPlanningError",
    "RuleBasedLessonPlanner",
    "build_rule_based_lesson_plan",
]
