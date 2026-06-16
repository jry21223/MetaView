from __future__ import annotations

from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

from app.domain.skills.geography_climate.climate_fixture import CLIMATE_FIXTURES, MONTH_LABELS
from app.domain.skills.geography_climate.problem_spec import GeographyClimateProblemSpec


@dataclass(frozen=True)
class ClimateSolution:
    kind: str
    station_ids: list[str]
    station_labels: list[str]
    metrics: dict[str, Decimal]
    extremes: dict[str, str]
    table_rows: list[list[str]]
    chart_values: list[tuple[str, float]]
    formula_latex: str
    answer_text: str
    assumptions: list[str] = field(default_factory=list)


def solve_climate_problem(spec: GeographyClimateProblemSpec) -> ClimateSolution:
    _raise_if_unsupported(spec.assumptions)
    stations = [_station(station_id) for station_id in spec.station_ids]
    if spec.kind == "station_comparison":
        return _solve_comparison(spec, stations)
    if spec.kind == "anomaly_from_normal":
        return _solve_anomaly(spec, stations[0])
    return _solve_single_station(spec, stations[0])


def _raise_if_unsupported(assumptions: list[str]) -> None:
    for assumption in assumptions:
        if assumption.startswith("unsupported:"):
            raise ValueError(assumption)


def _station(station_id: str) -> dict[str, object]:
    station = CLIMATE_FIXTURES.get(station_id)
    if station is None:
        raise ValueError(f"unknown climate fixture station: {station_id}")
    return station


def _solve_single_station(
    spec: GeographyClimateProblemSpec,
    station: dict[str, object],
) -> ClimateSolution:
    station_id = spec.station_ids[0]
    temps = _series(station, "temperature_c")
    precip = _series(station, "precipitation_mm")
    metrics = {
        "annual_temp_mean_c": _mean(temps),
        "annual_precip_total_mm": sum(precip),
    }
    extremes = _extremes(temps, precip)
    rows = [
        [MONTH_LABELS[index], _display(temps[index]), _display(precip[index])]
        for index in range(12)
    ]
    answer_text = (
        f"{station_id} 年均温 {_display(metrics['annual_temp_mean_c'])}C，"
        f"年降水 {_display(metrics['annual_precip_total_mm'])}mm；"
        f"最热 {extremes['warmest_month']}，最冷 {extremes['coldest_month']}，"
        f"最湿 {extremes['wettest_month']}，最干 {extremes['driest_month']}"
    )
    return ClimateSolution(
        kind=spec.kind,
        station_ids=[station_id],
        station_labels=[str(station["label"])],
        metrics=metrics,
        extremes=extremes,
        table_rows=rows,
        chart_values=[
            (MONTH_LABELS[index], float(temps[index])) for index in range(12)
        ],
        formula_latex=(
            r"\bar{T}_{annual}=\frac{\sum_{m=1}^{12}T_m}{12},\quad "
            r"P_{annual}=\sum_{m=1}^{12}P_m"
        ),
        answer_text=answer_text,
        assumptions=spec.assumptions,
    )


def _solve_comparison(
    spec: GeographyClimateProblemSpec,
    stations: list[dict[str, object]],
) -> ClimateSolution:
    rows: list[list[str]] = []
    metrics: dict[str, Decimal] = {}
    chart_values: list[tuple[str, float]] = []
    station_labels = [str(station["label"]) for station in stations]
    for station_id, station in zip(spec.station_ids, stations, strict=True):
        temps = _series(station, "temperature_c")
        precip = _series(station, "precipitation_mm")
        temp_mean = _mean(temps)
        precip_total = sum(precip)
        metrics[f"{station_id}_annual_temp_mean_c"] = temp_mean
        metrics[f"{station_id}_annual_precip_total_mm"] = precip_total
        rows.append([station_id, _display(temp_mean), _display(precip_total)])
        chart_values.append((station_id, float(temp_mean)))
    first = spec.station_ids[0]
    second = spec.station_ids[1]
    temp_delta = (
        metrics[f"{second}_annual_temp_mean_c"]
        - metrics[f"{first}_annual_temp_mean_c"]
    )
    precip_delta = (
        metrics[f"{second}_annual_precip_total_mm"]
        - metrics[f"{first}_annual_precip_total_mm"]
    )
    metrics["temperature_delta_c"] = _clean_decimal(temp_delta)
    metrics["precipitation_delta_mm"] = _clean_decimal(precip_delta)
    return ClimateSolution(
        kind=spec.kind,
        station_ids=spec.station_ids,
        station_labels=station_labels,
        metrics=metrics,
        extremes={},
        table_rows=rows,
        chart_values=chart_values,
        formula_latex=r"\Delta=\text{station}_2-\text{station}_1",
        answer_text=(
            f"{second} 相对 {first} 年均温差 {_display(temp_delta)}C，"
            f"年降水差 {_display(precip_delta)}mm"
        ),
        assumptions=spec.assumptions,
    )


def _solve_anomaly(
    spec: GeographyClimateProblemSpec,
    station: dict[str, object],
) -> ClimateSolution:
    if spec.month is None or spec.variable is None or spec.observed_value is None:
        raise ValueError("anomaly requires month, variable, and observed value")
    normal = _series(station, spec.variable)[spec.month - 1]
    anomaly = _clean_decimal(spec.observed_value - normal)
    key = "anomaly_c" if spec.variable == "temperature_c" else "anomaly_mm"
    unit = "C" if spec.variable == "temperature_c" else "mm"
    month_label = MONTH_LABELS[spec.month - 1]
    return ClimateSolution(
        kind=spec.kind,
        station_ids=spec.station_ids,
        station_labels=[str(station["label"])],
        metrics={key: anomaly, "normal": normal, "observed": spec.observed_value},
        extremes={},
        table_rows=[
            [month_label, "normal", _display(normal)],
            [month_label, "observed", _display(spec.observed_value)],
            [month_label, "anomaly", _display(anomaly)],
        ],
        chart_values=[
            ("normal", float(normal)),
            ("observed", float(spec.observed_value)),
            ("anomaly", float(anomaly)),
        ],
        formula_latex=r"\text{anomaly}=\text{observed}-\text{normal}",
        answer_text=f"{month_label}距平={_display(anomaly)}{unit}",
        assumptions=spec.assumptions,
    )


def _series(station: dict[str, object], key: str) -> list[Decimal]:
    values = station[key]
    if not isinstance(values, list) or len(values) != 12:
        raise ValueError("climate fixture must contain 12 monthly values")
    return [Decimal(str(value)) for value in values]


def _mean(values: list[Decimal]) -> Decimal:
    return _clean_decimal(sum(values) / Decimal("12"))


def _extremes(temps: list[Decimal], precip: list[Decimal]) -> dict[str, str]:
    warmest = max(range(12), key=lambda index: temps[index])
    coldest = min(range(12), key=lambda index: temps[index])
    wettest = max(range(12), key=lambda index: precip[index])
    driest = min(range(12), key=lambda index: precip[index])
    return {
        "warmest_month": MONTH_LABELS[warmest],
        "coldest_month": MONTH_LABELS[coldest],
        "wettest_month": MONTH_LABELS[wettest],
        "driest_month": MONTH_LABELS[driest],
    }


def _clean_decimal(value: Decimal) -> Decimal:
    if value == value.to_integral_value():
        return value.quantize(Decimal("1"))
    return value.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP).normalize()


def _display(value: Decimal) -> str:
    return format(_clean_decimal(value), "f")
