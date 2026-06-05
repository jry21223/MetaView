from app.domain.models.topic import TopicDomain
from app.domain.services.cir_prompt import build_cir_prompt
from app.domain.services.domain_router import SkillMode


def test_same_physics_question_specialized_vs_generic_prompt() -> None:
    prompt = "斜面小球受力分析，解释摩擦力和加速度"
    specialized_system, _ = build_cir_prompt(
        prompt,
        TopicDomain.PHYSICS,
        skill_mode=SkillMode.SPECIALIZED,
    )
    generic_system, _ = build_cir_prompt(
        prompt,
        None,
        skill_mode=SkillMode.GENERIC,
    )
    assert specialized_system != generic_system
    assert "VISUAL + PEDAGOGY RULES for physics" in specialized_system
    assert "VISUAL + PEDAGOGY RULES for physics" not in generic_system
    assert "Skill mode: generic" in generic_system


def test_same_algorithm_question_specialized_vs_generic_prompt() -> None:
    prompt = "可视化二分查找"
    specialized_system, _ = build_cir_prompt(
        prompt,
        TopicDomain.ALGORITHM,
        skill_mode=SkillMode.SPECIALIZED,
    )
    generic_system, _ = build_cir_prompt(
        prompt,
        None,
        skill_mode=SkillMode.GENERIC,
    )
    assert specialized_system != generic_system
    assert "VISUAL + PEDAGOGY RULES for algorithms" in specialized_system
    assert "VISUAL + PEDAGOGY RULES for algorithms" not in generic_system
