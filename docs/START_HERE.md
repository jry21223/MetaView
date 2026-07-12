# Start Here

Status: Active entrypoint

This is the first document to read before changing MetaView.

## Current product thesis

MetaView is an educational visual-explanation system with a dedicated director layer.

The core pipeline is:

```text
User input
  -> subject understanding / router
  -> CoverageDecision
  -> LessonPlan
  -> SkillPack / SkillRecipe (composable) / agent / legacy CIR
  -> PlaybookScript
  -> canonical backend QualityReport
  -> DirectorScript
  -> RenderPlan
  -> Remotion preview / export
```

## The two contracts

`PlaybookScript` is the content contract. It owns lesson steps, snapshots, formulas, visual objects, code overlays, narration, and renderer-supported scene data.

`DirectorScript` is the direction contract. It owns viewing rhythm, shot framing, virtual camera motion, focus target, emphasis terms, transition intent, and optional director-level narration overrides.

Do not collapse these contracts. The product value is not only that MetaView can generate visual content; it can direct that content into a watchable explanation.

## Stable default profile

The safest local/demo profile is:

```text
METAVIEW_APP_EDITION=self
VITE_APP_EDITION=self
METAVIEW_GENERATION_MODE=single
METAVIEW_MOCK_PROVIDER_ENABLED=true
```

Agent mode is an active verification path, not the default production claim. To claim agent mode is working, run the agent demo acceptance suite and keep the generated report local under `eval/reports/`.

## Web route map

- `/` is the public Landing page.
- `/create` is the lesson creation entrypoint; use this path for bookmarks, external CTAs, and E2E flows that should open the workbench directly.
- `/templates` opens the template library.
- `/admin` is the hidden operations dashboard and remains restricted to `ops` edition administrators.

The move from `/` to `/create` for direct creation is an intentional route behavior change. Do not assume the root path opens the generator.

## What to read next

1. `docs/director-layer.md` — Director as the independent shot-planning layer.
2. `docs/pipeline.md` — generation modes, PlaybookScript, and export path.
3. `docs/lesson-plan.md` — shared teaching decisions and the renderer-free contract.
4. `docs/coverage-and-fallback.md` — capability modes, controlled composition and fail-closed boundaries.
5. `docs/skill-recipe.md` — transient composable execution contract and validator boundary.
6. `docs/quality-gate.md` — backend success semantics, repair, persistence, and export recheck.
7. `docs/benchmark-v2.md` — four Gold Cases and strict product-quality scoring.
8. `docs/agent-demo-acceptance.md` — how to prove agent / runtime-tool mode actually works.
9. `docs/skill-pack-architecture.md` — deterministic SkillPack contract.
10. `docs/frontend-shell.md` — frontend page and studio shell structure.
11. `AGENTS.md` — required working rules for coding agents.

## What not to do now

- Do not add another rendering output path.
- Do not introduce Manim, iframe rendering, or server-side HTML video rendering.
- Do not merge DirectorScript into PlaybookScript.
- Do not build a large DirectorPlanner before the rule Director is visible and render-impacting.
- Do not add more broad docs before updating this entrypoint and `docs/README.md`.

## Current next milestones

1. Migrate the four Gold generators from static/repeated state to genuine visual progression.
2. Make the four cases pass three independent live runs without hard failures.
3. Compile SceneIntent into shared SceneBlueprint/Playbook assembly without removing legacy CIR in one step.
4. Add SkillRecipe validation/execution for `composable` decisions without registering a universal SkillPack.
5. Record Capability Gaps before adding the offline SkillForge authoring workflow.
