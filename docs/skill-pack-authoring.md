# Skill Pack Authoring

A `SkillPack` is a pluggable domain expert. It owns domain-specific parsing,
validation, solving, and playbook composition behind a shared interface.

Each skill must provide:

1. Manifest
2. Optional `heuristic_match()`
3. `ProblemSpec` validator
4. `execute()` returning `PlaybookScript` JSON
5. Tests
6. Renderer contract if it emits a new snapshot kind

## Package Shape

Recommended layout:

```text
apps/api/app/domain/skills/<skill_id>/
  manifest.py
  skill_pack.py
  problem_spec.py
  ...
```

The central registration point is:

```text
apps/api/app/domain/skills/registry.py
```

Add the new pack to `build_default_skill_registry()`. Do not add imports or
branches for the new skill inside `RunPipelineUseCase`.

## Manifest

The manifest tells the router what the skill can and cannot handle:

```python
SkillManifest(
    skill_id="green_theorem",
    domain="math",
    name="Green Theorem",
    description="Structured Green theorem visual explanations.",
    execution_mode="deterministic",
    capabilities=[
        SkillCapability(
            capability_id="green_theorem.rectangle_circulation",
            description="Circulation over rectangular regions.",
            examples=["用格林公式解释矩形边界上的环流"],
            output_schema="GreenTheoremProblemSpec",
        )
    ],
)
```

The small model router receives all manifests dynamically and must return either
a `SkillRouteMatch` or `null`.

## Execution Contract

`SkillPack.execute()` returns `SkillExecutionResult`. If `handled=True`,
`playbook_json` must be valid `PlaybookScript` JSON:

```python
return SkillExecutionResult(
    handled=True,
    playbook_json=playbook.model_dump_json(),
    review_actions=["skill:green_theorem"],
)
```

If the route is relevant but cannot be handled safely, return `handled=False`
with a `fallback_reason`. Once CoverageDecision has classified the request as
`specialized`, the pipeline records `skill.execution_unhandled` and fails
closed; it does not continue to the generic or agent path under a specialized
quality label.

## Renderer Contract

If the skill emits an existing snapshot kind, reuse the existing renderer
schema. If it emits a new snapshot kind, add:

- backend `PlaybookScript` snapshot model
- frontend renderer
- director adapter if camera/focus behavior is needed
- snapshot and renderer tests

`solid_geometry` is the first `SkillPack` implementation. It is not the skill
framework itself.
