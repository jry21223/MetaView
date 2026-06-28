# Topic Routing

Status: Active

MetaView routes prompts on the backend before selecting deterministic SkillPack,
generic CIR, or agent generation. Routing chooses the generation path and skill
match only; it does not change the CIR, PlaybookScript, or DirectorScript schema.

## Source Of Truth

The backend is the routing authority:

```text
PipelineRequest
  -> router_provider small model / hybrid router
  -> SkillRegistry heuristic fallback
  -> SkillRouteMatch | generic / agent fallback
```

Frontend `inferDomain` is only a UX hint. It may submit `domain=null`, and it
must not block user submission when it cannot classify the prompt. In that case
the UI should show a light message such as `将交给系统自动识别题目类型`.

Do not move router-model logic into `IntakeScreen`.

## Router Settings

These request/settings fields remain the public routing contract:

- `router_mode`: `off | heuristic | llm | hybrid`
- `router_model`: optional small router model override
- `router_min_confidence`: minimum confidence for accepting model route output
- `router_timeout_s`: router model timeout

Self-hosted clients may pass these through Provider settings. Ops edition rejects
client router overrides and uses platform-managed routing.

## Backend Order

`RunPipelineUseCase._route_request()` is the main boundary:

1. `skill_mode_override="generic"` skips SkillPack routing.
2. `router_provider` runs in `llm` or `hybrid` mode when configured.
3. Model matches at or above `router_min_confidence` become `SkillRouteMatch`.
4. Mid-confidence matches are treated as refinement/fallback, not hard failure.
5. `heuristic` or `hybrid` mode falls back to `SkillRegistry.heuristic_match()`.
6. No SkillPack match falls back to generic CIR or agent path, depending on generation mode.

`SkillRouteMatch` and `RouteDecision` are persisted in review actions so failures
can be diagnosed without guessing.

## SkillPack And Fallback

High-confidence deterministic matches should execute the registered `SkillPack`.
If a SkillPack declines or cannot validate its problem spec, the pipeline falls
back to generic CIR or agent generation with route context attached. `generic` is
not a domain; final PlaybookScript domains remain:

```text
algorithm, math, code, physics, chemistry, biology, geography
```

Source code remains a strong route signal for code-oriented skills, but the final
decision still belongs to the backend router / SkillRegistry boundary.
