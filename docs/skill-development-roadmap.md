# Skill Development Roadmap

This roadmap covers Phase 0 SkillPack development. It keeps the first wave
focused on deterministic parser and kernel work before any renderer-heavy
expansion.

## Common Rules

- Use sources for grounding, not bulk content. Do not copy long textbook
  sections into prompts, fixtures, or generated explanations.
- Summarize formulas into concise implementation notes, unit tests, and
  explainable step labels.
- Build the parser, `ProblemSpec`, deterministic kernel, and fallback behavior
  before investing in custom visualization.
- If parsing or solving is unsafe, return `handled=False` with a clear
  `fallback_reason` and let the generic or agent path continue.
- Use handwritten fixtures for supported, edge, and fallback cases.
- Runtime and tests must not use the network. Source-derived data must be
  reviewed, minimal, and checked in before use.
- Keep each new skill inside its own `SkillPack` package and register it
  through `build_default_skill_registry()`. Do not add skill-specific branches
  to `RunPipelineUseCase`.

## Development Order

1. `physics_mechanics`
   - Start here because the first scope is formula-bound and can reuse existing
     math/explanation snapshots.
   - Deliver constant-acceleration, projectile, and simple force kernels before
     any richer mechanics renderer.

2. `chemistry_stoichiometry`
   - Build next because equation parsing, balancing, and mole-ratio arithmetic
     are deterministic and testable without new rendering.
   - Ship a minimal reviewed atomic-mass table with no runtime source fetches.

3. `algorithm_graph_core`
   - Build after chemistry because it adds trace-style algorithm steps while
     still avoiding heavy media work.
   - Lock deterministic traversal, shortest-path, and DAG ordering rules in
     handwritten fixtures.

4. `biology_genetics`, `probability_statistics_core`, and `geography_climate`
   - Start these after the first three packs establish the parser/kernel/test
     pattern.
   - Prioritize exact probability kernels for genetics and statistics.
   - Keep geography climate work data-light with small offline fixtures.

## Phase 0 Gate For Each Skill

Each skill should pass these gates before it is considered ready:

1. Manifest describes supported and unsupported cases.
2. Parser produces a skill-owned `ProblemSpec` or a safe fallback.
3. Kernel solves only validated specs and exposes checks used by tests.
4. Adapter builds valid `PlaybookScript` using existing snapshot kinds where
   possible.
5. Fixtures cover happy paths, malformed input, unsupported scope, and unsafe
   solve conditions.
6. Tests run offline and prove no network access is required.

## Deferred Renderer Work

Renderer-heavy work is intentionally deferred until the deterministic core of a
skill is stable. This includes custom graph animations, map layers, complex
projectile or force diagrams, rich Punnett-square interactivity, and any new
snapshot kind that requires frontend renderer work.

If a new snapshot kind is eventually necessary, add it only after the
`ProblemSpec`, kernel output, and existing-renderer adapter tests make the data
contract clear.

### Vector Field Reference Watchlist

These projects are useful reference material for a later renderer-heavy vector
field or electromagnetism phase. They are not implementation dependencies for
the Phase 1 SkillPacks.

- NablaVis: React and Three.js vector-calculus scenes for gradient, divergence,
  curl, path, surface, and theorem-oriented exploration.
- Fibre (`portsmouth/fibre`): WebGL 3D vector-field and dynamical-system
  visualization, including field-line style presets and shader-driven field
  authoring ideas.
- `veld` (`nulkode/veld`): Three.js and TypeScript simulation of charges in
  electromagnetic fields, with charge motion plus electric and magnetic field
  visualization.
- threelab: candidate Three.js visualization-tool reference for node-graph,
  export, and interactive scene-system ideas; verify the exact electric-field
  line/equipotential demo before using it as a source.
