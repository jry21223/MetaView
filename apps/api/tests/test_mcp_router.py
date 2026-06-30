from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app


def _playbook() -> dict:
    return {
        "fps": 30,
        "total_frames": 60,
        "domain": "geography",
        "title": "东亚季风",
        "summary": "海陆热力差异改变近地面风向。",
        "parameter_controls": [],
        "steps": [
            {
                "step_id": "monsoon_intro",
                "end_frame": 60,
                "title": "海陆热力差异",
                "voiceover_text": "冬夏海陆温差方向相反。",
                "tokens": [],
                "snapshot": {
                    "kind": "geo_map_scene",
                    "pack_id": "geography-basic",
                    "map_region": "east_asia",
                    "layers": [],
                    "flows": [],
                },
            }
        ],
    }


def test_mcp_director_script_uses_existing_director_builder() -> None:
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/mcp/director-script",
        json={"playbook": _playbook(), "run_id": "mcp-test-run"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["director_script"]["run_id"] == "mcp-test-run"
    assert payload["director_script"]["source"] == "rule"
    assert payload["director_script"]["beats"][0]["step_id"] == "monsoon_intro"
    assert payload["provenance"]["builder"] == "build_default_director"


def test_mcp_core_endpoints_expose_compilation_and_quality_services() -> None:
    client = TestClient(create_app())

    capabilities = client.get("/api/v1/mcp/capabilities")
    assert capabilities.status_code == 200
    subjects = {subject["id"]: subject for subject in capabilities.json()["subjects"]}
    assert subjects["geography"]["assetPacks"] == ["geography-basic"]
    assert "geo_map_scene" in subjects["geography"]["renderers"]

    asset_packs = client.get("/api/v1/mcp/asset-packs", params={"subject": "geography"})
    assert asset_packs.status_code == 200
    assert asset_packs.json()["packs"][0]["resourceUri"] == "metaview://kits/geography-basic/manifest"

    resolved = client.post(
        "/api/v1/mcp/resolve-assets",
        json={
            "subject": "geography",
            "sceneType": "east_asia_monsoon",
            "semanticRoles": ["wind", "pressure_high"],
        },
    )
    assert resolved.status_code == 200
    assert resolved.json()["assets"][0]["assetId"] == "monsoon-wind-arrow"
    assert resolved.json()["missing"] == ["pressure_high"]

    blueprint = client.post(
        "/api/v1/mcp/scene-blueprint",
        json={
            "topic": "东亚季风：海陆热力差异如何反转风向",
            "subject": "geography",
            "durationSeconds": 45,
        },
    )
    assert blueprint.status_code == 200
    assert blueprint.json()["sceneBlueprint"]["sceneType"] == "east_asia_monsoon"
    assert "steps" not in blueprint.text

    quality = client.post(
        "/api/v1/mcp/visual-quality",
        json={
            "playbookScript": {
                **_playbook(),
                "steps": [
                    {
                        **_playbook()["steps"][0],
                        "snapshot": {
                            "kind": "geo_map_scene",
                            "layers": [],
                            "flows": [],
                        },
                    }
                ],
            }
        },
    )
    assert quality.status_code == 200
    report = quality.json()
    assert report["pass"] is False
    assert report["warnings"][0]["severity"] == "high"
    assert report["warnings"][0]["code"] == "missing_pack_id"
