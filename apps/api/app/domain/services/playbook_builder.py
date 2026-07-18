from __future__ import annotations

import json
import logging
import re

from app.domain.animation_tools import expand_cir_animation_calls
from app.domain.models.cir import (
    CirDocument,
    CirStep,
    ExecutionCheckpoint,
    ExecutionMap,
    LayerKind,
    VisualKind,
)
from app.domain.models.playbook import (
    AlgorithmArraySnapshot,
    AlgorithmBarsSnapshot,
    AlgorithmTreeSnapshot,
    CodeHighlightOverlay,
    GeoMapFlow,
    GeoMapLayer,
    GeoMapSceneSnapshot,
    GeoPressureCenter,
    KaTeXOverlaySnapshot,
    Layer,
    LayerTiming,
    MathFormulaSnapshot,
    MathPlotCurve,
    MathPlotSnapshot,
    MathSceneAnnotation,
    MathSceneCurve,
    MathScenePoint,
    MathSceneRegion,
    MathSceneSegment,
    MathSceneSnapshot,
    MathSceneVectorField,
    MetaStep,
    NarrationCardSnapshot,
    PhysicsForceSceneSnapshot,
    PhysicsSceneObject,
    PhysicsSceneVector,
    PlaybookScript,
)
from app.domain.models.topic import TopicDomain
from app.domain.services.algorithm_code_library import get_by_id, infer_id

logger = logging.getLogger(__name__)

_DEFAULT_FPS = 30
_DEFAULT_STEP_FRAMES = 60  # 2 s at 30 fps

# Whitelist for math-plot expressions: digits, identifiers (variables/functions),
# arithmetic operators, parentheses, comma and whitespace, plus a curated set
# of Unicode math glyphs and Greek letters that appear in real Chinese
# coursework. Anything else is treated as untrusted and the curve is dropped
# (defence against the LLM emitting non-expression text into the plot field).
# Issues #48 / #55: the previous ASCII-only allowlist silently dropped legit
# expressions like ``√(x^2+1)`` and ``∂y/∂x``, leaving the user staring at an
# empty formula card.
_UNICODE_MATH_CHARS = (
    "√∫∂∑∏∞"  # radicals / calculus / sums / infinity
    "πθαβγδεζηικλμνξορστυφχψω"  # Greek (lower)
    "ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ"  # Greek (upper)
)
_SAFE_EXPR_RE = re.compile(
    rf"^[0-9A-Za-z_+\-*/^%(). ,{_UNICODE_MATH_CHARS}]+$"
)

# LLMs prompted in Chinese occasionally leak a stray full-width punctuation
# character into the expression field (e.g. ``x^2）``). Normalize the common
# offenders to their ASCII equivalents before the whitelist check so the
# curve is salvaged instead of silently dropped.
_FULL_WIDTH_NORMALIZE = str.maketrans({
    "（": "(",
    "）": ")",
    "，": ",",
    "．": ".",
    "－": "-",
    "＋": "+",
    "×": "*",
    "÷": "/",
    "％": "%",
    "＾": "^",
    "　": " ",  # ideographic space
})


def _infer_algorithm_id(title: str, execution_map: ExecutionMap | None = None) -> str | None:
    # Prefer explicit algorithm_id from execution_map (LLM declared it).
    if execution_map and execution_map.algorithm_id:
        return execution_map.algorithm_id
    return infer_id(title)


def _resolve_source(
    user_source: str | None,
    user_language: str | None,
    algorithm_id: str | None,
    execution_map: ExecutionMap | None,
) -> tuple[list[str], str]:
    """Return (source_lines, language) using priority: user upload > library > LLM generated."""
    if user_source and user_source.strip():
        return user_source.splitlines(), user_language or "text"
    if algorithm_id:
        library_entry = get_by_id(algorithm_id)
        if library_entry:
            return list(library_entry.lines), library_entry.language
    if execution_map and execution_map.algorithm_code:
        lang = getattr(execution_map, "algorithm_language", "pseudocode") or "pseudocode"
        return list(execution_map.algorithm_code), lang
    return [], user_language or "text"


