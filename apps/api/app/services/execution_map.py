from __future__ import annotations

import re
from dataclasses import dataclass

from app.schemas import (
    CirDocument,
    ExecutionArrayTrack,
    ExecutionCheckpoint,
    ExecutionMap,
    ExecutionParameterControl,
    PipelineRequest,
    TopicDomain,
)
from app.services.source_code_module import normalize_source_code_language

_COMMENT_PREFIXES = ("#", "//")


@dataclass(frozen=True)
class _CodeAnchor:
    line_no: int
    text: str
    kinds: tuple[str, ...]


@dataclass(frozen=True)
class _ArrayTrackInfo:
    id: str
    label: str
    values: list[str]
    target_value: str | None


def build_execution_map(
    *,
    request: PipelineRequest,
    cir: CirDocument,
    render_backend: str | None,
) -> ExecutionMap | None:
    if cir.domain not in {TopicDomain.ALGORITHM, TopicDomain.CODE}:
        return None

    source_code = (request.source_code or "").strip("\n")
    if not source_code.strip():
        return None

    language = (
        normalize_source_code_language(source_code, request.source_code_language) or "unknown"
    )
    code_lines = source_code.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    anchors = _collect_code_anchors(code_lines, language)
    if not anchors:
        return None
    array_track = _extract_array_track(code_lines)

    checkpoints = _build_checkpoints(
        cir=cir,
        code_lines=code_lines,
        anchors=anchors,
        array_track=array_track,
        estimated_duration_s=_estimate_duration_s(render_backend, len(cir.steps)),
    )
    if not checkpoints:
        return None

    step_to_checkpoint = {checkpoint.step_id: checkpoint.id for checkpoint in checkpoints}
    line_to_step_ids = _build_line_to_step_ids(checkpoints)

    return ExecutionMap(
        duration_s=round(checkpoints[-1].end_s, 3),
        interaction_hint=(
            "拖动时间轴、点击动画里的数组单元、代码行或焦点标签即可双向跳转；到达逻辑拐点时会自动暂停并抛出问题。"
        ),
        checkpoints=checkpoints,
        parameter_controls=_extract_parameter_controls(code_lines),
        array_track=(
            ExecutionArrayTrack(
                id=array_track.id,
                label=array_track.label,
                values=array_track.values,
                target_value=array_track.target_value,
            )
            if array_track is not None
            else None
        ),
        step_to_checkpoint=step_to_checkpoint,
        line_to_step_ids=line_to_step_ids,
    )


def _collect_code_anchors(code_lines: list[str], language: str) -> list[_CodeAnchor]:
    anchors: list[_CodeAnchor] = []
    for index, raw_line in enumerate(code_lines, start=1):
        stripped = raw_line.strip()
        if not stripped:
            continue
        if stripped.startswith(_COMMENT_PREFIXES):
            continue

        kinds: list[str] = []
        lower = stripped.lower()

        if _looks_like_function_definition(stripped, language):
            kinds.append("function")
        if _looks_like_loop(stripped):
            kinds.append("loop")
        if _looks_like_branch(stripped):
            kinds.append("branch")
        if stripped.startswith("return ") or stripped == "return" or " return " in lower:
            kinds.append("return")
        if any(
            token in lower for token in ("left", "right", "mid", "pivot", "lo", "hi", "l ", "r ")
        ):
            kinds.append("pointer")
        if any(token in lower for token in ("swap", "exchange")):
            kinds.append("swap")
        if any(
            token in lower
            for token in (
                "append(",
                "push(",
                "push_back",
                "pop(",
                "pop_back",
                "enqueue",
                "dequeue",
            )
        ):
            kinds.append("state")
        if "=" in stripped and not _looks_like_branch(stripped) and not _looks_like_loop(stripped):
            kinds.append("state")
            if "==" not in stripped:
                kinds.append("init")
        if any(token in lower for token in ("<", ">", "==", "!=", "<=", ">=")):
            kinds.append("compare")
        if re.search(r"\b[a-zA-Z_][a-zA-Z0-9_]*\s*\(", stripped):
            kinds.append("call")

        if not kinds:
            kinds.append("state")

        anchors.append(_CodeAnchor(line_no=index, text=stripped, kinds=tuple(dict.fromkeys(kinds))))

    return anchors


