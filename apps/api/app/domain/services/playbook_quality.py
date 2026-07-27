from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Any, Literal

from app.domain.contracts.playbook_contract import SUPPORTED_SNAPSHOT_KIND_SET
from app.domain.models.coverage import CoverageDecision, CoverageMode
from app.domain.models.lesson_plan import LessonPlan
from app.domain.models.playbook import (
    AlgorithmArraySnapshot,
    AlgorithmBarsSnapshot,
    CodeHighlightOverlay,
    PlaybookScript,
)
from app.domain.models.quality_report import QualityReport
from app.domain.models.review import (
    PlaybookIssueSeverity,
    PlaybookReviewIssue,
    PlaybookReviewStatus,
    PlaybookReviewVerdict,
)
from app.domain.services.asset_manifest_resolver import resolve_asset_by_id
from app.domain.services.safe_math_expr import (
    SafeMathExpressionError,
    compile_safe_math_expression,
    extract_safe_math_identifiers,
)

MIN_AGENT_STEPS = 8
MAX_AGENT_STEPS = 14
_DEFAULT_FPS = 30
_DEFAULT_STEP_FRAMES = 120
_MIN_STEP_SECONDS = 5.5
_MAX_STEP_SECONDS = 12.0
_VOICEOVER_HOLD_SECONDS = 0.6
_CHINESE_CHARS_PER_SECOND = 4.8
_ENGLISH_WORDS_PER_SECOND = 2.4
_FRAME_INCREMENT = 6
_MATH_PARAMETER_ID_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_MOVING_LINE_PARAMETER_RE = re.compile(
    r"\by\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s*\*?\s*x\s*[+-]\s*"
    r"([A-Za-z_][A-Za-z0-9_]*)",
    re.IGNORECASE,
)
_MOVING_LINE_SLOPE_RE = re.compile(
    r"\by\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s*\*?\s*x\b",
    re.IGNORECASE,
)
_MOVING_LINE_MARKERS = (
    "moving line",
    "varying line",
    "line family",
    "动直线",
    "运动直线",
    "直线族",
    "恒过",
    "定点",
)
_DETERMINED_INTERCEPT_MARKERS = (
    "determines the intercept",
    "determine the intercept",
    "intercept is determined",
    "确定截距",
    "截距确定",
    "求出截距",
)
_EXPLICIT_PARAMETER_RE = re.compile(
    r"(?:vary|varying|change|changing|drag)\s+(?:the\s+)?"
    r"(?:free\s+)?parameter\s+([A-Za-z_][A-Za-z0-9_]*)",
    re.IGNORECASE,
)
_EXPLICIT_PARAMETER_CN_RE = re.compile(
    r"(?:改变|变化|拖动|调节)\s*参数\s*([A-Za-z_][A-Za-z0-9_]*)"
)

SUPPORTED_FRONTEND_SNAPSHOT_KINDS = SUPPORTED_SNAPSHOT_KIND_SET


@dataclass(frozen=True)
class _MathExpressionBinding:
    source: str
    intrinsic_names: set[str]
    fixed_params: dict[str, float]
    path: str
    view_key: str
    family_key: str
    view_path: str
    moving_target: bool
    sample_values: tuple[float, ...]

_SUBJECT_VISUAL_DOMAINS = {"geography", "biology", "chemistry"}
_ALGORITHM_FALLBACK_KINDS = {"algorithm_array", "algorithm_bars"}
_MATH_VISUAL_KINDS = {
    "math_plot",
    "math_formula",
    "math_scene",
    "matrix_scene",
    "stats_chart_scene",
    "iteration_trace_scene",
    "phase_portrait_scene",
    "complex_plane_scene",
    "optimization_scene",
    "modeling_scene",
    "manifold_scene",
    "solid_geometry_scene",
    "katex_overlay",
    "motion_scene",
}
_RICH_MATH_VISUAL_KINDS = _MATH_VISUAL_KINDS - {"math_formula", "katex_overlay"}
_RICH_MATH_PROMPT_MARKERS = {
    "plot",
    "graph",
    "curve",
    "tangent",
    "derivative",
    "geometry",
    "vector",
    "matrix",
    "distribution",
    "trajectory",
    "图",
    "曲线",
    "切线",
    "导数",
    "几何",
    "向量",
    "矩阵",
    "分布",
    "轨迹",
}
_ANSWER_PROMPT_MARKERS = {
    "explain",
    "show",
    "calculate",
    "derive",
    "compare",
    "why",
    "how",
    "what",
    "解释",
    "讲解",
    "演示",
    "展示",
    "说明",
    "追踪",
    "求",
    "计算",
    "推导",
    "比较",
    "为什么",
    "如何",
}
_ANSWER_STOPWORDS = {
    "a",
    "an",
    "and",
    "calculate",
    "compare",
    "derive",
    "explain",
    "for",
    "how",
    "in",
    "is",
    "of",
    "please",
    "show",
    "the",
    "to",
    "what",
    "why",
    "with",
    "解释",
    "讲解",
    "演示",
    "展示",
    "说明",
    "追踪",
    "计算",
    "推导",
    "比较",
    "为什么",
    "如何",
    "结果",
    "总结",
    "结论",
    "结束",
    "完成",
    "最后",
}
_ALGORITHM_STATE_PROMPT_MARKERS = {
    "algorithm",
    "bfs",
    "dfs",
    "search",
    "sort",
    "queue",
    "stack",
    "traversal",
    "recursion",
    "算法",
    "搜索",
    "排序",
    "队列",
    "栈",
    "遍历",
    "递归",
}
_BFS_PROMPT_MARKERS = {"bfs", "breadth-first", "breadth first", "广度优先"}
_BFS_COMPLETE_PROMPT_MARKERS = {
    "all nodes",
    "complete traversal",
    "every node",
    "full traversal",
    "visit order",
    "全部节点",
    "完整遍历",
    "访问顺序",
    "逐层点亮",
}
_GRAPH_TRAVERSAL_PROMPT_MARKERS = {
    *_BFS_PROMPT_MARKERS,
    "dfs",
    "depth-first",
    "depth first",
    "traversal",
    "遍历",
    "深度优先",
}
_RECURSION_PROMPT_MARKERS = {"recursion", "recursive", "递归", "调用栈"}
_PROJECTILE_PROMPT_MARKERS = {
    "horizontal velocity",
    "vertical velocity",
    "velocity components",
    "velocity decomposition",
    "vx",
    "vy",
    "平抛",
    "速度分解",
    "分速度",
}

_FORBIDDEN_RENDERING_PATTERNS = (
    "<html",
    "<iframe",
    "<script",
    "manim",
    "server-side video",
    "server video",
    "render_video",
    "ffmpeg",
)

_LESSON_FACT_ALIASES: dict[str, tuple[str, ...]] = {
    "derivative": ("derivative", "导数", "f'", "f′"),
    "tangent": ("tangent", "切线"),
    "slope": ("slope", "斜率"),
    "breadth_first": ("bfs", "breadth-first", "breadth first", "广度优先"),
    "queue": ("queue", "frontier", "队列"),
    "visited": ("visited", "已访问", "访问集合"),
    "order": ("visit_order", "visit order", "layer by layer", "访问顺序", "逐层"),
    "factorial": ("factorial", "阶乘"),
    "base_case": ("base_case", "base case", "基例", "递归出口"),
    "recursive_call": ("recursive_call", "recursive call", "递归调用"),
    "return_unwind": ("return_unwind", "unwind", "回溯", "返回"),
    "factorial_result": ("factorial_result", "return_value", "返回值", "阶乘结果"),
    "horizontal_velocity": (
        "horizontal_velocity",
        "horizontal velocity",
        "velocity-x",
        "v_x",
        "水平速度",
    ),
    "vertical_velocity": (
        "vertical_velocity",
        "vertical velocity",
        "velocity-y",
        "v_y",
        "竖直速度",
    ),
    "gravity": ("gravity", "重力", "g向下"),
    "parabolic": ("parabolic", "parabola", "抛物线"),
}

_LESSON_VISUAL_ROLE_ALIASES: dict[str, tuple[str, ...]] = {
    "curve": ("curves", "curve", "expression"),
    "target_point": ("target_point", "marker_x", "point"),
    "secant": ("secant", "割线"),
    "tangent": ("tangent", "切线"),
    "slope": ("slope", "斜率"),
    "node": ("nodes", "node_ids", "node"),
    "edge": ("edges", "edge"),
    "current_node": (
        "current",
        "current_node",
        "current_node_id",
        "active_node",
        "active_node_ids",
    ),
    "visited": ("visited", "visited_node_ids"),
    "queue": ("queue", "queue_node_ids", "frontier", "frontier_node_ids"),
    "stack_frame": ("frames", "stack_frame", "call_stack"),
    "active_frame": ("active_frame", "active_frame_id", "current_frame_id"),
    "code_line": ("code_trace", "active_line", "code_lines"),
    "return_value": ("return_value", "returned_value", "result", "return", "returned"),
    "object": ("objects", "object", "body_id"),
    "trajectory": ("trajectory", "path_points", "trail"),
    "horizontal_velocity": ("horizontal_velocity", "velocity-x", "v_x", "vx"),
    "vertical_velocity": ("vertical_velocity", "velocity-y", "v_y", "vy"),
    "gravity": ("gravity", "acceleration", "g"),
}

