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
from app.domain.skills.chemistry_stoichiometry.stoichiometry_kernel import (
    ChemistryStoichiometrySolution,
)

_FPS = 30
_STEP_FRAMES = 90


def build_chemistry_stoichiometry_playbook(
    run_id: str,  # noqa: ARG001
    solution: ChemistryStoichiometrySolution,
) -> PlaybookScript:
    snapshots = _snapshots(solution)
    steps = [
        MetaStep(
            step_id=f"chemistry_stoichiometry_{index + 1:02d}",
            end_frame=(index + 1) * _STEP_FRAMES,
            title=_title(index, snapshot),
            voiceover_text=getattr(snapshot, "caption", None) or solution.answer_text,
            animation_hint=snapshot.kind,
            snapshot=snapshot,
            layers=[Layer(timing=LayerTiming(), body=snapshot)],
            tokens=[],
        )
        for index, snapshot in enumerate(snapshots)
    ]
    return PlaybookScript(
        fps=_FPS,
        total_frames=len(steps) * _STEP_FRAMES,
        domain=TopicDomain.CHEMISTRY,
        title=_playbook_title(solution.kind),
        summary="使用确定性化学计量 kernel 构建可渲染的步骤。",
        steps=steps,
        parameter_controls=[],
        algorithm_id=None,
        initial_data={},
    )


def _snapshots(
    solution: ChemistryStoichiometrySolution,
) -> list[MathFormulaSnapshot | TableSceneSnapshot | StatsChartSceneSnapshot]:
    formula = MathFormulaSnapshot(
        formula_latex=solution.answer_latex,
        caption=solution.answer_text,
        annotations=[step.formula_latex for step in solution.steps],
    )
    table = TableSceneSnapshot(
        columns=_columns(solution.kind),
        rows=solution.table_rows,
        active_rows=list(range(len(solution.table_rows))),
        caption="用表格展示系数、物质的量或计算结果。",
    )
    if solution.chart_values:
        chart = StatsChartSceneSnapshot(
            chart_type="bar",
            series=[
                ChartSeries(
                    label="可反应份数",
                    values=[value for _, value in solution.chart_values],
                    emphasis="accent",
                )
            ],
            x_label="反应物",
            y_label="n/系数",
            formula_latex=r"\min(n_i/\nu_i)",
            caption="柱子越短，越先耗尽，是限量反应物。",
        )
        return [formula, table, chart, formula]
    return [formula, table, formula]


def _columns(kind: str) -> list[str]:
    return {
        "balance_equation": ["物质", "系数"],
        "molar_mass": ["化合物", "摩尔质量"],
        "limiting_reagent": ["反应物", "系数", "质量(g)", "物质的量(mol)", "可反应份数"],
        "solution_concentration": ["溶质", "n(mol)", "V(L)", "c(mol/L)"],
    }.get(kind, ["项目", "值"])


def _title(
    index: int,
    snapshot: MathFormulaSnapshot | TableSceneSnapshot | StatsChartSceneSnapshot,
) -> str:
    if snapshot.kind == "table_scene":
        return "整理计量关系"
    if snapshot.kind == "stats_chart_scene":
        return "比较限量反应物"
    return ["建立公式", "代入计算", "得到答案"][min(index, 2)]


def _playbook_title(kind: str) -> str:
    return {
        "balance_equation": "化学方程式配平",
        "molar_mass": "摩尔质量计算",
        "limiting_reagent": "限量反应物与理论产量",
        "solution_concentration": "物质的量浓度",
    }.get(kind, "化学计量")
