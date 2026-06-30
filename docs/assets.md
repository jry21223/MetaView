# MetaView Subject Visual Assets

MetaView visual kits are small, renderer-addressable asset packs for subject scenes.
They let scripts ask for semantic roles such as `wind`, `force`, `land`, or `object`
without letting the agent hand-author SVG paths or frame coordinates.

## Manifest Contract

Public manifests live under `apps/web/public/assets/metaview-kits/`.
Each pack follows `manifest.schema.json` and includes:

- `packId`: stable pack id, for example `geography-basic`.
- `subject`: one of `math`, `physics`, `chemistry`, `biology`, `geography`, `algorithm`, `code`.
- `version`: pack version.
- `license`: pack-level license.
- `sceneTemplates`: scene template ids that can use this pack.
- `rendererKinds`: renderer snapshot kinds expected to consume it.
- `assets`: asset entries with `id`, `type`, `path`, `tags`, `semanticRoles`,
  `license`, `commercialUseStatus`, nullable `sourceUrl`, nullable
  `licenseUrl`, nullable `modifiedFrom`, and optional `attribution`.

The TypeScript registry is in
`apps/web/src/features/playbook/engine/assets/assetRegistry.ts`.
Renderers should use `getAssetPack(packId)` or `findAssetByRole(subject, semanticRole)`
instead of hard-coding asset URLs.

## Starter Packs

- `geography-basic`: Natural Earth-derived map-layer SVG plus internal placeholder
  monsoon wind SVG.
- `physics-basic`: internal placeholder SVGs for force vector and projectile object roles.

Starter assets can be internal placeholders or durable third-party/public-domain
derivatives. Replace or add durable assets only when the source license,
attribution, commercial-use status, and provenance are recorded in the manifest.

## Adding Assets

1. Add the file under a pack directory in `apps/web/public/assets/metaview-kits/`.
2. Add a manifest entry with semantic roles that match renderer needs.
3. Record license, attribution, commercial-use status, source/license URLs,
   and `modifiedFrom` when the asset is derived from an external source.
4. Add or update a focused registry test.

Do not commit third-party binary assets without explicit license metadata.