_LESSON_SCENE_SNAPSHOT_KINDS: dict[str, frozenset[str]] = {
    "derivative_tangent": frozenset(("math_plot", "math_scene")),
    "bfs_graph": frozenset(("graph_scene", "algorithm_tree")),
    "recursion_stack": frozenset(("call_stack_scene",)),
    "projectile_motion": frozenset(("physics_force_scene", "motion_scene", "math_scene")),
}


PlaybookCheckReport = PlaybookReviewVerdict


def quality_gate_playbook(
    playbook: PlaybookScript,
    prompt: str,
    *,
    generator_path: str,
    coverage_mode: CoverageMode | Literal["unknown"] = "unknown",
    coverage_decision: CoverageDecision | None = None,
    lesson_plan: LessonPlan | None = None,
) -> QualityReport:
    """Run the canonical backend quality gate for a candidate playbook."""
    effective_coverage_mode = (
        coverage_decision.mode if coverage_decision is not None else coverage_mode
    )
    return QualityReport.from_review_verdict(
        _review_playbook(
            playbook,
            prompt,
            enforce_agent_step_bounds=False,
            coverage_decision=coverage_decision,
            lesson_plan=lesson_plan,
        ),
        generator_path=generator_path,
        coverage_mode=effective_coverage_mode,
    )


def self_check_playbook(
    playbook: PlaybookScript,
    prompt: str,
    *,
    lesson_plan: LessonPlan | None = None,
) -> PlaybookCheckReport:
    """Strict agent pre-check; final success still goes through ``quality_gate_playbook``."""
    return _review_playbook(
        playbook,
        prompt,
        enforce_agent_step_bounds=True,
        coverage_decision=None,
        lesson_plan=lesson_plan,
    )


def _review_playbook(
    playbook: PlaybookScript,
    prompt: str,
    *,
    enforce_agent_step_bounds: bool,
    coverage_decision: CoverageDecision | None,
    lesson_plan: LessonPlan | None,
) -> PlaybookCheckReport:
    issues: list[PlaybookReviewIssue] = []
    _check_structure(playbook, issues, enforce_step_bounds=enforce_agent_step_bounds)
    _check_timing(playbook, issues)
    _check_steps(playbook, prompt, issues)
    _check_domain_quality(playbook, prompt, issues)
    _check_assets(playbook, issues)
    _check_forbidden_rendering_paths(playbook, issues)
    if coverage_decision is not None:
        _check_coverage_boundary(coverage_decision, issues)
    if lesson_plan is not None:
        _check_lesson_plan_adherence(playbook, lesson_plan, issues)
    return playbook_review_verdict_from_issues(
        issues,
        clean_summary="Playbook passed API self-check.",
        warning_summary="Playbook passed API self-check with warnings.",
        blocked_summary="Playbook failed API self-check.",
        actions=["agent:self_check"],
    )


def _check_coverage_boundary(
    coverage_decision: CoverageDecision,
    issues: list[PlaybookReviewIssue],
) -> None:
    if coverage_decision.mode != "experimental":
        return
    if coverage_decision.fallback_policy == "text_only":
        issues.append(
            _issue(
                "capability.text_only_required",
                PlaybookIssueSeverity.ERROR,
                "coverage_decision.fallback_policy",
                (
                    "Coverage requires a text-only fallback, but MetaView currently "
                    "has no separate text-only content output contract."
                ),
                (
                    "Reject this Playbook candidate until a supported text-only product "
                    "surface exists."
                ),
                requires_repair=False,
            )
        )
        return
    if coverage_decision.fallback_policy == "limited_visual":
        issues.append(
            _issue(
                "capability.limited_visual_unavailable",
                PlaybookIssueSeverity.ERROR,
                "coverage_decision.fallback_policy",
                (
                    "Coverage requires a limited-visual fallback, but its required visual "
                    "validation capability is unavailable."
                ),
                (
                    "Reject this Playbook candidate until a validated limited-visual "
                    "product surface exists."
                ),
                requires_repair=False,
            )
        )


def _check_structure(
    playbook: PlaybookScript,
    issues: list[PlaybookReviewIssue],
    *,
    enforce_step_bounds: bool,
) -> None:
    if not playbook.title.strip():
        issues.append(
            _issue(
                "step.too_shallow",
                PlaybookIssueSeverity.ERROR,
                "title",
                "Playbook title is empty.",
                "Set a short title that names the lesson.",
            )
        )
    if not playbook.summary.strip():
        issues.append(
            _issue(
                "step.too_shallow",
                PlaybookIssueSeverity.WARNING,
                "summary",
                "Playbook summary is empty.",
                "Add a one-sentence summary of the lesson.",
            )
        )
    if not playbook.steps:
        issues.append(
            _issue(
                "scene.required_contract_missing",
                PlaybookIssueSeverity.ERROR,
                "steps",
                "Playbook must contain at least one teaching scene.",
                "Generate one or more SceneBlueprint-backed teaching steps.",
            )
        )
    if enforce_step_bounds and (
        len(playbook.steps) < MIN_AGENT_STEPS or len(playbook.steps) > MAX_AGENT_STEPS
    ):
        issues.append(
            _issue(
                "step.too_shallow",
                PlaybookIssueSeverity.ERROR,
                "steps",
                (
                    f"Playbook has {len(playbook.steps)} step(s); launch-safe "
                    f"bounds are {MIN_AGENT_STEPS}-{MAX_AGENT_STEPS}."
                ),
                "Regenerate with a concise but complete step sequence.",
            )
        )


def _check_timing(playbook: PlaybookScript, issues: list[PlaybookReviewIssue]) -> None:
    previous_end = 0
    for index, step in enumerate(playbook.steps):
        if step.end_frame <= previous_end:
            issues.append(
                _issue(
                    "timeline.non_monotonic",
                    PlaybookIssueSeverity.ERROR,
                    f"steps[{index}].end_frame",
                    "Step end_frame values must be strictly increasing.",
                    "Increase each step end_frame beyond the previous step.",
                )
            )
        step_duration = step.end_frame - previous_end
        estimated_frames = estimate_step_frames(step.voiceover_text, playbook.fps)
        if step.voiceover_text.strip() and step_duration < estimated_frames - 12:
            issues.append(
                _issue(
                    "timeline.voiceover_too_short",
                    PlaybookIssueSeverity.WARNING,
                    f"steps[{index}].end_frame",
                    (
                        f"Step duration ({step_duration} frames) appears shorter than the "
                        f"estimated narration requirement ({estimated_frames} frames)."
                    ),
                    "Increase this step duration or shorten the narration text.",
                )
            )
        previous_end = step.end_frame

    if playbook.steps and playbook.total_frames < playbook.steps[-1].end_frame:
        issues.append(
            _issue(
                "timeline.exceeds_total_frames",
                PlaybookIssueSeverity.ERROR,
                "total_frames",
                "total_frames does not cover the final step end_frame.",
                "Set total_frames to at least the last step's end_frame.",
            )
        )


def _check_steps(
    playbook: PlaybookScript,
    prompt: str,
    issues: list[PlaybookReviewIssue],
) -> None:
    for index, step in enumerate(playbook.steps):
        if not step.voiceover_text.strip():
            issues.append(
                _issue(
                    "step.empty_voiceover",
                    PlaybookIssueSeverity.ERROR,
                    f"steps[{index}].voiceover_text",
                    "Every step must have non-empty voiceover_text.",
                    "Write narration that explains why the step matters and what changes visually.",
                )
            )
        _check_snapshot(step.snapshot, f"steps[{index}].snapshot", issues)
        _check_subject_visual_fallback(
            playbook.domain,
            step.snapshot,
            f"steps[{index}].snapshot",
            issues,
        )
        if not step.layers:
            issues.append(
                _issue(
                    "renderer.contract_risk",
                    PlaybookIssueSeverity.ERROR,
                    f"steps[{index}].layers",
                    "Every step must carry at least one renderer layer.",
                    "Mirror the primary snapshot into layers[0].body.",
                )
            )
            issues.append(
                _issue(
                    "scene.required_contract_missing",
                    PlaybookIssueSeverity.ERROR,
                    f"steps[{index}].layers",
                    "The scene is missing its required primary renderer contract.",
                    "Compile the scene through SceneBlueprint and mirror it into layers[0].body.",
                )
            )
        else:
            _check_primary_layer_mirror(
                step.snapshot,
                step.layers[0].body,
                f"steps[{index}].layers[0].body",
                issues,
            )
        for layer_index, layer in enumerate(step.layers):
            _check_snapshot(
                layer.body,
                f"steps[{index}].layers[{layer_index}].body",
                issues,
            )
        if step.code_highlight is not None:
            _check_code_highlight(step.code_highlight, index, issues)
            _check_code_visual_state(
                step.code_highlight,
                step.snapshot,
                index,
                issues,
                prompt=prompt,
            )
        _check_narration_visual_match(index, step.title, step.voiceover_text, step.snapshot, issues)

    _check_final_step_answers_prompt(playbook, prompt, issues)


def _check_primary_layer_mirror(
    snapshot: Any,
    primary_layer_body: Any,
    path: str,
    issues: list[PlaybookReviewIssue],
) -> None:
    snapshot_kind = getattr(snapshot, "kind", None)
    layer_kind = getattr(primary_layer_body, "kind", None)
    if layer_kind != snapshot_kind:
        issues.append(
            _issue(
                "renderer.contract_risk",
                PlaybookIssueSeverity.ERROR,
                f"{path}.kind",
                (
                    "Primary renderer layer kind must match the step snapshot kind; "
                    f"got {layer_kind!r} for snapshot kind {snapshot_kind!r}."
                ),
                "Mirror the primary snapshot into layers[0].body before adding overlay layers.",
            )
        )
        return

    if _snapshot_json(primary_layer_body) != _snapshot_json(snapshot):
        issues.append(
            _issue(
                "renderer.contract_risk",
                PlaybookIssueSeverity.ERROR,
                path,
                "Primary renderer layer body must deeply equal the step snapshot.",
                "Copy the full primary snapshot into layers[0].body and put overlays after it.",
            )
        )


