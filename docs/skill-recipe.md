# SkillRecipe

Status: Active contract and validator; execution and Generalist Composer are planned.

`SkillRecipe` is a transient, data-only execution plan for a request whose
`CoverageDecision` is `composable`. It is never written to the SkillPack registry and cannot
create code, choose filesystem paths, embed raw SVG, invoke shell commands, or bypass the
canonical Quality Gate.

```text
CoverageDecision(composable)
  + LessonPlan
  -> SkillRecipe
  -> RecipeValidator
  -> planned RecipeExecutor / RuntimeToolHub
  -> SceneBlueprint
  -> PlaybookScript
  -> Canonical QualityReport
```

## Contract

The canonical Pydantic contract is
`apps/api/app/domain/models/skill_recipe.py`. Its checked-in public schema is
`apps/web/public/schemas/skill-recipe.schema.json` and is generated with:

```bash
cd apps/api
uv run python -m scripts.export_public_schemas
```

The recipe contains verified fact requirements, an exact RuntimeToolHub allowlist, required
validators, compilable SceneBlueprint templates, canonical snapshot kinds, semantic asset
requirements and QualityReport score expectations. Its embedded LessonPlan remains free of
renderer/layout data.

## Validation boundary

The pure domain validator accepts a validation context assembled at the application edge. The
context derives from existing sources of truth:

- deterministic tools: `RuntimeToolHub.list_tools()`;
- snapshots: `SUPPORTED_SNAPSHOT_KIND_SET`;
- scenes: the compiler's executable scene set, not the broader JSON Schema enum;
- assets: checked-in Asset Manifest packs;
- quality dimensions: `QualityScoreDimension` used by `QualityReport`.

Validation fails when coverage is not composable, the recipe exceeds coverage's tool evidence,
a tool/validator is missing or non-deterministic, a scene is schema-valid but not compilable, a
snapshot kind is unsupported, an explicit asset cannot be resolved, or the lesson exceeds the
bounded scene count.

## Current limitation

Production does not yet ask a Generalist Composer to create this object and does not yet execute
it. Until the RecipeExecutor lands, composable requests continue through the transitional
generation path documented in `coverage-and-fallback.md`.