def _build_checkpoints(
    *,
    cir: CirDocument,
    code_lines: list[str],
    anchors: list[_CodeAnchor],
    array_track: _ArrayTrackInfo | None,
    estimated_duration_s: float,
) -> list[ExecutionCheckpoint]:
    if not cir.steps:
        return []

    intro_s, outro_s = _intro_outro_padding_s(estimated_duration_s, len(cir.steps))
    step_window_s = max(estimated_duration_s - intro_s - outro_s, 0.6)
    segment_s = step_window_s / max(len(cir.steps), 1)
    checkpoints: list[ExecutionCheckpoint] = []
    cursor_line = 1
    used_lines: set[int] = set()

    for index, step in enumerate(cir.steps):
        step_blob = " ".join(
            [
                step.title,
                step.narration,
                *step.annotations,
                *[token.label for token in step.tokens],
                *[token.value or "" for token in step.tokens],
            ]
        ).lower()
        preferred_kinds = _preferred_anchor_kinds(step_blob, index=index, total=len(cir.steps))
        anchor = _select_anchor(
            anchors=anchors,
            preferred_kinds=preferred_kinds,
            cursor_line=cursor_line,
            step_blob=step_blob,
            used_lines=used_lines,
        )
        cursor_line = anchor.line_no
        active_lines = _expand_anchor_lines(anchor=anchor, code_lines=code_lines)
        used_lines.update(active_lines)
        focus_tokens = [token.value or token.label for token in step.tokens[:5]]
        array_focus_indices, array_reference_indices = _derive_array_indices(
            array_track=array_track,
            active_lines=active_lines,
            code_lines=code_lines,
            focus_tokens=focus_tokens,
            step_blob=step_blob,
            preferred_kinds=preferred_kinds,
            step_index=index,
            step_count=len(cir.steps),
        )

        start_s = intro_s + segment_s * index
        end_s = intro_s + segment_s * (index + 1)
        breakpoint = _should_pause_on_checkpoint(step_blob, index=index, total=len(cir.steps))
        checkpoints.append(
            ExecutionCheckpoint(
                id=f"checkpoint-{index + 1}",
                step_index=index,
                step_id=step.id,
                visual_kind=step.visual_kind.value,
                title=step.title,
                summary=_summarize_step(step.narration, step.annotations),
                start_s=round(start_s, 3),
                start_progress=round(start_s / estimated_duration_s, 4),
                end_s=round(end_s, 3),
                end_progress=round(end_s / estimated_duration_s, 4),
                code_lines=active_lines,
                focus_tokens=focus_tokens,
                array_focus_indices=array_focus_indices,
                array_reference_indices=array_reference_indices,
                breakpoint=breakpoint,
                guiding_question=(
                    _guiding_question(step_blob, preferred_kinds) if breakpoint else None
                ),
            )
        )

    if checkpoints:
        checkpoints[-1].end_s = round(estimated_duration_s, 3)
    return checkpoints


def _build_line_to_step_ids(checkpoints: list[ExecutionCheckpoint]) -> dict[int, list[str]]:
    line_to_step_ids: dict[int, list[str]] = {}
    for checkpoint in checkpoints:
        for line_no in checkpoint.code_lines:
            bucket = line_to_step_ids.setdefault(line_no, [])
            if checkpoint.step_id not in bucket:
                bucket.append(checkpoint.step_id)
    return {
        line_no: step_ids
        for line_no, step_ids in sorted(
            line_to_step_ids.items(), key=lambda item: item[0]
        )
    }


def _estimate_duration_s(render_backend: str | None, step_count: int) -> float:
    if step_count <= 0:
        return 6.0
    if render_backend == "storyboard-fallback":
        return round((36 + 52 * step_count + 40) / 24.0, 3)
    return round(max(6.0, 2.4 + step_count * 3.2), 3)


