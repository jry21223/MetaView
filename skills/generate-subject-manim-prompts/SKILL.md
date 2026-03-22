---
name: generate-subject-manim-prompts
description: Use this skill when you need subject-specific prompts that help an LLM plan, generate, or repair Python Manim lesson animations for math, algorithms, physics, chemistry, biology, or geography.
---

# Generate Subject Manim Prompts

## Use It For

- Maintaining subject-specific runtime prompt references for staged Manim generation
- Adapting `planner / coder / critic / repair` guidance by subject instead of reusing one generic animation prompt
- Repairing weak or conflicting subject guidance before it degrades generated Manim output

## Workflow

1. Identify the primary subject.
2. Read exactly one matching reference file first:
   - `references/math.md`
   - `references/algorithm.md`
   - `references/code.md` when the input is actual source code that must be animated faithfully
   - `references/physics.md`
   - `references/chemistry.md`
   - `references/biology.md`
   - `references/geography.md`
3. Read `references/prompt-templates.md` only for stage framing. Do not duplicate output-contract boilerplate inside the subject files.
4. Keep subject files stage-specific:
   - `Common`: domain truths that must never be violated
   - `Planner`: scene decomposition and risk discovery
   - `Coder`: render-time layout, object, and pacing rules
   - `Critic`: failure checks
   - `Repair`: minimum-safe fix strategy
5. Use `scripts/build_prompt.py` only as a helper to inspect the staged prompt skeleton. The production API already assembles runtime prompts separately.

## Core Rules

- Treat the runtime prompt builder as the source of output-format rules; subject files should focus on domain truth, not JSON or markdown packaging.
- Keep rules actionable and stage-specific; remove generic advice that is already covered by shared runtime rules.
- Prefer one main teaching surface plus at most one auxiliary panel unless the subject genuinely needs more.
- Every beat should teach one concrete change, not just decorate the frame.
- Use the smallest set of constraints that materially improves correctness, readability, or repair quality.
- When content belongs in shared runtime rules, delete it from the skill instead of repeating it.

## Subject Selection

- `math`: proofs, derivations, geometry, calculus, linear algebra, probability
- `algorithm`: sorting, search, graph traversal, dynamic programming, data structures
- `code`: source walkthroughs, control flow tracing, recursive execution, data-structure mutations grounded in real code
- `physics`: mechanics, fields, wave motion, circuits, thermodynamics
- `chemistry`: molecular structure, reaction steps, orbitals, stoichiometry, equilibrium
- `biology`: life cycles, pathways, anatomy, cell processes, inheritance
- `geography`: maps, regions, population change, climate patterns, movement over time

If a topic spans multiple domains, choose the primary subject and copy only the needed constraints from one secondary reference.

## Deliverable Shape

When the user asks how to author prompts, describe the staged flow:

1. `router`: choose the subject
2. `planner`: produce a compact scene plan and risks
3. `coder`: generate one runnable Manim scene
4. `critic`: audit fidelity, runtime safety, and layout
5. `repair`: apply the smallest reliable fix

When the user asks for local prompt inspection, run:

```bash
python skills/generate-subject-manim-prompts/scripts/build_prompt.py \
  --subject algorithm \
  --topic "二分查找" \
  --content "用有序数组解释 low、high、mid 的更新与终止条件" \
  --ui-theme dark
```

When the user asks to let an LLM draft or rewrite a subject reference file, run:

```bash
python skills/generate-subject-manim-prompts/scripts/generate_reference_with_llm.py \
  --subject algorithm \
  --notes "强调二分、滑窗、图搜索这几类常见算法的状态同步与终止条件" \
  --write
```

If you want to inspect the exact system/user prompts before calling the model, add `--dry-run`.
