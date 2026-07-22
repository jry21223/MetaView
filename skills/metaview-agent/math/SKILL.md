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
- For a derivative-as-tangent lesson, use repeated `math_plot` snapshots with
  the original curve, an actual linear secant/tangent expression, and
  `marker_x` at the target point. Label the tangent curve with
  `semantic_role: tangent`, state the derivative/slope value in the final
  narration, and record `derivative_tangent` in
  `initial_data.scene_blueprint`.
  Use `pack_id: math-basic` and `asset_id: derivative-tangent-preset`.

## Teaching Pattern

- Start from the object the learner can see: equation, graph, table, or region.
- Move from concrete visual observation to symbolic rule.
- Ask one small check question after a hard transition, such as identifying a
  slope, interval, vertex, or probability event.

## High-school conic sections

- Recognize ellipse, hyperbola, parabola, focus, directrix, asymptote,
  eccentricity, line/conic intersection, chord, midpoint chord, point-difference
  method, Vieta, fixed point/value/line, pole/polar, locus, parameter range, and
  area-extremum language.
- Prefer `math_scene` with semantic curves, points, lines, and formulas. Use the
  deterministic conic capability when route context provides one; otherwise
  request only supported composition tools and label uncovered cases
  experimental instead of claiming full support.
- Let the model choose the teaching route (observe, conjecture, derive, verify,
  summarize), but require deterministic tools or validators for foci,
  directrices, asymptotes, intersections, discriminants, chord length,
  midpoints, tangents, polar lines, loci, and parameter bounds.
- Use semantic roles such as `conic_curve`, `focus`, `directrix`, `asymptote`,
  `moving_point`, `intersection_point`, `tangent_point`, `chord`,
  `chord_midpoint`, `locus_trail`, `theoretical_locus`, and `polar_line` when
  those objects are present. Do not invent synonyms for existing roles.
- Do not emit SVG paths, sampled curve arrays, pixel coordinates, CSS
  transforms, frame counts, arbitrary JSON Patch operations, or unverified
  discriminant/intersection results. Do not copy public template scripts or
  embed hidden benchmark answers.
