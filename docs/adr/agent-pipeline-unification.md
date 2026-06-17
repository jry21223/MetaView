# ADR: Unified Agent Pipeline

Status: accepted

## Context

MetaView historically had three generation surfaces:

- `single`: LLM emits CIR JSON, backend compiles CIR to `PlaybookScript`.
- deterministic `SkillPack`: backend routes known problems before the agent path.
- `agent`: pi sidecar or Codex provider emits `PlaybookScript` directly.

This split made `single` too powerful architecturally despite having no runtime
tool environment. It cannot execute deterministic kernels, SkillPacks,
validators, animation registry tools, or renderer checks during generation.
Codex direct JSON generation has the same risk if treated as a second `single`
path: it can read instructions, but it cannot execute runtime tools yet.

## Decision

MetaView will converge on one AgentPipeline:

```text
User input
→ Router / Skill routing
→ RuntimeToolHub
→ Agent provider adapter: pi/http or codex
→ PlaybookScript
→ schema validation / self-check / reviewer
→ Remotion Player / Export
```

`pi` and `codex` are provider adapters under the same contract. They do not own
separate pipelines. `pi` is the default tool-loop runtime after parity. Codex is
repo-aware fallback, planner, and repair support until it has a safe executable
tool adapter.

`SkillPack`, deterministic kernels, validators, animation tools, and schema
checks belong to `RuntimeToolHub`. A SkillPack may still be used as a
deterministic direct path when it fully handles the prompt, but that decision is
made inside AgentPipeline, not as an unrelated pre-agent pipeline.

`PlaybookScript` remains the only rendering contract. MetaView will not add
Manim, iframe rendering, arbitrary HTML rendering, or server-side HTML video as
alternate exits.

## Migration Policy

`single` remains a legacy fallback and current default until the agent parity
suite passes. It is retained for rollback, CI mocks, and historical
compatibility, but no new skills, kernels, or prompt logic should be added to
the `single` path.

The default may move from `single` to `agent` only after focused acceptance cases
cover math deterministic validation, algorithm SkillPack/runtime behavior, and
code/Codex fallback behavior.

## Consequences

- New provider integrations implement `AgentRequest -> AgentResult`.
- New deterministic capabilities are registered as SkillPacks and RuntimeToolHub
  tools, not as branches inside `RunPipelineUseCase`.
- Existing sidecar routes for geometry assertions and animation tools remain
  compatibility wrappers over RuntimeToolHub.
- Provider-specific behavior stays in adapters; the pipeline owns validation,
  review, persistence, and rendering-contract enforcement.