def _check_snapshot(snapshot: Any, path: str, issues: list[PlaybookReviewIssue]) -> None:
    kind = getattr(snapshot, "kind", None)
    if kind not in SUPPORTED_FRONTEND_SNAPSHOT_KINDS:
        issues.append(
            _issue(
                "snapshot.unsupported_kind",
                PlaybookIssueSeverity.ERROR,
                f"{path}.kind",
                f"Snapshot kind {kind!r} is not registered in the frontend renderer registry.",
                "Use one of the existing renderer-backed snapshot kinds.",
            )
        )
        return
    if not _snapshot_has_meaningful_payload(snapshot):
        issues.append(
            _issue(
                "snapshot.empty_payload",
                PlaybookIssueSeverity.ERROR,
                path,
                f"Snapshot {kind!r} has no meaningful visual payload.",
                (
                    "Add renderer-visible data such as array values, curves, scene objects, "
                    "or formula text."
                ),
            )
        )
    _check_algorithm_indices(snapshot, path, issues)


def _check_subject_visual_fallback(
    domain: str,
    snapshot: Any,
    path: str,
    issues: list[PlaybookReviewIssue],
) -> None:
    normalized_domain = domain.strip().lower()
    kind = getattr(snapshot, "kind", None)
    if normalized_domain in _SUBJECT_VISUAL_DOMAINS and kind in _ALGORITHM_FALLBACK_KINDS:
        issues.append(
            _issue(
                "snapshot.domain_fallback",
                PlaybookIssueSeverity.ERROR,
                f"{path}.kind",
                f"{normalized_domain} playbooks must not fall back to {kind}.",
                (
                    "Use a SceneBlueprint or subject semantic renderer such as geo_map_scene, "
                    "bio_cell_scene, bio_process_scene, molecule_2d_scene, or reaction_scene "
                    "instead of an algorithm array."
                ),
            )
        )


def _snapshot_json(snapshot: Any) -> dict[str, Any]:
    if hasattr(snapshot, "model_dump"):
        return snapshot.model_dump(mode="json", exclude_none=True)
    if isinstance(snapshot, dict):
        return {key: value for key, value in snapshot.items() if value is not None}
    return {}


def _snapshot_has_meaningful_payload(snapshot: Any) -> bool:
    kind = getattr(snapshot, "kind", "")
    data = snapshot.model_dump(mode="json", exclude_none=True)
    if kind in {"algorithm_array", "algorithm_bars"}:
        return bool(data.get("array_values"))
    if kind == "algorithm_tree":
        return bool(data.get("nodes") or data.get("edges"))
    if kind == "math_plot":
        return any(curve.get("expression") for curve in data.get("curves", []))
    if kind == "math_formula":
        return bool(str(data.get("formula_latex", "")).strip())
    if kind == "math_scene":
        return any(
            data.get(key)
            for key in (
                "points",
                "curves",
                "regions",
                "vector_field",
                "segments",
                "annotations",
                "formula_latex",
                "caption",
            )
        )
    if kind == "matrix_scene":
        return bool(data.get("matrix"))
    if kind == "table_scene":
        return bool(data.get("columns") or data.get("rows"))
    if kind == "graph_scene":
        return bool(data.get("nodes") or data.get("edges"))
    if kind == "call_stack_scene":
        return bool(data.get("frames") or data.get("code_trace"))
    if kind == "code_trace_scene":
        return bool(data.get("lines") or data.get("array_values") or data.get("pointers"))
    if kind == "stats_chart_scene":
        return bool(data.get("series"))
    if kind == "iteration_trace_scene":
        return bool(data.get("iterations"))
    if kind == "phase_portrait_scene":
        return bool(data.get("trajectories") or data.get("equilibria") or data.get("vector_field"))
    if kind == "complex_plane_scene":
        return bool(data.get("points") or data.get("contours") or data.get("mapping_grid"))
    if kind == "optimization_scene":
        return bool(
            data.get("objective")
            or data.get("feasible_region")
            or data.get("iterates")
            or data.get("optimum")
        )
    if kind == "modeling_scene":
        return bool(data.get("variables") or data.get("relations") or data.get("simulation_series"))
    if kind == "manifold_scene":
        return bool(
            data.get("chart_name") or data.get("param_surface") or data.get("tangent_vectors")
        )
    if kind == "solid_geometry_scene":
        return bool(
            data.get("points")
            or data.get("edges")
            or data.get("planes")
            or data.get("vectors")
            or data.get("visible_elements")
        )
    if kind == "bio_cell_scene":
        return bool(data.get("structures") or data.get("callouts"))
    if kind == "bio_process_scene":
        return bool(data.get("steps") or data.get("connections") or data.get("callouts"))
    if kind == "molecule_2d_scene":
        return bool(data.get("atoms") or data.get("bonds") or data.get("molecule_asset_id"))
    if kind == "reaction_scene":
        return bool(
            data.get("reactants")
            or data.get("products")
            or data.get("arrows")
            or data.get("electron_flows")
            or data.get("formula_latex")
        )
    if kind == "geo_map_scene":
        return bool(data.get("layers") or data.get("flows") or data.get("pressure_centers"))
    if kind == "physics_force_scene":
        return bool(data.get("objects") or data.get("vectors") or data.get("trajectory"))
    if kind == "motion_scene":
        return bool(data.get("objects") or data.get("tracks"))
    if kind == "katex_overlay":
        return bool(str(data.get("latex", "")).strip())
    if kind == "narration_card":
        return bool(str(data.get("text", "")).strip())
    return False


def _check_algorithm_indices(
    snapshot: Any,
    path: str,
    issues: list[PlaybookReviewIssue],
) -> None:
    if not isinstance(snapshot, (AlgorithmArraySnapshot, AlgorithmBarsSnapshot)):
        return
    count = len(snapshot.array_values)
    indices = [
        *snapshot.active_indices,
        *snapshot.swap_indices,
        *snapshot.sorted_indices,
        *snapshot.pointers.values(),
        *snapshot.element_states.keys(),
        *(range_.start for range_ in snapshot.ranges),
        *(range_.end for range_ in snapshot.ranges),
        *(
            item.index
            for lane in snapshot.auxiliary_lanes
            for item in lane.items
            if item.index is not None
        ),
    ]
    if any(index < 0 or index >= count for index in indices):
        issues.append(
            _issue(
                "algorithm.invalid_state_transition",
                PlaybookIssueSeverity.ERROR,
                path,
                "Algorithm snapshot references an array index outside array_values.",
                "Keep element, range, auxiliary-lane, and pointer indices within the array length.",
            )
        )


def _check_code_highlight(
    code: CodeHighlightOverlay,
    step_index: int,
    issues: list[PlaybookReviewIssue],
) -> None:
    line_count = len(code.lines)
    active_lines = [*code.active_lines, code.active_line]
    if any(line < 0 or line >= line_count for line in active_lines):
        issues.append(
            _issue(
                "code.line_out_of_range",
                PlaybookIssueSeverity.ERROR,
                f"steps[{step_index}].code_highlight.active_lines",
                "Code highlight references a line outside the provided source lines.",
                "Keep active_lines and active_line within the zero-based lines array.",
            )
        )


def _check_code_visual_state(
    code: CodeHighlightOverlay,
    snapshot: Any,
    step_index: int,
    issues: list[PlaybookReviewIssue],
    *,
    prompt: str,
) -> None:
    data = _snapshot_json(snapshot)
    normalized_prompt = prompt.casefold()
    kind = data.get("kind")
    mismatch = False
    if kind == "graph_scene" and any(
        marker in normalized_prompt for marker in _BFS_PROMPT_MARKERS
    ):
        required = {"current", "queue", "visited"}
        if not required.issubset(code.variables):
            mismatch = True
        current = str(
            data.get("current_node_id")
            or next(iter(data.get("active_node_ids") or []), "done")
        )
        queue = list(
            dict.fromkeys(
                [
                    *(str(item) for item in data.get("queue_node_ids") or []),
                    *(str(item) for item in data.get("frontier_node_ids") or []),
                ]
            )
        )
        visited = [str(item) for item in data.get("visited_node_ids") or []]
        mismatch = mismatch or not (
            code.variables.get("current", "").strip() == current
            and _code_state_tokens(code.variables.get("queue", "")) == queue
            and _code_state_tokens(code.variables.get("visited", "")) == visited
        )
    elif kind == "call_stack_scene" and any(
        marker in normalized_prompt for marker in _RECURSION_PROMPT_MARKERS
    ):
        current_frame = next(
            (
                frame
                for frame in data.get("frames") or []
                if isinstance(frame, dict) and frame.get("id") == data.get("current_frame_id")
            ),
            None,
        )
        visual_variables = (current_frame or {}).get("variables") or {}
        mismatch = not visual_variables or any(
            key not in code.variables
            or not _code_state_value_equal(code.variables[key], value)
            for key, value in visual_variables.items()
        )
    elif kind == "code_trace_scene" and any(
        marker in normalized_prompt for marker in _RECURSION_PROMPT_MARKERS
    ):
        visual_variables = data.get("variables") or {}
        mismatch = not visual_variables or any(
            key not in code.variables
            or not _code_state_value_equal(code.variables[key], value)
            for key, value in visual_variables.items()
        )

    if mismatch:
        issues.append(
            _issue(
                "code.state_mismatch",
                PlaybookIssueSeverity.ERROR,
                f"steps[{step_index}].code_highlight.variables",
                "Code Sync variables do not match the visual execution state.",
                "Synchronize the code variables with the current graph, stack, or trace state.",
            )
        )


