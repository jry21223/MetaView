---
name: source-code-algorithm-viz
description: Use this skill when the user provides Python or C++ algorithm source code and wants a Manim animation that explains data structures, control flow, state updates, and return conditions directly from the code.
---

# Source Code Algorithm Viz

## Use It For

- Python or C++ algorithm walkthroughs based on the source code itself
- Visualizing loops, branches, recursion, pointers, indices, and return paths
- Generating animations that align code blocks with state transitions

## Workflow

1. Read the source code before interpreting the prompt.
2. Identify language, function entry point, input structure, and return value.
3. Extract the main control-flow events: loop, branch, recursion, state update, return.
4. Build animation beats that correspond to those source-level events.
5. End with result and complexity, grounded in the code rather than only the algorithm name.

## Guardrails

- Treat the source code as ground truth.
- Do not invent variables or data structures that are not implied by the code.
- Make pointer/index changes explicit.
- If the source code is incomplete, say what assumption was required.
