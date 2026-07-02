from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app

EXPECTED_PUBLIC_PACK_IDS = {
    "algorithm-code-basic",
    "biology-basic",
    "chemistry-basic",
    "core-visual-basic",
    "geography-basic",
    "geography-earth-basic",
    "math-basic",
    "physics-basic",
}


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


def _director(*, step_id: str = "monsoon_intro", end_frame: int = 60) -> dict:
    return {
        "schema_version": "1.0.0",
        "source": "rule",
        "run_id": "mcp-quality-test",
        "beats": [
            {
                "beat_id": "beat-1",
                "step_id": step_id,
                "start_frame": 0,
                "end_frame": end_frame,
                "intent": "focus",
                "shot_type": "close",
                "camera_motion": "push_in",
                "pacing": "normal",
                "emphasis_terms": ["季风"],
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
    assert set(subjects["geography"]["assetPacks"]) == {
        "geography-basic",
        "geography-earth-basic",
    }
    assert "geo_map_scene" in subjects["geography"]["renderers"]

    asset_packs = client.get("/api/v1/mcp/asset-packs", params={"subject": "geography"})
    assert asset_packs.status_code == 200
    geography_packs = {pack["packId"]: pack for pack in asset_packs.json()["packs"]}
    assert set(geography_packs) == {"geography-basic", "geography-earth-basic"}
    assert (
        geography_packs["geography-basic"]["resourceUri"]
        == "metaview://kits/geography-basic/manifest"
    )

    resolved = client.post(
        "/api/v1/mcp/resolve-assets",
        json={
            "subject": "geography",
            "sceneType": "east_asia_monsoon",
            "semanticRoles": ["wind", "pressure_high"],
        },
    )
    assert resolved.status_code == 200
    resolved_payload = resolved.json()
    resolved_assets = {
        asset["semanticRole"]: asset
        for asset in resolved_payload["assets"]
    }
    assert resolved_assets["wind"]["assetId"] == "monsoon-wind-arrow"
    assert resolved_assets["pressure_high"]["packId"] == "geography-earth-basic"
    assert resolved_payload["missing"] == []

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


def test_mcp_asset_packs_expose_all_public_manifests() -> None:
    client = TestClient(create_app())

    response = client.get("/api/v1/mcp/asset-packs")

    assert response.status_code == 200
    assert {pack["packId"] for pack in response.json()["packs"]} == EXPECTED_PUBLIC_PACK_IDS


def test_mcp_capabilities_asset_packs_match_public_manifests() -> None:
    client = TestClient(create_app())

    response = client.get("/api/v1/mcp/capabilities")

    assert response.status_code == 200
    subjects = {subject["id"]: subject for subject in response.json()["subjects"]}
    assert set(subjects["algorithm"]["assetPacks"]) == {"algorithm-code-basic"}
    assert set(subjects["biology"]["assetPacks"]) == {"biology-basic"}
    assert set(subjects["chemistry"]["assetPacks"]) == {"chemistry-basic"}
    assert set(subjects["geography"]["assetPacks"]) == {
        "geography-basic",
        "geography-earth-basic",
    }
    assert set(subjects["math"]["assetPacks"]) == {"math-basic"}
    assert set(subjects["physics"]["assetPacks"]) == {"physics-basic"}


def test_mcp_asset_packs_can_be_queried_for_new_public_subjects() -> None:
    client = TestClient(create_app())

    expected_by_subject = {
        "algorithm": {"algorithm-code-basic"},
        "biology": {"biology-basic"},
        "chemistry": {"chemistry-basic"},
        "math": {"math-basic"},
    }
    for subject, expected_pack_ids in expected_by_subject.items():
        response = client.get("/api/v1/mcp/asset-packs", params={"subject": subject})

        assert response.status_code == 200
        assert {pack["packId"] for pack in response.json()["packs"]} == expected_pack_ids


def test_mcp_resolve_assets_uses_public_manifest_discovery() -> None:
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/mcp/resolve-assets",
        json={
            "subject": "geography",
            "sceneType": "weather_pattern",
            "semanticRoles": ["pressure_high"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["missing"] == []
    assert payload["assets"][0]["packId"] == "geography-earth-basic"
    assert payload["assets"][0]["assetId"] == "pressure-high-symbol"


def test_mcp_visual_quality_reports_director_step_mismatch() -> None:
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/mcp/visual-quality",
        json={
            "playbookScript": _playbook(),
            "directorScript": _director(step_id="missing_step"),
        },
    )

    assert response.status_code == 200
    report = response.json()
    assert report["pass"] is False
    assert report["warnings"][0]["severity"] == "high"
    assert report["warnings"][0]["code"] == "director_step_missing"
    assert report["warnings"][0]["stepId"] == "missing_step"


def test_mcp_visual_quality_reports_director_frame_range_mismatch() -> None:
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/mcp/visual-quality",
        json={
            "playbookScript": _playbook(),
            "directorScript": _director(end_frame=90),
        },
    )

    assert response.status_code == 200
    report = response.json()
    assert report["pass"] is False
    assert report["warnings"][0]["severity"] == "high"
    assert report["warnings"][0]["code"] == "director_frame_out_of_range"
    assert report["warnings"][0]["stepId"] == "monsoon_intro"
