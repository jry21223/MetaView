# Animation Tool Registry

The Animation Tool Registry is the backend contract for common teaching
animations. It lets an LLM or agent emit a small, typed `AnimationCall` instead
of hand-writing large `LayerSpec` JSON.

## Purpose

`AnimationCall` lives on each CIR step and has two fields:

- `tool`: a registered tool name such as `math.show_tangent`
- `args`: a small parameter object validated by the backend

The model should output only `tool + args` for common animation patterns. The
backend expands the call into normalized `LayerSpec` objects, and the playbook
builder turns those layers into the existing `PlaybookScript` snapshots.

## Expansion Flow

1. CIR parse validates `step.animation_calls`.
2. CIR quality checks call `safe_expand_cir_animation_calls_with_issues(cir)`.
3. Unknown tools, invalid args, and tool exceptions become review issues.
4. `build_playbook()` calls `expand_cir_animation_calls(cir)` before building
   snapshots and layers.
5. Expanded layers are prepended to hand-written `step.layers`; raw layers remain
   available only as an advanced fallback.

The compatibility functions `expand_animation_call()` and
`expand_cir_animation_calls()` still return only layers/CIR. New code should use
the safe expansion APIs when it needs issue reporting.

## Current Tools

Math:

- `math.show_tangent`: `expression`, `x0`, `tangent_expression`, optional
  `formula_latex`, `caption`, `x_min`, `x_max`, `y_min`, `y_max`
- `math.show_function`: `expression`, optional `expression_2`, `formula_latex`,
  `marker_x`, `shade_from`, `shade_to`, bounds
- `math.show_integral_area`: `expression`, `from_` or `from`, `to`, optional
  `formula_latex`, bounds
- `math.show_derivative_compare`: `expression`, `derivative_expression`,
  optional formula/caption/bounds
- `math.show_function_transform`: `base_expression`, `transformed_expression`,
  optional labels/formula/caption/bounds
- `math.show_parametric_curve`: `expression_x`, `expression_y`, `t_min`,
  `t_max`, optional viewport/formula/caption
- `math.show_region_boundary`: `vertices`, optional `label`, viewport,
  formula, caption

Physics:

- `physics.force_diagram`: `forces[{name,magnitude,angle_deg}]`, optional
  viewport, formula, caption
- `physics.projectile_motion`: `v0`, `angle_deg`, optional `g`, `duration`,
  viewport, formula, caption

Chemistry:

- `chemistry.stoichiometry_table`: `rows[{species,coefficient,mol,mass,role}]`,
  `equation_latex`, optional `caption`

Algorithm:

- `algorithm.graph_traversal`: `nodes`, `edges[{source,target,label,weight}]`,
  `active_node_ids`, `active_edge_ids`, `directed`, `weighted`, optional caption

Biology:

- `biology.punnett_square`: `parent_a`, `parent_b`, `alleles`, `cells`,
  `phenotype_counts`

Statistics:

- `stats.distribution_chart`: `chart_type`, `series`, `x_label`, `y_label`,
  optional `formula_latex`, `caption`

## Adding Tools

Every new tool must:

- define a Pydantic args model
- validate required parameters instead of silently defaulting them
- return valid `LayerSpec` objects only
- report invalid input through safe expansion issues
- have unit tests for happy path, invalid args, and CIR expansion

After the registry is stable, new multi-subject tools should continue to reuse
existing `PlaybookScript` snapshot kinds and frontend renderers before proposing
any new renderer.