def build_playbook(
    cir: CirDocument,
    execution_map: ExecutionMap | None,
    fps: int = _DEFAULT_FPS,
    source_code: str | None = None,
    source_language: str | None = None,
) -> PlaybookScript:
    # Expand high-level animation macros before processing steps.
    cir = expand_cir_animation_calls(cir)

    checkpoint_by_step: dict[str, ExecutionCheckpoint] = {}
    if execution_map:
        for cp in execution_map.checkpoints:
            checkpoint_by_step[cp.step_id] = cp

    # Resolve source lines and language using priority chain:
    #   1. User-uploaded source_code (highest fidelity)
    #   2. Pre-baked library code for known algorithms
    #   3. LLM-generated algorithm_code from execution_map
    algorithm_id = _infer_algorithm_id(cir.title, execution_map)
    source_lines, source_language = _resolve_source(
        source_code, source_language, algorithm_id, execution_map
    )

    steps: list[MetaStep] = []
    cumulative = 0
    for i, cir_step in enumerate(cir.steps):
        checkpoint = checkpoint_by_step.get(cir_step.id)
        duration = _step_duration_frames(cir_step, checkpoint, fps)
        cumulative += duration
        snapshot = _build_snapshot(cir_step, checkpoint, execution_map, cir.domain)
        layers = _build_layers(cir_step, snapshot, checkpoint, execution_map, cir.domain)
        code_highlight = _build_code_highlight(checkpoint, source_lines, source_language)
        narration_tpl = _parse_narration_template(cir_step.narration)
        voiceover = (
            _resolve_plain_text(narration_tpl, cir_step.tokens)
            if narration_tpl
            else (cir_step.narration if isinstance(cir_step.narration, str) else "")
        )
        steps.append(
            MetaStep(
                step_id=cir_step.id,
                end_frame=cumulative,
                title=cir_step.title,
                voiceover_text=voiceover,
                animation_hint=_infer_hint(cir_step, i, len(cir.steps)),
                snapshot=snapshot,
                layers=layers,
                code_highlight=code_highlight,
                narration_template=narration_tpl,
                tokens=[t.model_dump() for t in cir_step.tokens],
            )
        )

    total_frames = max(cumulative, 1)
    initial_data: dict[str, list[str]] = {}
    if execution_map and execution_map.array_track and execution_map.array_track.values:
        initial_data["array"] = list(execution_map.array_track.values)

    return PlaybookScript(
        fps=fps,
        total_frames=total_frames,
        domain=cir.domain,
        title=cir.title,
        summary=cir.summary,
        steps=steps,
        parameter_controls=execution_map.parameter_controls if execution_map else [],
        algorithm_id=algorithm_id,
        initial_data=initial_data,
    )


def _build_code_highlight(
    checkpoint: ExecutionCheckpoint | None,
    source_lines: list[str],
    language: str,
) -> CodeHighlightOverlay | None:
    if not checkpoint or not checkpoint.code_lines or not source_lines:
        return None
    # Filter out-of-range indices (LLM may hallucinate line numbers)
    max_line = len(source_lines) - 1
    active_lines = sorted({i for i in checkpoint.code_lines if 0 <= i <= max_line})
    if not active_lines:
        return None
    return CodeHighlightOverlay(
        language=language,
        lines=source_lines,
        active_lines=active_lines,
        active_line=active_lines[0],
        operation_label=checkpoint.title or None,
    )


def _step_duration_frames(
    cir_step: CirStep,
    checkpoint: ExecutionCheckpoint | None,
    fps: int,
) -> int:
    if checkpoint is not None:
        duration_s = max(0.0, checkpoint.end_s - checkpoint.start_s)
        if duration_s > 0:
            return max(1, round(duration_s * fps))
    if cir_step.start_time is not None and cir_step.end_time is not None:
        duration_s = max(0.0, cir_step.end_time - cir_step.start_time)
        if duration_s > 0:
            return max(1, round(duration_s * fps))
    return _DEFAULT_STEP_FRAMES


def _try_parse_number(value: str) -> float | None:
    try:
        return float(value.strip())
    except (AttributeError, TypeError, ValueError):
        return None


_GEOMETRY_HINT_KEYWORDS = (
    "向量场", "区域", "边界", "环路", "闭合", "参数方程", "旋度", "散度",
    "通量", "线积分", "面积分", "二重积分", "格林", "斯托克斯", "高斯",
    "圆周", "椭圆", "多边形", "曲面",
)


def _looks_like_2d_geometry(cir_step: CirStep) -> bool:
    """Heuristic: does the step's narration / title imply a 2-D scene?

    Used to upgrade ``formula`` → ``scene`` when the LLM picks the safer
    `formula` path despite the topic clearly involving 2-D geometry. Pure
    string scan — no NLP, just a curated keyword list aligned with the
    prompt's "scene trigger words" so the heuristic and the LLM hint stay
    in lockstep.
    """

    haystack = (cir_step.title or "") + " "
    narration = cir_step.narration
    if isinstance(narration, str):
        haystack += narration
    elif isinstance(narration, list):
        haystack += " ".join(seg for seg in narration if isinstance(seg, str))
    return any(kw in haystack for kw in _GEOMETRY_HINT_KEYWORDS)


