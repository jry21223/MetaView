from __future__ import annotations

from typing import Any

from app.domain.services import geography_layout_compiler, physics_layout_compiler


def test_geography_layout_compiler_resolves_assets_through_manifest_resolver(
    monkeypatch,
) -> None:
    resolved: dict[tuple[str, str], dict[str, Any]] = {
        ("geo_map_scene", "map_layer"): {"id": "manifest-map-layer"},
        ("geo_map_scene", "land"): {"id": "manifest-land-layer"},
        ("geo_map_scene", "ocean"): {"id": "manifest-ocean-layer"},
        ("geo_map_scene", "wind"): {"id": "manifest-wind-arrow"},
    }

    def fake_resolve_asset_for_renderer(
        renderer_kind: str,
        semantic_role: str,
        *,
        pack_id: str | None = None,
    ) -> dict[str, Any] | None:
        assert pack_id == "geography-earth-basic"
        return resolved.get((renderer_kind, semantic_role))

    monkeypatch.setattr(
        geography_layout_compiler,
        "resolve_asset_for_renderer",
        fake_resolve_asset_for_renderer,
        raising=False,
    )

    snapshot = geography_layout_compiler.compile_geo_map_snapshot(
        {
            "packId": "geography-earth-basic",
            "flows": [
                {
                    "id": "custom-flow",
                    "semanticRole": "wind",
                    "from": [10, 20],
                    "to": [40, 50],
                }
            ],
        },
    )

    assert [layer.asset_id for layer in snapshot.layers] == [
        "manifest-map-layer",
        "manifest-land-layer",
        "manifest-ocean-layer",
    ]
    assert snapshot.flows[0].asset_id == "manifest-wind-arrow"


def test_physics_layout_compiler_resolves_object_assets_through_manifest_resolver(
    monkeypatch,
) -> None:
    def fake_resolve_asset_for_renderer(
        renderer_kind: str,
        semantic_role: str,
        *,
        pack_id: str | None = None,
    ) -> dict[str, Any] | None:
        assert renderer_kind == "physics_force_scene"
        assert pack_id == "physics-basic"
        if semantic_role == "block":
            return {"id": "manifest-block-sprite"}
        return None

    monkeypatch.setattr(
        physics_layout_compiler,
        "resolve_asset_for_renderer",
        fake_resolve_asset_for_renderer,
        raising=False,
    )

    snapshot = physics_layout_compiler.compile_physics_force_snapshot(
        {
            "packId": "physics-basic",
            "object": {"id": "cart", "semanticRole": "block", "x": 24, "y": 36},
        },
    )

    assert snapshot.objects[0].asset_id == "manifest-block-sprite"
