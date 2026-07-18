# MetaView Subject Visual Assets

MetaView visual kits are small, renderer-addressable asset packs for subject scenes.
They let scripts ask for semantic roles such as `wind`, `force`, `land`, or `object`
without letting the agent hand-author SVG paths or frame coordinates.

## Manifest Contract

Public manifests live under `apps/web/public/assets/metaview-kits/`.
Each pack follows `manifest.schema.json` and includes:

- `schemaVersion`: currently `1.0.0`.
- `packId`: stable pack id, for example `geography-earth-basic`.
- `subject`: one of `math`, `physics`, `chemistry`, `biology`, `geography`, `algorithm`, `code`.
- `version`: pack version.
- `license`: pack-level license.
- `licenseMode`: `single` or `mixed`.
- `defaultTeachingUse`: one of `formal`, `primitive`, `experimental`, or `ui`.
- `sources`: source records with `id`, `label`, `license`, nullable `sourceUrl`, nullable `licenseUrl`, and optional `attribution`.
- `sceneTemplates`: scene template ids that can use this pack.
- `rendererKinds`: renderer snapshot kinds expected to consume it.
- `assets`: asset entries with `id`, `type`, `path`, `tags`, `semanticRoles`,
  `sourceId`, `license`, `commercialUseStatus`, `requiresAttribution`,
  `commercialUseAllowed`, `shareAlike`, `modificationAllowed`, nullable
  `sourceUrl`, nullable `licenseUrl`, nullable `modifiedFrom`, optional
  `attribution`, optional per-asset `teachingUse`, and optional `rendererHints`.

The TypeScript registry is in
`apps/web/src/features/playbook/engine/assets/assetRegistry.ts`.
Renderers should use `getAssetPack(packId)` or `findAssetByRole(subject, semanticRole)`
instead of hard-coding asset URLs.
The API mirror uses
`apps/api/app/domain/services/asset_manifest_resolver.py` against the same
public manifest files. Backend layout compilers should resolve asset ids through
that helper rather than carrying a second hard-coded role-to-asset table.

## Scene Blueprint Compiler

The shared input contract lives at
`apps/web/public/schemas/scene-blueprint.schema.json`. Web fixtures validate
against this schema with Ajv, and API tests read the same file before compiling
representative blueprints. This schema describes the visual intent input to the
compiler; it is not a replacement for `PlaybookScript`.

`apps/web/src/features/playbook/engine/compiler/sceneBlueprintCompiler.ts`
is the narrow visual-compiler entrypoint for the current flagship subjects.
It accepts intent-level fields such as `subject`, `sceneType`, `visualIntent`,
and `emphasisPoints`, resolves assets through the shared asset resolver, applies
deterministic layout defaults, and outputs normal `PlaybookScript`.
Biology scenes can now accept `structures`, `steps`, `connections`, and
`callouts`; chemistry scenes can accept `atoms`, `bonds`, `reactants`,
`products`, `arrows`, and `electronFlows`; math plots can accept `curves`,
`params`, plot bounds, marker/shade controls, and formula labels. Subject layout
helpers consume those inputs first, then fall back to deterministic flagship
defaults when the fields are absent. Chemistry molecule scenes additionally
hydrate structured JSON presets through `kits/chemistry/moleculePresetResolver.ts`
before native atom/bond geometry is rendered, so atom/bond/callout data comes from
either the blueprint or the asset pack rather than a hand-written water molecule
inside the compiler.
The backend mirror uses `apps/api/app/domain/services/molecule_preset_resolver.py`
against the same public preset JSON before returning `PlaybookScript` to
SkillPack/runtime-tool callers.
For larger molecule inputs, the API also exposes
`apps/api/app/domain/services/rdkit_molecule_compiler.py`, which converts
SMILES strings such as glucose into the same `molecule_2d_scene` atom/bond
snapshot contract using RDKit 2D coordinates.
The current supported scene blueprints are `east_asia_monsoon`,
`projectile_motion`, `cell_structure`,
`dna_replication`, `molecule_2d_water`, `molecule_2d_methane`,
`molecule_2d_glucose`, `carbon_dioxide_molecule`,
`reaction_synthesis_water`, `derivative_tangent`, `cubic_tangent`,
`bfs_graph`, `recursion_stack`, and `binary_search`. The API runtime compiler
uses RDKit for `molecule_2d_glucose`; the web showcase renders the same
chemistry-basic SMILES asset through a deterministic structured layout.
The backend mirror lives at
`apps/api/app/domain/services/scene_blueprint_compiler.py` so SkillPack or
agent generation can adopt the same blueprint boundary before returning
`PlaybookScript`; it is not an MCP exposure layer.
Subject-specific API layout compilers under `apps/api/app/domain/services/`
must consume manifest-backed asset resolution before emitting snapshot asset ids,
matching the web compiler path as closely as possible.