def _build_layers(
    cir_step: CirStep,
    fallback_snapshot,
    checkpoint: ExecutionCheckpoint | None,
    execution_map: ExecutionMap | None,
    domain: TopicDomain,
) -> list[Layer]:
    """Materialise the layered representation for ``cir_step``.

    When the LLM emits ``cir_step.layers`` we expand each LayerSpec into a
    Playbook ``Layer``. When ``layers`` is empty (legacy CIR) we wrap the
    already-computed single ``fallback_snapshot`` as a one-element list so
    downstream renderers can treat every step uniformly.
    """

    if not cir_step.layers:
        return [Layer(timing=LayerTiming(), body=fallback_snapshot)]

    out: list[Layer] = []
    for spec in cir_step.layers:
        body = _build_layer_body(spec, cir_step, checkpoint, execution_map, domain)
        if body is None:
            logger.info(
                "Dropping unrenderable layer kind=%s in step %s", spec.kind, cir_step.id
            )
            continue
        out.append(
            Layer(
                timing=LayerTiming(
                    enter_at=max(0.0, min(1.0, spec.timing.enter_at)),
                    exit_at=max(0.0, min(1.0, spec.timing.exit_at)),
                    appear_anim=spec.timing.appear_anim or "fade",
                    z_order=spec.timing.z_order,
                ),
                body=body,
            )
        )
    if not out:
        # All layers were unrenderable — keep the legacy snapshot so the step
        # still produces visible output.
        return [Layer(timing=LayerTiming(), body=fallback_snapshot)]
    out.sort(key=lambda layer: layer.timing.z_order)
    return out


def _build_layer_body(
    spec,
    cir_step: CirStep,
    checkpoint: ExecutionCheckpoint | None,
    execution_map: ExecutionMap | None,
    domain: TopicDomain,
):
    """Translate a LayerSpec into the appropriate snapshot body.

    Returns ``None`` when the layer cannot be materialised (e.g. required
    body field missing) so the caller can drop it without failing the whole
    playbook build.
    """
    kind = spec.kind
    if kind == LayerKind.MATH_SCENE:
        if spec.scene is None:
            # Borrow the step-level scene when the LLM forgot to fill the layer's slot.
            scratch = cir_step.scene
        else:
            scratch = spec.scene
        if scratch is None:
            return _build_math_formula_snapshot(cir_step)
        # Build a temporary CirStep view that points layer-builder at scratch.
        shim = cir_step.model_copy(update={"scene": scratch})
        scene = _build_math_scene_snapshot(shim)
        return scene or _build_math_formula_snapshot(cir_step)
    if kind == LayerKind.MATH_PLOT:
        plot = spec.plot or cir_step.plot
        if plot is None:
            return None
        shim = cir_step.model_copy(update={"plot": plot})
        plot_snap = _build_math_plot_snapshot(shim)
        return plot_snap or _build_math_formula_snapshot(cir_step)
    if kind == LayerKind.MATH_FORMULA:
        # Use any embedded formula spec; otherwise fall back to the step's
        # plot.formula_latex / title placeholder via the existing helper.
        plot = spec.plot or cir_step.plot
        shim = cir_step if plot is None else cir_step.model_copy(update={"plot": plot})
        return _build_math_formula_snapshot(shim)
    if kind == LayerKind.KATEX_OVERLAY:
        if spec.katex_overlay is None or not spec.katex_overlay.latex.strip():
            return None
        # Inherit viewport bounds from the parent step's scene when present so
        # the overlay positions itself correctly on non-default viewports.
        scene = cir_step.scene
        return KaTeXOverlaySnapshot(
            x=spec.katex_overlay.x,
            y=spec.katex_overlay.y,
            latex=spec.katex_overlay.latex,
            align=spec.katex_overlay.align or "ne",
            x_min=scene.x_min if scene else None,
            x_max=scene.x_max if scene else None,
            y_min=scene.y_min if scene else None,
            y_max=scene.y_max if scene else None,
        )
    if kind == LayerKind.NARRATION_CARD:
        if spec.narration_card is None or not spec.narration_card.text.strip():
            return None
        return NarrationCardSnapshot(
            text=spec.narration_card.text,
            position=spec.narration_card.position or "bottom",
            emphasis=spec.narration_card.emphasis or "primary",
        )
    if kind in (LayerKind.ARRAY_BOXES, LayerKind.BAR_BLOCKS):
        # These layers always read the parent step's tokens + execution_map,
        # so we just route through the legacy array builder. The renderer
        # decides whether to draw bars or boxes based on the snapshot kind.
        return _build_array_snapshot(cir_step, checkpoint, execution_map)
    if kind == LayerKind.TREE_GRAPH:
        return _build_tree_snapshot(cir_step, checkpoint)
    if kind == LayerKind.TABLE_SCENE:
        return spec.table_scene
    if kind == LayerKind.GRAPH_SCENE:
        return spec.graph_scene
    if kind == LayerKind.STATS_CHART_SCENE:
        return spec.stats_chart_scene
    if kind == LayerKind.MOTION_SCENE:
        return spec.motion_scene
    logger.warning("Unknown layer kind=%s in step %s", kind, cir_step.id)
    return None