def _code_state_tokens(value: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9_.-]+", value)


def _code_state_value_equal(left: Any, right: Any) -> bool:
    left_text = str(left).strip()
    right_text = str(right).strip()
    try:
        left_number = float(left_text)
        right_number = float(right_text)
    except ValueError:
        return left_text == right_text
    return math.isfinite(left_number) and math.isfinite(right_number) and math.isclose(
        left_number,
        right_number,
    )


def _check_narration_visual_match(
    index: int,
    title: str,
    voiceover: str,
    snapshot: Any,
    issues: list[PlaybookReviewIssue],
) -> None:
    visual_tokens = _tokens_for_snapshot(snapshot) | _tokens_for_text(title)
    narration_tokens = _tokens_for_text(voiceover)
    if visual_tokens and narration_tokens and not (visual_tokens & narration_tokens):
        issues.append(
            _issue(
                "snapshot.narration_mismatch",
                PlaybookIssueSeverity.WARNING,
                f"steps[{index}].voiceover_text",
                "Step narration does not appear to reference the visual snapshot.",
                (
                    "Mention the key visual object, formula, array state, or scene element "
                    "in the narration."
                ),
            )
        )


def _check_final_step_answers_prompt(
    playbook: PlaybookScript,
    prompt: str,
    issues: list[PlaybookReviewIssue],
) -> None:
    if not playbook.steps:
        return
    if not _prompt_requires_explicit_answer(prompt):
        return
    prompt_tokens = _tokens_for_text(prompt) - _ANSWER_STOPWORDS
    if not prompt_tokens:
        return
    final = playbook.steps[-1]
    final_tokens = _tokens_for_text(final.title) | _tokens_for_text(final.voiceover_text)
    if not final_tokens or not (prompt_tokens & final_tokens):
        issues.append(
            _issue(
                "step.does_not_answer_prompt",
                PlaybookIssueSeverity.ERROR,
                "steps[-1]",
                "The final step may not answer the user's prompt.",
                "Make the final narration explicitly state the requested conclusion or result.",
            )
        )


def _prompt_requires_explicit_answer(prompt: str) -> bool:
    normalized = prompt.strip().lower()
    return any(marker in normalized for marker in _ANSWER_PROMPT_MARKERS)


def _check_domain_quality(
    playbook: PlaybookScript,
    prompt: str,
    issues: list[PlaybookReviewIssue],
) -> None:
    kinds = {getattr(step.snapshot, "kind", None) for step in playbook.steps}
    domain = str(playbook.domain.value if hasattr(playbook.domain, "value") else playbook.domain)

    if domain == "math":
        _check_math_parameter_contract(playbook, prompt, issues)
        math_kinds = kinds & _MATH_VISUAL_KINDS
        normalized_prompt = prompt.lower()
        needs_rich_visual = any(marker in normalized_prompt for marker in _RICH_MATH_PROMPT_MARKERS)
        if not math_kinds or (needs_rich_visual and not (math_kinds & _RICH_MATH_VISUAL_KINDS)):
            issues.append(
                _issue(
                    "math.low_visual_richness",
                    PlaybookIssueSeverity.ERROR,
                    "steps",
                    "Math playbook lacks the renderer-visible structure required by the prompt.",
                    "Use a math scene, plot, matrix, chart, or other semantic math renderer.",
                )
            )

    normalized_prompt = prompt.lower()
    if domain == "algorithm" and any(
        marker in normalized_prompt for marker in _ALGORITHM_STATE_PROMPT_MARKERS
    ):
        algorithm_snapshots = [
            step.snapshot
            for step in playbook.steps
            if getattr(step.snapshot, "kind", None)
            in {
                "algorithm_array",
                "algorithm_bars",
                "algorithm_tree",
                "graph_scene",
                "call_stack_scene",
                "code_trace_scene",
            }
        ]
        graph_traversal = any(
            marker in normalized_prompt for marker in _GRAPH_TRAVERSAL_PROMPT_MARKERS
        )
        bfs = any(marker in normalized_prompt for marker in _BFS_PROMPT_MARKERS)
        if graph_traversal:
            graph_snapshots = [
                snapshot
                for snapshot in algorithm_snapshots
                if getattr(snapshot, "kind", None) in {"graph_scene", "algorithm_tree"}
            ]
            has_required_state = any(
                _snapshot_has_graph_traversal_state(snapshot, require_queue=bfs)
                for snapshot in graph_snapshots
            )
        else:
            has_required_state = any(
                _snapshot_has_algorithm_state(snapshot) for snapshot in algorithm_snapshots
            )
        if not algorithm_snapshots or not has_required_state:
            issues.append(
                _issue(
                    "algorithm.state_missing",
                    PlaybookIssueSeverity.ERROR,
                    "steps",
                    (
                        "Algorithm playbook has no current, visited, queue, stack, "
                        "pointer, or active state."
                    ),
                    "Expose the changing algorithm state in the semantic snapshot fields.",
                )
            )
        if bfs:
            bfs_steps = [
                step
                for step in playbook.steps
                if getattr(step.snapshot, "kind", None) == "graph_scene"
            ]
            if bfs_steps and any(step.code_highlight is None for step in bfs_steps):
                issues.append(
                    _issue(
                        "code.sync_missing",
                        PlaybookIssueSeverity.ERROR,
                        "steps[*].code_highlight",
                        "BFS steps require a parallel Code Sync track outside the video stage.",
                        "Attach canonical BFS code lines and current/queue/visited variables.",
                    )
                )
            _check_bfs_checkpoint_progression(
                [step.snapshot for step in bfs_steps],
                issues,
                require_complete=any(
                    marker in normalized_prompt for marker in _BFS_COMPLETE_PROMPT_MARKERS
                ),
            )

    if domain in {"algorithm", "code", "computer_science"} and any(
        marker in normalized_prompt for marker in _RECURSION_PROMPT_MARKERS
    ):
        recursion_snapshots = [
            step.snapshot
            for step in playbook.steps
            if getattr(step.snapshot, "kind", None) in {"call_stack_scene", "code_trace_scene"}
        ]
        if not recursion_snapshots or not any(
            _snapshot_has_algorithm_state(snapshot) for snapshot in recursion_snapshots
        ):
            issues.append(
                _issue(
                    "code.execution_state_missing",
                    PlaybookIssueSeverity.ERROR,
                    "steps",
                    "Recursive code explanation lacks a structured call stack or code trace state.",
                    "Use call_stack_scene or code_trace_scene with active frames and lines.",
                )
            )
        recursion_steps = [
            step
            for step in playbook.steps
            if getattr(step.snapshot, "kind", None) in {"call_stack_scene", "code_trace_scene"}
        ]
        if recursion_steps and any(step.code_highlight is None for step in recursion_steps):
            issues.append(
                _issue(
                    "code.sync_missing",
                    PlaybookIssueSeverity.ERROR,
                    "steps[*].code_highlight",
                    "Recursive execution steps require a parallel Code Sync track.",
                    "Mirror the active code trace and current frame variables into code_highlight.",
                )
            )

    if domain == "physics" and any(
        marker in normalized_prompt for marker in _PROJECTILE_PROMPT_MARKERS
    ):
        if not any(_snapshot_has_projectile_state(step.snapshot) for step in playbook.steps):
            issues.append(
                _issue(
                    "physics.state_missing",
                    PlaybookIssueSeverity.ERROR,
                    "steps",
                    (
                        "Projectile explanation lacks trajectory, body, velocity "
                        "components, or gravity state."
                    ),
                    (
                        "Use physics_force_scene or motion_scene with the projectile "
                        "trajectory and vectors."
                    ),
                )
            )