This is not a second rendering contract. The compiler must not pass raw SVG
paths, arbitrary renderer code, or LLM-selected coordinates through to renderers.
Compiled output still flows through the existing renderer snapshot kinds, then
through the same Remotion composition and `visualQualityGate`.

Current backend SkillPack adoption:

- `geography_earth` compiles East Asia monsoon prompts to `geo_map_scene` with
  `geography-earth-basic`.
- `physics_mechanics` compiles projectile-motion visual steps to
  `physics_force_scene` with `physics-basic` while preserving formula, table,
  and answer steps from the deterministic mechanics kernel.

## Starter Packs

- `core-visual-basic`: experimental particle presets only. Teaching callouts,
  formula cards, grids, timeline arrows, and warning symbols use native renderer
  geometry rather than decorative SVG assets.
- `geography-earth-basic`: Natural Earth-derived East Asia map GeoJSON and map
  layers for `geo_map_scene`. The SceneBlueprint path routes map layers,
  native flow arrows, pressure centers, and optional particle presets through a geography layout
  compiler so custom flow/pressure input compiles into renderer snapshots.
- `physics-basic`: reusable block, ramp, spring, and pulley primitives.
  Projectile/object placement, native vectors,
  trajectories, and formulas now route through a physics layout compiler.
- `biology-basic`: internal organelle and DNA process SVGs for `bio_cell_scene`
  and `bio_process_scene`. The SceneBlueprint path routes custom cell
  structures, process steps, connections, and callouts through a biology layout
  compiler before emitting renderer snapshots.
- `chemistry-basic`: SMILES-addressable structured molecule presets and a glucose SMILES
  fixture for API RDKit compilation into `molecule_2d_scene` and
  `reaction_scene`. The SceneBlueprint path routes custom atom/bond layouts and
  reaction participants through chemistry layout compilers and native geometry while preserving
  preset/RDKit fallbacks.
- `math-basic`: structured plot presets for math plot/formula scenes. The
  SceneBlueprint path routes custom curve expressions, numeric params, plot
  bounds, markers, shaded regions, and labels through a math layout compiler.
- `algorithm-code-basic`: BFS graph, recursion-stack, and
  binary-search presets for `graph_scene`, `call_stack_scene`, and
  `code_trace_scene`. The deterministic
  `algorithm_graph_core` SkillPack emits runtime `graph_scene` snapshots with
  `pack_id`, `asset_id`, queue-node, visited-node, and active-edge state so
  generated BFS playbooks use the same native geometry as the showcase fixture.
  The SceneBlueprint path now routes BFS graph and binary-search code traces
  through small layout compilers, so structured blueprint input such as custom
  graph nodes or binary-search arrays is compiled into deterministic renderer
  snapshots instead of being ignored by fixture-specific constants.

Starter assets can be internal placeholders or durable third-party/public-domain
derivatives. Replace or add durable assets only when the source license,
attribution, commercial-use status, and provenance are recorded in the manifest.

## Phase 1 Closeout

Phase 1 is the current checked-in baseline for the asset roadmap: governance,
Core Visual Kit reuse, geography/physics flagship scenes, warning-only quality
gates, and showcase self-tests. It is intentionally not the MCP exposure layer.

Phase 1 acceptance evidence:

