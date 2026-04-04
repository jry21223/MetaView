import json
import sqlite3

from app.schemas import (
    AgentTrace,
    CirDocument,
    CirValidationReport,
    OutputMode,
    PipelineRequest,
    PipelineResponse,
    PipelineRunStatus,
    PipelineRuntime,
    ProviderDescriptor,
    ProviderKind,
    SandboxMode,
    SandboxReport,
    SandboxStatus,
    SkillDescriptor,
    TopicDomain,
    ValidationStatus,
)
from app.services.history import RunRepository


def test_run_repository_save_and_load(tmp_path) -> None:
    repository = RunRepository(db_path=str(tmp_path / "runs.db"))
    request = PipelineRequest(
        prompt="请讲解二分查找。",
        domain=TopicDomain.ALGORITHM,
        provider="mock",
        sandbox_mode=SandboxMode.DRY_RUN,
        source_image="data:image/png;base64,ZmFrZQ==",
        source_image_name="binary-search.png",
        output_mode=OutputMode.HTML,
    )
    response = PipelineResponse(
        request_id="run-1",
        cir=CirDocument(
            title="二分查找",
            domain=TopicDomain.ALGORITHM,
            summary="摘要",
            steps=[],
        ),
        renderer_script="<!doctype html><html><body><h1>binary search</h1></body></html>",
        preview_video_url=None,
        preview_html_url="/api/v1/html_preview/run-1.html",
        runtime=PipelineRuntime(
            skill=SkillDescriptor(
                id="algorithm-process-viz",
                domain=TopicDomain.ALGORITHM,
                label="算法过程可视化",
                description="算法 skill",
            ),
            provider=ProviderDescriptor(
                name="mock",
                label="Mock Provider",
                kind=ProviderKind.MOCK,
                model="mock-cir-studio-001",
                description="mock",
            ),
            sandbox=SandboxReport(
                mode=SandboxMode.DRY_RUN,
                engine="python-manim-static",
                status=SandboxStatus.PASSED,
            ),
            validation=CirValidationReport(status=ValidationStatus.VALID),
            agent_traces=[
                AgentTrace(
                    agent="planner",
                    provider="mock",
                    model="mock-cir-studio-001",
                    summary="summary",
                    raw_output='{"focus":"binary search"}',
                )
            ],
        ),
    )

    repository.save_run(request=request, response=response)

    runs = repository.list_runs(limit=10)
    assert len(runs) == 1
    assert runs[0].request_id == "run-1"
    assert runs[0].status == PipelineRunStatus.SUCCEEDED
    assert runs[0].output_mode == OutputMode.HTML

    detail = repository.get_run("run-1")
    assert detail is not None
    assert detail.request.prompt == "请讲解二分查找。"
    assert detail.request.source_image is None
    assert detail.status == PipelineRunStatus.SUCCEEDED
    assert detail.response.request_id == "run-1"
    assert detail.response.preview_video_url is None
    assert detail.response.preview_html_url == "/api/v1/html_preview/run-1.html"
    assert detail.response.runtime.agent_traces[0].raw_output is None

    full_detail = repository.get_run(
        "run-1",
        include_source_image=True,
        include_raw_output=True,
    )
    assert full_detail is not None
    assert full_detail.request.source_image == "data:image/png;base64,ZmFrZQ=="
    assert full_detail.response.preview_html_url == "/api/v1/html_preview/run-1.html"
    assert full_detail.response.runtime.agent_traces[0].raw_output == '{"focus":"binary search"}'


def test_run_repository_tracks_submitted_and_failed_run(tmp_path) -> None:
    repository = RunRepository(db_path=str(tmp_path / "runs.db"))
    request = PipelineRequest(
        prompt="请讲解 Dijkstra 算法。",
        provider="mock",
        sandbox_mode=SandboxMode.DRY_RUN,
        output_mode=OutputMode.HTML,
    )

    repository.create_submitted_run(request_id="run-queued", request=request)
    repository.mark_run_running("run-queued")
    repository.mark_run_failed(
        request_id="run-queued",
        request=request,
        error_message="provider offline",
    )

    runs = repository.list_runs(limit=10)
    assert runs[0].request_id == "run-queued"
    assert runs[0].status == PipelineRunStatus.FAILED
    assert runs[0].output_mode == OutputMode.HTML
    assert runs[0].error_message == "provider offline"

    detail = repository.get_run("run-queued")
    assert detail is not None
    assert detail.status == PipelineRunStatus.FAILED
    assert detail.error_message == "provider offline"
    assert detail.response is None


