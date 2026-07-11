# LessonPlan

Status: Active

`LessonPlan` is MetaView's renderer-independent teaching contract. It records
why a lesson is structured a certain way before a SkillPack, agent, or legacy
CIR generator produces `PlaybookScript`.

It is not a rendering format and does not replace `PlaybookScript`.

## Runtime position

```text
Intake
  -> Router
  -> RuleBasedLessonPlanner
  -> persist pipeline_runs.lesson_plan_json
  -> specialized SkillPack | Agent provider | legacy CIR generator
  -> PlaybookScript
  -> Canonical QualityReport
  -> DirectorScript
  -> Remotion
```

The plan is created after routing and before any generation provider call. The
same typed object is passed through each path:

- specialized SkillPack: `SkillExecutionContext.lesson_plan`;
- agent: `AgentRequest.lesson_plan`, including the Node sidecar and Codex SDK
  prompt context;
- legacy single: the canonical plan is embedded in `build_cir_prompt(...)` as
  binding teaching guidance.

The plan is persisted before generation starts. Provider failures therefore
still leave the teaching decision visible in run history. Existing database
rows migrate with `lesson_plan = null`; MetaView does not invent plans for
historical runs.

The canonical backend gate receives the same plan. Registered fact IDs,
semantic visual roles, preferred scene types and exact numeric conclusions are
checked against the candidate Playbook. Missing evidence is repairable and
cannot enter `succeeded`; a deterministic SkillPack without a repair path fails
closed. Facts without a registered deterministic evidence matcher remain visible warnings
instead of being silently treated as verified.

## Contract boundary

`LessonPlan` contains:

- domain, title, objectives, prerequisites and misconceptions;
- expected conclusion and lesson arc;
- ordered `SceneIntent` values;
- required fact IDs and semantic visual roles;
- an optional semantic `preferred_scene_type` value.

It must not contain coordinates, frames, SVG, asset paths, layers, React
structures, renderer-private fields or Director instructions. Pydantic uses
`extra="forbid"`, and the checked-in JSON Schema is compared directly with
the model in contract tests.

Canonical files:

- model: `apps/api/app/domain/models/lesson_plan.py`;
- planner port: `apps/api/app/application/ports/lesson_planner.py`;
- rule and assisted planners: `apps/api/app/application/services/lesson_planner.py`;
- public schema: `apps/web/public/schemas/lesson-plan.schema.json`;
- four verified plans: `eval/benchmark_v2/lesson_plans/`.

## Planner implementations

`RuleBasedLessonPlanner` is the production default. It is deterministic and
has capability-semantic guidance for derivative/tangent, BFS, recursion stack
and projectile motion without branching on Gold case IDs. Unknown topics use
a bounded general teaching arc rather than renderer guesses. The planner also
receives the resolved route decision and ProblemSpec, so a notation such as
`d/dx(x^2)` does not lose the already matched calculus capability.

`LLMAssistedLessonPlanner` is implemented and contract-tested, but is not the
default runtime planner. It refines a deterministic draft, rejects invalid JSON
and domain drift, and may only change teaching decisions.

`lesson_plan_from_legacy_cir(...)` is a deliberately lossy compatibility
adapter. CIR does not contain reliable prerequisites, misconceptions or fact
IDs, so the adapter leaves those lists empty instead of fabricating knowledge.
It never copies layout, timing, layers or assets. New single-mode runs are
planned before CIR generation; the adapter is for importing legacy CIR objects,
not a second production planner.

## Current limits

- LessonPlan is initial run provenance; follow-up versions do not yet patch or
  version-bind it.
- SceneBlueprint is not yet a multi-SceneIntent compiler. The current phase
  passes teaching intent into existing generators without changing the sole
  PlaybookScript rendering contract.
- Runtime adherence checks currently cover the four initial Gold
  capabilities. New fact IDs and scene capabilities must register deterministic checks;
  until then the QualityReport marks them as unverified.
- The current gate validates aggregate fact/visual/scene evidence and exact
  Gold conclusions. It does not yet prove per-SceneIntent execution order or
  `narration_goal` alignment. That requires the planned PlaybookAssembler/
  localized scene trace rather than brittle text matching.
- Existing SkillPacks may optionally return a refined `LessonPlan`, but old
  SkillPacks remain valid and receive the shared plan through their context.
- CoverageDecision, Generalist Composer and SkillRecipe are later phases and
  are not implied by this contract.
