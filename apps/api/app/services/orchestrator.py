from app.schemas import PipelineRequest, PipelineResponse
from app.services.agents import CoderAgent, CriticAgent, PlannerAgent


class PipelineOrchestrator:
    def __init__(self) -> None:
        self.planner = PlannerAgent()
        self.coder = CoderAgent()
        self.critic = CriticAgent()

    def run(self, request: PipelineRequest) -> PipelineResponse:
        cir = self.planner.run(request)
        renderer_script = self.coder.run(cir)
        diagnostics = self.critic.run(cir)
        return PipelineResponse(
            cir=cir,
            renderer_script=renderer_script,
            diagnostics=diagnostics,
        )

