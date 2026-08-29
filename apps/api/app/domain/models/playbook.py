from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.domain.models.execution import ExecutionParameterControl
from app.domain.models.topic import TopicDomain


class SnapshotKind(str, Enum):
    ALGORITHM_ARRAY = "algorithm_array"
    ALGORITHM_BARS = "algorithm_bars"
    ALGORITHM_TREE = "algorithm_tree"
    MATH_PLOT = "math_plot"
    MATH_FORMULA = "math_formula"
    MATH_SCENE = "math_scene"
    MATRIX_SCENE = "matrix_scene"
    TABLE_SCENE = "table_scene"
    GRAPH_SCENE = "graph_scene"
    CALL_STACK_SCENE = "call_stack_scene"
    CODE_TRACE_SCENE = "code_trace_scene"
    STATS_CHART_SCENE = "stats_chart_scene"
    ITERATION_TRACE_SCENE = "iteration_trace_scene"
    PHASE_PORTRAIT_SCENE = "phase_portrait_scene"
    COMPLEX_PLANE_SCENE = "complex_plane_scene"
    OPTIMIZATION_SCENE = "optimization_scene"
    MODELING_SCENE = "modeling_scene"
    MANIFOLD_SCENE = "manifold_scene"
    SOLID_GEOMETRY_SCENE = "solid_geometry_scene"
    BIO_CELL_SCENE = "bio_cell_scene"
    BIO_PROCESS_SCENE = "bio_process_scene"
    MOLECULE_2D_SCENE = "molecule_2d_scene"
    REACTION_SCENE = "reaction_scene"
    GEO_MAP_SCENE = "geo_map_scene"
    PHYSICS_FORCE_SCENE = "physics_force_scene"
    MOTION_SCENE = "motion_scene"
    KATEX_OVERLAY = "katex_overlay"
    NARRATION_CARD = "narration_card"


class AlgorithmRange(BaseModel):
    id: str
    start: int = Field(ge=0)
    end: int = Field(ge=0)
    role: Literal[
        "window",
        "search_range",
        "partition",
        "merge_range",
        "current_subarray",
        "best_subarray",
    ]
    label: str | None = None
    emphasis: Literal["primary", "secondary", "accent", "muted"] | None = None

    @model_validator(mode="after")
    def validate_bounds(self) -> AlgorithmRange:
        if self.end < self.start:
            raise ValueError("end must be greater than or equal to start")
        return self


class AlgorithmAuxiliaryItem(BaseModel):
    id: str
    label: str
    value: str | None = None
    index: int | None = Field(default=None, ge=0)
    emphasis: Literal["primary", "secondary", "accent", "muted"] | None = None


class AlgorithmAuxiliaryLane(BaseModel):
    id: str
    role: Literal["deque", "result", "auxiliary_array"]
    label: str
    items: list[AlgorithmAuxiliaryItem] = Field(default_factory=list)


class AlgorithmArraySnapshot(BaseModel):
    kind: Literal["algorithm_array"] = "algorithm_array"
    array_values: list[str] = Field(default_factory=list)
    active_indices: list[int] = Field(default_factory=list)
    swap_indices: list[int] = Field(default_factory=list)
    sorted_indices: list[int] = Field(default_factory=list)
    pointers: dict[str, int] = Field(default_factory=dict)
    ranges: list[AlgorithmRange] = Field(default_factory=list)
    element_states: dict[
        int,
        list[Literal["entering", "leaving", "maximum", "pivot"]],
    ] = Field(default_factory=dict)
    auxiliary_lanes: list[AlgorithmAuxiliaryLane] = Field(default_factory=list)


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
    ranges: list[AlgorithmRange] = Field(default_factory=list)
    element_states: dict[
        int,
        list[Literal["entering", "leaving", "maximum", "pivot"]],
    ] = Field(default_factory=dict)
    auxiliary_lanes: list[AlgorithmAuxiliaryLane] = Field(default_factory=list)


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
    semantic_role: str | None = None


