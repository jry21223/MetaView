from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field

from app.domain.models.cir import ExecutionParameterControl
from app.domain.models.topic import TopicDomain


class SnapshotKind(str, Enum):
    ALGORITHM_ARRAY = "algorithm_array"
    ALGORITHM_TREE = "algorithm_tree"


class AlgorithmArraySnapshot(BaseModel):
    kind: Literal["algorithm_array"] = "algorithm_array"
    array_values: list[str] = Field(default_factory=list)
    active_indices: list[int] = Field(default_factory=list)
    swap_indices: list[int] = Field(default_factory=list)
    sorted_indices: list[int] = Field(default_factory=list)
    pointers: dict[str, int] = Field(default_factory=dict)


class AlgorithmTreeSnapshot(BaseModel):
    kind: Literal["algorithm_tree"] = "algorithm_tree"
    nodes: list[dict] = Field(default_factory=list)
    edges: list[dict] = Field(default_factory=list)
    active_node_ids: list[str] = Field(default_factory=list)
    visited_node_ids: list[str] = Field(default_factory=list)
    path_edge_ids: list[str] = Field(default_factory=list)


AnySnapshot = Annotated[
    Union[AlgorithmArraySnapshot, AlgorithmTreeSnapshot],
    Field(discriminator="kind"),
]


class CodeHighlightOverlay(BaseModel):
    """Parallel code-sync track — sits alongside the visual snapshot, not inside it."""

    language: str  # "python" | "cpp" | "javascript"
    lines: list[str]  # full source split by line
    active_lines: list[int]  # 0-indexed lines to highlight in this step
    active_line: int  # primary scroll anchor (min of active_lines)
    variables: dict[str, str] = Field(default_factory=dict)


class MetaStep(BaseModel):
    step_id: str
    end_frame: int = Field(ge=1)
    title: str
    voiceover_text: str
    animation_hint: str | None = None
    snapshot: AnySnapshot
    code_highlight: CodeHighlightOverlay | None = None


class PlaybookScript(BaseModel):
    fps: int = Field(default=30, ge=1)
    total_frames: int = Field(ge=1)
    domain: TopicDomain
    title: str
    summary: str
    steps: list[MetaStep] = Field(default_factory=list)
    parameter_controls: list[ExecutionParameterControl] = Field(default_factory=list)
