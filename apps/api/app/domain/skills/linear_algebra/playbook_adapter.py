from __future__ import annotations

import sympy as sp

from app.domain.models.playbook import (
    Layer,
    LayerTiming,
    MathFormulaSnapshot,
    MatrixSceneSnapshot,
    MetaStep,
    PlaybookScript,
    TableSceneSnapshot,
)
from app.domain.models.topic import TopicDomain
from app.domain.skills.linear_algebra.problem_spec import LinearAlgebraProblemSpec

_FPS = 30
_STEP_FRAMES = 95


def build_linear_algebra_playbook(
    run_id: str,  # noqa: ARG001
    spec: LinearAlgebraProblemSpec,
) -> PlaybookScript:
    matrix = sp.Matrix(spec.matrix)
    if spec.task == "solve_system":
        return _build_solve_system(spec, matrix)
    if spec.task == "eigen_basic":
        return _build_eigen(spec, matrix)
    if spec.task == "det_rank":
        return _build_det_rank(spec, matrix)
    return _build_rref(spec, matrix)


def _build_solve_system(spec: LinearAlgebraProblemSpec, matrix: sp.Matrix) -> PlaybookScript:
    rhs = sp.Matrix(spec.rhs or [])
    augmented = matrix.row_join(rhs) if rhs.rows == matrix.rows else matrix
    rref, pivots = augmented.rref()
    variables = spec.variable_names or [f"x_{i + 1}" for i in range(matrix.cols)]
    solution = (
        sp.solve(
            [
                sp.Eq(
                    sum(matrix[row, col] * sp.Symbol(variables[col]) for col in range(matrix.cols)),
                    rhs[row],
                )
                for row in range(matrix.rows)
            ],
            [sp.Symbol(name) for name in variables],
            dict=True,
        )
        if rhs.rows == matrix.rows
        else []
    )
    snapshots = [
        MatrixSceneSnapshot(
            matrix=_cells(augmented),
            col_labels=[*variables, "b"],
            operation_label="增广矩阵",
            caption="把方程组转换成矩阵形式。",
        ),
        MatrixSceneSnapshot(
            matrix=_cells(rref),
            col_labels=[*variables, "b"],
            active_columns=list(pivots),
            operation_label="RREF",
            caption="高斯消元得到行最简形。",
        ),
        MathFormulaSnapshot(
            formula_latex=_solution_latex(solution),
            caption="从行最简形读出变量取值。",
        ),
        TableSceneSnapshot(
            columns=["变量", "值"],
            rows=_solution_rows(solution, variables),
            active_columns=[1],
            caption="最终解表。",
        ),
    ]
    return _script(spec, "线性方程组", snapshots)


def _build_eigen(spec: LinearAlgebraProblemSpec, matrix: sp.Matrix) -> PlaybookScript:
    lam = sp.Symbol("lambda")
    char_poly = matrix.charpoly(lam).as_expr()
    eigenvalues = matrix.eigenvals()
    snapshots = [
        MatrixSceneSnapshot(
            matrix=_cells(matrix), operation_label="原矩阵", caption="先确认矩阵对象。"
        ),
        MathFormulaSnapshot(
            formula_latex=r"\det(A-\lambda I)=0",
            caption="特征值来自特征方程。",
        ),
        MathFormulaSnapshot(
            formula_latex=rf"\det(A-\lambda I)={sp.latex(char_poly)}",
            caption="展开特征多项式。",
        ),
        TableSceneSnapshot(
            columns=["特征值", "代数重数"],
            rows=[[sp.latex(value), mult] for value, mult in eigenvalues.items()],
            active_columns=[0],
            caption="求解特征方程得到特征值。",
        ),
        MathFormulaSnapshot(
            formula_latex=_eigen_latex(eigenvalues),
            caption="把特征值集合整理成最终结果。",
        ),
    ]
    return _script(spec, "矩阵特征值", snapshots)


def _build_det_rank(spec: LinearAlgebraProblemSpec, matrix: sp.Matrix) -> PlaybookScript:
    det = matrix.det() if matrix.rows == matrix.cols else None
    rank = matrix.rank()
    snapshots = [
        MatrixSceneSnapshot(
            matrix=_cells(matrix), operation_label="原矩阵", caption="检查矩阵维度。"
        ),
        MathFormulaSnapshot(
            formula_latex=rf"\operatorname{{rank}}(A)={rank}",
            caption="秩等于线性无关行/列的最大数量。",
        ),
        MathFormulaSnapshot(
            formula_latex=rf"\det(A)={sp.latex(det)}"
            if det is not None
            else r"\det(A)\ \text{未定义}",
            caption="只有方阵才有行列式。",
        ),
        TableSceneSnapshot(
            columns=["指标", "值"],
            rows=[["rank", rank], ["det", sp.latex(det) if det is not None else "N/A"]],
            active_rows=[0, 1],
            caption="汇总矩阵核心指标。",
        ),
    ]
    return _script(spec, "矩阵秩与行列式", snapshots)


