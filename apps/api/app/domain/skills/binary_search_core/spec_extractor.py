from __future__ import annotations

import ast
import re

from app.domain.skills.binary_search_core.problem_spec import BinarySearchProblemSpec

_NUMBER = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)"
_TARGET_RE = re.compile(
    rf"(?:查找|寻找|找出|目标(?:值)?(?:为|是|=)?|target\s*=?)\s*(?P<target>{_NUMBER})",
    flags=re.IGNORECASE,
)
_SUPPORTED_REQUEST_TERMS = tuple(sorted(
    (
        "binary_search",
        "binary search",
        "二分查找",
        "二分搜索",
        "有序数组",
        "升序数组",
        "已排序数组",
        "目标值",
        "的过程",
        "demonstrate",
        "ascending",
        "pointers",
        "sorted",
        "process",
        "indices",
        "pointer",
        "search",
        "target",
        "array",
        "trace",
        "show",
        "find",
        "mark",
        "index",
        "使用",
        "演示",
        "展示",
        "说明",
        "解释",
        "数组",
        "有序",
        "升序",
        "查找",
        "寻找",
        "找出",
        "找到",
        "目标",
        "过程",
        "标出",
        "标记",
        "显示",
        "追踪",
        "跟踪",
        "变化",
        "指针",
        "下标",
        "比较",
        "中点",
        "当前",
        "区间",
        "缩小",
        "low",
        "mid",
        "high",
        "请",
        "用",
        "在",
        "里",
        "中",
        "从",
        "对",
        "如何",
        "the",
        "to",
        "in",
        "for",
        "with",
        "and",
    ),
    key=len,
    reverse=True,
))
_REQUEST_PUNCTUATION_RE = re.compile(
    rf"(?:{_NUMBER}|[\s,+\-*/=._:;!?，。；：！？()\[\]{{}}])"
)


def try_extract_binary_search(prompt: str) -> BinarySearchProblemSpec | None:
    text = _normalize(prompt)
    if not _is_binary_search(text):
        return None
    if not _has_only_supported_request_language(text):
        return None
    values = _extract_values(text)
    target_match = _TARGET_RE.search(text)
    if values is None or target_match is None:
        return None
    try:
        return BinarySearchProblemSpec(
            values=values,
            target=_parse_number(target_match.group("target")),
        )
    except ValueError:
        return None


def _normalize(prompt: str) -> str:
    return (
        prompt.strip()
        .replace("，", ",")
        .replace("。", "")
        .replace("（", "(")
        .replace("）", ")")
    )


def _is_binary_search(text: str) -> bool:
    lowered = text.lower()
    return any(
        marker in lowered
        for marker in ("二分查找", "二分搜索", "binary search", "binary_search")
    )


def _has_only_supported_request_language(text: str) -> bool:
    lowered = text.lower()
    remainder = re.sub(r"\[[^\]]+\]", " ", lowered)
    for term in _SUPPORTED_REQUEST_TERMS:
        remainder = remainder.replace(term, " ")
    return not _REQUEST_PUNCTUATION_RE.sub("", remainder)


def _extract_values(text: str) -> list[int | float] | None:
    match = re.search(r"\[[^\]]+\]", text)
    if match is None:
        return None
    try:
        raw = ast.literal_eval(match.group(0))
    except (SyntaxError, ValueError):
        return None
    if not isinstance(raw, list) or not raw:
        return None
    if any(isinstance(value, bool) or not isinstance(value, int | float) for value in raw):
        return None
    return raw


def _parse_number(value: str) -> int | float:
    if "." not in value:
        return int(value)
    return float(value)
