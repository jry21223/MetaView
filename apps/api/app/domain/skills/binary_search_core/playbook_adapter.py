from __future__ import annotations

from app.domain.models.playbook import (
    CodeHighlightOverlay,
    CodeTracePointer,
    CodeTraceSceneSnapshot,
    Layer,
    LayerTiming,
    MetaStep,
    PlaybookScript,
)
from app.domain.models.topic import TopicDomain
from app.domain.services.algorithm_code_library import get_by_id
from app.domain.services.playbook_quality import estimate_step_frames
from app.domain.skills.binary_search_core.problem_spec import Number
from app.domain.skills.binary_search_core.search_kernel import (
    BinarySearchSolution,
    BinarySearchState,
)

_FPS = 30
_STEP_FRAMES = 120


def build_binary_search_playbook(
    run_id: str,  # noqa: ARG001
    solution: BinarySearchSolution,
) -> PlaybookScript:
    source = get_by_id("binary_search")
    if source is None:
        raise RuntimeError("canonical binary-search pseudocode is unavailable")

    values = [_display(value) for value in solution.values]
    target = _display(solution.target)
    steps: list[MetaStep] = []
    frame_cursor = 0
    for index, state in enumerate(solution.states, start=1):
        voiceover = _voiceover(state, target)
        active_lines, active_line = _active_lines(state)
        variables = {
            "target": target,
            "low": str(state.low),
            "mid": str(state.mid),
            "high": str(state.high),
            "nums[mid]": _display(state.value),
        }
        snapshot = CodeTraceSceneSnapshot(
            pack_id="algorithm-code-basic",
            asset_id="binary-search-trace-preset",
            language=source.language,
            lines=list(source.lines),
            active_lines=active_lines,
            active_line=active_line,
            array_values=values,
            active_indices=[state.mid],
            search_range=(state.low, state.high),
            pointers=[
                CodeTracePointer(id="low", label="low", index=state.low),
                CodeTracePointer(id="mid", label="mid", index=state.mid),
                CodeTracePointer(id="high", label="high", index=state.high),
            ],
            variables=variables,
            caption=voiceover,
        )
        frame_cursor += max(_STEP_FRAMES, estimate_step_frames(voiceover, _FPS))
        steps.append(
            MetaStep(
                step_id=f"binary_search_core_{index:02d}",
                end_frame=frame_cursor,
                title=_title(state, target),
                voiceover_text=voiceover,
                animation_hint=snapshot.kind,
                snapshot=snapshot,
                layers=[Layer(timing=LayerTiming(), body=snapshot)],
                code_highlight=CodeHighlightOverlay(
                    language=source.language,
                    lines=list(source.lines),
                    active_lines=active_lines,
                    active_line=active_line,
                    variables=variables,
                    operation_label=_operation_label(state),
                ),
                tokens=[],
            )
        )

    return PlaybookScript(
        fps=_FPS,
        total_frames=frame_cursor,
        domain=TopicDomain.ALGORITHM,
        title="二分查找 low / mid / high 追踪",
        summary="在有序数组中比较 mid，并更新 low 或 high，直到命中目标。",
        steps=steps,
        parameter_controls=[],
        algorithm_id="binary_search",
        initial_data={"values": values, "target": [target]},
    )


def _voiceover(state: BinarySearchState, target: str) -> str:
    value = _display(state.value)
    prefix = (
        f"当前二分查找区间是下标 {state.low} 到 {state.high}，"
        f"low={state.low}、mid={state.mid}、high={state.high}，nums[mid]={value}。"
    )
    if state.comparison == "less":
        return (
            f"{prefix}{value} 小于目标 {target}，丢弃左半区；"
            f"下一轮 low={state.mid + 1}。"
        )
    if state.comparison == "greater":
        return (
            f"{prefix}{value} 大于目标 {target}，丢弃右半区；"
            f"下一轮 high={state.mid - 1}。"
        )
    return f"{prefix}{value} 等于目标 {target}，二分查找在下标 {state.mid} 找到目标。"


def _active_lines(state: BinarySearchState) -> tuple[list[int], int]:
    if state.comparison == "equal":
        return [3, 4], 4
    if state.comparison == "less":
        return [3, 5], 5
    return [3, 6], 6


def _title(state: BinarySearchState, target: str) -> str:
    if state.comparison == "equal":
        return f"mid={state.mid} 命中目标 {target}"
    direction = "右移 low" if state.comparison == "less" else "左移 high"
    return f"比较 mid={state.mid}，{direction}"


def _operation_label(state: BinarySearchState) -> str:
    return {
        "less": "move low right",
        "greater": "move high left",
        "equal": "return midpoint",
    }[state.comparison]


def _display(value: Number) -> str:
    if isinstance(value, int):
        return str(value)
    return str(int(value)) if value.is_integer() else str(value)