class MathPlotPoint(BaseModel):
    """A fixed data point overlaid on a math function plot (measured observations)."""

    x: float
    y: float
    label: str | None = None
    emphasis: str = "primary"  # primary | secondary | accent
    semantic_role: str | None = None


class MathPlotPolyline(BaseModel):
    """A precomputed trajectory drawn as one polyline (iterated maps, ODE solutions)."""

    points: list[tuple[float, float]] = Field(default_factory=list)
    label: str | None = None
    emphasis: str = "primary"  # primary | secondary | accent
    semantic_role: str | None = None


class MathPlotSnapshot(BaseModel):
    """Cartesian function / curve plot (math domain).

    Curves carry formula strings — not sampled points — so the renderer controls
    resolution and can animate the curve being drawn from the step ``progress``.
    ``points`` overlays discrete observations (experiment records) and
    ``polylines`` overlays precomputed trajectories on top.
    """

    kind: Literal["math_plot"] = "math_plot"
    pack_id: str | None = None
    asset_id: str | None = None
    curves: list[MathPlotCurve] = Field(default_factory=list)
    points: list[MathPlotPoint] = Field(default_factory=list)
    polylines: list[MathPlotPolyline] = Field(default_factory=list)
    params: dict[str, float] = Field(default_factory=dict)
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
    caption: str | None = None


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
    semantic_role: str | None = None


class MathSceneCurve(BaseModel):
    expression_y: str
    expression_x: str | None = None
    t_min: float | None = None
    t_max: float | None = None
    label: str | None = None
    emphasis: str = "primary"
    arrows: bool = False
    semantic_role: str | None = None


class MathSceneRegion(BaseModel):
    vertices: list[tuple[float, float]] = Field(default_factory=list)
    label: str | None = None
    emphasis: str = "secondary"
    semantic_role: str | None = None


class MathSceneVectorField(BaseModel):
    expression_px: str
    expression_py: str
    step: float | None = None
    label: str | None = None
    semantic_role: str | None = None


class MathSceneSegment(BaseModel):
    x0: float
    y0: float
    x1: float
    y1: float
    arrow: bool = False
    label: str | None = None
    emphasis: str = "primary"
    semantic_role: str | None = None


class MathSceneAnnotation(BaseModel):
    x: float
    y: float
    text: str
    align: str = "ne"
    semantic_role: str | None = None


class MathSceneSnapshot(BaseModel):
    """2D math scene: curves, regions, vector fields, segments, points.

    Used when math content benefits from a coordinate system explanation
    rather than a single formula or 1-D curve plot.
    """

    kind: Literal["math_scene"] = "math_scene"
    camera_mode: Literal["auto", "fixed"] = "auto"
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


CellValue = str | int | float
SceneEmphasis = Literal["primary", "secondary", "accent", "muted"]


class MatrixSceneSnapshot(BaseModel):
    kind: Literal["matrix_scene"] = "matrix_scene"
    matrix: list[list[CellValue]] = Field(default_factory=list)
    row_labels: list[str] = Field(default_factory=list)
    col_labels: list[str] = Field(default_factory=list)
    active_rows: list[int] = Field(default_factory=list)
    active_columns: list[int] = Field(default_factory=list)
    active_cells: list[tuple[int, int]] = Field(default_factory=list)
    operation_label: str | None = None
    formula_latex: str | None = None
    caption: str | None = None


class TableSceneSnapshot(BaseModel):
    kind: Literal["table_scene"] = "table_scene"
    columns: list[str] = Field(default_factory=list)
    rows: list[list[CellValue]] = Field(default_factory=list)
    active_rows: list[int] = Field(default_factory=list)
    active_columns: list[int] = Field(default_factory=list)
    active_cells: list[tuple[int, int]] = Field(default_factory=list)
    caption: str | None = None


class GraphSceneNode(BaseModel):
    id: str
    label: str | None = None
    x: float | None = None
    y: float | None = None
    emphasis: SceneEmphasis = "secondary"
    asset_id: str | None = None


class GraphSceneEdge(BaseModel):
    id: str | None = None
    source: str
    target: str
    label: str | None = None
    weight: float | None = None
    emphasis: SceneEmphasis = "secondary"
    asset_id: str | None = None