- Governance is enforced by `npm --workspace apps/web run asset:audit`; the
  heavy asset audit and Remotion showcase render run through `make visual-check`,
  while `make check` stays on lint, unit/contract tests, typecheck, and builds.
- Registry data is single-sourced from public manifests through
  `assetRegistry.ts`; `assetRegistry.test.ts` validates all registered roadmap
  starter packs, schema conformance, rendererKinds, source metadata, commercial
  status, and Natural Earth provenance.
- `AssetSvg` is the reusable renderer adapter for SVG/image assets. Missing
  assets render deterministic fallback markup with `data-missing-asset="true"`.
- `core-visual-basic` is consumed by subject renderers for shared callouts,
  formula tags, lab grids, warning icons, flow arrows, and timeline arrows
  instead of remaining passive metadata.
- `geography-earth-basic` powers `east_asia_monsoon` through Natural
  Earth-derived land/coastline/map-layer assets, monsoon flow assets, pressure
  centers, and moisture particles.
- `physics-basic` powers `projectile_motion` through projectile/object assets,
  vector arrow assets, trajectory, formula tag, and motion trail markers.
- `visualQualityGate` is non-blocking at runtime but exposes warning metadata;
  tests cover missing asset resolution, forbidden array fallback, asset policy
  warnings, and clean flagship fixtures.
- `subjectVisualShowcase.ts` is the durable self-test matrix. It currently
  covers 14 flagship fixtures across geography, physics, biology, chemistry,
  math, and algorithm, with required static markers and per-fixture screenshot
  quality thresholds.
- `showcase:baseline` writes a golden-review queue for the generated PNGs:
  each fixture gets `screenshotReview.status`, `requiredMarkers`,
  `blockingIssues`, `driftIssues`, and `contractCoverage` so release handoffs
  can distinguish screenshots that are ready for human review from screenshots
  blocked by missing output, weak image quality, or reference drift while also
  seeing which scene asset contracts were matched. The baseline report also
  exposes `contractOk` and `contractIssues`; release readiness and approved
  reference stamping fail when any fixture is missing a required contract asset.
  In the current matrix, all 14 showcase fixtures expose matched contract
  coverage when their renderer consumes the required assets.

Before treating this phase as closed in a release or branch handoff, run:

```bash
npm --workspace apps/web run asset:audit
npm --workspace apps/web run showcase:export
npm --workspace apps/web run showcase:smoke
npm --workspace apps/web run showcase:baseline
npm --workspace apps/web run showcase:review-packet
make visual-check
METAVIEW_GENERATION_MODE=single make check
```

The next phase should focus on productionizing the multi-subject asset compiler:
expand stable biology/chemistry/math/algorithm layout compilers, turn the
generated `screenshotReview` queue into human-approved screenshot references,
tighten attribution/export policy around non-internal assets, and only then
prepare the separate MCP read-only asset exposure work.

Phase 2 has started with the algorithm call-stack compiler: `recursion_stack`
now accepts structured `stackFrames`, `currentFrameId`, and `codeTrace` blueprint
input instead of always rendering the built-in factorial demo.

## Adding Assets

1. Add the file under a pack directory in `apps/web/public/assets/metaview-kits/`.
2. Add a manifest entry with semantic roles that match renderer needs.
3. Record license, attribution, commercial-use status, source/license URLs,
   and `modifiedFrom` when the asset is derived from an external source.
4. Run `npm run asset:audit`.
5. Add or update a focused registry test.

Do not commit third-party binary assets without explicit license metadata.
Assets with `license: "unknown"` fail audit and must not be exposed through MCP
or commercial export paths.

## Flagship Fixture Matrix

The checked-in showcase catalog lives in
`apps/web/src/features/playbook/engine/fixtures/subjectVisualShowcase.ts`.
It is the source of truth for Day-21 demo coverage and keeps fixture ids,
asset packs, renderer kinds, code-track settings, and required static-render
markers in one place.
The actual flagship playbooks are generated from
`apps/web/src/features/playbook/engine/fixtures/subjectVisualBlueprints.ts`
through `sceneBlueprintCompiler`, so the demo matrix exercises the
intent-to-asset-to-renderer compiler path instead of a duplicate hand-written
snapshot catalog.

