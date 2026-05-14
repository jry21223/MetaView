from __future__ import annotations

from enum import Enum

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
    emphasis: str | None = None  # primary | secondary | accent (default primary)


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


class ScenePoint(BaseModel):
    x: float
    y: float
    label: str | None = None
    emphasis: str | None = None  # primary | secondary | accent (default primary)


class SceneCurve(BaseModel):
    """A scene curve in three forms:

    1. Explicit ``y = f(x)`` — set ``expression_y``.
    2. Parametric ``(fnX(t), fnY(t))`` — set ``expression_x`` + ``expression_y``
       + ``t_min`` + ``t_max``.
    3. Pre-sampled polyline — set ``points`` to a list of (x, y) pairs. Used
       when the LLM prefers to spell the curve out rather than guess a
       sympy-style expression (frequently happens for parametric circles,
       irregular shapes, hand-drawn paths).

    At least one of ``expression_y`` or ``points`` must be present; the
    builder picks the first usable form.
    """

    expression_y: str | None = None
    expression_x: str | None = None  # if set, treat as parametric ``(x(t), y(t))``
    t_min: float | None = None
    t_max: float | None = None
    # LLM-friendly polyline form: list of (x, y) pairs sampled along the curve.
    points: list[tuple[float, float]] = Field(default_factory=list)
    label: str | None = None
    emphasis: str | None = None  # explicit tier; falls back to color or default
    color: str | None = None  # optional named color from LLM (blue/red/…); builder maps to emphasis
    arrows: bool = False  # render direction arrows along the curve


class SceneRegion(BaseModel):
    """Closed polygonal region filled and outlined; vertices in scene units."""

    vertices: list[tuple[float, float]] = Field(default_factory=list)
    label: str | None = None
    emphasis: str = "secondary"


class SceneVectorField(BaseModel):
    """Vector field ``F(x, y) = (P(x, y), Q(x, y))`` sampled on a regular grid."""

    expression_px: str
    expression_py: str
    step: float | None = None  # grid step in scene units; default = auto
    label: str | None = None


class SceneSegment(BaseModel):
    """Straight segment / arrow.

    Two shapes accepted:

    1. Endpoint form: ``(x0, y0) → (x1, y1)``.
    2. Polyline form: ``points = [[x, y], [x, y], …]`` (LLM-friendly; the
       builder fans this out into one or many consecutive endpoint
       segments). A common LLM output for a square's boundary is a
       single segment record with a 5-point ``points`` array — we accept
       that shape directly.

    Either both ``x0/y0/x1/y1`` are set, or ``points`` has ≥ 2 entries.
    """

    x0: float | None = None
    y0: float | None = None
    x1: float | None = None
    y1: float | None = None
    # LLM-friendly polyline form.
    points: list[tuple[float, float]] = Field(default_factory=list)
    arrow: bool = False
    label: str | None = None
    emphasis: str | None = None  # explicit tier; falls back to color or default
    color: str | None = None  # optional named color from LLM


class SceneAnnotation(BaseModel):
    """Free-floating text label. If ``text`` contains ``$...$`` it's KaTeX-rendered."""

    x: float
    y: float
    text: str
    align: str = "ne"  # ne | nw | se | sw | center


class SceneSpec(BaseModel):
    """A 2D coordinate scene: curves, regions, vector fields, segments, points."""

    x_min: float = -5.0
    x_max: float = 5.0
    y_min: float = -5.0
    y_max: float = 5.0
    x_label: str = "x"
    y_label: str = "y"
    points: list[ScenePoint] = Field(default_factory=list)
    curves: list[SceneCurve] = Field(default_factory=list)
    regions: list[SceneRegion] = Field(default_factory=list)
    vector_field: SceneVectorField | None = None
    segments: list[SceneSegment] = Field(default_factory=list)
    annotations: list[SceneAnnotation] = Field(default_factory=list)
    formula_latex: str | None = None  # corner KaTeX summary
    caption: str | None = None


class LayerKind(str, Enum):
    """Discriminator for a single visual layer inside a CIR step.

    A step may stack multiple layers (e.g. a math region + vector field + a
    floating formula overlay). Layers are an additive evolution of the legacy
    ``visual_kind`` field: when ``CirStep.layers`` is empty the builder
    auto-wraps the existing single-snapshot path for backward compatibility.
    """

    MATH_SCENE = "math_scene"
    MATH_PLOT = "math_plot"
    MATH_FORMULA = "math_formula"
    KATEX_OVERLAY = "katex_overlay"
    ARRAY_BOXES = "array_boxes"
    BAR_BLOCKS = "bar_blocks"
    TREE_GRAPH = "tree_graph"
    NARRATION_CARD = "narration_card"


class LayerTimingSpec(BaseModel):
    """Window inside a step's [0,1] progress where the layer is visible.

    The LLM picks normalised positions instead of absolute frame counts so
    the same prompt produces consistent timing across different frame rates.
    """

    enter_at: float = 0.0
    exit_at: float = 1.0
    appear_anim: str | None = "fade"  # fade | draw | slide | scale | none
    z_order: int = 0  # higher draws on top


class KaTeXOverlaySpec(BaseModel):
    """Floating KaTeX label anchored in scene coordinates."""

    x: float
    y: float
    latex: str
    align: str = "ne"  # ne | nw | se | sw | center


class NarrationCardSpec(BaseModel):
    """Floating narration card overlaying the main scene."""

    text: str
    position: str = "bottom"  # top | bottom | center
    emphasis: str | None = None  # primary | secondary | accent (default primary)


class LayerSpec(BaseModel):
    """A single layer of a CIR step.

    Exactly one of the body fields (``scene`` / ``plot`` / ``katex_overlay`` /
    ``narration_card``) should be populated; the builder validates this when
    expanding the layer into a Playbook ``Layer``.
    """

    kind: LayerKind
    timing: LayerTimingSpec = Field(default_factory=LayerTimingSpec)
    scene: SceneSpec | None = None
    plot: PlotSpec | None = None
    katex_overlay: KaTeXOverlaySpec | None = None
    narration_card: NarrationCardSpec | None = None
    # Layers that consume the step's existing tokens/edges (array boxes, tree
    # graph) read those from the parent CirStep so the LLM doesn't have to
    # duplicate per-layer payloads. The kind discriminator picks which
    # builder routine handles the payload.


class CirStep(BaseModel):
    id: str
    title: str
    narration: str | list  # LLM may output a JSON array despite schema hint
    visual_kind: VisualKind
    layout: LayoutInstruction = Field(default_factory=LayoutInstruction)
    tokens: list[VisualToken] = Field(default_factory=list)
    edges: list[EdgeRef] | None = None
    plot: PlotSpec | None = None
    scene: SceneSpec | None = None
    annotations: list[str] = Field(default_factory=list)
    start_time: float | None = None
    end_time: float | None = None
    # New layered output path. Empty list -> the builder synthesises a single
    # layer from ``visual_kind`` + ``plot`` / ``scene`` / ``tokens`` (legacy).
    layers: list[LayerSpec] = Field(default_factory=list)


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
