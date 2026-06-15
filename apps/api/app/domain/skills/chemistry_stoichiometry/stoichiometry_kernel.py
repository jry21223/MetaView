from __future__ import annotations

from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

from app.domain.skills.chemistry_stoichiometry.equation_parser import (
    balance_equation,
    format_balanced_equation,
    molar_mass,
)
from app.domain.skills.chemistry_stoichiometry.problem_spec import (
    ChemistryStoichiometryProblemSpec,
)


@dataclass(frozen=True)
class ChemistryValue:
    display: str
    numeric: float | None = None
    unit: str | None = None


@dataclass(frozen=True)
class ChemistryStep:
    title: str
    formula_latex: str
    caption: str


@dataclass(frozen=True)
class ChemistryStoichiometrySolution:
    kind: str
    steps: list[ChemistryStep]
    values: dict[str, ChemistryValue]
    answer_text: str
    answer_latex: str
    table_rows: list[list[str | int | float]]
    chart_values: list[tuple[str, float]] = field(default_factory=list)


def solve_stoichiometry(
    spec: ChemistryStoichiometryProblemSpec,
) -> ChemistryStoichiometrySolution:
    if spec.kind == "balance_equation":
        return _solve_balance(spec)
    if spec.kind == "molar_mass":
        return _solve_molar_mass(spec)
    if spec.kind == "limiting_reagent":
        return _solve_limiting_reagent(spec)
    if spec.kind == "solution_concentration":
        return _solve_solution_concentration(spec)
    raise ValueError("unsupported_stoichiometry_kind")


def _solve_balance(spec: ChemistryStoichiometryProblemSpec) -> ChemistryStoichiometrySolution:
    if not spec.equation:
        raise ValueError("missing_equation")
    coefficients, reactants, products = balance_equation(spec.equation)
    answer = format_balanced_equation(coefficients, reactants, products)
    compounds = [*reactants, *products]
    return ChemistryStoichiometrySolution(
        kind=spec.kind,
        steps=[
            ChemistryStep(
                "列出反应物和生成物",
                r"\text{reactants}\rightarrow\text{products}",
                "先保留化学式不变。",
            ),
            ChemistryStep("守恒每种元素", r"A\vec{x}=0", "用元素守恒建立线性方程。"),
            ChemistryStep("取最小整数比", answer, "把 nullspace 系数化为最小正整数。"),
        ],
        values={"balanced_equation": ChemistryValue(answer)},
        answer_text=answer,
        answer_latex=answer.replace("->", r"\rightarrow"),
        table_rows=[
            [compound, coefficient]
            for compound, coefficient in zip(compounds, coefficients, strict=True)
        ],
    )


def _solve_molar_mass(spec: ChemistryStoichiometryProblemSpec) -> ChemistryStoichiometrySolution:
    if not spec.compounds:
        raise ValueError("missing_compound")
    compound = spec.compounds[0]
    mass = molar_mass(compound)
    display = f"{_fmt(mass)} g/mol"
    return ChemistryStoichiometrySolution(
        kind=spec.kind,
        steps=[
            ChemistryStep("解析化学式", compound, "统计化学式中每种元素的个数。"),
            ChemistryStep("查原子量", r"M=\sum n_i A_i", "用常用原子量表逐项相加。"),
            ChemistryStep("得到摩尔质量", display, "结果带单位 g/mol。"),
        ],
        values={"molar_mass": ChemistryValue(display=display, numeric=mass, unit="g/mol")},
        answer_text=f"{compound} 的摩尔质量为 {display}。",
        answer_latex=rf"M({compound})={_fmt(mass)}\,\text{{g/mol}}",
        table_rows=[[compound, display]],
    )


def _solve_limiting_reagent(
    spec: ChemistryStoichiometryProblemSpec,
) -> ChemistryStoichiometrySolution:
    if not spec.equation:
        raise ValueError("missing_equation")
    coefficients, reactants, products = balance_equation(spec.equation)
    product = spec.query.get("product") or products[0]
    product_index = [*reactants, *products].index(product)
    product_coeff = coefficients[product_index]
    reactant_data = []
    for index, compound in enumerate(reactants):
        mass_key = f"mass:{compound}"
        if mass_key not in spec.quantities:
            raise ValueError(f"missing_mass:{compound}")
        mass_g = float(spec.quantities[mass_key].value)
        moles = mass_g / molar_mass(compound)
        available_ratio = moles / coefficients[index]
        reactant_data.append((compound, mass_g, moles, available_ratio, coefficients[index]))
    limiting = min(reactant_data, key=lambda item: item[3])
    excess = max(reactant_data, key=lambda item: item[3])
    product_moles = limiting[3] * product_coeff
    theoretical_yield = product_moles * molar_mass(product)
    table_rows = [
        [compound, coeff, _fmt(mass), _fmt(moles), _fmt(ratio)]
        for compound, mass, moles, ratio, coeff in reactant_data
    ]
    return ChemistryStoichiometrySolution(
        kind=spec.kind,
        steps=[
            ChemistryStep(
                "先配平方程",
                format_balanced_equation(coefficients, reactants, products),
                "系数给出物质的量比例。",
            ),
            ChemistryStep("质量转物质的量", r"n=m/M", "把每个反应物质量转成 mol。"),
            ChemistryStep("比较可反应份数", r"n_i/\nu_i", "最小份数对应限量反应物。"),
            ChemistryStep("换算理论产量", r"m=nM", "由限量反应物决定产品最大质量。"),
        ],
        values={
            "limiting_reagent": ChemistryValue(limiting[0]),
            "excess_reagent": ChemistryValue(excess[0]),
            "theoretical_yield": ChemistryValue(
                display=f"{_fmt(theoretical_yield)} g {product}",
                numeric=theoretical_yield,
                unit=f"g {product}",
            ),
        },
        answer_text=(
            f"限量反应物是 {limiting[0]}，理论产量为 "
            f"{_fmt(theoretical_yield)} g {product}。"
        ),
        answer_latex=rf"m_{{{product}}}={_fmt(theoretical_yield)}\,\text{{g}}",
        table_rows=table_rows,
        chart_values=[(compound, ratio) for compound, _, _, ratio, _ in reactant_data],
    )


def _solve_solution_concentration(
    spec: ChemistryStoichiometryProblemSpec,
) -> ChemistryStoichiometrySolution:
    amount = float(spec.quantities["amount_mol"].value)
    volume = float(spec.quantities["volume_l"].value)
    if volume <= 0:
        raise ValueError("volume_must_be_positive")
    concentration = amount / volume
    solute = spec.query.get("solute") or (spec.compounds[0] if spec.compounds else "solute")
    display = f"{_fmt(concentration)} mol/L"
    return ChemistryStoichiometrySolution(
        kind=spec.kind,
        steps=[
            ChemistryStep("识别溶质", solute, "题目给出溶质和物质的量。"),
            ChemistryStep("读取体积", "V", "溶液体积用 L 表示。"),
            ChemistryStep("计算浓度", r"c=n/V", "物质的量浓度等于 mol 除以 L。"),
        ],
        values={
            "concentration": ChemistryValue(
                display=display,
                numeric=concentration,
                unit="mol/L",
            )
        },
        answer_text=f"{solute} 的物质的量浓度为 {display}。",
        answer_latex=rf"c=\frac{{n}}{{V}}={_fmt(concentration)}\,\text{{mol/L}}",
        table_rows=[[solute, amount, volume, display]],
    )


def _fmt(value: float | Decimal) -> str:
    decimal = Decimal(str(value)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP).normalize()
    if decimal == decimal.to_integral():
        return str(int(decimal))
    return format(decimal, "f")