class GraphSceneSnapshot(BaseModel):
    kind: Literal["graph_scene"] = "graph_scene"
    pack_id: str | None = None
    asset_id: str | None = None
    nodes: list[GraphSceneNode] = Field(default_factory=list)
    edges: list[GraphSceneEdge] = Field(default_factory=list)
    directed: bool = False
    weighted: bool = False
    current_node_id: str | None = None
    active_node_ids: list[str] = Field(default_factory=list)
    active_edge_ids: list[str] = Field(default_factory=list)
    visited_node_ids: list[str] = Field(default_factory=list)
    queue_node_ids: list[str] = Field(default_factory=list)
    frontier_node_ids: list[str] = Field(default_factory=list)
    caption: str | None = None


class CallStackFrame(BaseModel):
    id: str
    label: str
    depth: int = 0
    state: str = "waiting"
    asset_id: str | None = None
    variables: dict[str, str] = Field(default_factory=dict)


class CallStackCodeTrace(BaseModel):
    language: str
    lines: list[str] = Field(default_factory=list)
    active_lines: list[int] = Field(default_factory=list)
    active_line: int = 0
    asset_id: str | None = None


class CallStackSceneSnapshot(BaseModel):
    kind: Literal["call_stack_scene"] = "call_stack_scene"
    pack_id: str | None = None
    asset_id: str | None = None
    frames: list[CallStackFrame] = Field(default_factory=list)
    code_trace: CallStackCodeTrace | None = None
    current_frame_id: str | None = None
    caption: str | None = None


class CodeTracePointer(BaseModel):
    id: str
    label: str
    index: int
    asset_id: str | None = None


class CodeTraceSceneSnapshot(BaseModel):
    kind: Literal["code_trace_scene"] = "code_trace_scene"
    pack_id: str | None = None
    asset_id: str | None = None
    language: str
    lines: list[str] = Field(default_factory=list)
    active_lines: list[int] = Field(default_factory=list)
    active_line: int = 0
    active_line_asset_id: str | None = None
    array_values: list[str] = Field(default_factory=list)
    active_indices: list[int] = Field(default_factory=list)
    search_range: tuple[int, int] | None = None
    pointers: list[CodeTracePointer] = Field(default_factory=list)
    variables: dict[str, str] = Field(default_factory=dict)
    caption: str | None = None


class ChartPoint(BaseModel):
    x: float
    y: float
    label: str | None = None


class ChartSeries(BaseModel):
    label: str
    points: list[ChartPoint] = Field(default_factory=list)
    values: list[float] = Field(default_factory=list)
    emphasis: SceneEmphasis = "primary"


class StatsChartSceneSnapshot(BaseModel):
    kind: Literal["stats_chart_scene"] = "stats_chart_scene"
    chart_type: Literal["line", "bar", "histogram", "distribution", "box"] = "line"
    series: list[ChartSeries] = Field(default_factory=list)
    x_label: str = "x"
    y_label: str = "y"
    current_index: int | None = None
    formula_latex: str | None = None
    caption: str | None = None


class IterationTraceItem(BaseModel):
    index: int
    value: CellValue
    error: float | None = None
    label: str | None = None


class IterationTraceSceneSnapshot(BaseModel):
    kind: Literal["iteration_trace_scene"] = "iteration_trace_scene"
    iterations: list[IterationTraceItem] = Field(default_factory=list)
    metric_name: str = "error"
    current_index: int | None = None
    formula_latex: str | None = None
    caption: str | None = None


class PhaseTrajectory(BaseModel):
    label: str | None = None
    points: list[tuple[float, float]] = Field(default_factory=list)
    emphasis: SceneEmphasis = "primary"


class PhaseEquilibrium(BaseModel):
    x: float
    y: float
    label: str | None = None
    stable: bool | None = None


