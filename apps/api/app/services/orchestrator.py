from app.config import Settings
from app.schemas import (
    AgentDiagnostic,
    CirValidationReport,
    CustomProviderUpsertRequest,
    PipelineRequest,
    PipelineResponse,
    PipelineRunDetail,
    PipelineRunSummary,
    PipelineRuntime,
    ProviderDescriptor,
    RuntimeCatalog,
    SandboxMode,
    ValidationStatus,
)
from app.services.agents import CoderAgent, CriticAgent, PlannerAgent
from app.services.history import CustomProviderRepository, RunRepository
from app.services.providers.registry import ProviderRegistry
from app.services.repair import PipelineRepairService
from app.services.sandbox import PreviewDryRunSandbox
from app.services.validation import CirValidator


class PipelineOrchestrator:
    def __init__(self, settings: Settings) -> None:
        self.repository = RunRepository(db_path=settings.history_db_path)
        self.custom_provider_repository = CustomProviderRepository(
            db_path=settings.history_db_path
        )
        self.provider_registry = ProviderRegistry(
            custom_provider_repository=self.custom_provider_repository,
            openai_api_key=settings.openai_api_key,
            openai_base_url=settings.openai_base_url,
            openai_model=settings.openai_model,
            openai_timeout_s=settings.openai_timeout_s,
        )
        self.default_provider = settings.default_provider
        self.sandbox = PreviewDryRunSandbox(timeout_ms=settings.sandbox_timeout_ms)
        self.validator = CirValidator()
        self.repair_service = PipelineRepairService()
        self.max_repair_attempts = settings.max_repair_attempts
        self.planner = PlannerAgent()
        self.coder = CoderAgent()
        self.critic = CriticAgent()

    def runtime_catalog(self) -> RuntimeCatalog:
        return RuntimeCatalog(
            default_provider=self.default_provider,
            sandbox_engine=self.sandbox.engine_name,
            providers=self.provider_registry.list_descriptors(),
            sandbox_modes=[SandboxMode.DRY_RUN, SandboxMode.OFF],
        )

    def run(self, request: PipelineRequest) -> PipelineResponse:
        provider_name = request.provider or self.default_provider
        provider = self.provider_registry.get(provider_name)
        repair_actions: list[str] = []
        repair_count = 0

        planning_hints, planning_trace = provider.plan(
            prompt=request.prompt, domain=request.domain.value
        )
        cir = self.planner.run(request, hints=planning_hints)
        validation_report = self.validator.validate(cir)

        if (
            validation_report.status == ValidationStatus.INVALID
            and repair_count < self.max_repair_attempts
        ):
            cir, new_actions = self.repair_service.repair_cir(cir, validation_report)
            repair_actions.extend(new_actions)
            repair_count += 1
            validation_report = self.validator.validate(cir)

        coding_hints, coding_trace = provider.code(title=cir.title, step_count=len(cir.steps))
        renderer_script = self.coder.run(cir, hints=coding_hints)

        critique_hints, critique_trace = provider.critique(
            title=cir.title, renderer_script=renderer_script
        )
        diagnostics = self.critic.run(cir, hints=critique_hints)
        diagnostics.extend(self._validation_diagnostics(validation_report))

        sandbox_report = self.sandbox.run(
            script=renderer_script, cir=cir, mode=request.sandbox_mode
        )

        if (
            sandbox_report.status.value == "failed"
            and repair_count < self.max_repair_attempts
            and request.sandbox_mode != SandboxMode.OFF
        ):
            repair_actions.extend(self.repair_service.repair_script(cir, sandbox_report))
            repair_count += 1
            renderer_script = self.coder.run(cir, hints=coding_hints)
            sandbox_report = self.sandbox.run(
                script=renderer_script, cir=cir, mode=request.sandbox_mode
            )

        diagnostics.extend(self._sandbox_diagnostics(sandbox_report))
        diagnostics.extend(self._repair_diagnostics(repair_actions))

        response = PipelineResponse(
            cir=cir,
            renderer_script=renderer_script,
            diagnostics=diagnostics,
            runtime=PipelineRuntime(
                provider=provider.descriptor,
                sandbox=sandbox_report,
                validation=validation_report,
                agent_traces=[planning_trace, coding_trace, critique_trace],
                repair_count=repair_count,
                repair_actions=repair_actions,
            ),
        )

        if request.persist_run:
            self.repository.save_run(request=request, response=response)

        return response

    def list_runs(self, limit: int = 20) -> list[PipelineRunSummary]:
        return self.repository.list_runs(limit=limit)

    def get_run(self, request_id: str) -> PipelineRunDetail | None:
        return self.repository.get_run(request_id=request_id)

    def upsert_custom_provider(
        self, payload: CustomProviderUpsertRequest
    ) -> ProviderDescriptor:
        return self.provider_registry.upsert_custom_provider(payload)

    def delete_custom_provider(self, name: str) -> bool:
        return self.provider_registry.delete_custom_provider(name)

    def _sandbox_diagnostics(self, sandbox_report) -> list[AgentDiagnostic]:
        diagnostics: list[AgentDiagnostic] = []

        for warning in sandbox_report.warnings:
            diagnostics.append(AgentDiagnostic(agent="sandbox", message=warning))

        for error in sandbox_report.errors:
            diagnostics.append(AgentDiagnostic(agent="sandbox", message=error))

        return diagnostics

    def _validation_diagnostics(
        self, validation_report: CirValidationReport
    ) -> list[AgentDiagnostic]:
        diagnostics: list[AgentDiagnostic] = []
        for issue in validation_report.issues:
            diagnostics.append(
                AgentDiagnostic(
                    agent="validator",
                    message=f"[{issue.severity.value}] {issue.message}",
                )
            )
        return diagnostics

    def _repair_diagnostics(self, repair_actions: list[str]) -> list[AgentDiagnostic]:
        return [AgentDiagnostic(agent="repair", message=action) for action in repair_actions]
