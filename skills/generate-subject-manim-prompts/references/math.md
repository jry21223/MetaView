# Math Prompt Guidance

Use this file for proofs, derivations, function graphs, geometry, matrices, and probability visuals.

## Priorities

- Ask the model to separate concept design from code generation.
- Keep symbolic continuity with `MathTex`: each expression should visibly evolve from the previous one.
- Define axes, geometric objects, variables, and notation before transforming them.
- Tie every visual change to a mathematical reason, not just a visual effect.
- Pace the scene like a lesson: setup, key transition, conclusion, short hold on the final result.

## Prompt Additions

- Ask for a notation registry before code: symbols, meanings, colors, and units if any.
- Ask for a beat-by-beat derivation plan that avoids meaning-changing jumps.
- Require the diagram and the formulas to stay numerically consistent.
- Require readable spacing for formulas and deliberate camera or layout changes.
- Ask for a final verification checklist covering notation, algebra, and diagram consistency.

## Failure Patterns To Prevent

- Skipping algebraic steps that change meaning
- Replacing one coordinate system with another without explanation
- Showing equations that do not match the plotted objects
- Overcrowding a frame with too many formulas at once

## ManimCat-Inspired Direction

Public ManimCat materials emphasize a two-stage process, strong LaTeX output, visual continuity for derivations, and retrying after invalid code. Use those ideas as method, not as text to copy.
