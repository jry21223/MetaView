# Conic Gold Template Pack V1 — architecture record

## Baseline review

The implementation starts from `origin/main` at `542dbfe`. The public template
surface is currently split between `apps/web/src/pages/Templates/templates.ts`
(catalogue copy) and `templatePreviewCases.ts` (deterministic Playbooks,
parameters, follow-ups, and poster metadata). Public preview export calls those
builders directly and writes only ignored output under `data/template-previews`.

`PlaybookScript` remains the sole runtime contract. Its `math_scene` snapshot
already supports safely parsed explicit and parametric curves, points, segments,
annotations, formulas, numeric parameter scope, animated object continuity, and
camera planning. `math_plot` remains useful for single-valued function graphs.
The renderer registry already maps both kinds for browser preview and Remotion.
The existing pole/polar case is a six-step deterministic `math_scene` Playbook
with local parameter recomputation and three follow-ups per step.

Gold Benchmark V2 is expectation-driven and evaluates real or recorded pipeline
output from `eval/fixtures`; it checks schema, scene type, semantic roles, facts,
state, pedagogy, timing, and warnings. Public template Playbooks are not part of
that input path. Skill routing is registry-based, while unsupported math falls
back to controlled/composable or experimental coverage rather than widening the
strict rejection boundary.

## Architecture conclusion

1. No new snapshot kind or Renderer is justified. Conics fit the existing
   `math_scene` primitives; `math_plot` remains available for explicit graphs.
2. Public conic cases are registered through one typed manifest carrying
   archetype, facts, visual invariants, pedagogy, parameters, poster, frozen
   Playbook builder, and local follow-ups. The template page and export flow
   derive public data from that registry.
3. Hidden variants live below `eval/hidden-cases/conic-sections` and are loaded
   only by Python evaluation code. Web source must never import that directory,
   so prompts and expected answers cannot enter the public bundle.
4. `archetypeId` is the only link between a public teacher case and its hidden
   variants. It selects shared capability/fact rules; it never selects or copies
   a frozen Playbook result.
5. Deterministic conic calculations belong in the existing Web shared/domain
   boundary as dependency-free TypeScript pure functions. Public templates,
   parameter interaction, and renderer-facing scene builders consume the same
   functions. Agent routing receives only archetype/tool guidance; it does not
   receive public scripts or hidden answers.
6. Stable semantic roles are a small compatible enhancement to `math_scene`
   objects, not a schema replacement. They allow renderer and benchmark checks
   without case-ID special handling.
7. Playbook schema version and player protocol remain unchanged. The existing
   `math_scene` snapshot gains only an optional `camera_mode: "fixed"` hint so
   a declared full-scene ViewBox can opt out of object-introduction auto-zoom.
   Preview and export continue to use `PlaybookPlayer` / `PlaybookComposition`.

The five public Follow-up intents also stay inside this boundary. They run
through the existing versioned semantic-interaction engine: step-local edits
preserve unrelated steps, pacing repairs the same Playbook timeline, and
parameter edits clamp or reject by Manifest controls before rebuilding through
the frozen builder and shared kernel.

## Implemented result

- The public manifest is `apps/web/src/pages/Templates/gold-templates/manifest.ts`;
  six conic manifests feed the existing template catalogue and preview registry.
- Shared public-safe archetype metadata lives in
  `contracts/conic-archetypes.json`; both public manifests and
  hidden evaluation variants resolve the same capability, fact, visual, and
  pedagogy rules by `archetypeId`.
- Hidden prompts are isolated in
  `eval/hidden-cases/conic-sections/variants.json`: 12 variants, two per
  archetype, with only catalog-keyed instance fact evidence and no duplicated
  shared metadata, Playbook, or step payload.
- The pure TypeScript kernel is
  `apps/web/src/shared/domain/conicSections.ts`. No snapshot kind, renderer, or
  Playbook schema version was added. Optional `semantic_role` fields and the
  optional fixed-camera hint were added compatibly to existing `math_scene`.
- The API `conic_sections` SkillPack exposes only the verified horizontal
  ellipse focus-definition route as specialized. Other conic requests keep
  their real composable/generic/experimental coverage result.

## Live benchmark evidence

On 2026-07-22 the 12-case hidden manifest was submitted once to a local API
configured with `METAVIEW_GENERATION_MODE=agent` and heuristic routing. The
initial run preserved 0/12 passes in the ignored report
`eval/reports/20260722_120006.json`: the supported ellipse output scored 100 but
failed the zero-warning hard gate because all six voice-over durations were too
short; the remaining cases retained their canonical-gate or coverage failures.

The deterministic adapter duration was corrected without changing a threshold
or expectation. Re-running `conic-hidden-ellipse-focus-01` through the same
AgentPipeline/API boundary produced 100/100, zero warnings, and 1/1 pass in
`eval/reports/20260722_120058.json`. This proves one supported archetype reaches
the live Gold boundary; it does not claim that the other five archetypes have
specialized generation quality. The local API had no model key, so non-covered
cases used existing mock/fallback behavior; the passing ellipse case used the
new deterministic SkillPack rather than a public frozen Playbook.

The permanent regression seam is
`apps/api/tests/test_conic_gold_pipeline.py`. It runs a hidden prompt through
`RunPipelineUseCase` in Agent mode, asserts specialized conic routing, validates
the produced LessonPlan and Playbook against the canonical quality gate and
renderer registry, then requires a passing Gold score with no warnings. A
second test keeps an unsupported hyperbola variant as a real failure instead of
substituting the public template.

## Final verification record (2026-07-22)

- `make check` passed: API 1020 passed / 3 skipped, Web 1145 passed, Agent 63
  passed, MCP 18 passed, and Web/Agent builds completed.
- `npm --workspace apps/web run test:visual:conics` passed 84/84 combinations:
  six public cases at all seven DESIGN.md review viewports (1440x900,
  1366x768, 1920x1080, 1024x768, 720x900, 390x844, and 320x700) in light and
  dark themes. The suite changes a real parameter, walks every Playbook step,
  checks critical semantic-object cardinality, horizontal overflow,
  formula/stage/control clipping, responsive parameter-panel behavior, top-bar
  collapse, and five local follow-ups. Fixed-camera conic scenes prevent
  object-introduction auto-zoom from cropping labels during step transitions.
- `npm --workspace apps/web run template-previews:export` exported all 10 public
  cases; `template-previews:posters` regenerated the six conic posters through
  the shared Remotion composition. Only the durable conic poster change needed
  by the discriminant LaTeX correction is retained.
- `make visual-check` remained blocked twice by the unchanged
  `projectile_motion` showcase: content pixel ratio 0.02351 is below its 0.028
  threshold. No visual threshold or unrelated physics fixture was changed.
- Recorded `make eval-gold` retained the existing strict baseline of 0/12
  attempts. Recorded `make eval-conic-gold` reported the first missing hidden
  result fixture and exited; hidden generated results are intentionally not
  replaced with public frozen Playbooks. The live/Agent ellipse pass above is
  the positive generation evidence for V1.

## Known limitations

- Specialized deterministic generation is currently limited to the horizontal
  standard-ellipse focus-definition archetype. The other five archetypes are
  public teacher templates and hidden evaluation definitions, not claimed
  specialized Agent capabilities.
- Vertical-major-axis generation, rotated/general quadratic conics, and
  area-extremum proofs remain composable, generic, or experimental.
- Recorded hidden-result fixtures are deliberately absent. A model-backed live
  run requires a configured local API and provider key; no key was available in
  this verification environment.
