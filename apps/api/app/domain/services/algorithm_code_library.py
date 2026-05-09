"""Pre-baked pseudocode library for high-frequency algorithms.

When the user's prompt matches a known algorithm, the canonical pseudocode is injected
into the CIR prompt so the LLM can map code_lines accurately. The same lines are used
as source_lines in playbook_builder, ensuring the code panel always shows clean,
consistent pseudocode without requiring user-uploaded code.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AlgorithmCode:
    algorithm_id: str
    language: str
    lines: tuple[str, ...]
    keywords: tuple[str, ...]  # lowercase keywords for detection


_LIBRARY: tuple[AlgorithmCode, ...] = (
    AlgorithmCode(
        algorithm_id="bubble_sort",
        language="pseudocode",
        keywords=("冒泡", "bubble sort", "bubble_sort", "bubblesort"),
        lines=(
            "procedure BubbleSort(A):",
            "  n = length(A)",
            "  for i = 0 to n - 2:",
            "    for j = 0 to n - i - 2:",
            "      if A[j] > A[j+1]:",
            "        swap(A[j], A[j+1])",
            "  return A",
        ),
    ),
    AlgorithmCode(
        algorithm_id="quick_sort",
        language="pseudocode",
        keywords=("快速排序", "快排", "quicksort", "quick sort", "quick_sort"),
        lines=(
            "procedure QuickSort(A, lo, hi):",
            "  if lo >= hi: return",
            "  pivot = A[hi]",
            "  i = lo - 1",
            "  for j = lo to hi - 1:",
            "    if A[j] <= pivot: i++; swap(A[i], A[j])",
            "  swap(A[i+1], A[hi])",
            "  QuickSort(A, lo, i);  QuickSort(A, i+2, hi)",
        ),
    ),
    AlgorithmCode(
        algorithm_id="merge_sort",
        language="pseudocode",
        keywords=("归并", "mergesort", "merge sort", "merge_sort"),
        lines=(
            "procedure MergeSort(A, lo, hi):",
            "  if lo >= hi: return",
            "  mid = (lo + hi) / 2",
            "  MergeSort(A, lo, mid)",
            "  MergeSort(A, mid + 1, hi)",
            "  L = A[lo..mid];  R = A[mid+1..hi]",
            "  merge L and R back into A[lo..hi]",
        ),
    ),
    AlgorithmCode(
        algorithm_id="insertion_sort",
        language="pseudocode",
        keywords=("插入排序", "insertion sort", "insertion_sort"),
        lines=(
            "procedure InsertionSort(A):",
            "  for i = 1 to length(A) - 1:",
            "    key = A[i]",
            "    j = i - 1",
            "    while j >= 0 and A[j] > key:",
            "      A[j+1] = A[j];  j--",
            "    A[j+1] = key",
        ),
    ),
    AlgorithmCode(
        algorithm_id="selection_sort",
        language="pseudocode",
        keywords=("选择排序", "selection sort", "selection_sort"),
        lines=(
            "procedure SelectionSort(A):",
            "  n = length(A)",
            "  for i = 0 to n - 1:",
            "    minIdx = i",
            "    for j = i + 1 to n - 1:",
            "      if A[j] < A[minIdx]: minIdx = j",
            "    swap(A[i], A[minIdx])",
        ),
    ),
    AlgorithmCode(
        algorithm_id="binary_search",
        language="pseudocode",
        keywords=("二分查找", "二分搜索", "binary search", "binary_search", "binarysearch"),
        lines=(
            "procedure BinarySearch(A, target):",
            "  lo = 0;  hi = length(A) - 1",
            "  while lo <= hi:",
            "    mid = (lo + hi) / 2",
            "    if A[mid] == target: return mid",
            "    if A[mid] < target:  lo = mid + 1",
            "    else:                hi = mid - 1",
            "  return -1",
        ),
    ),
    AlgorithmCode(
        algorithm_id="linear_search",
        language="pseudocode",
        keywords=("线性查找", "顺序查找", "linear search", "linear_search"),
        lines=(
            "procedure LinearSearch(A, target):",
            "  for i = 0 to length(A) - 1:",
            "    if A[i] == target:",
            "      return i",
            "  return -1",
        ),
    ),
    AlgorithmCode(
        algorithm_id="bfs",
        language="pseudocode",
        keywords=("广度优先", "bfs", "breadth first", "breadth-first"),
        lines=(
            "procedure BFS(graph, start):",
            "  queue = [start];  visited = {start}",
            "  while queue is not empty:",
            "    node = queue.dequeue()",
            "    process(node)",
            "    for each neighbor of node:",
            "      if neighbor not in visited:",
            "        visited.add(neighbor)",
            "        queue.enqueue(neighbor)",
        ),
    ),
    AlgorithmCode(
        algorithm_id="dfs",
        language="pseudocode",
        keywords=("深度优先", "dfs", "depth first", "depth-first"),
        lines=(
            "procedure DFS(graph, node, visited):",
            "  visited.add(node)",
            "  process(node)",
            "  for each neighbor of node:",
            "    if neighbor not in visited:",
            "      DFS(graph, neighbor, visited)",
        ),
    ),
)

# Build lookup indices once at import time.
_BY_ID: dict[str, AlgorithmCode] = {entry.algorithm_id: entry for entry in _LIBRARY}


def get_by_id(algorithm_id: str) -> AlgorithmCode | None:
    return _BY_ID.get(algorithm_id)


def infer_id(text: str) -> str | None:
    """Return algorithm_id if any keyword matches the given text (case-insensitive)."""
    lowered = text.lower()
    for entry in _LIBRARY:
        if any(kw in lowered for kw in entry.keywords):
            return entry.algorithm_id
    return None


def prompt_hint(algorithm_id: str) -> str:
    """Return a prompt snippet listing the canonical pseudocode for the LLM to use."""
    entry = _BY_ID.get(algorithm_id)
    if not entry:
        return ""
    numbered = "\n".join(f"{i}  {line}" for i, line in enumerate(entry.lines))
    return (
        f'\n## Canonical pseudocode for {algorithm_id} (MUST use for algorithm_code)\n'
        f'Set execution_map.algorithm_id = "{algorithm_id}".\n'
        f'Set execution_map.algorithm_code to exactly these lines (as a JSON array):\n'
        f"```\n{numbered}\n```\n"
        f'Map each checkpoint code_lines to 0-indexed positions in this list.\n'
    )