def _check_math_parameter_contract(
    playbook: PlaybookScript,
    prompt: str,
    issues: list[PlaybookReviewIssue],
) -> None:
    bindings = _math_expression_bindings(playbook)
    required_parameters = _required_interactive_parameters(prompt)
    controls: dict[str, float] = {}
    seen_ids: set[str] = set()
    control_ids_by_label: dict[str, str] = {}
    for index, control in enumerate(playbook.parameter_controls):
        path = f"parameter_controls[{index}]"
        raw_value = control.value.strip()
        valid_id = bool(_MATH_PARAMETER_ID_RE.fullmatch(control.id))
        try:
            value = float(raw_value)
        except ValueError:
            value = math.nan
        valid_value = bool(raw_value) and math.isfinite(value)
        duplicate = control.id in seen_ids
        normalized_label = re.sub(r"\s+", " ", control.label.strip().casefold())
        prior_label_id = control_ids_by_label.get(normalized_label)
        duplicate_meaning = bool(normalized_label) and (
            prior_label_id is not None and prior_label_id != control.id
        )
        seen_ids.add(control.id)
        if normalized_label and prior_label_id is None:
            control_ids_by_label[normalized_label] = control.id
        if not valid_id or not valid_value or duplicate or duplicate_meaning:
            reasons = []
            if not valid_id:
                reasons.append("id must be a renderer-safe identifier")
            if not valid_value:
                reasons.append("value must be a finite number")
            if duplicate:
                reasons.append("id must be unique")
            if duplicate_meaning:
                reasons.append(f"label duplicates parameter {prior_label_id!r}")
            issues.append(
                _issue(
                    "math.parameter_control_invalid",
                    PlaybookIssueSeverity.ERROR,
                    path,
                    f"Math parameter control {control.id!r} is invalid: {', '.join(reasons)}.",
                    (
                        "Use one unique ASCII identifier and label per mathematical "
                        "parameter, and provide a finite numeric default value."
                    ),
                )
            )
            continue
        controls[control.id] = value

    symbolic: set[str] = set()
    missing: set[str] = set()
    identifiers_by_view: dict[str, set[str]] = {}
    binding_by_view: dict[str, _MathExpressionBinding] = {}
    for binding in bindings:
        try:
            identifiers = extract_safe_math_identifiers(binding.source)
            compiled = compile_safe_math_expression(binding.source)
        except SafeMathExpressionError as exc:
            issues.append(
                _issue(
                    "math.parameter_control_invalid",
                    PlaybookIssueSeverity.ERROR,
                    binding.path,
                    f"Math expression cannot be rendered: {exc}.",
                    "Use the supported renderer expression grammar and explicit multiplication.",
                )
            )
            continue
        expression_parameters = identifiers - binding.intrinsic_names
        symbolic.update(expression_parameters)
        missing.update(
            expression_parameters - set(binding.fixed_params) - set(controls)
        )
        identifiers_by_view.setdefault(binding.view_key, set()).update(
            expression_parameters
        )
        binding_by_view[binding.view_key] = binding
        if not _expression_has_finite_default(
            compiled,
            controls,
            binding.fixed_params,
            binding.intrinsic_names,
            binding.sample_values,
        ):
            issues.append(
                _issue(
                    "math.parameter_control_invalid",
                    PlaybookIssueSeverity.ERROR,
                    binding.path,
                    "Math expression has no finite sample with the declared default parameters.",
                    (
                        "Choose finite defaults that render the curve before the "
                        "student moves a slider."
                    ),
                )
            )

    missing.update((required_parameters & symbolic) - set(controls))
    if missing:
        missing_names = sorted(missing)
        issues.append(
            _issue(
                "math.parameter_control_missing",
                PlaybookIssueSeverity.ERROR,
                "parameter_controls",
                (
                    "Math expressions reference free parameter(s) without controls: "
                    f"{', '.join(missing_names)}."
                ),
                (
                    "Declare one parameter control per free identifier and keep the same "
                    "identifier in every dynamic curve expression."
                ),
            )
        )

    condition_determined = _condition_determined_parameters(prompt)
    unused = sorted((set(controls) - symbolic) | (set(controls) & condition_determined))
    if unused:
        issues.append(
            _issue(
                "math.parameter_control_unused",
                PlaybookIssueSeverity.ERROR,
                "parameter_controls",
                (
                    "Math parameter control(s) are unused or already fixed by the "
                    f"problem constraints: {', '.join(unused)}."
                ),
                (
                    "Remove fake controls and controls for quantities already "
                    "determined by the problem; only surviving free parameters may "
                    "remain interactive."
                ),
            )
        )

    target_families = {
        binding.family_key
        for view_key, binding in binding_by_view.items()
        if binding.moving_target
        or bool(identifiers_by_view.get(view_key, set()) & required_parameters)
    }
    hardcoded_by_path: dict[str, set[str]] = {}
    for view_key, binding in binding_by_view.items():
        if binding.family_key not in target_families:
            continue
        hardcoded = required_parameters - identifiers_by_view.get(view_key, set())
        if hardcoded:
            hardcoded_by_path[binding.view_path] = hardcoded
    hardcoded_in_moving_views = set().union(
        *hardcoded_by_path.values()
    ) if hardcoded_by_path else set()
    for path, names in hardcoded_by_path.items():
        issues.append(
            _issue(
                "math.parameter_hardcoded",
                PlaybookIssueSeverity.ERROR,
                path,
                (
                    "A moving curve expression hardcodes surviving free "
                    f"parameter(s): {', '.join(sorted(names))}."
                ),
                (
                    "Keep each surviving free parameter symbolic in every moving "
                    "curve expression and declare a matching parameter control."
                ),
            )
        )

    hardcoded = sorted(required_parameters - symbolic - hardcoded_in_moving_views)
    if hardcoded:
        issues.append(
            _issue(
                "math.parameter_hardcoded",
                PlaybookIssueSeverity.ERROR,
                "steps",
                (
                    "The prompt requires a moving line, but surviving free "
                    f"parameter(s) were baked into numeric expressions: {', '.join(hardcoded)}."
                ),
                (
                    "Keep each surviving free parameter symbolic in the moving-line "
                    "curve and declare a matching parameter control."
                ),
            )
        )


def _required_interactive_parameters(prompt: str) -> set[str]:
    normalized = prompt.casefold()
    required = {
        match.group(1)
        for pattern in (_EXPLICIT_PARAMETER_RE, _EXPLICIT_PARAMETER_CN_RE)
        for match in pattern.finditer(prompt)
    }
    if not any(marker in normalized for marker in _MOVING_LINE_MARKERS):
        return required
    match = _MOVING_LINE_PARAMETER_RE.search(prompt)
    if match is None:
        slope_match = _MOVING_LINE_SLOPE_RE.search(prompt)
        if slope_match is not None:
            required.add(slope_match.group(1))
        return required
    slope, intercept = match.groups()
    required.add(slope)
    if not any(marker in normalized for marker in _DETERMINED_INTERCEPT_MARKERS):
        required.add(intercept)
    return required


def _condition_determined_parameters(prompt: str) -> set[str]:
    normalized = prompt.casefold()
    if not any(marker in normalized for marker in _MOVING_LINE_MARKERS):
        return set()
    if not any(marker in normalized for marker in _DETERMINED_INTERCEPT_MARKERS):
        return set()
    match = _MOVING_LINE_PARAMETER_RE.search(prompt)
    return {match.group(2)} if match is not None else set()


def _math_expression_bindings(
    playbook: PlaybookScript,
) -> list[_MathExpressionBinding]:
    bindings: list[_MathExpressionBinding] = []
    for step_index, step in enumerate(playbook.steps):
        snapshot = _snapshot_json(step.snapshot)
        kind = snapshot.get("kind")
        fixed_params = {
            str(name): float(value)
            for name, value in (snapshot.get("params") or {}).items()
            if isinstance(value, (int, float))
            and not isinstance(value, bool)
            and math.isfinite(float(value))
        }
        if kind == "math_plot":
            for curve_index, curve in enumerate(snapshot.get("curves") or []):
                if not isinstance(curve, dict) or not isinstance(curve.get("expression"), str):
                    continue
                path = (
                    f"steps[{step_index}].snapshot.curves[{curve_index}].expression"
                )
                bindings.append(
                    _MathExpressionBinding(
                        source=curve["expression"],
                        intrinsic_names={"x"},
                        fixed_params=fixed_params,
                        path=path,
                        view_key=f"steps[{step_index}]:math_plot:{curve_index}",
                        family_key=_curve_family_key(
                            [curve["expression"]],
                            {"x"},
                        ),
                        view_path=path,
                        moving_target=_is_moving_curve(curve),
                        sample_values=_range_samples(
                            snapshot.get("x_min"),
                            snapshot.get("x_max"),
                        ),
                    )
                )
        elif kind == "math_scene":
            for curve_index, curve in enumerate(snapshot.get("curves") or []):
                if not isinstance(curve, dict):
                    continue
                parametric = bool(curve.get("expression_x"))
                intrinsic_names = {"t"} if parametric else {"x"}
                sample_values = (
                    _range_samples(curve.get("t_min"), curve.get("t_max"))
                    if parametric
                    else _range_samples(snapshot.get("x_min"), snapshot.get("x_max"))
                )
                curve_sources = [
                    source
                    for field in ("expression_x", "expression_y")
                    if isinstance((source := curve.get(field)), str)
                    and source.strip()
                ]
                family_key = _curve_family_key(curve_sources, intrinsic_names)
                for field in ("expression_x", "expression_y"):
                    source = curve.get(field)
                    if isinstance(source, str) and source.strip():
                        bindings.append(
                            _MathExpressionBinding(
                                source=source,
                                intrinsic_names=intrinsic_names,
                                fixed_params=fixed_params,
                                path=(
                                    f"steps[{step_index}].snapshot.curves"
                                    f"[{curve_index}].{field}"
                                ),
                                view_key=f"steps[{step_index}]:math_scene:{curve_index}",
                                family_key=family_key,
                                view_path=(
                                    f"steps[{step_index}].snapshot.curves[{curve_index}]"
                                ),
                                moving_target=_is_moving_curve(curve),
                                sample_values=sample_values,
                            )
                        )
            vector_field = snapshot.get("vector_field")
            if isinstance(vector_field, dict):
                for field in ("expression_px", "expression_py"):
                    source = vector_field.get(field)
                    if isinstance(source, str) and source.strip():
                        bindings.append(
                            _MathExpressionBinding(
                                source=source,
                                intrinsic_names={"x", "y"},
                                fixed_params=fixed_params,
                                path=f"steps[{step_index}].snapshot.vector_field.{field}",
                                view_key=f"steps[{step_index}]:vector_field",
                                family_key="vector_field",
                                view_path=f"steps[{step_index}].snapshot.vector_field",
                                moving_target=False,
                                sample_values=_range_samples(
                                    snapshot.get("x_min"),
                                    snapshot.get("x_max"),
                                ),
                            )
                        )
    return bindings


