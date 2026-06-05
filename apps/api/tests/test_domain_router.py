import pytest

from app.domain.models.topic import TopicDomain
from app.domain.services.domain_router import SkillMode, keyword_hint, route_topic


@pytest.mark.parametrize("prompt,expected", [
    ("请可视化二分查找的过程", TopicDomain.ALGORITHM),
    ("visualize bubble sort algorithm", TopicDomain.ALGORITHM),
    ("请分析这段python代码的执行流程", TopicDomain.CODE),
    ("explain this for loop in python", TopicDomain.CODE),
    ("请可视化定积分的区间逼近", TopicDomain.MATH),
    ("show me how matrix multiplication works", TopicDomain.MATH),
    ("斜面小球受力分析和运动轨迹", TopicDomain.PHYSICS),
    ("how does electric circuit work", TopicDomain.PHYSICS),
    ("苯环分子结构和化学键变化", TopicDomain.CHEMISTRY),
    ("show organic compound reaction mechanism", TopicDomain.CHEMISTRY),
    ("细胞有丝分裂各阶段", TopicDomain.BIOLOGY),
    ("explain cell division mitosis", TopicDomain.BIOLOGY),
    ("水循环中蒸发降水径流", TopicDomain.GEOGRAPHY),
    ("show monsoon climate pattern on map", TopicDomain.GEOGRAPHY),
])
def test_keyword_hint_correct_domain(prompt: str, expected: TopicDomain) -> None:
    assert keyword_hint(prompt) == expected


def test_route_topic_unknown_uses_generic_skill() -> None:
    route = route_topic("some completely unrelated text 随机文字")
    assert route.skill_mode == SkillMode.GENERIC
    assert route.domain is None
    assert route.reason == "no_keyword_match"


def test_keyword_hint_returns_none_for_unknown() -> None:
    assert keyword_hint("some completely unrelated text 随机文字") is None


def test_route_topic_algorithm_keyword_uses_specialized_skill() -> None:
    route = route_topic("请可视化二分查找的过程")
    assert route.skill_mode == SkillMode.SPECIALIZED
    assert route.domain == TopicDomain.ALGORITHM
    assert "二分" in route.matched_keywords


def test_route_topic_explicit_domain_wins() -> None:
    route = route_topic("anything", explicit_domain="physics")
    assert route.skill_mode == SkillMode.SPECIALIZED
    assert route.domain == TopicDomain.PHYSICS
    assert route.explicit is True


def test_route_topic_source_code_routes_to_code() -> None:
    route = route_topic("explain this", source_code="def f():\n    return 1")
    assert route.skill_mode == SkillMode.SPECIALIZED
    assert route.domain == TopicDomain.CODE


def test_keyword_hint_is_case_insensitive() -> None:
    assert keyword_hint("BINARY SEARCH ALGORITHM") == TopicDomain.ALGORITHM