| Fixture | Domain | Asset pack | Renderer | Quality target |
| --- | --- | --- | --- | --- |
| `east_asia_monsoon` | geography | `geography-earth-basic` | `geo_map_scene` | Natural Earth land/coastline layers, native monsoon flow, pressure centers |
| `projectile_motion` | physics | `physics-basic` | `physics_force_scene` | native projectile/vector geometry, trajectory, motion trail |
| `cell_structure` | biology | `biology-basic` | `bio_cell_scene` | cell, nucleus, mitochondrion assets plus callouts |
| `dna_replication` | biology | `biology-basic` | `bio_process_scene` | DNA helix, replication fork, native flow arrow, process callout |
| `molecule_2d_water` | chemistry | `chemistry-basic` | `molecule_2d_scene` | structured atoms/bonds and molecule preset |
| `molecule_2d_methane` | chemistry | `chemistry-basic` | `molecule_2d_scene` | SMILES C, structured atoms/bonds, tetrahedral callout |
| `molecule_2d_glucose` | chemistry | `chemistry-basic` | `molecule_2d_scene` | glucose SMILES asset, structured ring layout, C6H12O6 formula |
| `carbon_dioxide_molecule` | chemistry | `chemistry-basic` | `molecule_2d_scene` | structured atom/bond input, double bonds, CO2 formula |
| `reaction_synthesis_water` | chemistry | `chemistry-basic` | `reaction_scene` | reactants/products plus native reaction geometry |
| `derivative_tangent` | math | `math-basic` | `math_plot` | formula plus curve/tangent plot markers |
| `cubic_tangent` | math | `math-basic` | `math_plot` | structured curve expressions, plot bounds, marker, shaded region |
| `bfs_graph` | algorithm | `algorithm-code-basic` | `graph_scene` | graph node, queue, active-edge assets plus code track |
| `recursion_stack` | algorithm | `algorithm-code-basic` | `call_stack_scene` | structured stackFrames/codeTrace input, call frames, waiting stack frames, active code-line asset |
| `binary_search` | algorithm | `algorithm-code-basic` | `code_trace_scene` | binary-search preset, active code-line asset, array window, low/mid/high pointer assets |

Local preview helpers:

1. Export JSON fixtures:

   ```bash
   npm --workspace apps/web run showcase:export
   ```

2. Render and validate every flagship fixture through the existing Remotion
   composition:

   ```bash
   npm --workspace apps/web run showcase:smoke
   ```

   The smoke gate writes ignored PNG evidence to
   `eval/shots/subject-visual-showcase-smoke/` and fails if a fixture produces a
   missing, tiny, visually blank, or under-baseline PNG. The
   `per-fixture screenshot baseline` lives in `subjectVisualShowcase.ts` next to
   the static marker requirements, so geography, physics, biology, chemistry,
   math, and algorithm fixtures can enforce different content coverage,
   color-count, and layout-spread floors.

