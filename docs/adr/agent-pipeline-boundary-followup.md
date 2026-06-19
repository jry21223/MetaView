# ADR: Agent Pipeline Boundary Follow-up

## Status

Proposed follow-up after the AgentPipeline runtime contract lands.

## Context

PR #99 introduces `AgentPipeline` and `RuntimeToolHub`, but the migration is
still intentionally incremental. `RunPipelineUseCase` remains responsible for
run state and persistence, while some agent-specific request assembly, repair,
and review details still live close to the legacy generation flow.

This is acceptable for the first runtime integration, but it should not become
the long-term architecture. New agent-only capabilities should move toward
`application/agent/` instead of expanding `RunPipelineUseCase`.

## Decision

- `RunPipelineUseCase` should own run orchestration: route selection, status,
  persistence, billing hooks, and dispatch into generation modes.
- `application/agent/` should own agent-specific behavior: request assembly,
  self-check, reviewer repair, runtime tool orchestration, and provider-facing
  contracts.
- `RuntimeToolHub` remains the single facade exposed to agent providers, but its
  implementation should split internally by domain area: playbook checks,
  animation expansion, geometry assertions, and SkillPack execution.
- `single` remains a legacy fallback. New deterministic skills and runtime
  tools should enter AgentPipeline / RuntimeToolHub rather than the single
  prompt path.

## Next Migration Steps

1. Move agent request construction out of `RunPipelineUseCase` into a dedicated
   `application/agent/request_builder.py`.
2. Move agent self-check and reviewer repair policy into `application/agent/`.
3. Split `runtime_tool_hub.py` into small domain modules while keeping the
   public facade stable.
4. Add tests at the AgentPipeline boundary so `RunPipelineUseCase` can be
   tested as orchestration, not as an agent implementation detail.

No PlaybookScript schema, renderer contract, or export path changes are part of
this follow-up.
