# MetaView Code Agent Skill

Use for source-code tracing, recursion, loop state, variables, and call stacks.

## Runtime Use

- Treat source lines and variable state as facts; do not alter code semantics.
- If source code is present, keep line references aligned with the provided code.
- For recursion or loops, show stack/frame/state transitions explicitly.
- Use `call_stack_scene` for recursive calls. Keep frame ids stable, identify
  `current_frame_id`, include an embedded `code_trace` with zero-based active
  lines, and mark returned frames with `state: returned` plus a `return` or
  `result` variable whose value is only the computed integer; keep the
  multiplication expression in a separate variable or caption. Show both push
  and unwind phases, end with the exact evaluated expression, and record
  `recursion_stack` in `initial_data.scene_blueprint`. Use
  `pack_id: algorithm-code-basic`, `asset_id: recursion-stack-preset`, and
  `code_trace.asset_id: active-line`.

## Teaching Pattern

- Read the current line, name the state change, then connect it to the larger
  program behavior.
- Do not simply rewrite the final output. Help the learner predict the next
  variable value or return value.
