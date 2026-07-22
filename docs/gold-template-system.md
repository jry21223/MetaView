# Gold Template system

Status: Active

Gold Case assets have one authoring source but two deliberately separate runtime
surfaces. A reviewed **Public Gold Template** is a teacher-grade product example;
a **Hidden Benchmark Variant** is an evaluation prompt that must enter the normal
generation pipeline. They share an archetype and validation vocabulary, never a
generated result.

## Public manifest

The public registry lives in
`apps/web/src/pages/Templates/gold-templates/`. The public-safe archetype catalog
at `contracts/conic-archetypes.json` is the source of truth for
archetype IDs, capabilities, mathematical fact rules, visual invariants, and
pedagogical rubrics. `GoldTemplateManifest` resolves that metadata by
`archetypeId` and attaches the public case copy, parameter contract, poster,
deterministic Playbook builder, and local follow-ups. `/templates`, detail
playback, and poster export derive their public cases from this registry.

The builder returns the same `PlaybookScript` consumed by the shared
`PlaybookPlayer` and Remotion `playbook` composition. Loading or operating a
public case does not call the API or model, create a run, or consume credits.
The frozen script is the reviewed product artifact, not evidence of generation
quality.

## Hidden evaluation boundary

Hidden prompts and expectations live in
`eval/hidden-cases/conic-sections/variants.json`. Only Python evaluation code
loads that path. Frontend source is tested to contain no import or reference to
`eval/hidden-cases`, and the hidden manifest contains no Playbook or steps.

`archetypeId` links a hidden prompt to the public-safe catalog entry. Hidden
variants retain their identity, prompt, parameters, conclusion form, and narrow
instance evidence aliases keyed by catalog fact ID. The catalog owns each fact
rule's meaning; the variant keeps the exact values or forms required for that
instance. The evaluation loader rejects unknown fact IDs, resolves capabilities,
semantic roles, state fields, and pedagogy from the catalog, then combines them
with the instance evidence. It does not select a public `caseId`, fetch a public
builder, or copy a frozen script. `make eval-conic-gold LIVE=1` submits each
hidden prompt to the real API Pipeline and evaluates the returned Playbook with
Benchmark V2.

This separation prevents a polished public case from becoming a benchmark
shortcut: changing the public template cannot make a hidden attempt pass, and a
hidden prompt cannot enter the browser bundle.
