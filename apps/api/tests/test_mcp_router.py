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