def _intro_outro_padding_s(duration_s: float, step_count: int) -> tuple[float, float]:
    if step_count <= 1:
        return (0.8, 0.8)
    intro = min(1.6, max(0.8, duration_s * 0.12))
    outro = min(1.4, max(0.7, duration_s * 0.1))
    return (round(intro, 3), round(outro, 3))


def _preferred_anchor_kinds(step_blob: str, *, index: int, total: int) -> list[str]:
    preferred: list[str] = []
    if index == 0:
        preferred.extend(["function", "init"])
    if any(
        token in step_blob for token in ("初始化", "准备", "输入", "起点", "start", "setup", "load")
    ):
        preferred.extend(["init", "function"])
    if any(
        token in step_blob for token in ("循环", "遍历", "扫描", "迭代", "枚举", "search", "walk")
    ):
        preferred.extend(["loop", "compare"])
    if any(
        token in step_blob
        for token in ("判断", "条件", "比较", "分支", "命中", "检查", "if", "else")
    ):
        preferred.extend(["branch", "compare"])
    if any(
        token in step_blob
        for token in ("left", "right", "mid", "pivot", "指针", "移动", "更新", "缩小", "扩大")
    ):
        preferred.extend(["pointer", "state"])
    if any(token in step_blob for token in ("swap", "交换")):
        preferred.extend(["swap", "state"])
    if any(token in step_blob for token in ("返回", "结束", "终止", "答案", "result", "return")):
        preferred.extend(["return", "branch"])
    if any(token in step_blob for token in ("递归", "回溯", "展开")):
        preferred.extend(["call", "function"])
    if index == total - 1:
        preferred.extend(["return", "state"])
    preferred.extend(["loop", "branch", "state", "call"])
    return list(dict.fromkeys(preferred))


def _select_anchor(
    *,
    anchors: list[_CodeAnchor],
    preferred_kinds: list[str],
    cursor_line: int,
    step_blob: str,
    used_lines: set[int],
) -> _CodeAnchor:
    best_anchor = anchors[0]
    best_score = float("-inf")
    for anchor in anchors:
        score = 0.0
        for rank, kind in enumerate(preferred_kinds):
            if kind in anchor.kinds:
                score += 28 - rank * 2
        distance = abs(anchor.line_no - cursor_line)
        if anchor.line_no >= cursor_line:
            score += max(0, 12 - distance * 0.7)
        else:
            score += max(0, 8 - distance * 0.9)
        if anchor.line_no not in used_lines:
            score += 4
        if any(token in step_blob for token in ("left", "right", "mid")) and any(
            token in anchor.text.lower() for token in ("left", "right", "mid")
        ):
            score += 6
        if "return" in step_blob and "return" in anchor.text.lower():
            score += 8
        if "if" in step_blob and anchor.text.strip().startswith(("if", "elif")):
            score += 5
        if score > best_score:
            best_anchor = anchor
            best_score = score
    return best_anchor


def _expand_anchor_lines(*, anchor: _CodeAnchor, code_lines: list[str]) -> list[int]:
    selected = [anchor.line_no]
    max_line = len(code_lines)
    if any(kind in anchor.kinds for kind in ("init", "function")):
        for offset in (1, 2):
            candidate = anchor.line_no - offset
            if candidate <= 0:
                break
            stripped = code_lines[candidate - 1].strip()
            if not stripped or stripped.startswith(_COMMENT_PREFIXES):
                continue
            selected.append(candidate)
    for offset in (1, 2):
        candidate = anchor.line_no + offset
        if candidate > max_line:
            break
        stripped = code_lines[candidate - 1].strip()
        if not stripped or stripped.startswith(_COMMENT_PREFIXES):
            continue
        if any(kind in anchor.kinds for kind in ("function", "loop", "branch")):
            selected.append(candidate)
        if len(selected) >= 3:
            break
    return sorted(dict.fromkeys(selected))