def _is_moving_curve(curve: dict[str, Any]) -> bool:
    hint = " ".join(
        str(curve.get(field) or "").casefold()
        for field in ("label", "semantic_role")
    )
    return any(marker in hint for marker in _MOVING_LINE_MARKERS)


def _curve_family_key(
    sources: list[str],
    intrinsic_names: set[str],
) -> str:
    """Match curve formulas after abstracting numeric and free-parameter values."""
    return "|".join(
        _expression_shape(source, intrinsic_names)
        for source in sources
    )


def _expression_shape(source: str, intrinsic_names: set[str]) -> str:
    normalized = re.sub(
        r"(?<![A-Za-z0-9_])(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?",
        "#",
        source.casefold(),
    )

    def replace_identifier(match: re.Match[str]) -> str:
        name = match.group(0)
        remainder = normalized[match.end():]
        if name in intrinsic_names or re.match(r"\s*\(", remainder):
            return name
        return "#"

    normalized = re.sub(
        r"[A-Za-z_][A-Za-z0-9_]*",
        replace_identifier,
        normalized,
    )
    normalized = re.sub(r"\s+", "", normalized)
    normalized = re.sub(r"(^|[(*+/^,])[-+]#", r"\1#", normalized)
    normalized = re.sub(
        r"(?:[#a-z_][#a-z0-9_]*(?:\^#)?)(?:\*(?:[#a-z_][#a-z0-9_]*(?:\^#)?))+",
        lambda match: "*".join(sorted(match.group(0).split("*"))),
        normalized,
    )
    if re.fullmatch(r"[#a-z0-9_*^]+(?:\+[#a-z0-9_*^]+)+", normalized):
        normalized = "+".join(sorted(normalized.split("+")))
    return normalized


def _range_samples(start: Any, end: Any) -> tuple[float, ...]:
    if (
        isinstance(start, (int, float))
        and not isinstance(start, bool)
        and math.isfinite(float(start))
        and isinstance(end, (int, float))
        and not isinstance(end, bool)
        and math.isfinite(float(end))
    ):
        lower, upper = sorted((float(start), float(end)))
        return (lower, (lower + upper) / 2, upper)
    return (-1.0, 0.0, 1.0)


def _expression_has_finite_default(
    compiled: Any,
    controls: dict[str, float],
    fixed_params: dict[str, float],
    intrinsic_names: set[str],
    sample_values: tuple[float, ...],
) -> bool:
    for sample in sample_values:
        scope = {
            **fixed_params,
            **controls,
            **dict.fromkeys(intrinsic_names, sample),
        }
        try:
            if math.isfinite(compiled(scope)):
                return True
        except SafeMathExpressionError:
            continue
    return False


def _check_bfs_checkpoint_progression(
    snapshots: list[Any],
    issues: list[PlaybookReviewIssue],
    *,
    require_complete: bool,
) -> None:
    states = [_snapshot_json(snapshot) for snapshot in snapshots]
    visited_states = [
        [str(node_id) for node_id in state.get("visited_node_ids") or []]
        for state in states
    ]
    longest_visited = max(visited_states, key=len, default=[])
    distinct_checkpoints = {
        (
            state.get("current_node_id"),
            tuple(str(node_id) for node_id in state.get("visited_node_ids") or []),
        )
        for state in states
    }
    current_order: list[str] = []
    for state in states:
        current = state.get("current_node_id")
        if current is None:
            continue
        current_id = str(current)
        if not current_order or current_order[-1] != current_id:
            current_order.append(current_id)
    if len(distinct_checkpoints) > 1 and longest_visited and current_order != longest_visited:
        issues.append(
            _issue(
                "algorithm.invalid_state_transition",
                PlaybookIssueSeverity.ERROR,
                "steps[*].snapshot.current_node_id",
                "BFS skips or reorders a current-node checkpoint from the visited sequence.",
                (
                    "Use one visual checkpoint per dequeue; do not combine multiple visited "
                    "nodes into one snapshot."
                ),
            )
        )
    if not require_complete or not states:
        return

    graph = max(states, key=lambda state: len(state.get("nodes") or []))
    start = next(
        (
            str(state.get("current_node_id"))
            for state in states
            if state.get("current_node_id") is not None
        ),
        longest_visited[0] if longest_visited else None,
    )
    reachable = _reachable_graph_nodes(graph, start) if start else set()
    if reachable and set(longest_visited) != reachable:
        issues.append(
            _issue(
                "algorithm.invalid_state_transition",
                PlaybookIssueSeverity.ERROR,
                "steps[*].snapshot.visited_node_ids",
                "BFS final visited state does not cover every node reachable from the start.",
                "Finish the traversal and show one dequeue checkpoint per reachable node.",
            )
        )


def _reachable_graph_nodes(graph: dict[str, Any], start: str) -> set[str]:
    adjacency: dict[str, set[str]] = {}
    directed = bool(graph.get("directed"))
    for edge in graph.get("edges") or []:
        if not isinstance(edge, dict):
            continue
        source = str(edge.get("source") or "")
        target = str(edge.get("target") or "")
        if not source or not target:
            continue
        adjacency.setdefault(source, set()).add(target)
        if not directed:
            adjacency.setdefault(target, set()).add(source)
    reachable = {start}
    queue = [start]
    while queue:
        current = queue.pop(0)
        for neighbor in adjacency.get(current, set()):
            if neighbor in reachable:
                continue
            reachable.add(neighbor)
            queue.append(neighbor)
    return reachable


def _snapshot_has_algorithm_state(snapshot: Any) -> bool:
    data = _snapshot_json(snapshot)
    kind = data.get("kind")
    state_fields = {
        "algorithm_array": (
            "active_indices",
            "swap_indices",
            "sorted_indices",
            "pointers",
            "ranges",
            "element_states",
            "auxiliary_lanes",
        ),
        "algorithm_bars": (
            "active_indices",
            "swap_indices",
            "sorted_indices",
            "pointers",
            "ranges",
            "element_states",
            "auxiliary_lanes",
        ),
        "algorithm_tree": ("active_node_ids", "visited_node_ids", "path_edge_ids"),
        "graph_scene": (
            "current_node_id",
            "active_node_ids",
            "active_edge_ids",
            "visited_node_ids",
            "queue_node_ids",
            "frontier_node_ids",
        ),
        "call_stack_scene": ("current_frame_id", "frames", "code_trace"),
        "code_trace_scene": (
            "active_lines",
            "active_indices",
            "search_range",
            "pointers",
            "variables",
        ),
    }
    return any(data.get(field) for field in state_fields.get(str(kind), ()))


def _snapshot_has_graph_traversal_state(snapshot: Any, *, require_queue: bool) -> bool:
    data = _snapshot_json(snapshot)
    kind = data.get("kind")
    if kind == "graph_scene":
        base = bool(
            data.get("nodes")
            and data.get("edges")
            and (data.get("current_node_id") or data.get("active_node_ids"))
            and data.get("visited_node_ids")
        )
        return base and (
            not require_queue or bool(data.get("queue_node_ids") or data.get("frontier_node_ids"))
        )
    if kind == "algorithm_tree":
        return bool(
            data.get("nodes")
            and data.get("edges")
            and data.get("active_node_ids")
            and data.get("visited_node_ids")
            and not require_queue
        )
    return False


def _snapshot_has_projectile_state(snapshot: Any) -> bool:
    data = _snapshot_json(snapshot)
    if data.get("kind") == "physics_force_scene":
        vectors = data.get("vectors") or []
        labels = {
            str(vector.get("label") or vector.get("id") or "").lower()
            for vector in vectors
            if isinstance(vector, dict)
        }
        roles = {
            str(vector.get("semantic_role") or "").lower()
            for vector in vectors
            if isinstance(vector, dict)
        }
        return bool(
            data.get("objects")
            and data.get("trajectory")
            and ({"vx", "v_x"} & labels)
            and ({"vy", "v_y"} & labels)
            and ({"g", "gravity"} & labels or {"gravity", "acceleration"} & roles)
        )
    if data.get("kind") == "motion_scene":
        properties_by_target: dict[str, set[str]] = {}
        for track in data.get("tracks") or []:
            if not isinstance(track, dict):
                continue
            properties_by_target.setdefault(str(track.get("target") or ""), set()).add(
                str(track.get("property") or "")
            )
        return bool(
            data.get("objects")
            and any({"x", "y"}.issubset(properties) for properties in properties_by_target.values())
        )
    return False


def estimate_step_frames(text: str, fps: int) -> int:
    if not text.strip():
        return _DEFAULT_STEP_FRAMES
    text_fps = fps if fps > 0 else _DEFAULT_FPS
    chinese_chars = len(re.findall(r"[\u4e00-\u9fff]", text))
    english_words = len(
        re.findall(
            r"[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)?",
            re.sub(r"[\u4e00-\u9fff]", " ", text),
        )
    )
    seconds = min(
        _MAX_STEP_SECONDS,
        max(
            _MIN_STEP_SECONDS,
            chinese_chars / _CHINESE_CHARS_PER_SECOND
            + english_words / _ENGLISH_WORDS_PER_SECOND
            + _VOICEOVER_HOLD_SECONDS,
        ),
    )
    frames = seconds * text_fps
    return max(_FRAME_INCREMENT, math.ceil(frames / _FRAME_INCREMENT) * _FRAME_INCREMENT)


