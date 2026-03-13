---
name: algorithm-process-viz
description: Use this skill when the task is to visualize algorithms, data structures, recursion, graph traversal, or dynamic programming as step-by-step state transitions with code-to-animation alignment.
---

# Algorithm Process Viz

## Use it for

- Sorting, searching, graph traversal, recursion, backtracking, dynamic programming
- ACM / OI / interview problems that need process-first explanation
- Any scene where variable updates must stay aligned with code blocks

## Workflow

1. Extract the state machine from loops, branches, recursion frames, and invariants.
2. Promote the tracked variables into explicit timeline entities.
3. Keep code highlight, data structure state, and narration synchronized.
4. If recursion or backtracking appears, split out a call-stack scene before showing returns.

## Guardrails

- Prefer state transition clarity over decorative motion.
- Do not skip intermediate states that affect correctness.
- End with answer and complexity on the same closing frame.
