from __future__ import annotations

from app.application.agent.runtime_tool_hub import RuntimeToolHub
from app.domain.contracts.playbook_contract import SUPPORTED_SNAPSHOT_KIND_SET
from app.domain.contracts.quality_contract import (
    FACT_VALIDATOR_TOOL_ID_SET,
    PLAYBOOK_VALIDATOR_TOOL_ID_SET,
)
from app.domain.services.asset_manifest_resolver import list_asset_packs
from app.domain.services.scene_blueprint_compiler import (
    COMPILED_SCENE_DOMAINS,
    COMPILED_SCENE_SNAPSHOT_KINDS,
)
from app.domain.services.skill_recipe_validator import SkillRecipeValidationContext


def build_skill_recipe_validation_context(
    runtime_tool_hub: RuntimeToolHub,
) -> SkillRecipeValidationContext:
    deterministic_tool_ids = frozenset(
        tool.name for tool in runtime_tool_hub.list_tools() if tool.deterministic
    )
    available_asset_ids = frozenset(
        (str(pack["packId"]), str(asset["id"]))
        for pack in list_asset_packs()
        for asset in pack.get("assets", [])
        if pack.get("packId") and asset.get("id")
    )
    asset_pack_domains = {
        str(pack["packId"]): str(pack["subject"])
        for pack in list_asset_packs()
        if pack.get("packId") and pack.get("subject")
    }
    return SkillRecipeValidationContext(
        deterministic_tool_ids=deterministic_tool_ids,
        validator_tool_ids=PLAYBOOK_VALIDATOR_TOOL_ID_SET & deterministic_tool_ids,
        required_validator_tool_ids=PLAYBOOK_VALIDATOR_TOOL_ID_SET,
        fact_validator_tool_ids=FACT_VALIDATOR_TOOL_ID_SET,
        compiled_scene_snapshot_kinds=COMPILED_SCENE_SNAPSHOT_KINDS,
        compiled_scene_domains=COMPILED_SCENE_DOMAINS,
        supported_snapshot_kinds=SUPPORTED_SNAPSHOT_KIND_SET,
        available_asset_ids=available_asset_ids,
        asset_pack_domains=asset_pack_domains,
    )


__all__ = ["build_skill_recipe_validation_context"]