3. Generate the ignored baseline audit report from the latest smoke summary:

   ```bash
   npm --workspace apps/web run showcase:baseline
   ```

   The report is written to
   `eval/reports/subject-visual-showcase-baseline.json` and records each
   fixture's baseline, measured screenshot stats, safety margins, and
   `screenshotReview` metadata. It also records `contractCoverage`, including
   matched contract ids, required asset ids, rendered asset ids, and missing
   contract assets when a scene has an asset contract. Top-level `contractOk`
   and `contractIssues` fields make missing contract assets block release
   readiness and approved reference stamping even when the PNG quality thresholds
   pass. A `ready_for_review`
   status means the PNG passed automated quality gates and includes the required
   static markers; `blocked` records missing-summary or under-baseline blockers;
   `drift_review_needed` records reference drift that should be visually checked
   before release; `approved_reference_current` means the render still matches a
   reference entry that carries explicit human-review metadata. To compare
   against a previous
   report without changing the hard failure contract, pass
   `SHOWCASE_BASELINE_REFERENCE=eval/reports/subject-visual-showcase-baseline.json`;
   the command will emit `driftOk` and per-fixture drift warnings separately from
   under-baseline failures. Script path inputs accept either workspace-relative
   paths such as `../../eval/...` or repo-root-relative paths such as `eval/...`.
   Release checks can require a fully approved reference set without changing
   the daily `make check` path:

   ```bash
   SHOWCASE_BASELINE_REFERENCE=eval/reports/subject-visual-showcase-approved-reference.json \
   SHOWCASE_BASELINE_REQUIRE_APPROVED=1 \
   npm --workspace apps/web run showcase:baseline
   ```

   That opt-in gate fails unless every fixture reports
   `approved_reference_current`.
   To package the current baseline into a human-review checklist with screenshot
   links, status, blocker metadata, contract coverage, required markers, and the
   approval command, run:

   ```bash
   npm --workspace apps/web run showcase:review-packet
   ```

   The command writes
   `eval/reports/subject-visual-showcase-review-packet.md` by default. It is an
   ignored handoff artifact for visual review, not a replacement for
   `showcase:approve-reference`.
   To create an approved reference after reviewing the generated PNGs, run:

   ```bash
   SHOWCASE_REFERENCE_REVIEWER=visual-reviewer \
   SHOWCASE_REFERENCE_NOTES="All flagship screenshots reviewed." \
   npm --workspace apps/web run showcase:approve-reference
   ```

   The command refuses to stamp a reference unless `SHOWCASE_REFERENCE_REVIEWER`
   is set and the current baseline report is ready for review. It writes the
   ignored reference file to
   `eval/reports/subject-visual-showcase-approved-reference.json` by default.
   Manual reference files use the same shape; keep reviewed references out of
   the generated smoke directory and add `review` to each approved entry:

   ```json
   {
     "id": "projectile_motion",
     "stats": { "...": "measured screenshot stats" },
     "review": {
       "status": "approved",
       "reviewer": "visual-reviewer",
       "approvedAt": "2026-07-02T00:00:00.000Z",
       "notes": "Projectile asset, trail, vectors, and formula card reviewed."
     }
   }
   ```

4. Render a single fixture through the existing Remotion composition:

   ```bash
   node apps/web/scripts/render-shots.mjs eval/reports/subject-visual-fixtures/east_asia_monsoon.json eval/shots/east_asia_monsoon
   ```

5. Open the local showcase page in the web app at `/asset-showcase`.

The frontend `visualQualityGate` is a diagnostics/attribution display layer;
pipeline success is decided by the backend Canonical QualityReport. Missing
assets and unsupported renderer contracts are blocking backend issues, while
showcase tests additionally require flagship fixtures to produce no warnings,
missing fallback, or unknown snapshot renderer. The frontend layer still emits metadata for deterministic
issues such as missing assets, forbidden array fallback, low visual richness,
possible label/callout overlap, and asset usage that requires attribution,
carries share-alike obligations, has unknown licensing, or is not marked safe
for commercial use. `PlaybookComposition` exposes those asset policy warnings as
machine-readable root attributes (`data-asset-attribution-*` and
`data-asset-license-risk-*`) so preview/export callers can build attribution and
commercial-use reports without parsing renderer internals. Web export submits
that report as structured `asset_report` metadata, and the API writes it as an
`asset-report.json` sidecar with a dedicated download URL once rendering
completes. The sidecar includes `commercial_export.allowed`,
`commercial_export.blockers`, `commercial_export.review_required`, and
`commercial_export.attribution_required`, separating unknown/restricted-license
blockers from share-alike review obligations and ordinary attribution
requirements. The export modal shows the same attribution/risk summary before
submission. API callers that omit `asset_report` are not blocked, but the job
response includes `asset_report_warning` so missing audit metadata is visible.
The root `make visual-check` path runs the showcase smoke render so flagship
assets must keep producing nonblank Remotion output without slowing the normal
unit/contract `make check` path.
