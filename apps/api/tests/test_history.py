from app.schemas import (
    AgentTrace,
    CirDocument,
    CirValidationReport,
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
    )
    response = PipelineResponse(
        request_id="run-1",
        cir=CirDocument(
            title="二分查找",
            domain=TopicDomain.ALGORITHM,
            summary="摘要",
            steps=[],
        ),
        renderer_script=(
            "from manim import *\n\n"
            "class Demo(Scene):\n"
            "    def construct(self):\n"
            "        self.wait(0.5)\n"
        ),
        preview_video_url="/media/previews/run-1.mp4",
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

    detail = repository.get_run("run-1")
    assert detail is not None
    assert detail.request.prompt == "请讲解二分查找。"
    assert detail.request.source_image is None
    assert detail.status == PipelineRunStatus.SUCCEEDED
    assert detail.response.request_id == "run-1"
    assert detail.response.preview_video_url == "/media/previews/run-1.mp4"
    assert detail.response.runtime.agent_traces[0].raw_output is None

    full_detail = repository.get_run(
        "run-1",
        include_source_image=True,
        include_raw_output=True,
    )
    assert full_detail is not None
    assert full_detail.request.source_image == "data:image/png;base64,ZmFrZQ=="
    assert full_detail.response.runtime.agent_traces[0].raw_output == '{"focus":"binary search"}'


def test_run_repository_tracks_submitted_and_failed_run(tmp_path) -> None:
    repository = RunRepository(db_path=str(tmp_path / "runs.db"))
    request = PipelineRequest(
        prompt="请讲解 Dijkstra 算法。",
        provider="mock",
        sandbox_mode=SandboxMode.DRY_RUN,
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
    assert runs[0].error_message == "provider offline"

    detail = repository.get_run("run-queued")
    assert detail is not None
    assert detail.status == PipelineRunStatus.FAILED
    assert detail.error_message == "provider offline"
    assert detail.response is None


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
