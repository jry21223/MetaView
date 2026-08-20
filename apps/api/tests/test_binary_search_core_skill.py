from __future__ import annotations

import pytest

from app.domain.skills.base import SkillRouteInput
from app.domain.skills.binary_search_core.manifest import BINARY_SEARCH_CORE_MANIFEST
from app.domain.skills.binary_search_core.skill_pack import BinarySearchCoreSkillPack


def test_binary_search_core_manifest_declares_deterministic_trace() -> None:
    payload = BINARY_SEARCH_CORE_MANIFEST.model_dump(mode="json")

    assert payload["skill_id"] == "binary_search_core"
    assert payload["domain"] == "algorithm"
    assert payload["execution_mode"] == "deterministic"
    assert [capability["capability_id"] for capability in payload["capabilities"]] == [
        "binary_search_core.trace"
    ]


def test_binary_search_core_extracts_sorted_values_without_answer_fields() -> None:
    skill = BinarySearchCoreSkillPack()
    match = skill.heuristic_match(
        SkillRouteInput(
            prompt="演示在有序数组 [1,3,5,7,9,11] 里二分查找 7，标出 low/mid/high"
        )
    )

    assert match is not None
    assert match.problem_spec == {
        "values": [1, 3, 5, 7, 9, 11],
        "target": 7,
    }
    assert "answer" not in match.problem_spec


def test_binary_search_core_rejects_unsorted_input() -> None:
    skill = BinarySearchCoreSkillPack()

    match = skill.heuristic_match(
        SkillRouteInput(prompt="在数组 [3,1,2] 中二分查找 2")
    )

    assert match is None


def test_binary_search_core_rejects_missing_target() -> None:
    skill = BinarySearchCoreSkillPack()
    match = skill.heuristic_match(
        SkillRouteInput(prompt="在有序数组 [1,3,5,7] 中二分查找 4")
    )

    assert match is None


def test_binary_search_core_preserves_large_integer_targets_exactly() -> None:
    skill = BinarySearchCoreSkillPack()
    match = skill.heuristic_match(
        SkillRouteInput(
            prompt=(
                "在有序数组 [9007199254740992,9007199254740993] 中"
                "二分查找 9007199254740993"
            )
        )
    )

    assert match is not None and match.problem_spec is not None
    assert match.problem_spec["target"] == 9007199254740993
    assert match.problem_spec["values"][-1] == 9007199254740993


def test_binary_search_core_does_not_overflow_on_very_large_integer() -> None:
    value = "9" * 400
    skill = BinarySearchCoreSkillPack()

    match = skill.heuristic_match(
        SkillRouteInput(prompt=f"在有序数组 [{value}] 中二分查找 {value}")
    )

    assert match is not None and match.problem_spec is not None
    assert match.problem_spec["target"] == int(value)


@pytest.mark.parametrize(
    "customization",
    [
        "使用传入的 compare(a,b) 函数作为比较逻辑",
        "using compare (a,b)",
        "按照自定义排序规则",
        "with a custom comparator",
        "用 cmp 回调",
    ],
)
def test_binary_search_core_rejects_custom_comparators(customization: str) -> None:
    skill = BinarySearchCoreSkillPack()

    match = skill.heuristic_match(
        SkillRouteInput(
            prompt=(
                f"在有序数组 [1,3,5,7] 中{customization}，"
                "二分查找 7"
            )
        )
    )

    assert match is None


def test_binary_search_core_rejects_uploaded_source_code() -> None:
    skill = BinarySearchCoreSkillPack()

    match = skill.heuristic_match(
        SkillRouteInput(
            prompt="在有序数组 [1,3,5,7] 中二分查找 7",
            source_code="const compare = (a, b) => a.rank - b.rank;",
            language="typescript",
        )
    )

    assert match is None
