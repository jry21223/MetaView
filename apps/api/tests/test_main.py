from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_healthcheck() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_pipeline_returns_cir() -> None:
    response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请可视化讲解二分查找为什么能在有序数组中快速定位答案。",
            "domain": "algorithm",
        },
    )
    assert response.status_code == 200

    payload = response.json()
    assert payload["cir"]["domain"] == "algorithm"
    assert len(payload["cir"]["steps"]) == 3
    assert "previewTimeline" in payload["renderer_script"]

