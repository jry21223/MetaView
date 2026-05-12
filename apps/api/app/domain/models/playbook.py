from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field

from app.domain.models.cir import ExecutionParameterControl
from app.domain.models.topic import TopicDomain


class SnapshotKind(str, Enum):
    ALGORITHM_ARRAY = "algorithm_array"
    ALGORITHM_BARS = "algorithm_bars"
    ALGORITHM_TREE = "algorithm_tree"
    MATH_PLOT = "math_plot"


class AlgorithmArraySnapshot(BaseModel):
    kind: Literal["algorithm_array"] = "algorithm_array"
    array_values: list[str] = Field(default_factory=list)
    active_indices: list[int] = Field(default_factory=list)
    swap_indices: list[int] = Field(default_factory=list)
    sorted_indices: list[int] = Field(default_factory=list)
    pointers: dict[str, int] = Field(default_factory=dict)


class AlgorithmBarsSnapshot(BaseModel):
    """Array elements drawn as height-encoded rectangular bars (bar block view).

    ``array_values`` carries the display labels; ``numeric_values`` carries the
    parsed magnitudes that drive each bar's height.
    """

    kind: Literal["algorithm_bars"] = "algorithm_bars"
    array_values: list[str] = Field(default_factory=list)
    numeric_values: list[float] = Field(default_factory=list)
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


class MathPlotCurve(BaseModel):
    """A single curve on a math function plot.

    ``expression`` is a formula in ``x`` (plus named parameters); the Remotion
    renderer evaluates and samples it client-side via ``shared/lib/mathExpr``.
    """

    expression: str
    label: str | None = None
    emphasis: str = "primary"  # primary | secondary | accent


class MathPlotSnapshot(BaseModel):
    """Cartesian function / curve plot (math domain).

    Carries formula strings — not sampled points — so the renderer controls
    resolution and can animate the curve being drawn from the step ``progress``.
    """

    kind: Literal["math_plot"] = "math_plot"
    curves: list[MathPlotCurve] = Field(default_factory=list)
    x_min: float = -10.0
    x_max: float = 10.0
    y_min: float | None = None
    y_max: float | None = None
    marker_x: float | None = None  # point marker riding the first curve
    shade_from: float | None = None  # shaded region under the first curve [from, to]
    shade_to: float | None = None
    x_label: str = "x"
    y_label: str = "y"
    formula_latex: str | None = None  # optional KaTeX label, e.g. "f(x) = x^2"


AnySnapshot = Annotated[
    Union[
        AlgorithmArraySnapshot,
        AlgorithmBarsSnapshot,
        AlgorithmTreeSnapshot,
        MathPlotSnapshot,
    ],
    Field(discriminator="kind"),
]


class CodeHighlightOverlay(BaseModel):
    """Parallel code-sync track — sits alongside the visual snapshot, not inside it."""

    language: str  # "python" | "cpp" | "javascript"
    lines: list[str]  # full source split by line
    active_lines: list[int]  # 0-indexed lines to highlight in this step
    active_line: int  # primary scroll anchor (min of active_lines)
    variables: dict[str, str] = Field(default_factory=dict)
    operation_label: str | None = None


class MetaStep(BaseModel):
    step_id: str
    end_frame: int = Field(ge=1)
    title: str
    voiceover_text: str
    animation_hint: str | None = None
    snapshot: AnySnapshot
    code_highlight: CodeHighlightOverlay | None = None
    narration_template: list | None = None
    tokens: list[dict] = Field(default_factory=list)


class PlaybookScript(BaseModel):
    fps: int = Field(default=30, ge=1)
    total_frames: int = Field(ge=1)
    domain: TopicDomain
    title: str
    summary: str
    steps: list[MetaStep] = Field(default_factory=list)
    parameter_controls: list[ExecutionParameterControl] = Field(default_factory=list)
    algorithm_id: str | None = None
    initial_data: dict[str, list[str]] = Field(default_factory=dict)
