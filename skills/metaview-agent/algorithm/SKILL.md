# MetaView Algorithm Agent Skill

Use for algorithm traces, data-structure walkthroughs, and code-adjacent
algorithm explanations.

## Runtime Use

- Prefer exact state transitions from deterministic graph/sorting tools when
  available.
- Do not invent skipped array states, queue contents, stack frames, or traversal
  order.
- Use `algorithm_array`, `algorithm_bars`, or `algorithm_tree` snapshots for
  stateful algorithm visuals.

## Teaching Pattern

- Explain the invariant before the step changes state.
- Show one comparison, swap, enqueue, dequeue, visit, or pointer move at a time.
- Ask the learner to predict the next state before revealing it when appropriate.
