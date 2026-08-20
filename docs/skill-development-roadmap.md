# Skill Development Roadmap

This roadmap tracks the current deterministic SkillPack baseline. The first
wave parser, kernel, and adapter work is now represented in
`build_default_skill_registry()`; use this document as a maintenance status map
and guardrail before any renderer-heavy expansion.

## Common Rules

- Use sources for grounding, not bulk content. Do not copy long textbook
  sections into prompts, fixtures, or generated explanations.
- Summarize formulas into concise implementation notes, unit tests, and
  explainable step labels.
- Build the parser, `ProblemSpec`, deterministic kernel, and fallback behavior
  before investing in custom visualization.
- If parsing is unsafe, return no heuristic match. If an already-specialized Skill execution
  returns `handled=False`, include a clear `fallback_reason`; the pipeline records
  `skill.execution_unhandled` and fails closed instead of continuing through generic or agent.
- Use handwritten fixtures for supported, edge, and fallback cases.
- Runtime and tests must not use the network. Source-derived data must be
  reviewed, minimal, and checked in before use.
- Keep each new skill inside its own `SkillPack` package and register it
  through `build_default_skill_registry()`. Do not add skill-specific branches
  to `RunPipelineUseCase`.

## Registry Status

`build_default_skill_registry()` currently registers these deterministic packs:

- `solid_geometry`
- `quadratic_transform`
- `elementary_algebra`
- `linear_algebra`
- `calculus_core`
- `conic_sections`
- `physics_mechanics`
- `chemistry_stoichiometry`
- `algorithm_graph_core`
- `biology_genetics`
- `probability_statistics_core`
- `geography_earth`
- `geography_climate`

## Maintenance Priorities

1. Keep each manifest's supported and unsupported notes aligned with its parser
   and kernel tests.
2. Preserve deterministic failure behavior: unsafe parsing returns no heuristic
   match; unsafe solving after a specialized match returns `handled=False` with
   a clear `fallback_reason` and the pipeline fails closed.
3. Expand handwritten fixtures before broadening capability descriptions.
4. Add renderer-heavy work only after the skill's `ProblemSpec`, kernel output,
   and existing-renderer adapter tests are stable.

## Gate For Each Skill

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
the current registered SkillPacks.

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