def test_run_repository_migrates_legacy_rows_with_default_output_mode(tmp_path) -> None:
    db_path = tmp_path / "legacy-runs.db"
    connection = sqlite3.connect(db_path)
    try:
        connection.execute(
            """
            CREATE TABLE pipeline_runs (
                request_id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                status TEXT NOT NULL,
                prompt TEXT NOT NULL,
                title TEXT NOT NULL,
                domain TEXT NOT NULL,
                provider TEXT NOT NULL,
                router_provider TEXT,
                generation_provider TEXT,
                sandbox_status TEXT NOT NULL,
                request_payload TEXT NOT NULL,
                response_payload TEXT NOT NULL,
                error_message TEXT
            )
            """
        )

        legacy_request = {
            "prompt": "请讲解链表。",
            "domain": "algorithm",
            "provider": "mock",
            "router_provider": "mock",
            "generation_provider": "mock",
            "enable_narration": True,
            "sandbox_mode": "dry_run",
            "persist_run": True,
        }
        legacy_response = {
            "request_id": "legacy-run",
            "cir": {
                "version": "1.0",
                "title": "链表",
                "domain": "algorithm",
                "summary": "摘要",
                "steps": [],
            },
            "renderer_script": "from manim import *",
            "preview_video_url": "/media/previews/legacy-run.mp4",
            "preview_html_url": None,
            "execution_map": None,
            "diagnostics": [],
            "runtime": {
                "skill": {
                    "id": "algorithm-process-viz",
                    "domain": "algorithm",
                    "label": "算法过程可视化",
                    "description": "算法 skill",
                    "version": "1.0.0",
                    "triggers": [],
                    "dependencies": [],
                    "supports_image_input": False,
                    "execution_notes": [],
                },
                "provider": {
                    "name": "mock",
                    "label": "Mock Provider",
                    "kind": "mock",
                    "model": "mock-cir-studio-001",
                    "stage_models": {},
                    "description": "mock",
                    "configured": True,
                    "is_custom": False,
                    "supports_vision": False,
                    "api_key_configured": False,
                },
                "router_provider": {
                    "name": "mock",
                    "label": "Mock Provider",
                    "kind": "mock",
                    "model": "mock-cir-studio-001",
                    "stage_models": {},
                    "description": "mock",
                    "configured": True,
                    "is_custom": False,
                    "supports_vision": False,
                    "api_key_configured": False,
                },
                "generation_provider": {
                    "name": "mock",
                    "label": "Mock Provider",
                    "kind": "mock",
                    "model": "mock-cir-studio-001",
                    "stage_models": {},
                    "description": "mock",
                    "configured": True,
                    "is_custom": False,
                    "supports_vision": False,
                    "api_key_configured": False,
                },
                "sandbox": {
                    "mode": "dry_run",
                    "engine": "python-manim-static",
                    "status": "passed",
                    "duration_ms": 1,
                    "warnings": [],
                    "errors": [],
                },
                "validation": {"status": "valid", "issues": []},
                "agent_traces": [],
                "repair_count": 0,
                "repair_actions": [],
            },
            "step_timing": [],
        }

        connection.execute(
            """
            INSERT INTO pipeline_runs (
                request_id,
                created_at,
                updated_at,
                status,
                prompt,
                title,
                domain,
                provider,
                router_provider,
                generation_provider,
                sandbox_status,
                request_payload,
                response_payload,
                error_message
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "legacy-run",
                "2026-04-03T10:00:00+00:00",
                "2026-04-03T10:00:00+00:00",
                PipelineRunStatus.SUCCEEDED.value,
                "请讲解链表。",
                "链表",
                TopicDomain.ALGORITHM.value,
                "mock",
                "mock",
                "mock",
                SandboxStatus.PASSED.value,
                json.dumps(legacy_request, ensure_ascii=False),
                json.dumps(legacy_response, ensure_ascii=False),
                None,
            ),
        )
        connection.commit()
    finally:
        connection.close()

    repository = RunRepository(db_path=str(db_path))

    runs = repository.list_runs(limit=10)
    assert len(runs) == 1
    assert runs[0].request_id == "legacy-run"
    assert runs[0].output_mode == OutputMode.VIDEO

    detail = repository.get_run("legacy-run")
    assert detail is not None
    assert detail.request.output_mode == OutputMode.VIDEO
    assert detail.response is not None
    assert detail.response.request_id == "legacy-run"


def test_run_repository_can_recover_orphaned_inflight_runs(tmp_path) -> None:
    repository = RunRepository(db_path=str(tmp_path / "runs.db"))
    request = PipelineRequest(
        prompt="请讲解定积分。",
        provider="mock",
        sandbox_mode=SandboxMode.DRY_RUN,
    )

    repository.create_submitted_run(request_id="run-queued", request=request)
    repository.create_submitted_run(request_id="run-running", request=request)
    repository.mark_run_running("run-running")

    changed = repository.mark_inflight_runs_failed("service restarted")

    assert changed == 2

    queued = repository.get_run("run-queued")
    running = repository.get_run("run-running")

    assert queued is not None
    assert queued.status == PipelineRunStatus.FAILED
    assert queued.error_message == "service restarted"
    assert queued.response is None

    assert running is not None
    assert running.status == PipelineRunStatus.FAILED
    assert running.error_message == "service restarted"
    assert running.response is None
