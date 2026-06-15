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
from app.domain.skills.biology_genetics.genetics_kernel import GeneticsSolution

_FPS = 30
_STEP_FRAMES = 90


def build_biology_genetics_playbook(
    run_id: str,  # noqa: ARG001
    solution: GeneticsSolution,
) -> PlaybookScript:
    snapshots = _snapshots(solution)
    steps = [
        MetaStep(
            step_id=f"biology_genetics_{index + 1:02d}",
            end_frame=(index + 1) * _STEP_FRAMES,
            title=_title(snapshot.kind),
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
        domain=TopicDomain.BIOLOGY,
        title=_playbook_title(solution.kind),
        summary="使用确定性孟德尔遗传 kernel 构建可渲染步骤。",
        steps=steps,
        parameter_controls=[],
        algorithm_id=solution.kind,
        initial_data={"parents": solution.parents},
    )


def _snapshots(
    solution: GeneticsSolution,
) -> list[
    ModelingSceneSnapshot
    | TableSceneSnapshot
    | StatsChartSceneSnapshot
    | MathFormulaSnapshot
]:
    modeling = ModelingSceneSnapshot(
        variables=[
            ModelingVariable(id="parent_1", label="亲本 1", value=solution.parents[0]),
            ModelingVariable(id="parent_2", label="亲本 2", value=solution.parents[1]),
            ModelingVariable(id="offspring", label="子代表型比例", value=solution.phenotype_ratio),
        ],
        relations=[
            ModelingRelation(source="parent_1", target="offspring", label="配子组合"),
            ModelingRelation(source="parent_2", target="offspring", label="配子组合"),
        ],
        assumptions=["显性等位基因完全显性", "不同性状独立分配"],
        formula_latex=solution.formula_latex,
        caption="把亲本基因型拆成配子，再组合成子代。",
    )
    table = TableSceneSnapshot(
        columns=["配子"] + solution.table_rows[0][1:],
        rows=solution.table_rows[1:],
        active_rows=list(range(1, len(solution.table_rows))),
        caption="Punnett 方格逐格枚举所有等概率配子组合。",
    )
    chart = StatsChartSceneSnapshot(
        chart_type="bar",
        series=[
            ChartSeries(
                label="表现型概率",
                values=[value for _label, value in solution.chart_values],
                emphasis="accent",
            )
        ],
        x_label="表现型",
        y_label="概率",
        formula_latex=solution.formula_latex,
        caption="柱高表示每类表现型的精确概率。",
    )
    formula = MathFormulaSnapshot(
        formula_latex=solution.formula_latex,
        caption=solution.answer_text,
        annotations=[
            f"{key}: {value}" for key, value in solution.probabilities.items() if value > 0
        ],
    )
    return [modeling, table, chart, formula]


def _title(kind: str) -> str:
    return {
        "modeling_scene": "建立遗传模型",
        "table_scene": "枚举 Punnett 方格",
        "stats_chart_scene": "比较表现型概率",
        "math_formula": "整理比例与概率",
    }.get(kind, "遗传推导")


def _playbook_title(kind: str) -> str:
    return {
        "monohybrid_ratio": "单因子杂交比例",
        "test_cross": "测交概率表",
        "dihybrid_ratio": "双因子杂交比例",
        "genotype_probability": "基因型概率",
        "phenotype_probability": "表现型概率",
        "punnett_table": "Punnett 方格",
    }.get(kind, "孟德尔遗传")