def _build_rref(spec: LinearAlgebraProblemSpec, matrix: sp.Matrix) -> PlaybookScript:
    rref, pivots = matrix.rref()
    snapshots = [
        MatrixSceneSnapshot(
            matrix=_cells(matrix), operation_label="原矩阵", caption="先写出待消元矩阵。"
        ),
        MatrixSceneSnapshot(
            matrix=_cells(matrix),
            active_cells=[(0, 0)] if matrix.rows and matrix.cols else [],
            operation_label="选择主元",
            caption="从第一列选择主元并准备消元。",
        ),
        MatrixSceneSnapshot(
            matrix=_cells(rref),
            active_columns=list(pivots),
            operation_label="RREF",
            caption="执行行变换后得到行最简形。",
        ),
        TableSceneSnapshot(
            columns=["主元列", "说明"],
            rows=[[pivot, "pivot"] for pivot in pivots],
            active_rows=list(range(len(pivots))),
            caption="主元列决定列空间和自由变量结构。",
        ),
        MathFormulaSnapshot(
            formula_latex=rf"\operatorname{{rref}}(A)={sp.latex(rref)}",
            caption="最终矩阵是原矩阵的行等价标准形式。",
        ),
    ]
    return _script(spec, "矩阵行变换", snapshots)


def _script(
    spec: LinearAlgebraProblemSpec,
    title: str,
    snapshots: list[MatrixSceneSnapshot | MathFormulaSnapshot | TableSceneSnapshot],
) -> PlaybookScript:
    while len(snapshots) < 5:
        snapshots.append(snapshots[-1])
    steps: list[MetaStep] = []
    for index, snapshot in enumerate(snapshots[:6]):
        steps.append(
            MetaStep(
                step_id=f"linear_algebra_{index + 1:02d}",
                end_frame=(index + 1) * _STEP_FRAMES,
                title=_step_title(index, snapshot),
                voiceover_text=getattr(snapshot, "caption", None) or "执行线性代数步骤。",
                animation_hint=snapshot.kind,
                snapshot=snapshot,
                layers=[Layer(timing=LayerTiming(), body=snapshot)],
                tokens=[],
            )
        )
    return PlaybookScript(
        fps=_FPS,
        total_frames=len(steps) * _STEP_FRAMES,
        domain=TopicDomain.MATH,
        title=title,
        summary="使用确定性矩阵 kernel 构建可渲染的线性代数步骤。",
        steps=steps,
        parameter_controls=[],
        algorithm_id=None,
        initial_data={},
    )


def _cells(matrix: sp.Matrix) -> list[list[str | int | float]]:
    return [[_cell(matrix[row, col]) for col in range(matrix.cols)] for row in range(matrix.rows)]


def _cell(value: sp.Expr) -> str | int | float:
    value = sp.simplify(value)
    if value.is_Integer:
        return int(value)
    if value.is_Rational:
        return str(value)
    try:
        number = float(value)
        if number.is_integer():
            return int(number)
        return number
    except Exception:  # noqa: BLE001
        return sp.latex(value)


def _solution_latex(solution: list[dict[sp.Symbol, sp.Expr]]) -> str:
    if not solution:
        return r"\text{无唯一解或需要进一步讨论}"
    parts = [rf"{sp.latex(symbol)}={sp.latex(value)}" for symbol, value in solution[0].items()]
    return r",\ ".join(parts)


def _solution_rows(
    solution: list[dict[sp.Symbol, sp.Expr]], variables: list[str]
) -> list[list[str | int | float]]:
    if not solution:
        return [[name, "未定"] for name in variables]
    values = solution[0]
    return [[name, sp.latex(values.get(sp.Symbol(name), "未定"))] for name in variables]


def _eigen_latex(eigenvalues: dict[sp.Expr, int]) -> str:
    values = ", ".join(sp.latex(value) for value in eigenvalues)
    return rf"\lambda \in \left\{{{values}\right\}}"


def _step_title(
    index: int, snapshot: MatrixSceneSnapshot | MathFormulaSnapshot | TableSceneSnapshot
) -> str:
    if snapshot.kind == "matrix_scene" and snapshot.operation_label:
        return snapshot.operation_label
    return ["建立对象", "写出条件", "执行计算", "读取结果", "总结"][min(index, 4)]
