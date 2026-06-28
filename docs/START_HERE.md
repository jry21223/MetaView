# Start Here

Status: Active entrypoint

This is the first document to read before changing MetaView.

## Current product thesis

MetaView is an educational visual-explanation system with a dedicated director layer.

The core pipeline is:

```text
User input
  -> subject understanding / router / SkillPack / agent
  -> PlaybookScript
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

## What to read next

1. `docs/director-layer.md` — Director as the independent shot-planning layer.
2. `docs/pipeline.md` — generation modes, PlaybookScript, and export path.
3. `docs/agent-demo-acceptance.md` — how to prove agent / runtime-tool mode actually works.
4. `docs/skill-pack-architecture.md` — deterministic SkillPack contract.
5. `docs/frontend-shell.md` — frontend page and studio shell structure.
6. `AGENTS.md` — required working rules for coding agents.

## What not to do now

- Do not add another rendering output path.
- Do not introduce Manim, iframe rendering, or server-side HTML video rendering.
- Do not merge DirectorScript into PlaybookScript.
- Do not build a large DirectorPlanner before the rule Director is visible and render-impacting.
- Do not add more broad docs before updating this entrypoint and `docs/README.md`.

## Current next milestones

Done for the current MVP loop:

1. Director is visible through a read-only Director Inspector.
2. Remotion preview/export consumes Director camera motion and light pacing through the Director frame plan / adapter path.
3. Follow-up can save DirectorScript patch revisions for camera, pacing, shot, emphasis, focus, and director narration changes.
4. Export can target the active follow-up version instead of silently falling back to the original run.

Next milestone: run the Director product-loop cases, then consider an LLM or agent DirectorPlanner only after the rule/manual loop passes.
