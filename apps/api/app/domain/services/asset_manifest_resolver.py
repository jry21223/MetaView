from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

ASSET_MANIFEST_ROOT = (
    Path(__file__).resolve().parents[5]
    / "apps"
    / "web"
    / "public"
    / "assets"
    / "metaview-kits"
)


@lru_cache
def list_asset_packs() -> tuple[dict[str, Any], ...]:
    packs: list[dict[str, Any]] = []
    for manifest_path in sorted(ASSET_MANIFEST_ROOT.glob("*/manifest.json")):
        packs.append(json.loads(manifest_path.read_text(encoding="utf-8")))
    return tuple(packs)


def resolve_asset_by_id(
    pack_id: str | None,
    asset_id: str | None,
) -> dict[str, Any] | None:
    if not asset_id:
        return None
    for pack in list_asset_packs():
        if pack_id and pack.get("packId") != pack_id:
            continue
        for asset in pack.get("assets", []):
            if asset.get("id") == asset_id:
                return asset
    return None


def resolve_asset_by_role(
    subject: str,
    semantic_role: str | None,
    *,
    pack_id: str | None = None,
) -> dict[str, Any] | None:
    if not semantic_role:
        return None
    for pack in list_asset_packs():
        if pack.get("subject") != subject:
            continue
        if pack_id and pack.get("packId") != pack_id:
            continue
        for asset in pack.get("assets", []):
            if semantic_role in asset.get("semanticRoles", []):
                return asset
    return None


def resolve_asset_for_renderer(
    renderer_kind: str,
    semantic_role: str | None,
    *,
    pack_id: str | None = None,
) -> dict[str, Any] | None:
    if not semantic_role:
        return None
    for pack in list_asset_packs():
        if pack_id and pack.get("packId") != pack_id:
            continue
        if renderer_kind not in pack.get("rendererKinds", []):
            continue
        for asset in pack.get("assets", []):
            if semantic_role in asset.get("semanticRoles", []):
                return asset
    return None