def _summarize_step(narration: str, annotations: list[str]) -> str:
    base = narration.strip()
    if len(base) > 120:
        base = base[:117].rstrip() + "..."
    if annotations:
        return f"{base} · {annotations[0]}".strip(" ·")
    return base


def _should_pause_on_checkpoint(step_blob: str, *, index: int, total: int) -> bool:
    if index == 0 and total > 1:
        return True
    return any(
        token in step_blob
        for token in (
            "判断",
            "条件",
            "分支",
            "比较",
            "命中",
            "终止",
            "返回",
            "边界",
            "if",
            "else",
            "return",
        )
    )


def _guiding_question(step_blob: str, preferred_kinds: list[str]) -> str:
    if "init" in preferred_kinds or any(
        token in step_blob for token in ("初始化", "准备", "输入", "起点", "setup", "start")
    ):
        return "这些初始状态为什么要这样设置？如果边界值更极端，会先影响哪一个变量？"
    if "return" in preferred_kinds or "返回" in step_blob:
        return "现在为什么已经可以返回结果，而不是继续推进？"
    if "branch" in preferred_kinds or "判断" in step_blob or "比较" in step_blob:
        return "这里为什么会进入这个分支？如果换成边界输入，结果会变吗？"
    if "pointer" in preferred_kinds or "left" in step_blob or "right" in step_blob:
        return "指针为什么要在这一刻移动？它维护了什么不变量？"
    if "loop" in preferred_kinds:
        return "这轮迭代结束后，哪些状态被保留下来了？"
    return "如果把输入推到边界条件，这一步还会按同样逻辑执行吗？"


def _extract_parameter_controls(code_lines: list[str]) -> list[ExecutionParameterControl]:
    controls: list[ExecutionParameterControl] = []
    joined = "\n".join(code_lines)

    array_match = re.search(
        r"\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\[[^\n]{1,160}\]|\{[^\n]{1,160}\})",
        joined,
    )
    if array_match:
        controls.append(
            ExecutionParameterControl(
                id=array_match.group(1),
                label=array_match.group(1),
                value=array_match.group(2),
                description="修改数组或序列输入后，可重新观察时间轴与代码分支如何变化。",
                placeholder="[1, 3, 5, 7]",
            )
        )

    scalar_matches = re.finditer(
        r"\b(target|k|n|x|value|needle|pivot)\b\s*=\s*([^\n#;]{1,64})",
        joined,
        flags=re.IGNORECASE,
    )
    for match in scalar_matches:
        name = match.group(1)
        if any(control.id == name for control in controls):
            continue
        controls.append(
            ExecutionParameterControl(
                id=name,
                label=name,
                value=match.group(2).strip(),
                description="尝试修改这个关键参数，验证算法在边界输入下的行为。",
                placeholder="8",
            )
        )
        if len(controls) >= 3:
            break

    return controls[:3]


def _extract_array_track(code_lines: list[str]) -> _ArrayTrackInfo | None:
    joined = "\n".join(code_lines)
    array_match = re.search(
        r"\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\[([^\]\n]{1,300})\]",
        joined,
    )
    if not array_match:
        return None

    values = [
        value.strip().strip("\"'")
        for value in array_match.group(2).split(",")
        if value.strip()
    ]
    if not values:
        return None

    target_match = re.search(
        r"\b(target|k|needle|value|pivot|x)\b\s*=\s*([^\n#;]{1,64})",
        joined,
        flags=re.IGNORECASE,
    )
    target_value = None
    if target_match:
        target_value = target_match.group(2).strip().strip("\"'")

    return _ArrayTrackInfo(
        id=array_match.group(1),
        label=array_match.group(1),
        values=values[:18],
        target_value=target_value,
    )


