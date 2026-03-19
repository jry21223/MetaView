from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.services.prompts.sections import join_sections, render_section
from app.services.source_code_module import inspect_source_code, normalize_source_code_language

PromptStage = Literal["planner", "coder", "critic"]


@dataclass(frozen=True)
class CodePromptProfile:
    language: str
    algorithm_name: str
    structures: tuple[str, ...]
    operations: tuple[str, ...]
    boards: tuple[str, ...]


_BOARD_RULES: dict[str, dict[str, str]] = {
    "array_like": {
        "title": "Array And Index Driven Processes",
        "planner": """
        Extract the exact array or list state, active indices, comparison points,
        writes, swaps, and confirmed regions from the source code.
        If input data is absent, choose a small deterministic example that makes
        branch decisions and state changes visible.
        """,
        "coder": """
        Prefer rectangles or squares with value labels for array cells.
        Keep index or pointer markers visible while they move.
        Show comparisons, swaps, overwrites, sorted regions, and binary-search style
        boundary contraction one step at a time.
        """,
        "critic": """
        Check that swaps update both the visual objects and their logical order.
        Check that moving arrows or index markers do not disappear off screen.
        Check that per-step timing is slow enough to follow comparisons and updates.
        """,
    },
    "linked_list": {
        "title": "Linked List And Pointer Rewiring",
        "planner": """
        Identify nodes, structural links, and named pointers such as head, curr,
        prev, next, slow, or fast.
        Plan separate beats for pointer movement and for link rewiring.
        """,
        "coder": """
        Use node boxes or circles plus explicit arrows for structural links.
        Keep pointer labels visually separate from list edges.
        When links change, replace or transform the edge objects so the new topology
        is obvious.
        """,
        "critic": """
        Check that structural arrows match the actual next or prev assignments.
        Check that pointer labels do not get confused with data edges.
        Check that condensed layouts still preserve traversal direction.
        """,
    },
    "tree_graph": {
        "title": "Tree And Graph Traversals",
        "planner": """
        Identify node relationships, traversal order, and any visited, queue,
        stack, or frontier state that matters to the execution.
        Choose a small representative structure if the full input would overload one frame.
        """,
        "coder": """
        Use circles for nodes and lines or arrows for edges.
        Highlight the current node, frontier changes, and visited state updates.
        Only show auxiliary queue or stack panels when they contribute to understanding.
        """,
        "critic": """
        Check that traversal order follows the code rather than a generic template.
        Check that visited state and auxiliary frontier structures stay synchronized.
        Check that active nodes are not obscured by dense edges.
        """,
    },
    "recursion_dp": {
        "title": "Recursion, Divide And Conquer, And DP",
        "planner": """
        Identify the active subproblem, base case, recursive branch, return path,
        or DP state transition that actually changes the result.
        Plan a compressed stack or table view instead of trying to show every detail at once.
        """,
        "coder": """
        For recursion, show the active call, interval, or subproblem focus plus the return step.
        For DP, use a small table or grid and reveal dependency cells before the update.
        Keep the stack or table compact enough to remain readable.
        """,
        "critic": """
        Check that base cases, recursive returns, and DP transitions are explicit.
        Check that stack frames or table cells update in the same order as the source code.
        Check that omitted branches do not hide the main control-flow idea.
        """,
    },
}


def build_code_prompt_profile_from_source(
    source_code: str | None,
    source_code_language: str | None = None,
) -> CodePromptProfile | None:
    if not source_code or not source_code.strip():
        return None

    insights = inspect_source_code(source_code, source_code_language)
    return CodePromptProfile(
        language=normalize_source_code_language(source_code, source_code_language) or "unknown",
        algorithm_name=insights.algorithm_name,
        structures=tuple(insights.structures),
        operations=tuple(insights.operations),
        boards=_boards_from_tags(
            structures=insights.structures,
            operations=insights.operations,
            hint_blob=source_code,
        ),
    )


def build_code_prompt_profile_from_cir(
    *,
    title: str | None = None,
    summary: str | None = None,
    cir_json: str | None = None,
) -> CodePromptProfile:
    hint_blob = " ".join(part for part in [title, summary, cir_json] if part)
    structures = _structures_from_hint_blob(hint_blob)
    operations = _operations_from_hint_blob(hint_blob)
    boards = _boards_from_tags(
        structures=structures,
        operations=operations,
        hint_blob=hint_blob,
    )
    return CodePromptProfile(
        language="unknown",
        algorithm_name=(title or "source walkthrough").strip() or "source walkthrough",
        structures=tuple(structures),
        operations=tuple(operations),
        boards=boards,
    )


