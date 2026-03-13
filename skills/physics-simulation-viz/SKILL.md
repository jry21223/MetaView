---
name: physics-simulation-viz
description: Use this skill for mechanics, circuits, fields, and physics problems that need law-consistent animation, including cases where a static problem image must be converted into a dynamic explanation.
---

# Physics Simulation Viz

## Use it for

- Mechanics, projectile motion, collisions, force analysis
- Circuits, field problems, constrained motion
- Static problem images that need to become law-consistent animated explanations

## Workflow

1. If a problem image is provided, first extract objects, supports, contact surfaces, angles, givens, unknowns, and constraints.
2. Convert the scene into a physical model before animating: forces, topology, boundary conditions, conserved quantities.
3. Animate the time evolution only after the model is explicit.
4. End with a law check: Newton, energy, momentum, KCL/KVL, or field relations.

## Guardrails

- Do not merely reproduce the picture; infer the governing constraints.
- Surface assumptions whenever the image is ambiguous.
- Units, directions, and trends must stay physically consistent.
