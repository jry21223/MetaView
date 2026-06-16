from __future__ import annotations

from decimal import Decimal

MONTH_LABELS = [
    "1月",
    "2月",
    "3月",
    "4月",
    "5月",
    "6月",
    "7月",
    "8月",
    "9月",
    "10月",
    "11月",
    "12月",
]

CLIMATE_FIXTURES = {
    "EDU_TEMPERATE": {
        "label": (
            "EDU_TEMPERATE Temperate Teaching Station "
            "(offline educational normal, not live NOAA data)"
        ),
        "temperature_c": [
            Decimal("0"),
            Decimal("2"),
            Decimal("6"),
            Decimal("11"),
            Decimal("16"),
            Decimal("21"),
            Decimal("25"),
            Decimal("24"),
            Decimal("19"),
            Decimal("13"),
            Decimal("6"),
            Decimal("1"),
        ],
        "precipitation_mm": [
            Decimal("40"),
            Decimal("35"),
            Decimal("50"),
            Decimal("60"),
            Decimal("70"),
            Decimal("80"),
            Decimal("90"),
            Decimal("85"),
            Decimal("75"),
            Decimal("65"),
            Decimal("55"),
            Decimal("45"),
        ],
    },
    "EDU_ARID": {
        "label": (
            "EDU_ARID Dryland Teaching Station "
            "(offline educational normal, not live NOAA data)"
        ),
        "temperature_c": [
            Decimal("8"),
            Decimal("10"),
            Decimal("15"),
            Decimal("20"),
            Decimal("25"),
            Decimal("30"),
            Decimal("34"),
            Decimal("33"),
            Decimal("28"),
            Decimal("22"),
            Decimal("15"),
            Decimal("10"),
        ],
        "precipitation_mm": [
            Decimal("18"),
            Decimal("14"),
            Decimal("12"),
            Decimal("10"),
            Decimal("6"),
            Decimal("3"),
            Decimal("2"),
            Decimal("2"),
            Decimal("5"),
            Decimal("9"),
            Decimal("12"),
            Decimal("16"),
        ],
    },
}
