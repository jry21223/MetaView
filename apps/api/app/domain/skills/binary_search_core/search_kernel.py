from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.domain.skills.binary_search_core.problem_spec import BinarySearchProblemSpec, Number

Comparison = Literal["less", "greater", "equal"]


@dataclass(frozen=True)
class BinarySearchState:
    low: int
    mid: int
    high: int
    value: Number
    comparison: Comparison


@dataclass(frozen=True)
class BinarySearchSolution:
    values: list[Number]
    target: Number
    states: list[BinarySearchState]
    found_index: int | None


def solve_binary_search(spec: BinarySearchProblemSpec) -> BinarySearchSolution:
    low = 0
    high = len(spec.values) - 1
    states: list[BinarySearchState] = []

    while low <= high:
        mid = (low + high) // 2
        value = spec.values[mid]
        if value == spec.target:
            states.append(BinarySearchState(low, mid, high, value, "equal"))
            return BinarySearchSolution(spec.values, spec.target, states, mid)
        if value < spec.target:
            states.append(BinarySearchState(low, mid, high, value, "less"))
            low = mid + 1
        else:
            states.append(BinarySearchState(low, mid, high, value, "greater"))
            high = mid - 1

    return BinarySearchSolution(spec.values, spec.target, states, None)
