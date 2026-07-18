from __future__ import annotations

from typing import Any, Literal

from app.domain.models.playbook import (
    GeoMapFlow,
    GeoMapLayer,
    GeoMapSceneSnapshot,
    GeoPressureCenter,
)
from app.domain.services.asset_manifest_resolver import (
    resolve_asset_by_role,
    resolve_asset_for_renderer,
)


def _point(value: Any, default: tuple[float, float]) -> tuple[float, float]:
    if isinstance(value, list | tuple) and len(value) >= 2:
        x, y = value[0], value[1]
        if isinstance(x, int | float) and isinstance(y, int | float):
            return (float(x), float(y))
    return default


def _asset_id_for_renderer(
    pack_id: str,
    semantic_role: str,
    fallbacks: list[str] | None = None,
) -> str | None:
    for role in [semantic_role, *(fallbacks or [])]:
        asset = (
            resolve_asset_for_renderer("geo_map_scene", role, pack_id=pack_id)
            or resolve_asset_by_role("geography", role, pack_id=pack_id)
            or resolve_asset_for_renderer("geo_map_scene", role)
            or resolve_asset_by_role("geography", role)
        )
        if asset:
            return str(asset["id"])
    return None


def _flows(blueprint: dict[str, Any], pack_id: str) -> list[GeoMapFlow]:
    source = blueprint.get("flows")
    if not isinstance(source, list) or not source:
        source = [
            {
                "id": "summer-monsoon",
                "semanticRole": "monsoon_flow",
                "from": [78, 68],
                "to": [42, 38],
                "label": "summer monsoon",
                "strength": 1.1,
            }
        ]

    flows: list[GeoMapFlow] = []
    for index, flow in enumerate(source):
        if not isinstance(flow, dict):
            continue
        semantic_role = str(flow.get("semanticRole") or flow.get("semantic_role") or "monsoon_flow")
        asset_id = (
            str(flow.get("assetId") or flow.get("asset_id"))
            if flow.get("assetId") or flow.get("asset_id")
            else _asset_id_for_renderer(pack_id, semantic_role, ["wind"])
        )
        strength = (
            float(flow.get("strength"))
            if isinstance(flow.get("strength"), int | float)
            else 1.0
        )
        flows.append(
            GeoMapFlow(
                id=str(flow.get("id") or f"flow-{index + 1}"),
                semantic_role=semantic_role,
                **{"from": _point(flow.get("from"), (78.0, 68.0))},
                to=_point(flow.get("to"), (42.0, 38.0)),
                label=str(flow.get("label") or semantic_role),
                asset_id=asset_id,
                strength=strength,
            )
        )
    return flows


def _pressure_kind(value: Any) -> Literal["high", "low"]:
    return "high" if value == "high" else "low"


def _pressure_centers(blueprint: dict[str, Any]) -> list[GeoPressureCenter]:
    source = blueprint.get("pressureCenters") or blueprint.get("pressure_centers")
    if not isinstance(source, list) or not source:
        source = [
            {"id": "land-low", "kind": "low", "x": 38, "y": 35, "label": "land low"},
            {"id": "ocean-high", "kind": "high", "x": 76, "y": 64, "label": "ocean high"},
        ]

    centers: list[GeoPressureCenter] = []
    for index, center in enumerate(source):
        if not isinstance(center, dict):
            continue
        centers.append(
            GeoPressureCenter(
                id=str(center.get("id") or f"pressure-{index + 1}"),
                kind=_pressure_kind(center.get("kind")),
                x=float(center.get("x")) if isinstance(center.get("x"), int | float) else 50.0,
                y=float(center.get("y")) if isinstance(center.get("y"), int | float) else 50.0,
                label=str(center.get("label") or center.get("kind") or "pressure"),
            )
        )
    return centers


def compile_geo_map_snapshot(blueprint: dict[str, Any]) -> GeoMapSceneSnapshot:
    pack_id = str(blueprint.get("packId") or "geography-earth-basic")
    map_region = str(blueprint.get("mapRegion") or blueprint.get("map_region") or "east_asia")
    map_asset_id = _asset_id_for_renderer(pack_id, "map_layer", ["land"])
    land_asset_id = _asset_id_for_renderer(pack_id, "land", ["map_layer"])
    ocean_asset_id = _asset_id_for_renderer(pack_id, "ocean")
    coastline_asset_id = _asset_id_for_renderer(pack_id, "coastline")
    return GeoMapSceneSnapshot(
        pack_id=pack_id,
        map_region=map_region,
        layers=[
            GeoMapLayer(
                id="map",
                semantic_role="map_layer",
                label="East Asia map" if map_region == "east_asia" else f"{map_region} map",
                asset_id=map_asset_id,
            ),
            GeoMapLayer(
                id="land",
                semantic_role="land",
                label="heated continent",
                asset_id=None if land_asset_id == map_asset_id else land_asset_id,
            ),
            GeoMapLayer(
                id="ocean",
                semantic_role="ocean",
                label="western Pacific",
                asset_id=ocean_asset_id,
            ),
            GeoMapLayer(
                id="coastline",
                semantic_role="coastline",
                label="East Asia coastline",
                asset_id=coastline_asset_id,
            ),
        ],
        flows=_flows(blueprint, pack_id),
        pressure_centers=_pressure_centers(blueprint),
        particle_preset=str(
            blueprint.get("particlePreset")
            or blueprint.get("particle_preset")
            or "moisture_particles"
        ),
        caption=str(
            blueprint.get("caption")
            or "Land-sea thermal contrast reverses seasonal wind direction."
        ),
    )
