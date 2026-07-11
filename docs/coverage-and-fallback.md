# Coverage Resolution and Fallback

Status: Active — production contract, verified resolver and persistence; Generalist Composer is planned.

MetaView resolves a canonical `CoverageDecision` before LessonPlan creation or any content
provider call:

```text
Skill routing + topic evidence + registered manifests + runtime tool discovery
  -> CoverageDecision
  -> persist pipeline_runs.coverage_decision_json
  -> LessonPlan
  -> SkillPack | agent | legacy CIR
  -> PlaybookScript
  -> Canonical QualityReport
```

`CoverageDecision` is a capability and safety boundary. It is not a rendering contract and
must not be copied into `PlaybookScript`, `DirectorScript`, or the Remotion composition.

## Modes

| Mode | Meaning | Fallback |
|------|---------|----------|
| `specialized` | A registered SkillPack, supported capability, valid ProblemSpec, matching domain, confidence threshold, deterministic solve tool, schema validator and self-check all passed. | `use_skill` |
| `composable` | An exact controlled profile is backed by canonical SceneBlueprint scene types and deterministic tools/validators. | `compose` |
| `experimental` | The domain is known, but no complete verified Skill/profile exists, or a controlled profile is missing a tool/validator. | `limited_visual` or `text_only` |
| `unsupported` | The manifest explicitly rejects the capability, or neither a reliable domain nor a verified execution capability exists. | `reject` |

`unsupported` and `experimental` decisions currently fail before LessonPlan/provider
execution. `unsupported` records `capability.unsupported`; experimental fallback records
`capability.text_only_required` or `capability.limited_visual_unavailable`. MetaView has no
separate text-only result surface and cannot validate a limited-visual candidate when the
required validator is missing, so neither path may be reported as video-generation success.

## Specialized verification

Coverage does not trust a router label by itself. `specialized` requires all of the following:

1. The Skill ID exists in `build_default_skill_registry()`.
2. The capability exists in that Skill manifest and has `supported=true`.
3. Router, independently resolved topic domain and manifest domain agree. When topic routing has
   no domain, only a registered, supported, high-confidence deterministic heuristic with a valid
   ProblemSpec may establish its own manifest domain; an arbitrary model route cannot.
4. Confidence meets the configured router threshold and `needs_refinement=false`.
5. The same Skill deterministically rederives and validates the same capability's ProblemSpec.
   Any fields supplied by the router must be semantically consistent with that independently
   derived spec; derived metadata may be omitted by the router.
6. `skill.<skill_id>.solve`, `playbook.schema.validate`, and `playbook.self_check` exist and
   are deterministic.

ProblemSpecs whose deterministic extractor marks an assumption as `unsupported:*` (or
`*_not_supported`) are rejected before Skill execution. If a specialized Skill nevertheless
declines at runtime or returns no Playbook candidate, the run is blocked with
`skill.execution_unhandled`; it never falls through to Agent/CIR while retaining a specialized
quality label.

This second validation prevents false matches such as a binary-search array being classified
as descriptive statistics merely because it contains many numbers.

## Controlled composition profiles

`composable` is deliberately narrow. The current verified profiles are:

- the exact derivative/tangent teaching template for `y=x²` at `(1,1)` with slope `2`;
- a qualitative BFS tree lesson without an explicit parseable edge list;
- the canonical `factorial(4)` recursion-stack lesson without arbitrary source code;
- qualitative horizontal projectile motion without numerical solving, air resistance, or
  collision.

Each profile is checked against the canonical SceneBlueprint schema, RuntimeToolHub manifests,
animation registry capabilities where required, and backend validators. Having any tool in the
same domain is not enough to claim `composable`.

`available_tool_ids` contains the minimum relevant tools that discovery proved available for
this decision. It is audit evidence, not an authorization boundary and not proof that a tool was
executed. The `SkillRecipe` contract and RecipeValidator now enforce a narrower per-request
allowlist; production wiring to the planned RecipeExecutor is not active yet.

## Current execution status

- Production/verified: contract, deterministic resolver, SQLite persistence, API response,
  QualityReport mode propagation, fail-closed unsupported/experimental behavior, Agent/CIR
  prompt binding, and History diagnostics.
- Production/verified: the transient `SkillRecipe` contract, canonical public schema and
  deterministic RecipeValidator.
- Transitional: a `composable` decision continues through the existing agent or legacy CIR
  generation path with the boundary attached. It does not yet create or execute a recipe in the
  live pipeline, so this is not the final Generalist execution architecture.
- Legacy: `RouteDecision` and topic `SkillMode` remain prompt/routing context. Neither is a
  substitute for CoverageDecision.
- Planned: Generalist Composer, SkillRecipe production execution, Capability Gap recording and
  offline SkillForge. Generalist Composer must not be registered as a universal SkillPack.

## Persistence and UI

The complete decision is stored once on the original run in
`pipeline_runs.coverage_decision_json`. Follow-up, version restore and export preserve that run
decision; new QualityReports prefer `coverage_decision.mode` and only fall back to the legacy
quality string for old rows. Their canonical gate receives the complete decision, so an old
experimental run cannot bypass the current fallback boundary during patch, restore, or export.
The same rechecks also receive the persisted LessonPlan, preserving required facts, visual
roles, scene types and expected conclusions across follow-up, restore and export.

History shows mode, confidence, fallback and a user-readable reason. Raw Skill/tool/missing
capability IDs are hidden by default and reserved for a later teacher/review diagnostics mode.
The decision is not rendered in the stage or video.

## Verification

```bash
uv run pytest \
  apps/api/tests/test_coverage_decision_contract.py \
  apps/api/tests/test_coverage_resolver.py \
  apps/api/tests/test_coverage_decision_persistence.py \
  apps/api/tests/test_coverage_pipeline_integration.py
```