def _check_assets(playbook: PlaybookScript, issues: list[PlaybookReviewIssue]) -> None:
    seen: set[tuple[str | None, str]] = set()
    for step_index, step in enumerate(playbook.steps):
        snapshots = [(step.snapshot, f"steps[{step_index}].snapshot")]
        snapshots.extend(
            (layer.body, f"steps[{step_index}].layers[{layer_index}].body")
            for layer_index, layer in enumerate(step.layers[1:], start=1)
        )
        for snapshot, path in snapshots:
            for asset_path, pack_id, asset_id in _asset_references(snapshot, path):
                key = (pack_id, asset_id)
                if key in seen:
                    continue
                seen.add(key)
                if resolve_asset_by_id(pack_id, asset_id) is not None:
                    continue
                issues.append(
                    _issue(
                        "asset.missing",
                        PlaybookIssueSeverity.ERROR,
                        asset_path,
                        f"Asset {asset_id!r} cannot be resolved from pack {pack_id or 'any'!r}.",
                        "Use an asset id declared by the selected Asset Manifest.",
                    )
                )


def _asset_references(
    value: Any,
    path: str,
    inherited_pack_id: str | None = None,
    snapshot_kind: str | None = None,
) -> list[tuple[str, str | None, str]]:
    data = _snapshot_json(value) if hasattr(value, "model_dump") else value
    if isinstance(data, dict):
        pack_id = data.get("pack_id") or inherited_pack_id
        current_kind = data.get("kind") or snapshot_kind
        refs: list[tuple[str, str | None, str]] = []
        for key, child in data.items():
            child_path = f"{path}.{key}"
            if key.endswith("asset_id") and isinstance(child, str) and child.strip():
                reference_pack_id = pack_id
                if current_kind == "bio_process_scene" and ".connections[" in child_path:
                    reference_pack_id = "core-visual-basic"
                refs.append((child_path, reference_pack_id, child.strip()))
            else:
                refs.extend(
                    _asset_references(
                        child,
                        child_path,
                        pack_id,
                        str(current_kind) if current_kind else None,
                    )
                )
        return refs
    if isinstance(data, list):
        refs = []
        for index, child in enumerate(data):
            refs.extend(
                _asset_references(
                    child,
                    f"{path}[{index}]",
                    inherited_pack_id,
                    snapshot_kind,
                )
            )
        return refs
    return []


def _check_forbidden_rendering_paths(
    playbook: PlaybookScript,
    issues: list[PlaybookReviewIssue],
) -> None:
    raw = playbook.model_dump_json().lower()
    for pattern in _FORBIDDEN_RENDERING_PATTERNS:
        if pattern in raw:
            issues.append(
                _issue(
                    "renderer.contract_risk",
                    PlaybookIssueSeverity.ERROR,
                    "playbook",
                    f"Playbook mentions forbidden rendering path {pattern!r}.",
                    "Use only PlaybookScript consumed by the frontend Remotion renderer.",
                )
            )


def _check_lesson_plan_adherence(
    playbook: PlaybookScript,
    lesson_plan: LessonPlan,
    issues: list[PlaybookReviewIssue],
) -> None:
    evidence = _lesson_plan_evidence(playbook)
    visual_tokens = _lesson_plan_visual_tokens(playbook)
    required_facts = {
        fact_id for scene in lesson_plan.scenes for fact_id in scene.required_fact_ids
    }
    required_roles = {
        role for scene in lesson_plan.scenes for role in scene.required_visual_roles
    }

    for fact_id in sorted(required_facts):
        aliases = _LESSON_FACT_ALIASES.get(fact_id)
        if aliases is None:
            issues.append(
                _issue(
                    "lesson_plan.fact_unverifiable",
                    PlaybookIssueSeverity.WARNING,
                    f"lesson_plan.required_fact_ids.{fact_id}",
                    f"Required fact {fact_id!r} has no deterministic evidence matcher yet.",
                    (
                        "Register a deterministic fact check before treating this "
                        "fact as verified."
                    ),
                )
            )
        elif not _contains_lesson_alias(evidence, aliases):
            issues.append(
                _issue(
                    "lesson_plan.fact_missing",
                    PlaybookIssueSeverity.ERROR,
                    f"lesson_plan.required_fact_ids.{fact_id}",
                    f"Playbook does not provide evidence for required fact {fact_id!r}.",
                    "Repair the relevant scene and narration to cover this LessonPlan fact.",
                )
            )

    for role in sorted(required_roles):
        aliases = _LESSON_VISUAL_ROLE_ALIASES.get(role)
        if aliases is None:
            continue
        if not _contains_lesson_visual_alias(visual_tokens, aliases):
            issues.append(
                _issue(
                    "lesson_plan.visual_role_missing",
                    PlaybookIssueSeverity.ERROR,
                    f"lesson_plan.required_visual_roles.{role}",
                    f"Playbook does not render required visual role {role!r}.",
                    "Compile a scene containing this semantic visual role.",
                )
            )

    snapshot_kinds = {step.snapshot.kind for step in playbook.steps}
    preferred_scene_types = {
        scene.preferred_scene_type
        for scene in lesson_plan.scenes
        if scene.preferred_scene_type is not None
    }
    for scene_type in sorted(preferred_scene_types):
        accepted_kinds = _LESSON_SCENE_SNAPSHOT_KINDS.get(scene_type)
        if accepted_kinds is None:
            continue
        if snapshot_kinds.isdisjoint(accepted_kinds):
            issues.append(
                _issue(
                    "lesson_plan.scene_type_missing",
                    PlaybookIssueSeverity.ERROR,
                    f"lesson_plan.preferred_scene_type.{scene_type}",
                    f"Playbook does not contain a renderer for scene type {scene_type!r}.",
                    "Use a compatible SceneBlueprint or renderer-backed snapshot kind.",
                )
            )

    _check_lesson_plan_exact_conclusion(
        lesson_plan,
        _lesson_plan_final_evidence(playbook),
        required_facts,
        issues,
    )


def _check_lesson_plan_exact_conclusion(
    lesson_plan: LessonPlan,
    final_evidence: str,
    required_facts: set[str],
    issues: list[PlaybookReviewIssue],
) -> None:
    if "factorial_result" in required_facts:
        conclusion = re.sub(r"\s+", "", lesson_plan.expected_conclusion.casefold())
        match = re.search(r"factorial\((\d+)\)=(\d+)", conclusion)
        if match:
            n, result = match.groups()
            actual_values = _factorial_conclusion_values(final_evidence, n)
            _check_exact_numeric_conclusion(
                expected_value=float(result),
                actual_values=actual_values,
                required_marker=match.group(0),
                issues=issues,
            )
    elif {"derivative", "tangent", "slope"} <= required_facts:
        expected_values = _derivative_conclusion_values(lesson_plan.expected_conclusion)
        if expected_values:
            expected_value = expected_values[-1]
            _check_exact_numeric_conclusion(
                expected_value=expected_value,
                actual_values=_derivative_conclusion_values(final_evidence),
                required_marker=f"导数/切线斜率等于 {_format_lesson_number(expected_value)}",
                issues=issues,
            )


def _check_exact_numeric_conclusion(
    *,
    expected_value: float,
    actual_values: list[float],
    required_marker: str,
    issues: list[PlaybookReviewIssue],
) -> None:
    conflicting_values = [
        value
        for value in actual_values
        if not math.isclose(value, expected_value, rel_tol=0.0, abs_tol=1e-12)
    ]
    if conflicting_values:
        rendered_values = ", ".join(
            sorted({_format_lesson_number(value) for value in conflicting_values})
        )
        issues.append(
            _issue(
                "lesson_plan.conclusion_conflict",
                PlaybookIssueSeverity.ERROR,
                "lesson_plan.expected_conclusion",
                (
                    f"Final teaching scene states {rendered_values}, which conflicts with the "
                    f"planned conclusion {required_marker!r}."
                ),
                "Repair the final teaching scene so every explicit result matches the plan.",
            )
        )
        return

    if not any(
        math.isclose(value, expected_value, rel_tol=0.0, abs_tol=1e-12)
        for value in actual_values
    ):
        issues.append(
            _issue(
                "lesson_plan.conclusion_missing",
                PlaybookIssueSeverity.ERROR,
                "lesson_plan.expected_conclusion",
                f"Final teaching scene does not establish {required_marker!r}.",
                "Repair the final teaching scene so it explicitly states the verified conclusion.",
            )
        )


_LESSON_NUMBER_PATTERN = (
    r"(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])(?!(?:\s*)[+*/^%-])"
)
_DERIVATIVE_SUBJECT_PATTERN = (
    r"(?:f\s*['′]\s*\([^\n)]{1,24}\)|derivative|tangent(?:'s)?\s+slope|"
    r"slope\s+of\s+(?:the\s+)?tangent|导数|切线(?:的)?斜率)"
)
_DERIVATIVE_WORD_RESULT_PATTERN = re.compile(
    rf"{_DERIVATIVE_SUBJECT_PATTERN}[^。！？!?；;\n]{{0,48}}?"
    rf"(?:(?<!不)(?:等于|为|是)|\bis\b(?!\s+not\b)|\bequals\b)\s*"
    rf"({_LESSON_NUMBER_PATTERN})",
    flags=re.IGNORECASE,
)
_DERIVATIVE_EQUAL_RESULT_PATTERN = re.compile(
    rf"{_DERIVATIVE_SUBJECT_PATTERN}\s*=\s*({_LESSON_NUMBER_PATTERN})",
    flags=re.IGNORECASE,
)
_DERIVATIVE_FORMULA_RESULT_PATTERN = re.compile(
    rf"f\s*['′]\s*\([^\n)]{{1,24}}\)\s*=\s*[^\n]{{1,180}}?"
    rf"=\s*({_LESSON_NUMBER_PATTERN})",
    flags=re.IGNORECASE,
)