def render_code_prompt_sections(
    stage: PromptStage,
    profile: CodePromptProfile | None,
) -> str:
    base_section = render_section(
        "Code Domain Ground Rules",
        """
        Treat the source code as the ground truth.
        Support both Python and C++ inputs; do not silently rewrite the task as Python-only.
        Preserve the user's control flow, state updates, and termination conditions.
        Prefer a synchronized left source panel plus a main state view, but trim to the
        core function when the full code would become unreadable.
        """,
    )
    source_panel_section = render_section(
        "Source Panel And Narration",
        """
        Keep source lines and visual state changes synchronized.
        Raw source code should be rendered with `Text`, `Paragraph`, or another plain-text
        approach instead of forcing arbitrary code through TeX.
        Chinese narration is allowed, but code rendering must stay robust even when TeX or
        ctex support is limited.
        """,
    )
    profile_section = ""
    if profile is not None:
        profile_section = render_section(
            "Detected Code Profile",
            (
                f"language={profile.language}\n"
                f"algorithm={profile.algorithm_name}\n"
                f"structures={', '.join(profile.structures) or 'none'}\n"
                f"operations={', '.join(profile.operations) or 'none'}\n"
                f"boards={', '.join(profile.boards)}"
            ),
        )

    selected_boards = profile.boards if profile is not None else tuple(_BOARD_RULES)
    board_sections = [
        render_section(_BOARD_RULES[board]["title"], _BOARD_RULES[board][stage])
        for board in selected_boards
    ]
    return join_sections(
        base_section,
        source_panel_section,
        profile_section,
        *board_sections,
    )


def describe_code_prompt_profile(profile: CodePromptProfile | None) -> str:
    if profile is None:
        return "code_profile=unknown"
    return (
        f"code_profile=language:{profile.language};"
        f"algorithm:{profile.algorithm_name};"
        f"boards:{','.join(profile.boards)}"
    )


def _boards_from_tags(
    *,
    structures: list[str] | tuple[str, ...],
    operations: list[str] | tuple[str, ...],
    hint_blob: str,
) -> tuple[str, ...]:
    structures_lower = {item.lower() for item in structures}
    operations_lower = {item.lower() for item in operations}
    hint_lower = hint_blob.lower()
    boards: list[str] = []

    if (
        {"array", "queue", "stack", "state"} & structures_lower
        or {"iterate", "swap", "pointer-update"} & operations_lower
        or any(token in hint_lower for token in ["left", "right", "mid", "window", "pivot"])
    ):
        boards.append("array_like")
    if "linked-list" in structures_lower or any(
        token in hint_lower for token in ["listnode", ".next", "->next", " prev", "head", "tail"]
    ):
        boards.append("linked_list")
    if {"tree", "graph"} & structures_lower or any(
        token in hint_lower for token in ["root", "children", "adj", "edge", "bfs", "dfs"]
    ):
        boards.append("tree_graph")
    if "dp-table" in structures_lower or "recurse" in operations_lower or any(
        token in hint_lower for token in ["recursive", "recursion", "memo", "dp", "subproblem"]
    ):
        boards.append("recursion_dp")

    if not boards:
        boards.append("array_like")
    return tuple(dict.fromkeys(boards))


def _structures_from_hint_blob(hint_blob: str) -> list[str]:
    hint_lower = hint_blob.lower()
    structures: list[str] = []
    if any(token in hint_lower for token in ["array", "list", "nums", "arr", "mid", "pivot"]):
        structures.append("array")
    if any(token in hint_lower for token in ["queue", "deque"]):
        structures.append("queue")
    if "stack" in hint_lower:
        structures.append("stack")
    if any(token in hint_lower for token in ["listnode", ".next", "->next", "linked"]):
        structures.append("linked-list")
    if any(token in hint_lower for token in ["tree", "root", "child"]):
        structures.append("tree")
    if any(token in hint_lower for token in ["graph", "adj", "edge"]):
        structures.append("graph")
    if any(token in hint_lower for token in ["dp", "memo", "table"]):
        structures.append("dp-table")
    return structures or ["state"]


def _operations_from_hint_blob(hint_blob: str) -> list[str]:
    hint_lower = hint_blob.lower()
    operations: list[str] = []
    if any(token in hint_lower for token in ["for ", "while ", "iterate", "scan"]):
        operations.append("iterate")
    if any(token in hint_lower for token in ["if ", "branch", "condition"]):
        operations.append("branch")
    if any(token in hint_lower for token in ["swap", "exchange"]):
        operations.append("swap")
    if any(token in hint_lower for token in ["left", "right", "mid", "pointer", "index"]):
        operations.append("pointer-update")
    if any(token in hint_lower for token in ["return", "answer", "result"]):
        operations.append("return")
    if any(token in hint_lower for token in ["recursive", "recursion", "call stack", "subproblem"]):
        operations.append("recurse")
    return operations or ["update-state"]
