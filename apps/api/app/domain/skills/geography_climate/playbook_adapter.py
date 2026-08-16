from __future__ import annotations

from app.domain.models.playbook import (
    ChartSeries,
    Layer,
    LayerTiming,
    MathFormulaSnapshot,
    MetaStep,
    ModelingRelation,
    ModelingSceneSnapshot,
    ModelingVariable,
    PlaybookScript,
    StatsChartSceneSnapshot,
    TableSceneSnapshot,
)
from app.domain.models.topic import TopicDomain
from app.domain.services.playbook_quality import estimate_step_frames
from app.domain.skills.geography_climate.climate_kernel import ClimateSolution

_FPS = 30
_STEP_FRAMES = 90


def build_geography_climate_playbook(
    run_id: str,  # noqa: ARG001
    solution: ClimateSolution,
) -> PlaybookScript:
    snapshots = _snapshots(solution)
    steps: list[MetaStep] = []
    frame_cursor = 0
    for index, snapshot in enumerate(snapshots):
        voiceover_text = getattr(snapshot, "caption", None) or solution.answer_text
        frame_cursor += max(_STEP_FRAMES, estimate_step_frames(voiceover_text, _FPS))
        steps.append(
            MetaStep(
                step_id=f"geography_climate_{index + 1:02d}",
                end_frame=frame_cursor,
                title=_title(snapshot.kind),
                voiceover_text=voiceover_text,
                animation_hint=snapshot.kind,
                snapshot=snapshot,
                layers=[Layer(timing=LayerTiming(), body=snapshot)],
                tokens=[],
            )
        )
    return PlaybookScript(
        fps=_FPS,
        total_frames=frame_cursor,
        domain=TopicDomain.GEOGRAPHY,
        title=_playbook_title(solution.kind),
        summary="使用离线教学气候常年值 fixture 构建可渲染步骤。",
        steps=steps,
        parameter_controls=[],
        algorithm_id=solution.kind,
        initial_data={"stations": solution.station_ids, "fixture": ["offline_educational_normals"]},
    )


def _snapshots(
    solution: ClimateSolution,
) -> list[
    ModelingSceneSnapshot
    | TableSceneSnapshot
    | StatsChartSceneSnapshot
    | MathFormulaSnapshot
]:
    modeling = ModelingSceneSnapshot(
        variables=[
            ModelingVariable(id=station_id, label=station_id, value=label)
            for station_id, label in zip(solution.station_ids, solution.station_labels, strict=True)
        ],
        relations=[
            ModelingRelation(
                source=solution.station_ids[0],
                target="offline_fixture",
                label="monthly normals",
            )
        ]
        if solution.station_ids
        else [],
        assumptions=["offline educational normal", "not live NOAA data"],
        formula_latex=solution.formula_latex,
        caption="站点数据来自仓库内离线教学 fixture，不是实时气候查询。",
    )
    table = TableSceneSnapshot(
        columns=_columns(solution.kind),
        rows=solution.table_rows,
        active_rows=list(range(len(solution.table_rows))),
        caption="逐月或逐站列出常年值与派生量。",
    )
    chart = StatsChartSceneSnapshot(
        chart_type="line" if solution.kind == "station_normals_summary" else "bar",
        series=[
            ChartSeries(
                label="气候值",
                values=[value for _label, value in solution.chart_values],
                emphasis="accent",
            )
        ],
        x_label="月份/站点",
        y_label="温度或降水",
        formula_latex=solution.formula_latex,
        caption="用月序列或站点柱形图显示气候常年值。",
    )
    formula = MathFormulaSnapshot(
        formula_latex=solution.formula_latex,
        caption=solution.answer_text,
        annotations=[f"{key}={value}" for key, value in solution.metrics.items()],
    )
    return [modeling, table, chart, formula]


def _columns(kind: str) -> list[str]:
    if kind == "station_comparison":
        return ["站点", "年均温(C)", "年降水(mm)"]
    if kind == "anomaly_from_normal":
        return ["月份", "类型", "值"]
    return ["月份", "气温(C)", "降水(mm)"]


def _title(kind: str) -> str:
    return {
        "modeling_scene": "数据来源",
        "table_scene": "整理常年值",
        "stats_chart_scene": "查看月序列",
        "math_formula": "计算指标",
    }.get(kind, "气候常年值")


def _playbook_title(kind: str) -> str:
    return {
        "station_normals_summary": "气候常年值摘要",
        "annual_temperature_mean": "年均温计算",
        "annual_precipitation_total": "年降水总量",
        "warmest_coldest_month": "最热最冷月份",
        "wettest_driest_month": "最湿最干月份",
        "station_comparison": "站点气候对比",
        "anomaly_from_normal": "距平计算",
    }.get(kind, "地理气候")
