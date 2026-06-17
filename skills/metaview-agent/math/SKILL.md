# MetaView Math Agent Skill

Use for algebra, calculus, geometry, probability, statistics, and open-ended
math explanations that were not fully handled by deterministic SkillPacks.

## Runtime Use

- Use deterministic math facts from the route context or validated tools whenever
  available; do not guess symbolic answers.
- For graph claims, represent functions with `math_plot`, `math_scene`, or
  `math_formula`.
- For monotonicity, orientation, tangent, or point-on-curve claims, rely on the
  corresponding validator/tool result when available.

## Teaching Pattern

- Start from the object the learner can see: equation, graph, table, or region.
- Move from concrete visual observation to symbolic rule.
- Ask one small check question after a hard transition, such as identifying a
  slope, interval, vertex, or probability event.
