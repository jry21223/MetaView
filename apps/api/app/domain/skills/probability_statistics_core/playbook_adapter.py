from __future__ import annotations

from app.domain.models.playbook import (
    ChartSeries,
    Layer,
    LayerTiming,
    MathFormulaSnapshot,
    MetaStep,
    PlaybookScript,
    StatsChartSceneSnapshot,
    TableSceneSnapshot,
)
from app.domain.models.topic import TopicDomain
from app.domain.services.playbook_quality import estimate_step_frames
from app.domain.skills.probability_statistics_core.statistics_kernel import (
    ProbabilityStatisticsSolution,
)

_FPS = 30
_STEP_FRAMES = 90


def build_probability_statistics_playbook(
    run_id: str,  # noqa: ARG001
    solution: ProbabilityStatisticsSolution,
) -> PlaybookScript:
    snapshots = _snapshots(solution)
    steps: list[MetaStep] = []
    frame_cursor = 0
    for index, snapshot in enumerate(snapshots):
        voiceover = getattr(snapshot, "caption", None) or solution.answer_text
        frame_cursor += max(_STEP_FRAMES, estimate_step_frames(voiceover, _FPS))
        steps.append(
            MetaStep(
                step_id=f"probability_statistics_core_{index + 1:02d}",
                end_frame=frame_cursor,
                title=_title(snapshot.kind),
                voiceover_text=voiceover,
                animation_hint=snapshot.kind,
                snapshot=snapshot,
                layers=[Layer(timing=LayerTiming(), body=snapshot)],
                tokens=[],
            )
        )
    return PlaybookScript(
        fps=_FPS,
        total_frames=frame_cursor,
        domain=TopicDomain.MATH,
        title=_playbook_title(solution.kind),
        summary=f"使用确定性概率统计 kernel 得到结论：{solution.answer_text}",
        steps=steps,
        parameter_controls=[],
        algorithm_id=solution.kind,
        initial_data={},
    )


def _snapshots(
    solution: ProbabilityStatisticsSolution,
) -> list[TableSceneSnapshot | StatsChartSceneSnapshot | MathFormulaSnapshot]:
    table = TableSceneSnapshot(
        columns=_columns(solution.kind, solution.table_rows),
        rows=solution.table_rows,
        active_rows=list(range(len(solution.table_rows))),
        caption="把输入量和中间量整理成可检查表格。",
    )
    chart = StatsChartSceneSnapshot(
        chart_type="bar" if solution.kind != "z_score_normal_cdf" else "distribution",
        series=[
            ChartSeries(
                label="值",
                values=[value for _label, value in solution.chart_values],
                emphasis="accent",
            )
        ],
        x_label="项目",
        y_label="数值/概率",
        categories=(
            [label for label, _value in solution.chart_values]
            if solution.kind != "z_score_normal_cdf"
            else []
        ),
        formula_latex=solution.formula_latex,
        caption="用图形比较关键数值的大小。",
    )
    formula = MathFormulaSnapshot(
        formula_latex=solution.formula_latex,
        caption=f"概率计算结论：{solution.answer_text}",
        annotations=[f"{key}={value}" for key, value in solution.results.items()],
    )
    return [table, chart, formula]


def _columns(kind: str, rows: list[list[str]]) -> list[str]:
    if kind == "contingency_table":
        width = max((len(row) for row in rows), default=2)
        return ["类别", *[f"C{index}" for index in range(1, width)]]
    return ["项目", "值"]


def _title(kind: str) -> str:
    return {
        "table_scene": "整理数据",
        "stats_chart_scene": "比较数值",
        "math_formula": "概率结论",
    }.get(kind, "概率统计")


def _playbook_title(kind: str) -> str:
    return {
        "descriptive_statistics": "描述统计",
        "probability_union": "概率加法公式",
        "conditional_probability": "条件概率",
        "contingency_table": "列联表合计",
        "binomial_probability": "二项分布概率",
        "z_score_normal_cdf": "标准正态 z 分数",
    }.get(kind, "概率统计核心")
