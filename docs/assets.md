# MetaView Subject Visual Assets

MetaView visual kits are small, renderer-addressable asset packs for subject scenes.
They let scripts ask for semantic roles such as `wind`, `force`, `land`, or `object`
without letting the agent hand-author SVG paths or frame coordinates.

## Manifest Contract

Public manifests live under `apps/web/public/assets/metaview-kits/`.
Each pack follows `manifest.schema.json` and includes:

- `schemaVersion`: currently `1.0.0`.
- `packId`: stable pack id, for example `geography-basic`.
- `subject`: one of `math`, `physics`, `chemistry`, `biology`, `geography`, `algorithm`, `code`.
- `version`: pack version.
- `license`: pack-level license.
- `licenseMode`: `single` or `mixed`.
- `sources`: source records with `id`, `label`, `license`, nullable `sourceUrl`, nullable `licenseUrl`, and optional `attribution`.
- `sceneTemplates`: scene template ids that can use this pack.
- `rendererKinds`: renderer snapshot kinds expected to consume it.
- `assets`: asset entries with `id`, `type`, `path`, `tags`, `semanticRoles`,
  `sourceId`, `license`, `commercialUseStatus`, `requiresAttribution`,
  `commercialUseAllowed`, `shareAlike`, `modificationAllowed`, nullable
  `sourceUrl`, nullable `licenseUrl`, nullable `modifiedFrom`, optional
  `attribution`, and optional `rendererHints`.

The TypeScript registry is in
`apps/web/src/features/playbook/engine/assets/assetRegistry.ts`.
Renderers should use `getAssetPack(packId)` or `findAssetByRole(subject, semanticRole)`
instead of hard-coding asset URLs.

## Scene Blueprint Compiler

`apps/web/src/features/playbook/engine/compiler/sceneBlueprintCompiler.ts`
is the narrow visual-compiler entrypoint for the current flagship subjects.
It accepts intent-level fields such as `subject`, `sceneType`, `visualIntent`,
and `emphasisPoints`, resolves assets through the shared asset resolver, applies
deterministic layout defaults, and outputs normal `PlaybookScript`.
The current supported scene blueprints are `east_asia_monsoon`,
`projectile_motion`, `cell_structure`, `molecule_2d_water`,
`derivative_tangent`, and `bfs_graph`.
The backend mirror lives at
`apps/api/app/domain/services/scene_blueprint_compiler.py` so SkillPack or
agent generation can adopt the same blueprint boundary before returning
`PlaybookScript`; it is not an MCP exposure layer.

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

- `geography-basic`: starter map-layer SVG plus internal monsoon wind SVG.
- `core-visual-basic`: internal shared arrows, labels, icons, particle presets,
  and grid backgrounds for renderer adapters across subjects.
- `geography-earth-basic`: Natural Earth-derived East Asia map GeoJSON and map
  symbols for `geo_map_scene`.
- `physics-basic`: internal SVGs for force vector, projectile object, block,
  ramp, spring, and pulley roles.
- `biology-basic`: internal organelle SVGs for `bio_cell_scene`.
- `chemistry-basic`: internal atom/bond SVGs plus structured molecule presets
  for `molecule_2d_scene`.
- `math-basic`: structured plot presets for math plot/formula scenes.
- `algorithm-code-basic`: internal graph node, queue, visited, active-edge SVGs
  plus a BFS graph preset for `graph_scene`.

Starter assets can be internal placeholders or durable third-party/public-domain
derivatives. Replace or add durable assets only when the source license,
attribution, commercial-use status, and provenance are recorded in the manifest.

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
| `east_asia_monsoon` | geography | `geography-earth-basic` | `geo_map_scene` | Natural Earth map layer, monsoon flow asset, pressure centers |
| `projectile_motion` | physics | `physics-basic` | `physics_force_scene` | projectile asset, vector asset, trajectory, motion trail |
| `cell_structure` | biology | `biology-basic` | `bio_cell_scene` | cell, nucleus, mitochondrion assets plus callouts |
| `molecule_2d_water` | chemistry | `chemistry-basic` | `molecule_2d_scene` | structured atoms/bonds and molecule preset |
| `derivative_tangent` | math | `math-basic` | `math_plot` | formula plus curve/tangent plot markers |
| `bfs_graph` | algorithm | `algorithm-code-basic` | `graph_scene` | graph node, queue, active-edge assets plus code track |

Local preview helpers:

1. Export JSON fixtures:

   ```bash
   npm --workspace apps/web run showcase:export
   ```

2. Render a fixture through the existing Remotion composition:

   ```bash
   node apps/web/scripts/render-shots.mjs eval/reports/subject-visual-fixtures/east_asia_monsoon.json eval/shots/east_asia_monsoon
   ```

3. Open the local showcase page in the web app at `/asset-showcase`.

The visual quality gate is non-blocking at runtime, but showcase tests require
these flagship fixtures to produce no warnings, no missing asset fallback, and
no unknown snapshot renderer.
