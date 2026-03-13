from app.schemas import (
    CirDocument,
    CirValidationReport,
    PipelineRequest,
    PipelineResponse,
    PipelineRuntime,
    ProviderDescriptor,
    ProviderName,
    SandboxMode,
    SandboxReport,
    SandboxStatus,
    TopicDomain,
    ValidationStatus,
)
from app.services.history import RunRepository


def test_run_repository_save_and_load(tmp_path) -> None:
    repository = RunRepository(db_path=str(tmp_path / "runs.db"))
    request = PipelineRequest(
        prompt="请讲解二分查找。",
        domain=TopicDomain.ALGORITHM,
        provider=ProviderName.MOCK,
        sandbox_mode=SandboxMode.DRY_RUN,
    )
    response = PipelineResponse(
        request_id="run-1",
        cir=CirDocument(
            title="二分查找",
            domain=TopicDomain.ALGORITHM,
            summary="摘要",
            steps=[],
        ),
        renderer_script="export const previewTimeline = [];",
        runtime=PipelineRuntime(
            provider=ProviderDescriptor(
                name=ProviderName.MOCK,
                model="mock-cir-studio-001",
                description="mock",
            ),
            sandbox=SandboxReport(
                mode=SandboxMode.DRY_RUN,
                engine="preview-dry-run",
                status=SandboxStatus.PASSED,
            ),
            validation=CirValidationReport(status=ValidationStatus.VALID),
        ),
    )

    repository.save_run(request=request, response=response)

    runs = repository.list_runs(limit=10)
    assert len(runs) == 1
    assert runs[0].request_id == "run-1"

    detail = repository.get_run("run-1")
    assert detail is not None
    assert detail.request.prompt == "请讲解二分查找。"
    assert detail.response.request_id == "run-1"
