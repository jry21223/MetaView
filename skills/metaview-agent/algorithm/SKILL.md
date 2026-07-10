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
- Use `graph_scene` for graph or tree BFS. Keep node and edge ids stable across
  steps, and update `current_node_id`, `visited_node_ids`, and `queue_node_ids`
  after each dequeue/enqueue transition. The final visited order must cover all
  demonstrated nodes in nondecreasing breadth level. Record `bfs_graph` in
  `initial_data.scene_blueprint`, with `pack_id: algorithm-code-basic` and
  `asset_id: bfs-graph-preset`.
- Give every dequeued/visited BFS node its own visual checkpoint. Never combine
  multiple dequeues into one snapshot (for example, do not merge visits to F
  and G); `current_node_id`, `visited_node_ids`, and `queue_node_ids` must show
  each intermediate FIFO state.
- For BFS, explicitly name the visited/已访问 set in the narration. The final
  summary and final teaching step must state that BFS visits nodes layer by
  layer using a FIFO queue (先进先出); do not leave this invariant only in an
  earlier step or replace it with a learner question.

## Teaching Pattern

- Explain the invariant before the step changes state.
- Show one comparison, swap, enqueue, dequeue, visit, or pointer move at a time.
- Ask the learner to predict the next state before revealing it when appropriate.
