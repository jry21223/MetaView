from __future__ import annotations

from typing import Any

from app.domain.models.playbook import MathPlotCurve, MathPlotSnapshot
from app.domain.services.asset_manifest_resolver import (
    resolve_asset_by_role,
    resolve_asset_for_renderer,
)

DEFAULT_MATH_PACK_ID = "math-basic"


def _asset_id_for_math_plot(pack_id: str) -> str | None:
    asset = (
        resolve_asset_for_renderer("math_plot", "tangent", pack_id=pack_id)
        or resolve_asset_by_role("math", "tangent", pack_id=pack_id)
        or resolve_asset_for_renderer("math_plot", "derivative", pack_id=pack_id)
        or resolve_asset_by_role("math", "derivative", pack_id=pack_id)
        or resolve_asset_for_renderer("math_plot", "plot", pack_id=pack_id)
        or resolve_asset_by_role("math", "plot", pack_id=pack_id)
    )
    return str(asset["id"]) if asset else None


def _number(value: Any, fallback: float) -> float:
    return float(value) if isinstance(value, int | float) else fallback


def _optional_number(value: Any, fallback: float | None) -> float | None:
    if value is None:
        return fallback
    return float(value) if isinstance(value, int | float) else fallback


def _first_present(payload: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in payload:
            return payload[key]
    return None


def _curve(raw: dict[str, Any]) -> MathPlotCurve:
    return MathPlotCurve(
        expression=str(raw["expression"]),
        label=raw.get("label"),
        emphasis=str(raw.get("emphasis") or "primary"),
        semantic_role=raw.get("semanticRole") or raw.get("semantic_role"),
    )


def compile_math_plot_snapshot(blueprint: dict[str, Any]) -> MathPlotSnapshot:
    pack_id = str(blueprint.get("packId") or DEFAULT_MATH_PACK_ID)
    raw_curves = blueprint.get("curves") or []
    return MathPlotSnapshot(
        pack_id=pack_id,
        asset_id=blueprint.get("assetId")
        or blueprint.get("asset_id")
        or _asset_id_for_math_plot(pack_id),
        curves=[_curve(curve) for curve in raw_curves]
        if raw_curves
        else [
            MathPlotCurve(
                expression="x^2", label="f(x)=x^2", emphasis="primary", semantic_role="curve"
            ),
            MathPlotCurve(
                expression="2*x - 1",
                label="tangent slope = 2",
                emphasis="accent",
                semantic_role="tangent",
            ),
        ],
        params={str(key): float(value) for key, value in (blueprint.get("params") or {}).items()},
        x_min=_number(_first_present(blueprint, "xMin", "x_min"), -1),
        x_max=_number(_first_present(blueprint, "xMax", "x_max"), 3),
        y_min=_optional_number(_first_present(blueprint, "yMin", "y_min"), -1),
        y_max=_optional_number(_first_present(blueprint, "yMax", "y_max"), 5),
        marker_x=_optional_number(_first_present(blueprint, "markerX", "marker_x"), 1),
        shade_from=_optional_number(_first_present(blueprint, "shadeFrom", "shade_from"), 0.85),
        shade_to=_optional_number(_first_present(blueprint, "shadeTo", "shade_to"), 1.15),
        x_label=str(blueprint.get("xLabel") or blueprint.get("x_label") or "x"),
        y_label=str(blueprint.get("yLabel") or blueprint.get("y_label") or "f(x)"),
        formula_latex=str(
            blueprint.get("formulaLatex") or blueprint.get("formula_latex") or "f'(1)=2"
        ),
        caption=str(
            blueprint.get("caption") or "The derivative at x=1 is the slope of the tangent line."
        ),
    )