def _build_snapshot(
    cir_step: CirStep,
    checkpoint: ExecutionCheckpoint | None,
    execution_map: ExecutionMap | None,
    domain: TopicDomain,
) -> (
    AlgorithmArraySnapshot
    | AlgorithmBarsSnapshot
    | AlgorithmTreeSnapshot
    | MathPlotSnapshot
    | MathFormulaSnapshot
    | MathSceneSnapshot
    | GeoMapSceneSnapshot
    | PhysicsForceSceneSnapshot
    | NarrationCardSnapshot
):
    if cir_step.visual_kind == VisualKind.GRAPH:
        return _build_tree_snapshot(cir_step, checkpoint)
    if cir_step.visual_kind == VisualKind.SCENE:
        scene = _build_math_scene_snapshot(cir_step)
        if scene is not None:
            return scene
        logger.info("Math scene empty for step %s; falling back to formula snapshot", cir_step.id)
        return _build_math_formula_snapshot(cir_step)
    if cir_step.visual_kind == VisualKind.FUNCTION:
        plot = _build_math_plot_snapshot(cir_step)
        if plot is not None:
            return plot
        # Math curves were unusable. If the step carries a 2-D scene, prefer it.
        if cir_step.scene is not None:
            scene = _build_math_scene_snapshot(cir_step)
            if scene is not None:
                logger.info(
                    "Math plot empty for step %s; using attached scene snapshot",
                    cir_step.id,
                )
                return scene
        logger.info("Math plot empty for step %s; falling back to formula snapshot", cir_step.id)
        return _build_math_formula_snapshot(cir_step)
    if cir_step.visual_kind == VisualKind.FORMULA:
        # If the LLM emitted formula for math content that should obviously be
        # a 2-D scene (vector fields, regions, integrals, ...), and the scene
        # field was filled, upgrade. This catches the common failure mode
        # where the LLM picks "formula" out of caution despite the prompt.
        if domain == TopicDomain.MATH and _looks_like_2d_geometry(cir_step):
            if cir_step.scene is not None:
                scene = _build_math_scene_snapshot(cir_step)
                if scene is not None:
                    logger.warning(
                        "Math step %s: LLM chose formula but narration implies 2D geometry; "
                        "upgrading to scene snapshot",
                        cir_step.id,
                    )
                    return scene
        return _build_math_formula_snapshot(cir_step)
    # Math domain must never degrade to the algorithm array view. If the LLM
    # ignored prompt guidance and emitted visual_kind=array for math, route to
    # scene (when present) then formula so the user sees the topic's core
    # idea instead of A/B/C/D.
    if domain == TopicDomain.MATH:
        if cir_step.scene is not None:
            scene = _build_math_scene_snapshot(cir_step)
            if scene is not None:
                logger.warning(
                    "Math step %s used visual_kind=%s; routing to scene snapshot",
                    cir_step.id,
                    cir_step.visual_kind,
                )
                return scene
        logger.warning(
            "Math step %s used visual_kind=%s; routing to formula snapshot",
            cir_step.id,
            cir_step.visual_kind,
        )
        return _build_math_formula_snapshot(cir_step)
    if domain == TopicDomain.GEOGRAPHY and cir_step.visual_kind == VisualKind.MAP:
        return _build_geo_map_scene_snapshot(cir_step)
    if domain == TopicDomain.PHYSICS and cir_step.visual_kind == VisualKind.MOTION:
        return _build_physics_force_scene_snapshot(cir_step)
    if cir_step.visual_kind in {
        VisualKind.CIRCUIT,
        VisualKind.MOLECULE,
        VisualKind.CELL,
    }:
        logger.warning(
            "Unsupported subject visual_kind fallback: step_id=%s domain=%s visual_kind=%s",
            cir_step.id,
            domain.value,
            cir_step.visual_kind.value,
        )
        return NarrationCardSnapshot(
            text=cir_step.narration or cir_step.title,
            position="bottom",
            emphasis="primary",
        )
    # ARRAY, FLOW, TEXT fall through to array for legacy non-math routes.
    return _build_array_snapshot(cir_step, checkpoint, execution_map)


