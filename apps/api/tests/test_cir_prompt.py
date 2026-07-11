from app.application.services.lesson_planner import build_rule_based_lesson_plan
from app.domain.models.coverage import CoverageDecision
from app.domain.models.topic import TopicDomain
from app.domain.services.cir_prompt import build_cir_prompt
from app.domain.services.domain_router import SkillMode


def test_returns_two_strings() -> None:
    system, user = build_cir_prompt("test prompt", TopicDomain.ALGORITHM)
    assert isinstance(system, str) and len(system) > 0
    assert isinstance(user, str)


def test_user_prompt_equals_original_input() -> None:
    prompt = "请可视化二分查找"
    _, user = build_cir_prompt(prompt, TopicDomain.ALGORITHM)
    assert user == prompt


def test_canonical_lesson_plan_guides_cir_without_changing_user_prompt() -> None:
    prompt = "用 BFS 解释广度优先遍历为什么需要队列"
    lesson_plan = build_rule_based_lesson_plan(prompt=prompt, domain="algorithm")

    system, user = build_cir_prompt(
        prompt,
        TopicDomain.ALGORITHM,
        lesson_plan=lesson_plan,
    )

    assert user == prompt
    assert "Canonical LessonPlan" in system
    assert '"preferred_scene_type": "bfs_graph"' in system
    assert '"required_fact_ids"' in system
    assert "Do not copy LessonPlan into renderer payloads" in system


def test_system_prompt_contains_domain_hint() -> None:
    system, _ = build_cir_prompt("test", TopicDomain.MATH)
    assert "math" in system.lower()


def test_system_prompt_contains_json_schema_keywords() -> None:
    system, _ = build_cir_prompt("test", TopicDomain.ALGORITHM)
    assert "CirDocument" in system or "visual_kind" in system
    assert "narration" in system


def test_different_domains_produce_different_guidance() -> None:
    sys_algo, _ = build_cir_prompt("test", TopicDomain.ALGORITHM)
    sys_chem, _ = build_cir_prompt("test", TopicDomain.CHEMISTRY)
    assert sys_algo != sys_chem


def test_system_prompt_instructs_json_only_output() -> None:
    system, _ = build_cir_prompt("test", TopicDomain.ALGORITHM)
    assert "JSON" in system


def test_math_prompt_includes_layer_examples() -> None:
    """Phase 4: math domain prompt must surface the multi-layer step examples
    so the LLM can imitate the structure for Green's-theorem-style content."""
    system, _ = build_cir_prompt("画格林公式", TopicDomain.MATH)
    assert "多层 step 黄金范例" in system
    assert "math_scene" in system
    assert "katex_overlay" in system
    assert "narration_card" in system


def test_layers_schema_documented_in_prompt() -> None:
    system, _ = build_cir_prompt("test", TopicDomain.MATH)
    # The schema block lists each layer kind and the appear_anim values.
    assert "appear_anim" in system
    assert "z_order" in system
    assert "enter_at" in system


def test_self_check_includes_layer_validation() -> None:
    system, _ = build_cir_prompt("test", TopicDomain.MATH)
    # New self-check item: validate layer timing windows.
    assert "enter_at <= exit_at" in system


def test_math_prompt_advertises_scene_visual_kind() -> None:
    """Phase 5 fix: prompt must tell LLM that `scene` exists as a math visual_kind.
    Previously the prompt only listed function/formula, so the LLM never picked
    scene even for vector fields and 2D regions."""
    system, _ = build_cir_prompt("画格林公式", TopicDomain.MATH)
    assert "function" in system and "scene" in system and "formula" in system
    # The schema line listing valid visual_kind values must include scene.
    assert "function | scene | formula" in system or "scene" in system
    # The trigger-word list MUST mention vector field + region (otherwise LLM
    # has no concrete cue to pick scene over formula).
    assert "向量场" in system and "区域" in system


def test_math_prompt_forbids_formula_for_vector_field() -> None:
    system, _ = build_cir_prompt("test", TopicDomain.MATH)
    # The self-check section must call out the formula-vs-scene failure mode.
    assert "向量场" in system
    # And explicitly forbid duplicate layers (real LLM bug we observed).
    assert "math_scene 只能出现一次" in system


def test_math_prompt_forbids_points_polyline_shape() -> None:
    """Phase 5b: prompt must explicitly forbid the LLM's natural-but-wrong
    output shapes (``{points: [...]}`` for segments and curves).

    Real LLM failure observed: 17 pydantic validation errors because the
    LLM emitted ``{"points": [[x,y], ...]}`` instead of ``{x0,y0,x1,y1}``."""
    system, _ = build_cir_prompt("画格林公式", TopicDomain.MATH)
    assert "不要" in system and "polyline" in system.lower() or "x0" in system
    # Explicit guidance for segments and curves shapes.
    assert "x0" in system and "x1" in system  # segment shape called out
    assert "expression_y" in system  # curve shape called out


def test_build_cir_prompt_generic_mode_has_no_domain_specific_guidance() -> None:
    system, user = build_cir_prompt(
        "explain an unfamiliar idea",
        None,
        skill_mode=SkillMode.GENERIC,
    )
    assert user == "explain an unfamiliar idea"
    assert "Skill mode: generic" in system
    assert "No confident subject-specific skill was matched" in system
    assert "VISUAL + PEDAGOGY RULES for algorithms" not in system
    assert "VISUAL + PEDAGOGY RULES for physics" not in system


def test_build_cir_prompt_includes_binding_coverage_boundary() -> None:
    coverage = CoverageDecision(
        mode="experimental",
        domain="physics",
        confidence=0.62,
        matched_skill_ids=[],
        available_tool_ids=["scene_blueprint.compile"],
        missing_capabilities=["validator:physics.circuit"],
        fallback_policy="text_only",
        reason="Circuit facts cannot be validated by the current runtime.",
    )

    system, _ = build_cir_prompt(
        "解释基尔霍夫定律",
        TopicDomain.PHYSICS,
        coverage_decision=coverage,
    )

    assert "Canonical CoverageDecision" in system
    assert "BINDING CAPABILITY BOUNDARY" in system
    assert "validator:physics.circuit" in system
    assert "does not authorize invented outputs" in system


def test_build_cir_prompt_specialized_mode_keeps_domain_guidance() -> None:
    system, _ = build_cir_prompt(
        "斜面小球受力分析",
        TopicDomain.PHYSICS,
        skill_mode=SkillMode.SPECIALIZED,
    )
    assert "Skill mode: specialized" in system
    assert "VISUAL + PEDAGOGY RULES for physics" in system


def test_physics_prompt_prefers_scene_for_spatial_diagrams() -> None:
    system, _ = build_cir_prompt("讲解斜面受力", TopicDomain.PHYSICS)
    assert 'visual_kind="scene"' in system
    assert "force diagrams" in system
    assert "vectors" in system
    assert "free-body diagrams" in system
    assert "projectile motion" in system


def test_physics_prompt_limits_array_to_quantity_tables() -> None:
    system, _ = build_cir_prompt("讲解牛顿第二定律", TopicDomain.PHYSICS)
    assert "compact quantity table" in system
    assert 'visual_kind="array" only' in system
    assert 'Use visual_kind="array" to show forces' not in system
