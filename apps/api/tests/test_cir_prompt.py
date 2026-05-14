from app.domain.models.topic import TopicDomain
from app.domain.services.cir_prompt import build_cir_prompt


def test_returns_two_strings() -> None:
    system, user = build_cir_prompt("test prompt", TopicDomain.ALGORITHM)
    assert isinstance(system, str) and len(system) > 0
    assert isinstance(user, str)


def test_user_prompt_equals_original_input() -> None:
    prompt = "请可视化二分查找"
    _, user = build_cir_prompt(prompt, TopicDomain.ALGORITHM)
    assert user == prompt


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
