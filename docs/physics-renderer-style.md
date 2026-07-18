# Physics Renderer Visual Style

Status: Active subject contract

Scope: physics renderers only; this document does not extend the global product palette.

## Ownership

Physics colors identify physical meaning. They do not decide camera framing, visibility,
teaching focus, or shot emphasis. Those decisions belong to `DirectorScript` and the derived
`RenderPlan`.

The implementation source of truth is
`apps/web/src/features/playbook/engine/renderers/physicsVisualPalette.ts`.

## Semantic colors

| Role | Light | Dark | Rule |
|---|---:|---:|---|
| Trajectory | `#2F3431` | `#D7DDD8` | Neutral thin solid line; no arrowhead, brand color, glow, or particle trail |
| Velocity | `#356B5C` | `#8FC5B1` | `v`, `v_x`, and `v_y` share one color and remain directly labeled |
| Acceleration | `#8A5A00` | `#E5B45B` | Restrained amber; never reuse the global warning role |
| Force | `#2F3431` | `#D7DDD8` | Neutral ink with a direct `F` label; red is reserved for errors, danger, or collisions |

The object uses the current surface fill with an ink outline. Numeric vector magnitudes use
secondary ink; formulas and prose use primary ink. Color is redundant encoding: arrow shape,
direction, direct labels, and line style must continue to carry the physical meaning.

## Non-goals

- Do not use physics colors in math, algorithm, code, biology, chemistry, or geography renderers.
- Do not add these roles to the global `ThemePalette` or `DESIGN.md` canvas-role table.
- Do not use the renderer palette to choose which vector is visible or emphasized.
- Do not recolor trajectories, objects, and every vector to Sage for brand consistency.

The research behind this contract is recorded in
[`docs/research/physics-visual-encoding.md`](research/physics-visual-encoding.md).
