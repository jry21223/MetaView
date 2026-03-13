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
    assert payload["providers"][0]["label"] == "Mock Provider"
    assert payload["providers"][1]["name"] == "openai"
    assert payload["providers"][1]["configured"] is False


def test_runtime_catalog_allows_local_dev_cors_origin() -> None:
    response = client.get(
        "/api/v1/runtime",
        headers={"Origin": "http://127.0.0.1:4174"},
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:4174"


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


def test_custom_provider_crud() -> None:
    create_response = client.post(
        "/api/v1/providers/custom",
        json={
            "name": "local-ollama",
            "label": "Local Ollama",
            "base_url": "http://127.0.0.1:11434/v1",
            "model": "qwen2.5-coder",
            "api_key": "",
            "description": "本地自定义 provider",
            "temperature": 0.1,
            "enabled": True,
        },
    )
    assert create_response.status_code == 200
    payload = create_response.json()
    assert payload["name"] == "local-ollama"
    assert payload["is_custom"] is True

    runtime_response = client.get("/api/v1/runtime")
    providers = runtime_response.json()["providers"]
    assert any(provider["name"] == "local-ollama" for provider in providers)

    delete_response = client.delete("/api/v1/providers/custom/local-ollama")
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] is True
