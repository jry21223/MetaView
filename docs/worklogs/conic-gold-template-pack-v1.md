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
7. Playbook schema version and player protocol remain unchanged. Preview and
   export continue to use `PlaybookPlayer` / `PlaybookComposition`.

This record will be extended with final paths, validation evidence, and known
limitations as the pack is implemented.
