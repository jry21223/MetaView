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
    MATH_FORMULA = "math_formula"
    MATH_SCENE = "math_scene"
    KATEX_OVERLAY = "katex_overlay"
    NARRATION_CARD = "narration_card"


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


class MathFormulaSnapshot(BaseModel):
    """Static math formula display (math domain — non-graphable content).

    Used when the math step cannot be drawn on a 1-D coordinate plane: vector
    fields, 2-D region integrals, abstract algebra, set theory, etc. The
    renderer typesets ``formula_latex`` center-stage with optional caption and
    side annotations — far more useful than the array fallback used to be.
    """

    kind: Literal["math_formula"] = "math_formula"
    formula_latex: str
    caption: str | None = None  # 1-sentence plain-language summary
    highlights: list[str] = Field(default_factory=list)  # KaTeX sub-expressions to emphasise
    annotations: list[str] = Field(default_factory=list)  # short side notes


class MathScenePoint(BaseModel):
    x: float
    y: float
    label: str | None = None
    emphasis: str = "primary"


class MathSceneCurve(BaseModel):
    expression_y: str
    expression_x: str | None = None
    t_min: float | None = None
    t_max: float | None = None
    label: str | None = None
    emphasis: str = "primary"
    arrows: bool = False


class MathSceneRegion(BaseModel):
    vertices: list[tuple[float, float]] = Field(default_factory=list)
    label: str | None = None
    emphasis: str = "secondary"


class MathSceneVectorField(BaseModel):
    expression_px: str
    expression_py: str
    step: float | None = None
    label: str | None = None


class MathSceneSegment(BaseModel):
    x0: float
    y0: float
    x1: float
    y1: float
    arrow: bool = False
    label: str | None = None
    emphasis: str = "primary"


class MathSceneAnnotation(BaseModel):
    x: float
    y: float
    text: str
    align: str = "ne"


class MathSceneSnapshot(BaseModel):
    """2D math scene: curves, regions, vector fields, segments, points.

    Used when math content benefits from a coordinate system explanation
    rather than a single formula or 1-D curve plot.
    """

    kind: Literal["math_scene"] = "math_scene"
    x_min: float = -5.0
    x_max: float = 5.0
    y_min: float = -5.0
    y_max: float = 5.0
    x_label: str = "x"
    y_label: str = "y"
    points: list[MathScenePoint] = Field(default_factory=list)
    curves: list[MathSceneCurve] = Field(default_factory=list)
    regions: list[MathSceneRegion] = Field(default_factory=list)
    vector_field: MathSceneVectorField | None = None
    segments: list[MathSceneSegment] = Field(default_factory=list)
    annotations: list[MathSceneAnnotation] = Field(default_factory=list)
    formula_latex: str | None = None
    caption: str | None = None


class KaTeXOverlaySnapshot(BaseModel):
    """A KaTeX label anchored at a (x, y) in the underlying scene coords."""

    kind: Literal["katex_overlay"] = "katex_overlay"
    x: float
    y: float
    latex: str
    align: str = "ne"


class NarrationCardSnapshot(BaseModel):
    """Free-floating narration card body overlayed on the main scene."""

    kind: Literal["narration_card"] = "narration_card"
    text: str
    position: str = "bottom"
    emphasis: str = "primary"


AnySnapshot = Annotated[
    Union[
        AlgorithmArraySnapshot,
        AlgorithmBarsSnapshot,
        AlgorithmTreeSnapshot,
        MathPlotSnapshot,
        MathFormulaSnapshot,
        MathSceneSnapshot,
        KaTeXOverlaySnapshot,
        NarrationCardSnapshot,
    ],
    Field(discriminator="kind"),
]


class LayerTiming(BaseModel):
    """Normalised [0,1] window inside a step's progress where a Layer renders."""

    enter_at: float = 0.0
    exit_at: float = 1.0
    appear_anim: str = "fade"
    z_order: int = 0


class Layer(BaseModel):
    """A renderer-ready layer: timing + body snapshot.

    ``body.kind`` discriminates which renderer in the frontend ``layerRegistry``
    handles it. Existing single-snapshot steps are wrapped as a 1-element
    layers list during builder fan-out for backwards compatibility.
    """

    timing: LayerTiming = Field(default_factory=LayerTiming)
    body: AnySnapshot


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
    snapshot: AnySnapshot  # kept for backwards compat; mirrors layers[0].body
    layers: list[Layer] = Field(default_factory=list)
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