class PhasePortraitSceneSnapshot(BaseModel):
    kind: Literal["phase_portrait_scene"] = "phase_portrait_scene"
    trajectories: list[PhaseTrajectory] = Field(default_factory=list)
    equilibria: list[PhaseEquilibrium] = Field(default_factory=list)
    vector_field: MathSceneVectorField | None = None
    x_min: float = -5.0
    x_max: float = 5.0
    y_min: float = -5.0
    y_max: float = 5.0
    formula_latex: str | None = None
    caption: str | None = None


class ComplexPlanePoint(BaseModel):
    re: float
    im: float
    label: str | None = None
    emphasis: SceneEmphasis = "primary"


class ComplexPlaneSceneSnapshot(BaseModel):
    kind: Literal["complex_plane_scene"] = "complex_plane_scene"
    points: list[ComplexPlanePoint] = Field(default_factory=list)
    contours: list[list[tuple[float, float]]] = Field(default_factory=list)
    mapping_grid: list[list[tuple[float, float]]] = Field(default_factory=list)
    x_min: float = -4.0
    x_max: float = 4.0
    y_min: float = -4.0
    y_max: float = 4.0
    formula_latex: str | None = None
    caption: str | None = None


class OptimizationSceneSnapshot(BaseModel):
    kind: Literal["optimization_scene"] = "optimization_scene"
    objective: str | None = None
    feasible_region: list[tuple[float, float]] = Field(default_factory=list)
    iterates: list[tuple[float, float]] = Field(default_factory=list)
    optimum: tuple[float, float] | None = None
    x_min: float = -1.0
    x_max: float = 6.0
    y_min: float = -1.0
    y_max: float = 6.0
    formula_latex: str | None = None
    caption: str | None = None


class ModelingVariable(BaseModel):
    id: str
    label: str
    value: CellValue | None = None
    unit: str | None = None


class ModelingRelation(BaseModel):
    source: str
    target: str
    label: str | None = None
    emphasis: SceneEmphasis = "secondary"


class ModelingSceneSnapshot(BaseModel):
    kind: Literal["modeling_scene"] = "modeling_scene"
    variables: list[ModelingVariable] = Field(default_factory=list)
    relations: list[ModelingRelation] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    simulation_series: list[ChartSeries] = Field(default_factory=list)
    formula_latex: str | None = None
    caption: str | None = None


class ManifoldTangentVector(BaseModel):
    at: tuple[float, float, float]
    direction: tuple[float, float, float]
    label: str | None = None
    emphasis: SceneEmphasis = "accent"


class ManifoldSceneSnapshot(BaseModel):
    kind: Literal["manifold_scene"] = "manifold_scene"
    chart_name: str | None = None
    param_surface: str | None = None
    u_range: tuple[float, float] = (-2.0, 2.0)
    v_range: tuple[float, float] = (-2.0, 2.0)
    tangent_vectors: list[ManifoldTangentVector] = Field(default_factory=list)
    formula_latex: str | None = None
    caption: str | None = None


SolidGeometryEmphasis = Literal["primary", "secondary", "muted", "accent"]


class SolidGeometryPoint(BaseModel):
    label: str
    position: tuple[float, float, float]
    math_position_latex: tuple[str, str, str] | None = None


class SolidGeometryEdge(BaseModel):
    start: str
    end: str
    label: str | None = None
    emphasis: SolidGeometryEmphasis = "secondary"


class SolidGeometryPlane(BaseModel):
    id: str
    vertices: list[str]
    label: str | None = None
    emphasis: SolidGeometryEmphasis = "secondary"


class SolidGeometryVector(BaseModel):
    id: str
    start: str
    end: str | None = None
    direction: tuple[float, float, float] | None = None
    label: str | None = None
    emphasis: SolidGeometryEmphasis = "accent"


class SolidGeometrySceneSnapshot(BaseModel):
    kind: Literal["solid_geometry_scene"] = "solid_geometry_scene"
    points: list[SolidGeometryPoint] = Field(default_factory=list)
    edges: list[SolidGeometryEdge] = Field(default_factory=list)
    planes: list[SolidGeometryPlane] = Field(default_factory=list)
    vectors: list[SolidGeometryVector] = Field(default_factory=list)
    visible_elements: list[str] = Field(default_factory=list)
    focus_target: str | None = None
    formula_latex: str | None = None
    caption: str | None = None


