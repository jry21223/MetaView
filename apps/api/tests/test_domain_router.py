import pytest

from app.domain.models.topic import TopicDomain
from app.domain.services.domain_router import keyword_hint


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


def test_keyword_hint_defaults_to_algorithm_for_unknown() -> None:
    assert keyword_hint("some completely unrelated text 随机文字") == TopicDomain.ALGORITHM


def test_keyword_hint_is_case_insensitive() -> None:
    assert keyword_hint("BINARY SEARCH ALGORITHM") == TopicDomain.ALGORITHM
