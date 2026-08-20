from __future__ import annotations

import ast
import re

from app.domain.skills.binary_search_core.problem_spec import BinarySearchProblemSpec

_NUMBER = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)"
_TARGET_RE = re.compile(
    rf"(?:查找|寻找|找出|目标(?:值)?(?:为|是|=)?|target\s*=?)\s*(?P<target>{_NUMBER})",
    flags=re.IGNORECASE,
)
_UNSUPPORTED_MARKERS = (
    "自定义比较",
    "比较函数",
    "custom comparator",
    "custom comparison",
    "comparator",
)


def try_extract_binary_search(prompt: str) -> BinarySearchProblemSpec | None:
    text = _normalize(prompt)
    if not _is_binary_search(text):
        return None
    if any(marker in text.lower() for marker in _UNSUPPORTED_MARKERS):
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
