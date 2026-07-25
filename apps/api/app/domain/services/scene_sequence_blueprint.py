from __future__ import annotations

from copy import deepcopy
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.domain.models.playbook import (
    CallStackCodeTrace,
    CallStackFrame,
    CallStackSceneSnapshot,
    Layer,
    LayerTiming,
    MetaStep,
    PlaybookScript,
)
from app.domain.models.topic import TopicDomain
from app.domain.services.playbook_quality import estimate_step_frames
from app.domain.services.scene_blueprint_compiler import (
    _code_highlight,
    _compile_snapshot,
    _sync_code_highlight_state,
)
from app.domain.services.scene_blueprint_schema import validate_scene_blueprint

TransitionKind = Literal["hold", "reveal", "morph", "compare", "focus"]


class SceneCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    id: str = Field(min_length=1)
    title: str | None = None
    narration_goal: str = Field(alias="narrationGoal", min_length=1)
    state_delta: dict[str, Any] = Field(default_factory=dict, alias="stateDelta")
    transition: TransitionKind = "reveal"
    assertions: list[str] = Field(default_factory=list)
    duration_seconds: float | None = Field(default=None, alias="durationSeconds", gt=0, le=20)


class SceneSequenceBlueprint(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    subject: str = Field(min_length=1)
    scene_type: str = Field(alias="sceneType", min_length=1)
    title: str = Field(min_length=1)
    visual_intent: list[str] = Field(alias="visualIntent", min_length=1)
    initial_state: dict[str, Any] = Field(default_factory=dict, alias="initialState")
    checkpoints: list[SceneCheckpoint] = Field(min_length=1, max_length=14)

    @model_validator(mode="after")
    def validate_checkpoint_ids(self) -> "SceneSequenceBlueprint":
        ids = [checkpoint.id for checkpoint in self.checkpoints]
        if len(ids) != len(set(ids)):
            raise ValueError("checkpoint ids must be unique")
        return self


class CompiledSceneSequence(BaseModel):
    playbook: PlaybookScript
    source_map: dict[str, dict[str, Any]]
    checkpoint_snapshots: list[dict[str, Any]]


def scene_sequence_blueprint_tool_schema() -> dict[str, Any]:
    return SceneSequenceBlueprint.model_json_schema(by_alias=True)


def compile_scene_sequence_blueprint(payload: dict[str, Any]) -> CompiledSceneSequence:
    sequence = SceneSequenceBlueprint.model_validate(payload)
    base_payload = _base_blueprint_payload(payload)
    state = _deep_merge(deepcopy(base_payload), sequence.initial_state)
    fps = 30
    frame_cursor = 0
    steps: list[MetaStep] = []
    source_map: dict[str, dict[str, Any]] = {}
    snapshots: list[dict[str, Any]] = []
    previous_snapshot: dict[str, Any] | None = None

    for index, checkpoint in enumerate(sequence.checkpoints, start=1):
        state = _deep_merge(state, checkpoint.state_delta)
        state["subject"] = sequence.subject
        state["sceneType"] = sequence.scene_type
        state["title"] = checkpoint.title or sequence.title
        state["visualIntent"] = list(sequence.visual_intent)
        state["caption"] = checkpoint.narration_goal
        schema_errors = validate_scene_blueprint(state)
        if schema_errors:
            raise ValueError(
                f"checkpoint {checkpoint.id!r} produces invalid SceneBlueprint: {schema_errors}"
            )
        snapshot = _compile_sequence_snapshot(sequence.scene_type, state)
        snapshot_json = snapshot.model_dump(mode="json", exclude_none=True)
        _validate_checkpoint_assertions(
            checkpoint=checkpoint,
            snapshot=snapshot_json,
            previous_snapshot=previous_snapshot,
        )
        code_highlight = _code_highlight(sequence.scene_type, state)
        if code_highlight is not None:
            code_highlight = _sync_code_highlight_state(
                sequence.scene_type,
                snapshot,
                code_highlight,
            )
        duration = (
            round(checkpoint.duration_seconds * fps)
            if checkpoint.duration_seconds is not None
            else max(90, estimate_step_frames(checkpoint.narration_goal, fps))
        )
        frame_cursor += duration
        step_id = f"{sequence.scene_type}_{checkpoint.id}"
        steps.append(
            MetaStep(
                step_id=step_id,
                end_frame=frame_cursor,
                title=checkpoint.title or f"{sequence.title} · {index}",
                voiceover_text=checkpoint.narration_goal,
                animation_hint=checkpoint.transition,
                snapshot=snapshot,
                layers=[
                    Layer(
                        timing=LayerTiming(
                            appear_anim=_transition_appear_animation(checkpoint.transition),
                        ),
                        body=snapshot,
                    )
                ],
                code_highlight=code_highlight,
                tokens=[],
            )
        )
        path = f"checkpoints.{index - 1}"
        source_map[path] = {
            "checkpoint_id": checkpoint.id,
            "step_id": step_id,
            "step_index": index - 1,
            "snapshot_kind": snapshot.kind,
        }
        snapshots.append(snapshot_json)
        previous_snapshot = snapshot_json

    playbook = PlaybookScript(
        fps=fps,
        total_frames=frame_cursor,
        domain=TopicDomain(sequence.subject),
        title=sequence.title,
        summary=str(payload.get("caption") or sequence.title),
        steps=steps,
        parameter_controls=[],
        algorithm_id=sequence.scene_type,
        initial_data={
            "scene_sequence_blueprint": [sequence.scene_type],
            "checkpoint_ids": [checkpoint.id for checkpoint in sequence.checkpoints],
            "visual_intent": list(sequence.visual_intent),
        },
    )
    return CompiledSceneSequence(
        playbook=playbook,
        source_map=source_map,
        checkpoint_snapshots=snapshots,
    )


def _compile_sequence_snapshot(scene_type: str, state: dict[str, Any]):
    if scene_type == "recursion_stack" and isinstance(state.get("stackFrames"), list):
        return _compile_recursion_checkpoint(state)
    return _compile_snapshot(scene_type, state)


def _compile_recursion_checkpoint(state: dict[str, Any]) -> CallStackSceneSnapshot:
    raw_frames = state.get("stackFrames")
    frames: list[CallStackFrame] = []
    if isinstance(raw_frames, list):
        for index, item in enumerate(raw_frames):
            if not isinstance(item, dict):
                continue
            frame_id = str(item.get("id") or f"frame-{index + 1}")
            raw_variables = item.get("variables")
            variables = (
                {str(key): str(value) for key, value in raw_variables.items()}
                if isinstance(raw_variables, dict)
                else {}
            )
            frames.append(
                CallStackFrame(
                    id=frame_id,
                    label=str(item.get("label") or frame_id),
                    depth=int(item.get("depth") or index),
                    state=str(item.get("state") or "waiting"),
                    variables=variables,
                    asset_id=(
                        str(item["assetId"]) if item.get("assetId") is not None else None
                    ),
                )
            )
    if not frames:
        return _compile_snapshot("recursion_stack", state)

    raw_trace = state.get("codeTrace")
    code_trace = None
    if isinstance(raw_trace, dict):
        raw_lines = raw_trace.get("lines")
        lines = [str(line) for line in raw_lines] if isinstance(raw_lines, list) else []
        active_lines_raw = raw_trace.get("activeLines") or raw_trace.get("active_lines")
        active_lines = (
            [int(line) for line in active_lines_raw if isinstance(line, int)]
            if isinstance(active_lines_raw, list)
            else []
        )
        active_line = raw_trace.get("activeLine", raw_trace.get("active_line", 0))
        code_trace = CallStackCodeTrace(
            language=str(raw_trace.get("language") or "python"),
            lines=lines,
            active_lines=active_lines,
            active_line=int(active_line) if isinstance(active_line, int) else 0,
            asset_id=(
                str(raw_trace["assetId"]) if raw_trace.get("assetId") is not None else None
            ),
        )

    requested_current = state.get("currentFrameId") or state.get("current_frame_id")
    current_frame_id = str(requested_current) if requested_current else frames[-1].id
    if current_frame_id not in {frame.id for frame in frames}:
        raise ValueError(
            f"currentFrameId {current_frame_id!r} does not identify a checkpoint stack frame"
        )
    return CallStackSceneSnapshot(
        pack_id=str(state.get("packId") or "algorithm-code-basic"),
        asset_id=str(state.get("assetId") or "recursion-stack-preset"),
        frames=frames,
        code_trace=code_trace,
        current_frame_id=current_frame_id,
        caption=str(state.get("caption") or "Recursive call-stack checkpoint."),
    )


def _base_blueprint_payload(payload: dict[str, Any]) -> dict[str, Any]:
    excluded = {"checkpoints", "initialState", "initial_state"}
    return {key: deepcopy(value) for key, value in payload.items() if key not in excluded}


_MAX_MERGE_DEPTH = 32


def _deep_merge(
    base: dict[str, Any],
    patch: dict[str, Any],
    *,
    depth: int = 0,
) -> dict[str, Any]:
    if depth > _MAX_MERGE_DEPTH:
        raise ValueError(
            f"stateDelta nesting exceeds the {_MAX_MERGE_DEPTH}-level safety limit"
        )
    result = deepcopy(base)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge(result[key], value, depth=depth + 1)
        elif value is None:
            result.pop(key, None)
        else:
            result[key] = deepcopy(value)
    return result


def _validate_checkpoint_assertions(
    *,
    checkpoint: SceneCheckpoint,
    snapshot: dict[str, Any],
    previous_snapshot: dict[str, Any] | None,
) -> None:
    for assertion in checkpoint.assertions:
        if assertion in {"distinct_from_previous", "has_visible_change"}:
            if previous_snapshot is not None and snapshot == previous_snapshot:
                raise ValueError(
                    f"checkpoint {checkpoint.id!r} failed assertion {assertion!r}: "
                    "compiled snapshot is identical to the previous checkpoint"
                )
        elif assertion == "non_empty":
            if len(snapshot) <= 1:
                raise ValueError(
                    f"checkpoint {checkpoint.id!r} failed assertion 'non_empty'"
                )
        else:
            raise ValueError(
                f"checkpoint {checkpoint.id!r} declares unsupported assertion {assertion!r}"
            )


def _transition_appear_animation(transition: TransitionKind) -> str:
    return {
        "hold": "none",
        "reveal": "fade",
        "morph": "draw",
        "compare": "slide",
        "focus": "scale",
    }[transition]