def _build_geo_map_scene_snapshot(cir_step: CirStep) -> GeoMapSceneSnapshot:
    return GeoMapSceneSnapshot(
        pack_id="geography-earth-basic",
        map_region="east_asia",
        layers=[
            GeoMapLayer(
                id="land",
                semantic_role="land",
                label="大陆",
                asset_id="east-asia-land-110m",
            ),
            GeoMapLayer(
                id="coastline",
                semantic_role="coastline",
                label="海岸线",
                asset_id="east-asia-coastline-110m",
            ),
            GeoMapLayer(id="ocean", semantic_role="ocean", label="海洋"),
        ],
        flows=[
            GeoMapFlow(
                id="monsoon-wind",
                semantic_role="wind",
                from_=(78.0, 68.0),
                to=(42.0, 38.0),
                label="季风",
                strength=1.0,
            )
        ],
        pressure_centers=[
            GeoPressureCenter(id="land-pressure", kind="low", x=38.0, y=35.0, label="陆地低压"),
            GeoPressureCenter(id="ocean-pressure", kind="high", x=76.0, y=64.0, label="海洋高压"),
        ],
        particle_preset="moisture_particles",
        caption=cir_step.narration or cir_step.title,
    )


def _build_physics_force_scene_snapshot(cir_step: CirStep) -> PhysicsForceSceneSnapshot:
    return PhysicsForceSceneSnapshot(
        pack_id="physics-basic",
        objects=[
            PhysicsSceneObject(
                id="body",
                label="物体",
                x=30.0,
                y=42.0,
            )
        ],
        vectors=[
            PhysicsSceneVector(
                id="velocity-x",
                target="body",
                semantic_role="velocity",
                dx=28.0,
                dy=0.0,
                label="v_x",
            ),
            PhysicsSceneVector(
                id="gravity",
                target="body",
                semantic_role="acceleration",
                dx=0.0,
                dy=24.0,
                label="g",
            ),
        ],
        trajectory=[(18.0, 34.0), (32.0, 42.0), (50.0, 57.0), (72.0, 78.0)],
        formula_latex=r"x=v_0t,\quad y=\frac12gt^2",
        caption=cir_step.narration or cir_step.title,
    )


def _sanitize_expression(expression: str | None) -> str | None:
    """Return a trimmed expression if it passes the safe-character whitelist."""
    if not expression:
        return None
    text = expression.strip().translate(_FULL_WIDTH_NORMALIZE)
    if not text or len(text) > 200 or not _SAFE_EXPR_RE.match(text):
        return None
    return text


def _build_math_plot_snapshot(cir_step: CirStep) -> MathPlotSnapshot | None:
    spec = cir_step.plot
    if spec is None:
        return None

    curves: list[MathPlotCurve] = []
    for raw in spec.curves:
        safe = _sanitize_expression(raw.expression)
        if safe is None:
            logger.warning("Dropping unsafe/empty plot expression in step %s", cir_step.id)
            continue
        emphasis = raw.emphasis if raw.emphasis in ("primary", "secondary", "accent") else "primary"
        curves.append(MathPlotCurve(expression=safe, label=raw.label, emphasis=emphasis))

    if not curves:
        return None

    x_min, x_max = spec.x_min, spec.x_max
    if not (x_min < x_max):  # guard against degenerate / inverted ranges
        x_min, x_max = -10.0, 10.0

    marker_x = spec.marker_x
    if marker_x is not None:
        marker_x = max(x_min, min(x_max, marker_x))

    shade_from, shade_to = spec.shade_from, spec.shade_to
    if shade_from is not None and shade_to is not None:
        shade_from = max(x_min, min(x_max, shade_from))
        shade_to = max(x_min, min(x_max, shade_to))
        if shade_from > shade_to:
            shade_from, shade_to = shade_to, shade_from

    return MathPlotSnapshot(
        curves=curves,
        x_min=x_min,
        x_max=x_max,
        y_min=spec.y_min,
        y_max=spec.y_max,
        marker_x=marker_x,
        shade_from=shade_from,
        shade_to=shade_to,
        x_label=spec.x_label or "x",
        y_label=spec.y_label or "y",
        formula_latex=spec.formula_latex,
    )


_SCENE_EMPHASIS = ("primary", "secondary", "accent")
_SCENE_ALIGN = ("ne", "nw", "se", "sw", "center")

# Loose color → emphasis mapping for LLM-provided named colors. Anything not
# listed falls through to the explicit `emphasis` field.
_COLOR_TO_EMPHASIS: dict[str, str] = {
    "red": "accent",
    "orange": "accent",
    "yellow": "accent",
    "pink": "accent",
    "purple": "secondary",
    "violet": "secondary",
    "magenta": "secondary",
    "blue": "primary",
    "green": "primary",
    "cyan": "primary",
    "teal": "primary",
}


def _normalize_emphasis(value: str, default: str = "primary") -> str:
    return value if value in _SCENE_EMPHASIS else default


def _normalize_align(value: str, default: str = "ne") -> str:
    return value if value in _SCENE_ALIGN else default


