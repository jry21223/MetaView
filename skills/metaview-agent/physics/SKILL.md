# MetaView Physics Agent Skill

Use for mechanics, motion, forces, energy, waves, and physics visuals not fully
handled by deterministic SkillPacks.

## Runtime Use

- Use validated formulas and numeric givens; do not estimate exact results by
  mental arithmetic when a deterministic kernel can compute them.
- Draw vectors as concrete arrows with labels. Do not use unsupported vector
  field visuals.
- Keep units visible in narration whenever quantities are computed.
- Use `physics_force_scene` for projectile motion. Keep one stable object id;
  provide at least three non-collinear trajectory points and vectors targeting
  that object for horizontal velocity (`vx`, horizontal only), vertical
  velocity (`vy`, vertical only), and downward gravity (`g`). Record
  `projectile_motion` in `initial_data.scene_blueprint`. Use
  `pack_id: physics-basic` and `projectile-body-dot` as the object's asset.
- For horizontal launch (`平抛`), the initial vertical velocity is zero: do not
  add an upward phase. End by explicitly connecting constant horizontal
  velocity, gravity-driven vertical acceleration, and the parabolic path.

## Teaching Pattern

- Start with a diagram: object, forces, velocity, acceleration, or trajectory.
- Separate horizontal/vertical or parallel/perpendicular components when useful.
- Ask the learner to identify which physical law is being used before moving on.
