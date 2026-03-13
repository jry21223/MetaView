from app.schemas import (
    AgentDiagnostic,
    PipelineRequest,
    PipelineResponse,
    PipelineRuntime,
    RuntimeCatalog,
    SandboxMode,
)
from app.services.agents import CoderAgent, CriticAgent, PlannerAgent
from app.services.providers.registry import ProviderRegistry
from app.services.sandbox import PreviewDryRunSandbox


class PipelineOrchestrator:
    def __init__(self, default_provider, sandbox_timeout_ms: int) -> None:
        self.provider_registry = ProviderRegistry()
        self.default_provider = default_provider
        self.sandbox = PreviewDryRunSandbox(timeout_ms=sandbox_timeout_ms)
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

        planning_hints, planning_trace = provider.plan(
            prompt=request.prompt, domain=request.domain.value
        )
        cir = self.planner.run(request, hints=planning_hints)

        coding_hints, coding_trace = provider.code(title=cir.title, step_count=len(cir.steps))
        renderer_script = self.coder.run(cir, hints=coding_hints)

        critique_hints, critique_trace = provider.critique(
            title=cir.title, renderer_script=renderer_script
        )
        diagnostics = self.critic.run(cir, hints=critique_hints)

        sandbox_report = self.sandbox.run(
            script=renderer_script, cir=cir, mode=request.sandbox_mode
        )
        diagnostics.extend(self._sandbox_diagnostics(sandbox_report))

        return PipelineResponse(
            cir=cir,
            renderer_script=renderer_script,
            diagnostics=diagnostics,
            runtime=PipelineRuntime(
                provider=provider.descriptor,
                sandbox=sandbox_report,
                agent_traces=[planning_trace, coding_trace, critique_trace],
            ),
        )

    def _sandbox_diagnostics(self, sandbox_report) -> list[AgentDiagnostic]:
        diagnostics: list[AgentDiagnostic] = []

        for warning in sandbox_report.warnings:
            diagnostics.append(AgentDiagnostic(agent="sandbox", message=warning))

        for error in sandbox_report.errors:
            diagnostics.append(AgentDiagnostic(agent="sandbox", message=error))

        return diagnostics