class BioCellStructure(BaseModel):
    id: str
    semantic_role: str
    label: str | None = None
    x: float
    y: float
    width: float
    height: float
    asset_id: str | None = None


class BioCellCallout(BaseModel):
    id: str
    target_id: str
    label: str
    side: Literal["left", "right", "top", "bottom"] | None = None


class BioCellSceneSnapshot(BaseModel):
    kind: Literal["bio_cell_scene"] = "bio_cell_scene"
    pack_id: str | None = None
    cell_type: str | None = None
    structures: list[BioCellStructure] = Field(default_factory=list)
    callouts: list[BioCellCallout] = Field(default_factory=list)
    caption: str | None = None


class BioProcessStep(BaseModel):
    id: str
    semantic_role: str
    label: str | None = None
    x: float
    y: float
    width: float
    height: float
    asset_id: str | None = None
    description: str | None = None


class BioProcessConnection(BaseModel):
    id: str
    from_: str = Field(alias="from")
    to: str
    semantic_role: str
    label: str | None = None
    asset_id: str | None = None


class BioProcessSceneSnapshot(BaseModel):
    kind: Literal["bio_process_scene"] = "bio_process_scene"
    pack_id: str | None = None
    process_id: str
    steps: list[BioProcessStep] = Field(default_factory=list)
    connections: list[BioProcessConnection] = Field(default_factory=list)
    callouts: list[BioCellCallout] = Field(default_factory=list)
    caption: str | None = None


class Molecule2DAtom(BaseModel):
    id: str
    element: str
    x: float
    y: float
    charge: str | None = None
    label: str | None = None
    asset_id: str | None = None


class Molecule2DBond(BaseModel):
    id: str
    from_: str = Field(alias="from")
    to: str
    order: Literal[1, 2, 3] = 1
    stereo: Literal["wedge", "dash"] | None = None
    label: str | None = None
    asset_id: str | None = None


class Molecule2DCallout(BaseModel):
    id: str
    target_id: str
    label: str
    side: Literal["left", "right", "top", "bottom"] | None = None


class Molecule2DSceneSnapshot(BaseModel):
    kind: Literal["molecule_2d_scene"] = "molecule_2d_scene"
    pack_id: str | None = None
    molecule_id: str
    smiles: str | None = None
    molecule_asset_id: str | None = None
    atoms: list[Molecule2DAtom] = Field(default_factory=list)
    bonds: list[Molecule2DBond] = Field(default_factory=list)
    highlights: list[str] = Field(default_factory=list)
    callouts: list[Molecule2DCallout] = Field(default_factory=list)
    formula_latex: str | None = None
    caption: str | None = None


class ReactionParticipant(BaseModel):
    id: str
    formula_latex: str
    label: str | None = None
    coefficient: float | None = None
    x: float
    y: float
    asset_id: str | None = None