def _resolve_emphasis(emphasis_value: str, color: str | None, default: str = "primary") -> str:
    """Pick the emphasis tier. Explicit ``emphasis`` wins; otherwise infer
    from a named ``color`` string the LLM emitted (blue → primary, red →
    accent, etc.). Unknown values fall back to the supplied default."""
    if emphasis_value in _SCENE_EMPHASIS:
        return emphasis_value
    if color:
        mapped = _COLOR_TO_EMPHASIS.get(color.strip().lower())
        if mapped:
            return mapped
    return default


def _build_math_scene_snapshot(cir_step: CirStep) -> MathSceneSnapshot | None:
    """Translate ``cir_step.scene`` into a renderer-ready snapshot.

    Each expression is run through the safe-character whitelist; invalid
    pieces are dropped, not allowed to crash the renderer. Returns ``None``
    when the scene contains no usable visible element (the caller falls
    back to a formula snapshot).
    """

    spec = cir_step.scene
    if spec is None:
        return None

    x_min, x_max = spec.x_min, spec.x_max
    if not (x_min < x_max):
        x_min, x_max = -5.0, 5.0
    y_min, y_max = spec.y_min, spec.y_max
    if not (y_min < y_max):
        y_min, y_max = -5.0, 5.0

    points = [
        MathScenePoint(
            x=p.x,
            y=p.y,
            label=p.label,
            emphasis=_normalize_emphasis(p.emphasis),
        )
        for p in spec.points
    ]

    curves: list[MathSceneCurve] = []
    polyline_segments: list[MathSceneSegment] = []
    for raw in spec.curves:
        emphasis = _resolve_emphasis(raw.emphasis, raw.color)
        # Prefer the structured (expression) form when present. Fall back to
        # the LLM's pre-sampled `points` polyline otherwise — the renderer
        # has no native pre-sampled curve type yet, so we fan the polyline
        # into consecutive line segments. That preserves the visual shape
        # while staying inside the existing snapshot schema.
        safe_y = _sanitize_expression(raw.expression_y)
        if safe_y is not None:
            safe_x: str | None = None
            if raw.expression_x is not None:
                safe_x = _sanitize_expression(raw.expression_x)
                if safe_x is None:
                    logger.warning(
                        "Dropping unsafe scene curve x-expression in step %s", cir_step.id
                    )
                    continue
            curves.append(
                MathSceneCurve(
                    expression_y=safe_y,
                    expression_x=safe_x,
                    t_min=raw.t_min,
                    t_max=raw.t_max,
                    label=raw.label,
                    emphasis=emphasis,
                    arrows=bool(raw.arrows),
                )
            )
            continue
        # No expression — try the polyline form (LLM-friendly).
        pts = [(float(x), float(y)) for x, y in raw.points if x is not None and y is not None]
        if len(pts) >= 2:
            for (x0, y0), (x1, y1) in zip(pts, pts[1:], strict=False):
                polyline_segments.append(
                    MathSceneSegment(
                        x0=x0, y0=y0, x1=x1, y1=y1,
                        arrow=False,
                        label=None,  # label only on the curve as a whole, not each piece
                        emphasis=emphasis,
                    )
                )
            continue
        logger.warning(
            "Dropping scene curve in step %s: neither expression_y nor a "
            "≥2-point polyline was provided",
            cir_step.id,
        )

    regions = [
        MathSceneRegion(
            vertices=[(float(vx), float(vy)) for vx, vy in r.vertices],
            label=r.label,
            emphasis=_normalize_emphasis(r.emphasis, default="secondary"),
        )
        for r in spec.regions
        if r.vertices
    ]

    vector_field: MathSceneVectorField | None = None
    if spec.vector_field is not None:
        safe_px = _sanitize_expression(spec.vector_field.expression_px)
        safe_py = _sanitize_expression(spec.vector_field.expression_py)
        if safe_px and safe_py:
            step = spec.vector_field.step
            if step is not None and step <= 0:
                step = None
            vector_field = MathSceneVectorField(
                expression_px=safe_px,
                expression_py=safe_py,
                step=step,
                label=spec.vector_field.label,
            )
        else:
            logger.warning(
                "Dropping vector field with unsafe expressions in step %s", cir_step.id
            )

    segments: list[MathSceneSegment] = list(polyline_segments)
    for s in spec.segments:
        emphasis = _resolve_emphasis(s.emphasis, s.color)
        # Endpoint form: x0/y0/x1/y1 all provided.
        if s.x0 is not None and s.y0 is not None and s.x1 is not None and s.y1 is not None:
            segments.append(
                MathSceneSegment(
                    x0=s.x0, y0=s.y0, x1=s.x1, y1=s.y1,
                    arrow=bool(s.arrow),
                    label=s.label,
                    emphasis=emphasis,
                )
            )
            continue
        # Polyline form: fan out consecutive points into segments. Only the
        # last segment of the polyline carries the arrow flag (the natural
        # place to draw a direction indicator).
        pts = [(float(x), float(y)) for x, y in s.points if x is not None and y is not None]
        if len(pts) >= 2:
            last_idx = len(pts) - 2
            for i, ((x0, y0), (x1, y1)) in enumerate(zip(pts, pts[1:], strict=False)):
                segments.append(
                    MathSceneSegment(
                        x0=x0, y0=y0, x1=x1, y1=y1,
                        arrow=bool(s.arrow) and i == last_idx,
                        label=s.label if i == last_idx else None,
                        emphasis=emphasis,
                    )
                )
            continue
        logger.warning(
            "Dropping scene segment in step %s: neither (x0,y0,x1,y1) nor "
            "a ≥2-point polyline was provided",
            cir_step.id,
        )

    annotations = [
        MathSceneAnnotation(
            x=a.x,
            y=a.y,
            text=a.text,
            align=_normalize_align(a.align),
        )
        for a in spec.annotations
        if a.text and a.text.strip()
    ]

    has_visible_content = bool(
        curves or regions or segments or points or annotations or vector_field or spec.formula_latex
    )
    if not has_visible_content:
        return None

    return MathSceneSnapshot(
        x_min=x_min,
        x_max=x_max,
        y_min=y_min,
        y_max=y_max,
        x_label=spec.x_label or "x",
        y_label=spec.y_label or "y",
        points=points,
        curves=curves,
        regions=regions,
        vector_field=vector_field,
        segments=segments,
        annotations=annotations,
        formula_latex=spec.formula_latex,
        caption=spec.caption,
    )