def _derive_array_indices(
    *,
    array_track: _ArrayTrackInfo | None,
    active_lines: list[int],
    code_lines: list[str],
    focus_tokens: list[str],
    step_blob: str,
    preferred_kinds: list[str],
    step_index: int,
    step_count: int,
) -> tuple[list[int], list[int]]:
    if array_track is None or not array_track.values:
        return ([], [])

    combined_blob = " ".join(
        [
            step_blob,
            *[
                code_lines[line_no - 1].strip().lower()
                for line_no in active_lines
                if 1 <= line_no <= len(code_lines)
            ],
        ]
    )
    focus: list[int] = []
    refs: list[int] = []
    matched_from_tokens = _match_array_values(array_track.values, focus_tokens)
    target_index = _find_target_index(array_track)
    last_index = len(array_track.values) - 1

    if matched_from_tokens:
        focus.extend(matched_from_tokens[:2])

    if any(kind in preferred_kinds for kind in ("init", "function")) or any(
        token in combined_blob
        for token in ("初始化", "准备", "window", "边界", "left", "right", "左侧", "右侧")
    ):
        refs.extend([0, last_index])

    if any(token in combined_blob for token in ("mid", "pivot", "compare", "比较", "中点")):
        focus.append(_progressive_mid_index(step_index, step_count, len(array_track.values)))

    if "left" in combined_blob and "mid" not in combined_blob:
        focus.append(0)
    if "right" in combined_blob and "mid" not in combined_blob:
        focus.append(last_index)

    if (
        any(token in combined_blob for token in ("return", "命中", "答案", "找到"))
        and target_index is not None
    ):
        focus.append(target_index)

    if (
        any(token in combined_blob for token in ("swap", "exchange", "交换"))
        and len(array_track.values) >= 2
    ):
        first = min(step_index, last_index)
        second = max(0, last_index - step_index)
        focus.extend([first, second])

    if not focus:
        focus.append(_progressive_mid_index(step_index, step_count, len(array_track.values)))

    if target_index is not None:
        refs.append(target_index)

    focus = _normalize_indices(focus, len(array_track.values))
    refs = _normalize_indices(refs, len(array_track.values), exclude=focus)
    return (focus, refs)


def _match_array_values(values: list[str], focus_tokens: list[str]) -> list[int]:
    normalized_tokens = {token.strip().strip("\"'") for token in focus_tokens if token.strip()}
    return [index for index, value in enumerate(values) if value in normalized_tokens]


def _find_target_index(array_track: _ArrayTrackInfo) -> int | None:
    if array_track.target_value is None:
        return None
    normalized = array_track.target_value.strip().strip("\"'")
    for index, value in enumerate(array_track.values):
        if value == normalized:
            return index
    return None


def _progressive_mid_index(step_index: int, step_count: int, length: int) -> int:
    if length <= 1:
        return 0
    if step_count <= 1:
        return length // 2
    ratio = step_index / max(step_count - 1, 1)
    return round((length - 1) * (0.5 + (ratio - 0.5) * 0.5))


def _normalize_indices(
    indices: list[int],
    length: int,
    *,
    exclude: list[int] | None = None,
) -> list[int]:
    excluded = set(exclude or [])
    result: list[int] = []
    for index in indices:
        bounded = max(0, min(length - 1, index))
        if bounded in excluded or bounded in result:
            continue
        result.append(bounded)
    return result[:4]


def _looks_like_function_definition(line: str, language: str) -> bool:
    if language == "python":
        return bool(re.match(r"^\s*(def|class)\s+[A-Za-z_][A-Za-z0-9_]*\s*[\(:]", line))
    return bool(
        re.match(
            (
                r"^\s*(template\s*<.*>\s*)?(?:inline\s+)?"
                r"(?:void|int|bool|double|float|long long|auto|char|size_t|vector<.*?>|string)"
                r"\s+[A-Za-z_][A-Za-z0-9_]*\s*\("
            ),
            line,
        )
    )


def _looks_like_loop(line: str) -> bool:
    return bool(re.match(r"^\s*(for|while)\b", line))


def _looks_like_branch(line: str) -> bool:
    return bool(re.match(r"^\s*(if|elif|else|switch|case)\b", line))