def _derivative_conclusion_values(evidence: str) -> list[float]:
    patterns = (
        _DERIVATIVE_WORD_RESULT_PATTERN,
        _DERIVATIVE_EQUAL_RESULT_PATTERN,
        _DERIVATIVE_FORMULA_RESULT_PATTERN,
    )
    return [
        float(match.group(1))
        for pattern in patterns
        for match in pattern.finditer(evidence)
    ]


def _factorial_conclusion_values(evidence: str, n: str) -> list[float]:
    escaped_n = re.escape(n)
    relationship = r"(?:=|等于|为|是|\bis\b|\bequals\b)"
    patterns = (
        rf"factorial\s*[（(]\s*{escaped_n}\s*[）)]\s*{relationship}\s*"
        rf"({_LESSON_NUMBER_PATTERN})",
        rf"(?<!\d){escaped_n}(?!\d)\s*!\s*{relationship}\s*"
        rf"({_LESSON_NUMBER_PATTERN})",
        rf"阶乘\s*{escaped_n}\s*{relationship}\s*({_LESSON_NUMBER_PATTERN})",
        rf"(?<!\d){escaped_n}(?!\d)\s*的阶乘\s*{relationship}\s*"
        rf"({_LESSON_NUMBER_PATTERN})",
    )
    values: list[float] = []
    for pattern in patterns:
        values.extend(
            float(match.group(1))
            for match in re.finditer(pattern, evidence, flags=re.IGNORECASE)
        )
    return values


def _format_lesson_number(value: float) -> str:
    return str(int(value)) if value.is_integer() else str(value)


def _lesson_plan_evidence(playbook: PlaybookScript) -> str:
    evidence: list[str] = [playbook.title, playbook.summary]
    for step in playbook.steps:
        evidence.extend((step.title, step.voiceover_text, step.snapshot.kind))
        _collect_lesson_snapshot_evidence(
            step.snapshot.model_dump(mode="json", exclude_none=True),
            evidence,
        )
    return " ".join(evidence).casefold()


_LESSON_VISUAL_STRUCTURAL_FIELDS = frozenset(
    {
        "active_line",
        "active_lines",
        "active_node_ids",
        "code_trace",
        "current_frame_id",
        "current_node_id",
        "curves",
        "edges",
        "frames",
        "frontier_node_ids",
        "marker_x",
        "nodes",
        "objects",
        "path_points",
        "points",
        "queue_node_ids",
        "segments",
        "trail",
        "trajectory",
        "vectors",
        "visited_node_ids",
    }
)
_LESSON_VISUAL_DRAWABLE_FIELDS = frozenset(
    {"curves", "edges", "frames", "nodes", "objects", "points", "segments", "vectors"}
)


def _lesson_plan_visual_tokens(playbook: PlaybookScript) -> set[str]:
    tokens: set[str] = set()
    for step in playbook.steps:
        tokens.add(step.snapshot.kind.casefold())
        _collect_lesson_visual_snapshot_tokens(
            step.snapshot.model_dump(mode="json", exclude_none=True),
            tokens,
        )
    return tokens


def _lesson_plan_final_evidence(playbook: PlaybookScript) -> str:
    if not playbook.steps:
        return ""
    final_step = playbook.steps[-1]
    evidence = [final_step.title, final_step.voiceover_text, final_step.snapshot.kind]
    _collect_lesson_snapshot_evidence(
        final_step.snapshot.model_dump(mode="json", exclude_none=True),
        evidence,
    )
    return "\n".join(evidence).casefold()


def _collect_lesson_snapshot_evidence(value: Any, evidence: list[str]) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if _has_lesson_semantic_value(child):
                evidence.append(str(key))
            _collect_lesson_snapshot_evidence(child, evidence)
    elif isinstance(value, list):
        for child in value:
            _collect_lesson_snapshot_evidence(child, evidence)
    elif isinstance(value, str) and value.strip():
        evidence.append(value)


def _collect_lesson_visual_snapshot_tokens(
    value: Any,
    tokens: set[str],
    *,
    inside_drawable: bool = False,
) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            normalized_key = key.casefold()
            if normalized_key == "formula_latex" and isinstance(child, str):
                if re.search(r"(?:\bm\b|m[_({]|f\s*['′])", child, flags=re.IGNORECASE):
                    tokens.add("slope")
                continue
            if normalized_key in _LESSON_VISUAL_STRUCTURAL_FIELDS:
                if _has_lesson_semantic_value(child):
                    tokens.add(normalized_key)
                if normalized_key in _LESSON_VISUAL_DRAWABLE_FIELDS:
                    _collect_lesson_visual_snapshot_tokens(
                        child,
                        tokens,
                        inside_drawable=True,
                    )
                continue
            if inside_drawable and normalized_key in {"id", "label", "semantic_role", "state"}:
                if isinstance(child, str) and child.strip():
                    _add_lesson_visual_drawable_token(child, tokens)
                continue
            if inside_drawable and normalized_key == "variables" and isinstance(child, dict):
                tokens.update(str(variable).casefold() for variable in child)
                continue
            if isinstance(child, (dict, list)):
                _collect_lesson_visual_snapshot_tokens(
                    child,
                    tokens,
                    inside_drawable=inside_drawable,
                )
    elif isinstance(value, list):
        for child in value:
            _collect_lesson_visual_snapshot_tokens(
                child,
                tokens,
                inside_drawable=inside_drawable,
            )


def _add_lesson_visual_drawable_token(value: str, tokens: set[str]) -> None:
    normalized = value.strip().casefold()
    tokens.add(normalized)
    for aliases in _LESSON_VISUAL_ROLE_ALIASES.values():
        for alias in aliases:
            normalized_alias = alias.casefold()
            if normalized_alias == "g":
                if normalized == normalized_alias:
                    tokens.add(normalized_alias)
            elif normalized_alias in normalized:
                tokens.add(normalized_alias)


def _has_lesson_semantic_value(value: Any) -> bool:
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict)):
        return bool(value)
    return value is not None


def _contains_lesson_alias(evidence: str, aliases: tuple[str, ...]) -> bool:
    return any(alias.casefold() in evidence for alias in aliases)


def _contains_lesson_visual_alias(tokens: set[str], aliases: tuple[str, ...]) -> bool:
    return any(alias.casefold() in tokens for alias in aliases)


def _tokens_for_snapshot(snapshot: Any) -> set[str]:
    kind = str(getattr(snapshot, "kind", ""))
    data = snapshot.model_dump(mode="json", exclude_none=True)
    tokens = {token for token in kind.split("_") if len(token) >= 2}
    tokens.update(_tokens_for_text(_text_payload(data)))
    if kind.startswith("algorithm"):
        tokens.add("array")
    if kind.startswith("math"):
        tokens.add("math")
    return tokens


def _text_payload(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return " ".join(_text_payload(item) for item in value.values())
    if isinstance(value, list):
        return " ".join(_text_payload(item) for item in value)
    return ""


def _tokens_for_text(text: str) -> set[str]:
    raw_tokens = re.findall(r"[a-zA-Z0-9_]+", text.lower())
    tokens = {part for token in raw_tokens for part in token.split("_") if len(part) >= 2}
    tokens.update(
        symbol.lower()
        for symbol in re.findall(r"(?<![A-Za-z])([A-Za-z])(?![A-Za-z])", text)
        if symbol.lower() not in {"a", "i"}
    )
    for segment in re.findall(r"[\u4e00-\u9fff]+", text):
        tokens.update(segment[index : index + 2] for index in range(len(segment) - 1))
    return tokens


def playbook_review_verdict_from_issues(
    issues: list[PlaybookReviewIssue],
    *,
    clean_summary: str,
    warning_summary: str,
    blocked_summary: str,
    actions: list[str] | None = None,
) -> PlaybookReviewVerdict:
    if any(issue.severity == PlaybookIssueSeverity.ERROR for issue in issues):
        status = PlaybookReviewStatus.BLOCKED
        summary = blocked_summary
    elif issues:
        status = PlaybookReviewStatus.WARNINGS
        summary = warning_summary
    else:
        status = PlaybookReviewStatus.CLEAN
        summary = clean_summary
    return PlaybookReviewVerdict(
        status=status,
        summary=summary,
        issues=issues,
        actions=actions or [],
    )


def _issue(
    code: str,
    severity: PlaybookIssueSeverity,
    path: str,
    message: str,
    suggestion: str,
    *,
    requires_repair: bool | None = None,
) -> PlaybookReviewIssue:
    return PlaybookReviewIssue(
        code=code,
        severity=severity,
        path=path,
        message=message,
        suggestion=suggestion,
        requires_repair=(
            severity == PlaybookIssueSeverity.ERROR
            if requires_repair is None
            else requires_repair
        ),
    )
