from __future__ import annotations

import re
from decimal import Decimal

from app.domain.skills.geography_climate.problem_spec import GeographyClimateProblemSpec

_NUMBER = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)"
_UNSUPPORTED_TERMS = (
    "实时",
    "live",
    "下载",
    "noaa api",
    "地图",
    "map",
    "插值",
    "interpolation",
    "趋势",
    "trend",
)
_CLIMATE_CONTEXT_TERMS = (
    "气候",
    "常年值",
    "站点",
    "降水",
    "降水量",
    "气温",
    "温度",
    "距平",
    "年均温",
    "年平均气温",
    "年降水",
    "最热",
    "最冷",
    "最湿",
    "最干",
    "anomaly",
    "normal",
    "climate",
    "station",
)


def try_extract_geography_climate(prompt: str) -> GeographyClimateProblemSpec | None:
    text = _normalize(prompt)
    if not _has_climate_context(text):
        return None
    station_ids = _station_ids(text)
    if not station_ids:
        return None
    kind = _kind(text, station_ids)
    month = _month(text)
    variable, observed_value = _observed(text)
    if kind == "anomaly_from_normal" and (
        month is None
        or not 1 <= month <= 12
        or variable is None
        or observed_value is None
    ):
        return None
    assumptions = ["offline_educational_normals"]
    unsupported = [term for term in _UNSUPPORTED_TERMS if term.lower() in text.lower()]
    if unsupported:
        assumptions.append("unsupported:" + ",".join(unsupported))
    return GeographyClimateProblemSpec(
        kind=kind,
        station_ids=station_ids[:2] if kind == "station_comparison" else station_ids[:1],
        month=month,
        variable=variable,
        observed_value=observed_value,
        query=_query(kind),
        assumptions=assumptions,
    )


def _normalize(prompt: str) -> str:
    return (
        prompt.replace("（", "(")
        .replace("）", ")")
        .replace("，", ",")
        .replace("。", "")
        .replace("℃", "C")
    )


def _has_climate_context(text: str) -> bool:
    lowered = text.lower()
    return any(term in lowered for term in _CLIMATE_CONTEXT_TERMS)


def _station_ids(text: str) -> list[str]:
    ids = re.findall(r"\b[A-Z][A-Z0-9_]{2,}\b", text)
    seen: set[str] = set()
    result: list[str] = []
    for station_id in ids:
        if station_id not in seen and station_id not in {"NOAA"}:
            seen.add(station_id)
            result.append(station_id)
    return result


def _kind(text: str, station_ids: list[str]) -> str:
    if ("比较" in text or "compare" in text.lower()) and len(station_ids) >= 2:
        return "station_comparison"
    if "距平" in text or "anomaly" in text.lower():
        return "anomaly_from_normal"
    if "年均温" in text or "年平均气温" in text:
        return "annual_temperature_mean"
    if "年降水" in text:
        return "annual_precipitation_total"
    if "最热" in text or "最冷" in text:
        return "warmest_coldest_month"
    if "最湿" in text or "最干" in text or "最多降水" in text or "最少降水" in text:
        return "wettest_driest_month"
    return "station_normals_summary"


def _month(text: str) -> int | None:
    match = re.search(r"(?P<month>\d{1,2})\s*月", text)
    if match:
        return int(match.group("month"))
    return None


def _observed(text: str) -> tuple[str | None, Decimal | None]:
    temp_match = re.search(
        rf"(?:气温|温度)\s*(?P<value>{_NUMBER})\s*C",
        text,
        flags=re.IGNORECASE,
    )
    if temp_match:
        return "temperature_c", Decimal(temp_match.group("value"))
    precip_match = re.search(
        rf"(?:降水|降水量)\s*(?P<value>{_NUMBER})\s*mm",
        text,
        flags=re.IGNORECASE,
    )
    if precip_match:
        return "precipitation_mm", Decimal(precip_match.group("value"))
    return None, None


def _query(kind: str) -> list[str]:
    return {
        "station_normals_summary": [
            "annual_temperature_mean",
            "annual_precipitation_total",
            "warmest_coldest_month",
            "wettest_driest_month",
        ],
        "annual_temperature_mean": ["annual_temperature_mean"],
        "annual_precipitation_total": ["annual_precipitation_total"],
        "warmest_coldest_month": ["warmest_coldest_month"],
        "wettest_driest_month": ["wettest_driest_month"],
        "station_comparison": ["annual_temperature_mean", "annual_precipitation_total"],
        "anomaly_from_normal": ["anomaly_from_normal"],
    }[kind]