def _build_math_formula_snapshot(cir_step: CirStep) -> MathFormulaSnapshot:
    """Build a static formula display for non-graphable math content.

    Pulls ``formula_latex`` from ``cir_step.plot`` when available, otherwise
    falls back to a ``\\text{...}`` block built from the step title so the
    main viewport never shows mis-typed A/B/C/D boxes for math topics.
    """

    formula_latex: str | None = None
    if cir_step.plot is not None and cir_step.plot.formula_latex:
        formula_latex = cir_step.plot.formula_latex.strip() or None
    if not formula_latex:
        # Defensive placeholder — better than rendering wrong content.
        safe_title = cir_step.title.replace("{", "").replace("}", "").replace("\\", "")
        formula_latex = f"\\text{{{safe_title}}}"

    annotations = [a.strip() for a in cir_step.annotations if a and a.strip()]
    return MathFormulaSnapshot(
        formula_latex=formula_latex,
        caption=None,
        highlights=[],
        annotations=annotations,
    )


def _build_array_snapshot(
    cir_step: CirStep,
    checkpoint: ExecutionCheckpoint | None,
    execution_map: ExecutionMap | None,
) -> AlgorithmArraySnapshot | AlgorithmBarsSnapshot:
    # Prefer array_track values when available
    array_values: list[str] = []
    if execution_map and execution_map.array_track:
        array_values = list(execution_map.array_track.values)
    if not array_values:
        array_values = [t.label for t in cir_step.tokens]

    active_indices: list[int] = []
    swap_indices: list[int] = []
    pointers: dict[str, int] = {}

    # Tokens with emphasis "accent" mark sorted positions (always applied)
    sorted_indices = [i for i, t in enumerate(cir_step.tokens) if t.emphasis == "accent"]

    if checkpoint:
        active_indices = list(checkpoint.array_focus_indices)
        if checkpoint.swap_indices:
            # LLM explicitly told us which indices are being swapped
            swap_indices = list(checkpoint.swap_indices)
        elif len(active_indices) == 2 and any(
            kw in checkpoint.title.lower() for kw in ("swap", "exchange", "交换", "互换")
        ):
            # Fall back to heuristic only when the step title signals an actual swap
            swap_indices = list(active_indices)
        # Extract pointer names from token ids that look like "ptr_X" or "idx_X"
        for t in cir_step.tokens:
            m = re.match(r"^(?:ptr|idx|pointer|index)_?(.+)$", t.id, re.IGNORECASE)
            if m and t.value and t.value.isdigit():
                pointers[m.group(1)] = int(t.value)

    # When every element is numeric, render as height-encoded bar blocks (issue #31).
    parsed = [_try_parse_number(v) for v in array_values]
    if array_values and all(n is not None for n in parsed):
        return AlgorithmBarsSnapshot(
            array_values=array_values,
            numeric_values=[n for n in parsed if n is not None],
            active_indices=active_indices,
            swap_indices=swap_indices,
            sorted_indices=sorted_indices,
            pointers=pointers,
        )

    return AlgorithmArraySnapshot(
        array_values=array_values,
        active_indices=active_indices,
        swap_indices=swap_indices,
        sorted_indices=sorted_indices,
        pointers=pointers,
    )


