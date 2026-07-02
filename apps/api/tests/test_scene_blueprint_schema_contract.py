from __future__ import annotations

import json
from pathlib import Path

from app.domain.models.review import PlaybookReviewStatus
from app.domain.services.asset_manifest_resolver import list_asset_packs
from app.domain.services.metaview_core import MetaViewCoreService
from app.domain.services.playbook_quality import self_check_playbook
from app.domain.services.scene_blueprint_compiler import compile_scene_blueprint_to_playbook

SCHEMA_PATH = (
    Path(__file__).resolve().parents[3]
    / "apps"
    / "web"
    / "public"
    / "schemas"
    / "scene-blueprint.schema.json"
)


def _schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def test_scene_blueprint_schema_documents_current_flagship_contract() -> None:
    schema = _schema()

    assert schema["required"] == ["subject", "sceneType", "title", "visualIntent"]
    assert {
        "algorithm",
        "biology",
        "chemistry",
        "geography",
        "math",
        "physics",
    } <= set(schema["properties"]["subject"]["enum"])
    assert {
        "east_asia_monsoon",
        "projectile_motion",
        "cell_structure",
        "dna_replication",
        "molecule_2d_water",
        "molecule_2d_methane",
        "reaction_synthesis_water",
        "derivative_tangent",
        "bfs_graph",
        "recursion_stack",
        "binary_search",
    } <= set(schema["properties"]["sceneType"]["enum"])


def test_schema_valid_geography_blueprint_compiles_in_api() -> None:
    blueprint = {
        "subject": "geography",
        "sceneType": "east_asia_monsoon",
        "title": "East Asia monsoon",
        "visualIntent": ["seasonal_wind_reversal", "land_sea_thermal_contrast"],
        "mapRegion": "east_asia",
        "flows": [
            {
                "id": "summer-monsoon",
                "semanticRole": "monsoon_flow",
                "from": [78, 68],
                "to": [42, 38],
            }
        ],
    }

    playbook = compile_scene_blueprint_to_playbook(blueprint)
    verdict = self_check_playbook(playbook, "Explain East Asia monsoon.")

    assert verdict.status == PlaybookReviewStatus.CLEAN
    assert playbook.initial_data["scene_blueprint"] == ["east_asia_monsoon"]


def test_core_scene_blueprint_service_returns_schema_required_fields() -> None:
    schema = _schema()
    service = MetaViewCoreService(asset_packs=list(list_asset_packs()))

    response = service.compile_scene_blueprint(
        topic="东亚季风：海陆热力差异如何反转风向",
        subject="geography",
        audience="middle school",
        duration_seconds=45,
        style="teaching",
        language="zh-CN",
    )
    blueprint = response["sceneBlueprint"]

    missing = [field for field in schema["required"] if not blueprint.get(field)]
    assert missing == []
    assert response["sceneBlueprintSchema"] == {
        "id": schema["$id"],
        "valid": True,
        "resourceUri": "metaview://schemas/scene-blueprint",
    }
