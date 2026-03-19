from __future__ import annotations

import ast
import re
from dataclasses import dataclass

from app.schemas import VisualKind


@dataclass(frozen=True)
class SourceCodeInsights:
    language: str
    algorithm_name: str
    structures: list[str]
    operations: list[str]
    summary: str
    primary_visual_kind: VisualKind


def normalize_source_code_language(
    source_code: str | None,
    source_code_language: str | None = None,
) -> str | None:
    if source_code_language:
        normalized = source_code_language.strip().lower()
        if normalized in {"cpp", "c++", "cc", "cxx"}:
            return "cpp"
        if normalized in {"py", "python"}:
            return "python"
        return normalized

    if not source_code:
        return None

    code = source_code.strip()
    if "#include" in code or "std::" in code or "vector<" in code:
        return "cpp"
    if re.search(r"^\s*def\s+\w+\s*\(", code, flags=re.MULTILINE) or "import " in code:
        return "python"
    return "unknown"


def inspect_source_code(
    source_code: str,
    source_code_language: str | None = None,
) -> SourceCodeInsights:
    language = normalize_source_code_language(source_code, source_code_language) or "unknown"
    algorithm_name = _detect_algorithm_name(source_code)
    structures = _detect_structures(source_code)
    operations = _detect_operations(source_code)
    primary_visual_kind = _detect_primary_visual_kind(structures, operations)
    summary = (
        f"源码模块会围绕 {algorithm_name} 的输入结构、状态推进和终止条件进行动画规划。"
    )
    return SourceCodeInsights(
        language=language,
        algorithm_name=algorithm_name,
        structures=structures,
        operations=operations,
        summary=summary,
        primary_visual_kind=primary_visual_kind,
    )


def should_route_to_code(
    prompt: str,
    source_code: str | None,
) -> bool:
    if source_code and source_code.strip():
        return True
    prompt_lower = prompt.lower()
    code_signals = [
        "cpp",
        "c++",
        "python 代码",
        "源码",
        "source code",
        "class solution",
        "def ",
        "#include",
    ]
    return any(signal in prompt_lower for signal in code_signals)


def _detect_algorithm_name(source_code: str) -> str:
    code_lower = source_code.lower()
    patterns = [
        ("binary search", ["binary", "mid", "left", "right"]),
        ("bubble sort", ["bubble", "swap", "j + 1"]),
        ("selection sort", ["min_idx", "selection"]),
        ("insertion sort", ["insertion", "key ="]),
        ("merge sort", ["merge", "mid", "left_half"]),
        ("quick sort", ["quick", "pivot", "partition"]),
        ("dfs", ["dfs", "visited", "stack"]),
        ("bfs", ["bfs", "queue", "visited"]),
        ("dynamic programming", ["dp[", "memo", "transition"]),
    ]
    for name, keywords in patterns:
        if all(keyword in code_lower for keyword in keywords[:2]) and any(
            keyword in code_lower for keyword in keywords
        ):
            return name

    function_match = re.search(
        r"\b(def|void|int|bool)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(",
        source_code,
    )
    if function_match:
        return function_match.group(2)
    return "algorithm"


def _detect_structures(source_code: str) -> list[str]:
    code_lower = source_code.lower()
    structures: list[str] = []
    if any(token in code_lower for token in ["vector", "list", "array", "nums", "arr["]):
        structures.append("array")
    if any(
        token in code_lower
        for token in ["listnode", ".next", "->next", ".prev", "->prev", "head", "tail"]
    ):
        structures.append("linked-list")
    if any(token in code_lower for token in ["queue", "deque"]):
        structures.append("queue")
    if any(token in code_lower for token in ["stack", "stk"]):
        structures.append("stack")
    if any(token in code_lower for token in ["graph", "adj", "edges"]):
        structures.append("graph")
    if any(token in code_lower for token in ["tree", "node", "root"]):
        structures.append("tree")
    if "dp[" in code_lower or "memo" in code_lower:
        structures.append("dp-table")
    return structures or ["state"]


def _detect_operations(source_code: str) -> list[str]:
    code_lower = source_code.lower()
    operations: list[str] = []
    if any(token in code_lower for token in ["for ", "while "]):
        operations.append("iterate")
    if "if " in code_lower:
        operations.append("branch")
    if any(token in code_lower for token in ["swap", "std::swap"]):
        operations.append("swap")
    if any(token in code_lower for token in ["left", "right", "mid"]):
        operations.append("pointer-update")
    if any(token in code_lower for token in ["return", "ans", "result"]):
        operations.append("return")
    if _has_recursion(source_code):
        operations.append("recurse")
    return operations or ["update-state"]


def _detect_primary_visual_kind(structures: list[str], operations: list[str]) -> VisualKind:
    if "linked-list" in structures:
        return VisualKind.FLOW
    if "graph" in structures or "tree" in structures:
        return VisualKind.GRAPH
    if "dp-table" in structures or "pointer-update" in operations:
        return VisualKind.ARRAY
    if "recurse" in operations:
        return VisualKind.FLOW
    return VisualKind.ARRAY


def _has_recursion(source_code: str) -> bool:
    try:
        module = ast.parse(source_code)
    except SyntaxError:
        return _has_cpp_style_recursion(source_code)

    for node in module.body:
        if isinstance(node, ast.FunctionDef):
            if any(
                isinstance(inner, ast.Call)
                and isinstance(inner.func, ast.Name)
                and inner.func.id == node.name
                for inner in ast.walk(node)
            ):
                return True
    return False


def _has_cpp_style_recursion(source_code: str) -> bool:
    function_match = re.search(
        r"\b(?:void|int|long long|bool|double|float|string)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(",
        source_code,
    )
    if not function_match:
        return False
    function_name = function_match.group(1)
    return f"{function_name}(" in source_code[function_match.end() :]