class ReactionArrow(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: str
    semantic_role: str = "reaction_arrow"
    from_: tuple[float, float] = Field(alias="from")
    to: tuple[float, float]
    label: str | None = None
    asset_id: str | None = None


class ReactionElectronFlow(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: str
    semantic_role: str = "electron_flow"
    from_: tuple[float, float] = Field(alias="from")
    to: tuple[float, float]
    label: str | None = None
    asset_id: str | None = None


class ReactionSceneSnapshot(BaseModel):
    kind: Literal["reaction_scene"] = "reaction_scene"
    pack_id: str | None = None
    reaction_id: str
    reactants: list[ReactionParticipant] = Field(default_factory=list)
    products: list[ReactionParticipant] = Field(default_factory=list)
    arrows: list[ReactionArrow] = Field(default_factory=list)
    electron_flows: list[ReactionElectronFlow] = Field(default_factory=list)
    callouts: list[Molecule2DCallout] = Field(default_factory=list)
    formula_latex: str | None = None
    caption: str | None = None


class GeoMapLayer(BaseModel):
    id: str
    semantic_role: str
    label: str | None = None
    asset_id: str | None = None


class GeoMapFlow(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: str
    semantic_role: str = "wind"
    from_: tuple[float, float] = Field(alias="from")
    to: tuple[float, float]
    label: str | None = None
    asset_id: str | None = None
    strength: float | None = None


class GeoPressureCenter(BaseModel):
    id: str
    kind: Literal["high", "low"]
    x: float
    y: float
    label: str


class GeoMapSceneSnapshot(BaseModel):
    kind: Literal["geo_map_scene"] = "geo_map_scene"
    pack_id: str = "geography-earth-basic"
    map_region: str = "east_asia"
    layers: list[GeoMapLayer] = Field(default_factory=list)
    flows: list[GeoMapFlow] = Field(default_factory=list)
    pressure_centers: list[GeoPressureCenter] = Field(default_factory=list)
    particle_preset: str | None = None
    caption: str | None = None


class PhysicsSceneObject(BaseModel):
    id: str
    label: str | None = None
    x: float
    y: float
    asset_id: str | None = None
    radius: float | None = None


class PhysicsSceneVector(BaseModel):
    id: str
    target: str
    semantic_role: str
    dx: float
    dy: float
    label: str | None = None
    magnitude: str | None = None


class PhysicsSceneTrajectory(BaseModel):
    """A path drawn in scene space (a second body, a reference trajectory, a wall)."""

    id: str | None = None
    points: list[tuple[float, float]] = Field(default_factory=list)
    label: str | None = None
    emphasis: str | None = None
    semantic_role: str | None = None
    # Ride a looping tracer dot along this path after it draws in. All tracers
    # share one clock, so paths spanning the same time interval stay physically
    # synchronized; only flag paths whose vertices are uniform in time.
    flow: bool | None = None


class PhysicsScenePoint(BaseModel):
    """A marked point in scene space (equal-time samples, apex, landing marks)."""

    x: float
    y: float
    label: str | None = None
    emphasis: str | None = None
    semantic_role: str | None = None


class PhysicsSceneAnnotation(BaseModel):
    """Free-floating text label anchored in scene space."""

    x: float
    y: float
    text: str
    align: str | None = None
    semantic_role: str | None = None


class PhysicsSceneSpring(BaseModel):
    """Zig-zag coil drawn between two anchors (spring diagrams)."""

    id: str
    x0: float
    y0: float
    x1: float
    y1: float
    coils: int | None = None
    label: str | None = None
    semantic_role: str | None = None


class PhysicsForceSceneSnapshot(BaseModel):
    kind: Literal["physics_force_scene"] = "physics_force_scene"
    pack_id: str = "physics-basic"
    objects: list[PhysicsSceneObject] = Field(default_factory=list)
    vectors: list[PhysicsSceneVector] = Field(default_factory=list)
    trajectory: list[tuple[float, float]] = Field(default_factory=list)
    trajectories: list[PhysicsSceneTrajectory] = Field(default_factory=list)
    points: list[PhysicsScenePoint] = Field(default_factory=list)
    annotations: list[PhysicsSceneAnnotation] = Field(default_factory=list)
    springs: list[PhysicsSceneSpring] = Field(default_factory=list)
    ground_y: float | None = None
    # Horizontal extent of the scene space (height stays 100). Default 100 is
    # the legacy square canvas; wide scenes (e.g. 168) fill the 16:9 stage.
    scene_width: float | None = None
    # Ride a looping tracer dot along the primary `trajectory` (see PhysicsSceneTrajectory.flow).
    flow_tracer: bool | None = None
    formula_latex: str | None = None
    caption: str | None = None


MotionStyle = Literal["primary", "secondary", "accent", "muted"]
MotionTextStyle = Literal["title", "label", "caption"]
MotionEasing = Literal["linear", "easeOut", "easeInOut", "spring"]


class MotionSceneWorld(BaseModel):
    xMin: float
    xMax: float
    yMin: float
    yMax: float


class MotionSceneViewport(BaseModel):
    width: float
    height: float
    world: MotionSceneWorld


class MotionPointObject(BaseModel):
    id: str
    type: Literal["point"] = "point"
    x: float
    y: float
    r: float | None = None
    label: str | None = None
    style: MotionStyle | None = None


class MotionSegmentObject(BaseModel):
    id: str
    type: Literal["segment"] = "segment"
    x1: float
    y1: float
    x2: float
    y2: float
    label: str | None = None
    arrow: bool = False
    style: MotionStyle | None = None


class MotionPolygonObject(BaseModel):
    id: str
    type: Literal["polygon"] = "polygon"
    points: list[tuple[float, float]]
    label: str | None = None
    style: MotionStyle | None = None


class MotionTextObject(BaseModel):
    id: str
    type: Literal["text"] = "text"
    x: float
    y: float
    text: str
    style: MotionTextStyle | None = None


MotionObject = Annotated[
    Union[
        MotionPointObject,
        MotionSegmentObject,
        MotionPolygonObject,
        MotionTextObject,
    ],
    Field(discriminator="type"),
]


class MotionKeyframe(BaseModel):
    t: float
    value: float


class MotionTrack(BaseModel):
    target: str
    property: Literal["opacity", "x", "y", "scale", "rotate", "drawProgress", "highlight"]
    keyframes: list[MotionKeyframe] = Field(default_factory=list)
    easing: MotionEasing | None = None


class MotionCameraKeyframe(BaseModel):
    t: float
    x: float
    y: float
    zoom: float


class MotionCameraTrack(BaseModel):
    keyframes: list[MotionCameraKeyframe] = Field(default_factory=list)
    easing: Literal["linear", "easeOut", "easeInOut"] | None = None


class MotionSceneSnapshot(BaseModel):
    kind: Literal["motion_scene"] = "motion_scene"
    viewport: MotionSceneViewport
    objects: list[MotionObject] = Field(default_factory=list)
    tracks: list[MotionTrack] = Field(default_factory=list)
    camera: MotionCameraTrack | None = None


class KaTeXOverlaySnapshot(BaseModel):
    """A KaTeX label anchored at a (x, y) in the underlying scene coords.

    The optional ``x_min``/``x_max``/``y_min``/``y_max`` fields tell the
    frontend renderer what viewport to convert (x, y) against. When the
    overlay sits atop a math_scene layer, the builder copies the scene's
    bounds in so the renderer doesn't drift on non-default viewports.
    """

    kind: Literal["katex_overlay"] = "katex_overlay"
    x: float
    y: float
    latex: str
    align: str = "ne"
    x_min: float | None = None
    x_max: float | None = None
    y_min: float | None = None
    y_max: float | None = None


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
        MatrixSceneSnapshot,
        TableSceneSnapshot,
        GraphSceneSnapshot,
        CallStackSceneSnapshot,
        CodeTraceSceneSnapshot,
        StatsChartSceneSnapshot,
        IterationTraceSceneSnapshot,
        PhasePortraitSceneSnapshot,
        ComplexPlaneSceneSnapshot,
        OptimizationSceneSnapshot,
        ModelingSceneSnapshot,
        ManifoldSceneSnapshot,
        SolidGeometrySceneSnapshot,
        BioCellSceneSnapshot,
        BioProcessSceneSnapshot,
        Molecule2DSceneSnapshot,
        ReactionSceneSnapshot,
        GeoMapSceneSnapshot,
        PhysicsForceSceneSnapshot,
        MotionSceneSnapshot,
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
    # Frozen contract boundary between the generation pipeline and the renderer.
    # Stored verbatim as playbook_json; old rows without this field default below.
    schema_version: str = Field(default="1.0.0")
    fps: int = Field(default=30, ge=1)
    total_frames: int = Field(ge=1)
    domain: TopicDomain
    title: str
    summary: str
    steps: list[MetaStep] = Field(default_factory=list)
    parameter_controls: list[ExecutionParameterControl] = Field(default_factory=list)
    algorithm_id: str | None = None
    initial_data: dict[str, list[str]] = Field(default_factory=dict)