def _build_tree_snapshot(
    cir_step: CirStep,
    checkpoint: ExecutionCheckpoint | None,
) -> AlgorithmTreeSnapshot:
    nodes: list[dict] = []
    edges: list[dict] = []
    seen_edges: set[tuple[str, str]] = set()

    for token in cir_step.tokens:
        nodes.append({"id": token.id, "label": token.label})

    if cir_step.edges:
        # Prefer explicit edges from the LLM over heuristic inference
        for e in cir_step.edges:
            key = (e.from_id, e.to_id)
            if key not in seen_edges:
                seen_edges.add(key)
                edges.append({"from_id": e.from_id, "to_id": e.to_id})
    else:
        # Fallback heuristic: infer edges from token id naming conventions
        for token in cir_step.tokens:
            m = re.match(r"^(.+)_child_(.+)$", token.id)
            if m:
                parent_id = m.group(1)
                key = (parent_id, token.id)
                if key not in seen_edges:
                    seen_edges.add(key)
                    edges.append({"from_id": parent_id, "to_id": token.id})
            if token.value and token.value.startswith("parent:"):
                parent_id = token.value[7:]
                key = (parent_id, token.id)
                if key not in seen_edges:
                    seen_edges.add(key)
                    edges.append({"from_id": parent_id, "to_id": token.id})

    active_node_ids: list[str] = []
    visited_node_ids: list[str] = []
    if checkpoint:
        active_node_ids = list(checkpoint.focus_tokens)

    # Tokens with emphasis "secondary" that appeared in previous steps → visited heuristic
    visited_node_ids = [t.id for t in cir_step.tokens if t.emphasis == "secondary"]

    return AlgorithmTreeSnapshot(
        nodes=nodes,
        edges=edges,
        active_node_ids=active_node_ids,
        visited_node_ids=visited_node_ids,
        path_edge_ids=[],
    )


_HINT_MAP: dict[VisualKind, str] = {
    VisualKind.ARRAY: "compare",
    VisualKind.GRAPH: "highlight",
    VisualKind.FLOW: "reveal",
    VisualKind.FORMULA: "reveal",
    VisualKind.FUNCTION: "reveal",
    VisualKind.SCENE: "reveal",
    VisualKind.TEXT: "reveal",
    VisualKind.MOTION: "enter",
    VisualKind.CIRCUIT: "highlight",
    VisualKind.MOLECULE: "transform",
    VisualKind.MAP: "reveal",
    VisualKind.CELL: "reveal",
}


def _infer_hint(cir_step: CirStep, index: int, total: int) -> str:
    if index == 0:
        return "enter"
    if index == total - 1:
        return "reveal"
    return _HINT_MAP.get(cir_step.visual_kind, "highlight")


def _parse_narration_template(raw: str | list) -> list | None:
    """Parse LLM narration into a structured template array for dynamic resolution.

    Accepts:
    1. list — already parsed JSON array from LLM (real API often outputs array type directly)
    2. str starting with '[' — JSON-encoded array embedded in a string
    3. str with {{token_id}} placeholders — converted to simplified template
    4. plain str — returns None (falls back to voiceover_text)
    """
    if isinstance(raw, list):
        return raw

    stripped = raw.strip()
    if stripped.startswith("["):
        try:
            result = json.loads(stripped)
            if isinstance(result, list):
                return result
        except json.JSONDecodeError:
            pass
        logger.warning("narration looks like JSON array but failed to parse; falling back")
        return None

    if "{{" in stripped:
        parts: list = []
        for segment in re.split(r"(\{\{[^}]+\}\})", stripped):
            m = re.match(r"\{\{([^}]+)\}\}", segment)
            if m:
                parts.append({"t": m.group(1)})
            elif segment:
                parts.append(segment)
        return parts if parts else None

    return None


def _resolve_plain_text(template: list, tokens: list) -> str:
    """Flatten a narration template into a readable plain-text string.

    Token refs are substituted with their labels; conditional branches take
    the first non-empty branch (default branch last).
    """
    token_map = {t.id: t.label for t in tokens}
    parts: list[str] = []
    for seg in template:
        if isinstance(seg, str):
            parts.append(seg)
        elif isinstance(seg, dict) and "t" in seg:
            parts.append(token_map.get(seg["t"], seg["t"]))
        elif isinstance(seg, list):
            for branch in seg:
                if isinstance(branch, list) and len(branch) >= 2:
                    text = _resolve_plain_text(branch[1], tokens)
                    if text:
                        parts.append(text)
                        break
    return "".join(parts)
