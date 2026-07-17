from __future__ import annotations

from app.domain.services.asset_manifest_resolver import (
    resolve_asset_by_id,
    resolve_asset_by_role,
    resolve_asset_for_renderer,
)


def test_asset_manifest_resolver_reads_public_manifest_assets() -> None:
    asset = resolve_asset_for_renderer(
        "geo_map_scene",
        "pressure_high",
        pack_id="geography-earth-basic",
    )

    assert asset is not None
    assert asset["id"] == "pressure-high-symbol"
    assert asset["path"].endswith("/geography-earth-basic/symbols/pressure-high.svg")
    assert asset["license"] == "internal"


def test_asset_manifest_resolver_matches_id_and_subject_role() -> None:
    by_id = resolve_asset_by_id("physics-basic", "block-body")
    by_role = resolve_asset_by_role("physics", "block", pack_id="physics-basic")

    assert by_id is not None
    assert by_id["id"] == "block-body"
    assert by_role is not None
    assert by_role["id"] == "block-body"


def test_asset_manifest_resolver_rejects_wrong_renderer_kind() -> None:
    assert (
        resolve_asset_for_renderer(
            "physics_force_scene",
            "pressure_high",
            pack_id="geography-earth-basic",
        )
        is None
    )
