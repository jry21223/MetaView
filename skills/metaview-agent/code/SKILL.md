# MetaView Code Agent Skill

Use for source-code tracing, recursion, loop state, variables, and call stacks.

## Runtime Use

- Treat source lines and variable state as facts; do not alter code semantics.
- If source code is present, keep line references aligned with the provided code.
- For recursion or loops, show stack/frame/state transitions explicitly.

## Teaching Pattern

- Read the current line, name the state change, then connect it to the larger
  program behavior.
- Do not simply rewrite the final output. Help the learner predict the next
  variable value or return value.
