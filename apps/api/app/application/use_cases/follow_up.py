from __future__ import annotations

import copy
import json
from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError

from app.application.dto.followup_dto import FollowUpChatMessage, FollowUpRequest
from app.application.ports.llm_provider import ILLMProvider
from app.domain.models.playbook import PlaybookScript


class FollowUpPatchError(ValueError):
    """Raised when an LLM patch cannot be safely applied to a playbook."""


@dataclass(frozen=True)
class FollowUpPatchResult:
    reply: str
    change_summary: str
    patch: list[dict[str, Any]]
    playbook: PlaybookScript | None


_ALLOWED_ROOTS = (
    "/title",
    "/summary",
    "/steps",
    "/parameter_controls",
    "/algorithm_id",
    "/initial_data",
)


class FollowUpPatchUseCase:
    def __init__(self, llm: ILLMProvider, *, default_step_frames: int) -> None:
        self._llm = llm
        self._default_step_frames = default_step_frames

    async def execute(
        self, playbook: PlaybookScript, request: FollowUpRequest
    ) -> FollowUpPatchResult:
        system = _build_system_prompt()
        user = _build_user_prompt(playbook, request.message, request.messages)
        first_raw = await self._llm.complete(system, user)
        try:
            return self._parse_and_apply(playbook, first_raw)
        except FollowUpPatchError as first_error:
            repair_user = _build_repair_prompt(playbook, request.message, first_raw, first_error)
            repair_raw = await self._llm.complete(system, repair_user)
            return self._parse_and_apply(playbook, repair_raw)

    def _parse_and_apply(
        self, playbook: PlaybookScript, raw: str
    ) -> FollowUpPatchResult:
        payload = _parse_llm_payload(raw)
        reply = str(payload.get("reply") or "").strip()
        change_summary = str(payload.get("change_summary") or "").strip()
        patch = payload.get("patch")
        if not reply:
            raise FollowUpPatchError("reply must be a non-empty string")
        if not change_summary:
            raise FollowUpPatchError("change_summary must be a non-empty string")
        if not isinstance(patch, list):
            raise FollowUpPatchError("patch must be a JSON array")
        if len(patch) == 0:
            return FollowUpPatchResult(
                reply=reply,
                change_summary=change_summary,
                patch=[],
                playbook=None,
            )

        base = playbook.model_dump(mode="json")
        patched = _apply_patch(base, patch)
        patched = _normalize_timeline_and_layers(patched, self._default_step_frames)
        try:
            next_playbook = PlaybookScript.model_validate(patched)
        except ValidationError as exc:
            raise FollowUpPatchError(str(exc)) from exc
        return FollowUpPatchResult(
            reply=reply,
            change_summary=change_summary,
            patch=patch,
            playbook=next_playbook,
        )


def _build_system_prompt() -> str:
    return """你是 MetaView 的 Playbook 局部修改助手。
你会收到当前 PlaybookScript JSON、用户追问和最近对话。
如果用户只是追问概念、步骤原因或文字解释，可以只回答问题；如果用户要求调整讲解、
步骤、画面或参数，就在当前基础上修改 Playbook。

追问也是学习场景。默认用温和、动态的老师口吻引导学生：
- 如果不知道用户年级，按高一/高二能听懂的程度解释。
- 先连接当前 Playbook 里已经出现的知识，再提示下一小步。
- 不要直接给出作业答案；一次只问一个问题，让学生自己补上关键一步。
- 难点后用一句话小结、口诀或小练习检查理解。
- 如果用户明确要求修改视频，可以改 Playbook；如果只是求解释，优先用空 patch。

只输出严格 JSON，不要 Markdown，不要代码围栏：
{
  "reply": "给用户的简短中文说明",
  "change_summary": "像 git commit message 一样概括这次改动",
  "patch": [{"op": "replace", "path": "/summary", "value": "..."}]
}

patch 使用 RFC 6902 子集，只能使用 add/remove/replace。
如果只是文字回答且不需要修改视频，patch 必须是空数组 []。
允许修改的路径根：/title, /summary, /steps, /parameter_controls, /algorithm_id, /initial_data。
可以一次修改多个 step，也可以修改任意合法 renderer 的 snapshot/layers。
parameter_controls.*.value 和 initial_data.*[] 必须是字符串，即使表示数字也写成 "2"。
不要修改 fps、total_frames、end_frame；服务端会重新规范化时间线。"""


def _build_user_prompt(
    playbook: PlaybookScript, message: str, messages: list[FollowUpChatMessage]
) -> str:
    history = [
        {"role": item.role, "content": item.content}
        for item in messages[-12:]
    ]
    return json.dumps(
        {
            "current_playbook": playbook.model_dump(mode="json"),
            "conversation": history,
            "user_request": message,
        },
        ensure_ascii=False,
    )


def _build_repair_prompt(
    playbook: PlaybookScript,
    message: str,
    raw: str,
    error: Exception,
) -> str:
    return json.dumps(
        {
            "current_playbook": playbook.model_dump(mode="json"),
            "user_request": message,
            "previous_output": raw,
            "validation_error": str(error),
            "instruction": "重新输出严格 JSON，只修正 patch/reply/change_summary。",
        },
        ensure_ascii=False,
    )


