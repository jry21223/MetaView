---
name: generate-subject-manim-prompts
description: Use this skill when you need subject-specific prompts that help an LLM plan, generate, or repair Python Manim lesson animations for math, algorithms, physics, chemistry, biology, or geography.
---

# Generate Subject Manim Prompts

## Use It For

- Drafting prompt sets for LLMs that must return reliable Python Manim CE code
- Adapting prompt strategy by subject instead of reusing one generic animation prompt
- Repairing broken Manim outputs with compiler errors, runtime errors, or visual mismatches

## Workflow

1. Identify the primary subject.
2. Read exactly one matching reference file first:
   - `references/math.md`
   - `references/algorithm.md`
   - `references/physics.md`
   - `references/chemistry.md`
   - `references/biology.md`
   - `references/geography.md`
3. Read `references/prompt-templates.md` for the shared prompt shape.
4. Produce prompts in three phases:
   - `concept design`: storyboard, objects, equations or state variables, pacing, and failure risks
   - `code generation`: one executable Python Manim scene based on the approved plan
   - `repair`: a minimal patch request that keeps correct behavior and fixes only what failed
5. If the user already knows the subject, topic, and goal, use `scripts/build_prompt.py` to assemble a ready-to-send prompt bundle.

## Core Rules

- Default to one `Scene` subclass unless the user explicitly asks for multiple scenes.
- Require concrete coordinates, sizes, colors, labels, durations, and data values.
- Prefer standard Manim CE classes and helpers; avoid custom wrappers unless the user provides them.
- Ask for a single Python code block in the code phase and no prose around it.
- Keep the visual narrative aligned with the underlying concept. Every animation beat should teach one thing.
- For math, use only the public high-level ideas visible in ManimCat: concept planning before code, symbolic continuity, educational pacing, and repair after failures. Do not copy repository prompts verbatim.

## Subject Selection

- `math`: proofs, derivations, geometry, calculus, linear algebra, probability
- `algorithm`: sorting, search, graph traversal, dynamic programming, data structures
- `physics`: mechanics, fields, wave motion, circuits, thermodynamics
- `chemistry`: molecular structure, reaction steps, orbitals, stoichiometry, equilibrium
- `biology`: life cycles, pathways, anatomy, cell processes, inheritance
- `geography`: maps, regions, population change, climate patterns, movement over time

If a topic spans multiple domains, choose the primary subject and copy only the needed constraints from one secondary reference.

## Deliverable Shape

When the user asks for prompt drafting, return:

1. A `concept design` prompt pair: `system` and `user`
2. A `code generation` prompt pair: `system` and `user`
3. A `repair` prompt pair: `system` and `user`

When the user asks for fast assembly, run:

```bash
python skills/generate-subject-manim-prompts/scripts/build_prompt.py \
  --subject math \
  --topic "derivative as slope" \
  --goal "explain how secant becomes tangent" \
  --audience "high school students"
```
