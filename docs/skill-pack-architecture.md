# Skill Pack Architecture

MetaView skills are pluggable domain experts. The central pipeline routes a
request to a registered `SkillPack`, asks that skill to produce a
`PlaybookScript` JSON payload, then builds the normal `DirectorScript` and
hands rendering to the existing renderer layer.

```text
SkillPack Registry
  -> Small Model Router or registry heuristic
  -> Selected SkillPack
  -> ProblemSpec validation
  -> Skill-specific deterministic kernel or composer
  -> PlaybookScript JSON
  -> DirectorScript
  -> Renderer
```

`RunPipelineUseCase` only knows the shared skill interfaces and registry. It
does not import a skill package such as `solid_geometry`, and it does not know
how any skill extracts specs, solves kernels, or builds playbooks.

## Core Contracts

- `SkillManifest` describes the skill, execution mode, capabilities, examples,
  and unsupported notes.
- `SkillRouteInput` contains the user prompt plus optional source code and
  language.
- `SkillRouteMatch` identifies a selected skill and may include a candidate
  `problem_spec`.
- `SkillPack.validate_problem_spec()` converts untrusted router output into the
  skill-owned Pydantic spec model.
- `SkillPack.execute()` returns `SkillExecutionResult` with `PlaybookScript`
  JSON. The pipeline validates that JSON against the shared `PlaybookScript`
  schema before persisting it.

## Registry

The default skill list lives in:

```text
apps/api/app/domain/skills/registry.py
```

Adding a new skill should add a package and register its `SkillPack` in
`build_default_skill_registry()`. The central pipeline should not gain a new
skill-specific import or branch.

## Routing

In `hybrid` mode, the registry first accepts a high-confidence,
non-refining deterministic heuristic match. If there is no such match, the
small model router receives all current manifests and returns either a
`SkillRouteMatch` JSON object or `null`. The router prompt is intentionally dynamic:

```text
Do not assume the only skill is solid_geometry. The skill list is dynamic.
```

The router must not solve final answers. It can only choose a skill and
optionally draft a `problem_spec` for that skill to validate.

If the model router is unavailable, low confidence, or returns `null`, the
pipeline reuses the best lower-confidence heuristic evidence. `llm` mode does
not preempt the model; `heuristic` mode never calls it.

## First Implementation

`solid_geometry` is the first `SkillPack`. It is not the skill framework
itself. Its package owns:

- manifest and capabilities
- heuristic spec extraction
- `SolidGeometryProblemSpec` validation
- deterministic SymPy kernel execution
- `PlaybookScript` construction for `solid_geometry_scene`

The shared Director and renderer contracts remain unchanged.