def _parse_llm_payload(raw: str) -> dict[str, Any]:
    text = _strip_markdown_fences(raw)
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise FollowUpPatchError(f"LLM output is not valid JSON: {exc}") from exc
    if not isinstance(payload, dict):
        raise FollowUpPatchError("LLM output must be a JSON object")
    return payload


def _strip_markdown_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


def _apply_patch(document: dict[str, Any], patch: list[dict[str, Any]]) -> dict[str, Any]:
    target = copy.deepcopy(document)
    for op in patch:
        if not isinstance(op, dict):
            raise FollowUpPatchError("each patch operation must be an object")
        operation = op.get("op")
        path = op.get("path")
        if operation not in {"add", "remove", "replace"}:
            raise FollowUpPatchError(f"unsupported patch op: {operation!r}")
        if not isinstance(path, str) or not path.startswith("/"):
            raise FollowUpPatchError("patch path must start with '/'")
        if not _is_allowed_path(path):
            raise FollowUpPatchError(f"patch path is not allowed: {path}")
        if operation in {"add", "replace"} and "value" not in op:
            raise FollowUpPatchError(f"{operation} operation requires value")
        _apply_single_operation(target, operation, path, op.get("value"))
    return target


def _is_allowed_path(path: str) -> bool:
    return any(path == root or path.startswith(f"{root}/") for root in _ALLOWED_ROOTS)


def _apply_single_operation(
    document: dict[str, Any], operation: str, path: str, value: Any
) -> None:
    tokens = [_unescape_pointer_token(part) for part in path.split("/")[1:]]
    if not tokens:
        raise FollowUpPatchError("root replacement is not allowed")
    parent = _resolve_parent(document, tokens)
    key = tokens[-1]

    if isinstance(parent, list):
        if operation == "add" and key == "-":
            parent.append(value)
            return
        index = _parse_list_index(key, len(parent), allow_append=operation == "add")
        if operation == "add":
            parent.insert(index, value)
        elif operation == "replace":
            parent[index] = value
        else:
            parent.pop(index)
        return

    if not isinstance(parent, dict):
        raise FollowUpPatchError(f"cannot patch through non-container at {path}")
    if operation == "add":
        parent[key] = value
    elif operation == "replace":
        if key not in parent:
            raise FollowUpPatchError(f"replace path does not exist: {path}")
        parent[key] = value
    else:
        if key not in parent:
            raise FollowUpPatchError(f"remove path does not exist: {path}")
        del parent[key]


def _resolve_parent(document: dict[str, Any], tokens: list[str]) -> Any:
    current: Any = document
    for token in tokens[:-1]:
        if isinstance(current, list):
            current = current[_parse_list_index(token, len(current))]
        elif isinstance(current, dict):
            if token not in current:
                raise FollowUpPatchError(f"path segment does not exist: {token}")
            current = current[token]
        else:
            raise FollowUpPatchError(f"path segment is not traversable: {token}")
    return current


def _parse_list_index(token: str, length: int, *, allow_append: bool = False) -> int:
    try:
        index = int(token)
    except ValueError as exc:
        raise FollowUpPatchError(f"invalid list index: {token}") from exc
    max_index = length if allow_append else length - 1
    if index < 0 or index > max_index:
        raise FollowUpPatchError(f"list index out of range: {token}")
    return index


def _unescape_pointer_token(token: str) -> str:
    return token.replace("~1", "/").replace("~0", "~")


def _normalize_timeline_and_layers(
    playbook: dict[str, Any], default_step_frames: int
) -> dict[str, Any]:
    _normalize_parameter_contract(playbook)
    steps = playbook.get("steps")
    if not isinstance(steps, list):
        return playbook
    frame = 0
    step_frames = max(1, default_step_frames)
    for index, step in enumerate(steps):
        if not isinstance(step, dict):
            continue
        frame += step_frames
        step["end_frame"] = frame
        step.setdefault("step_id", f"step_{index + 1:02d}")
        layers = step.get("layers")
        if isinstance(layers, list) and layers:
            first = layers[0]
            if isinstance(first, dict) and isinstance(first.get("body"), dict):
                step["snapshot"] = first["body"]
        elif "snapshot" in step:
            step["layers"] = [
                {
                    "timing": {
                        "enter_at": 0.0,
                        "exit_at": 1.0,
                        "appear_anim": "fade",
                        "z_order": 0,
                    },
                    "body": step["snapshot"],
                }
            ]
    playbook["total_frames"] = max(1, frame)
    return playbook


def _normalize_parameter_contract(playbook: dict[str, Any]) -> None:
    controls = playbook.get("parameter_controls")
    if isinstance(controls, list):
        for control in controls:
            if not isinstance(control, dict):
                continue
            for key in ("id", "label", "value", "description", "placeholder"):
                if key in control and control[key] is not None:
                    control[key] = str(control[key])

    initial_data = playbook.get("initial_data")
    if isinstance(initial_data, dict):
        for key, values in list(initial_data.items()):
            if isinstance(values, list):
                initial_data[key] = [str(value) for value in values]
            elif values is None:
                initial_data[key] = []
            else:
                initial_data[key] = [str(values)]
