from __future__ import annotations

from pydantic import BaseModel, Field

from app.domain.models.topic import TopicDomain, VisualKind


class LayoutInstruction(BaseModel):
    x: int = 64
    y: int = 96
    width: int = 640
    height: int = 120


class VisualToken(BaseModel):
    id: str
    label: str
    value: str | None = None
    emphasis: str = "secondary"


class EdgeRef(BaseModel):
    from_id: str
    to_id: str


class PlotCurveSpec(BaseModel):
    """One curve on a math function plot.

    ``expression`` is a formula in ``x`` (plus any named parameters),
    e.g. ``"x^2 - 2*x"`` or ``"sin(x)"``. Sampling happens in the renderer.
    """

    expression: str
    label: str | None = None
    emphasis: str = "primary"  # primary | secondary | accent


class PlotSpec(BaseModel):
    """Math function-plot specification attached to a CIR step.

    Used when ``CirStep.visual_kind == VisualKind.FUNCTION``. The LLM supplies
    expressions (not sampled points); the Remotion renderer evaluates them.
    """

    curves: list[PlotCurveSpec] = Field(default_factory=list)
    x_min: float = -10.0
    x_max: float = 10.0
    y_min: float | None = None
    y_max: float | None = None
    marker_x: float | None = None  # a moving point marker rides the first curve
    shade_from: float | None = None  # shaded region under the first curve [from, to]
    shade_to: float | None = None
    x_label: str = "x"
    y_label: str = "y"
    formula_latex: str | None = None  # optional KaTeX label, e.g. "f(x) = x^2"


class CirStep(BaseModel):
    id: str
    title: str
    narration: str | list  # LLM may output a JSON array despite schema hint
    visual_kind: VisualKind
    layout: LayoutInstruction = Field(default_factory=LayoutInstruction)
    tokens: list[VisualToken] = Field(default_factory=list)
    edges: list[EdgeRef] | None = None
    plot: PlotSpec | None = None
    annotations: list[str] = Field(default_factory=list)
    start_time: float | None = None
    end_time: float | None = None


class CirDocument(BaseModel):
    version: str = "0.1.0"
    title: str
    domain: TopicDomain
    summary: str
    steps: list[CirStep] = Field(default_factory=list)
    preset_id: str | None = Field(default=None)


class ExecutionParameterControl(BaseModel):
    id: str
    label: str
    value: str
    description: str | None = None
    placeholder: str | None = None


class ExecutionArrayTrack(BaseModel):
    id: str
    label: str
    values: list[str] = Field(default_factory=list)
    target_value: str | None = None


class ExecutionCheckpoint(BaseModel):
    id: str
    step_index: int = Field(ge=0)
    step_id: str
    visual_kind: VisualKind
    title: str
    summary: str
    start_s: float = Field(ge=0)
    start_progress: float | None = Field(default=None, ge=0, le=1)
    end_s: float = Field(ge=0)
    end_progress: float | None = Field(default=None, ge=0, le=1)
    code_lines: list[int] = Field(default_factory=list)
    focus_tokens: list[str] = Field(default_factory=list)
    array_focus_indices: list[int] = Field(default_factory=list)
    array_reference_indices: list[int] = Field(default_factory=list)
    swap_indices: list[int] = Field(default_factory=list)
    breakpoint: bool = False
    guiding_question: str | None = None


class ExecutionMap(BaseModel):
    duration_s: float = Field(gt=0)
    interaction_hint: str | None = None
    checkpoints: list[ExecutionCheckpoint] = Field(default_factory=list)
    parameter_controls: list[ExecutionParameterControl] = Field(default_factory=list)
    array_track: ExecutionArrayTrack | None = None
    step_to_checkpoint: dict[str, str] = Field(default_factory=dict)
    line_to_step_ids: dict[int, list[str]] = Field(default_factory=dict)
    algorithm_id: str | None = None
    algorithm_code: list[str] | None = None
