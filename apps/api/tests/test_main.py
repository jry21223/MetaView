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
            "provider": "mock",
            "sandbox_mode": "dry_run",
        },
    )
    assert response.status_code == 200

    payload = response.json()
    assert payload["cir"]["domain"] == "algorithm"
    assert len(payload["cir"]["steps"]) == 3
    assert "previewTimeline" in payload["renderer_script"]
    assert payload["runtime"]["provider"]["name"] == "mock"
    assert payload["runtime"]["sandbox"]["status"] == "passed"
    assert payload["runtime"]["validation"]["status"] == "valid"
    assert payload["runtime"]["repair_count"] == 0


def test_runtime_catalog() -> None:
    response = client.get("/api/v1/runtime")
    assert response.status_code == 200

    payload = response.json()
    assert payload["default_provider"] == "mock"
    assert payload["sandbox_engine"] == "preview-dry-run"
    assert payload["providers"][0]["name"] == "mock"
    assert payload["providers"][1]["name"] == "openai"
    assert payload["providers"][1]["configured"] is False


def test_pipeline_runs_history_endpoints() -> None:
    pipeline_response = client.post(
        "/api/v1/pipeline",
        json={
            "prompt": "请讲解动态规划中的状态定义与转移。",
            "domain": "algorithm",
            "provider": "mock",
            "sandbox_mode": "dry_run",
            "persist_run": True,
        },
    )
    assert pipeline_response.status_code == 200
    request_id = pipeline_response.json()["request_id"]

    list_response = client.get("/api/v1/runs")
    assert list_response.status_code == 200
    runs = list_response.json()
    assert any(item["request_id"] == request_id for item in runs)

    detail_response = client.get(f"/api/v1/runs/{request_id}")
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["request"]["prompt"] == "请讲解动态规划中的状态定义与转移。"
    assert detail["response"]["request_id"] == request_id
