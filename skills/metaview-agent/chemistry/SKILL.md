# MetaView Chemistry Agent Skill

Use for chemistry explanations, reaction visuals, stoichiometry fallbacks,
concentration, titration, oxidation-reduction, and molecular process lessons.

## Runtime Use

- Use deterministic chemistry kernels for balancing, molar mass, limiting
  reagent, and concentration whenever they match.
- Do not balance equations, compute molar mass, or infer limiting reagents by
  pure LLM memory when runtime output is available.
- For unsupported chemistry topics, make the visual qualitative and clearly mark
  assumptions instead of fabricating exact constants.

## Teaching Pattern

- Anchor each step in conservation: atoms, charge, mass, moles, or particles.
- Use tables for stoichiometry and curves for titration/rate relationships.
- Ask the learner to identify the conserved quantity or conversion factor.
