# High-school conic sections capability

Status: Active

The Conic Gold Template Pack V1 uses the existing `math_scene` contract and
renderer. It does not add a conic-specific snapshot kind, renderer, player, or
script protocol. `math_scene.camera_mode="fixed"` is an optional compatible hint
used when object-introduction auto-zoom would crop a required full curve.

## Public archetypes

| Archetype | Public case | Parameters | Steps |
|---|---|---|---:|
| `conic.ellipse.focus-definition` | `ellipse-focus-definition` | `a`, `b`, `t` | 6 |
| `conic.parabola.focus-directrix` | `parabola-focus-directrix` | `p`, `t` | 5 |
| `conic.hyperbola.asymptotes` | `hyperbola-asymptotes` | `a`, `b`, `u` | 6 |
| `conic.line-ellipse.position` | `line-ellipse-position` | line kind, slope/intercept or vertical x | 6 |
| `conic.ellipse.chord-midpoint-locus` | `ellipse-chord-midpoint-locus` | fixed point x, slope | 6 |
| `conic.pole-polar.circle` | `pole-polar` | external point coordinate | 6 |

All cases use computed curves, points, segments, annotations, formulas, and
semantic roles. Each step exposes five local semantic Follow-up intents for
pacing, explanation, conclusion emphasis, validated parameter changes, and a
current-step-only clarification. Parameter changes rebuild the same Playbook
contract through the shared kernel; other operations remain tied to the current
step and preserve a valid timeline.

The public-safe metadata source of truth is
`contracts/conic-archetypes.json`. Public case builders and the
hidden benchmark loader both resolve it by `archetypeId`; hidden prompts and
frozen public Playbooks remain in their separate runtime surfaces.

## Deterministic domain kernel

`apps/web/src/shared/domain/conicSections.ts` is dependency-free TypeScript. It
validates standard ellipse, parabola, and hyperbola parameters; computes foci,
eccentricity, directrices, asymptotes, and parametric points; verifies focal
distance properties; intersects slope-form or vertical lines with an ellipse;
and computes chords, midpoints, locus samples, ellipse tangents, tangent points,
and circle polar lines.

Intersections use a scaled discriminant tolerance. Values inside tolerance are
classified as tangent and return one point; negative values are disjoint.
Invalid or degenerate conics fail closed. Vertical lines have a separate general
line representation rather than a fake infinite slope. Locus sampling omits
invalid/degenerate positions and retains the valid parameter range.

## Skill and coverage

The math Agent skill recognizes conic terminology and directs mathematical
computations to deterministic tools. The registered `conic_sections` SkillPack
currently provides one verified specialized generation capability:
`conic.ellipse.focus_definition` for horizontal standard ellipses with explicit
`a > b > 0`. It emits a newly built Playbook from the parsed problem spec; it
does not contain the public frozen script or hidden answers.

Other conic archetypes remain composable, generic fallback, or experimental as
decided by CoverageResolver. Rotated conics, arbitrary symbolic coefficients,
vertical-major-axis Skill output, and area-extremum proofs are not claimed as
specialized V1 support. Invalid parameters and unsupported orientations must
fail closed rather than display a plausible but incorrect diagram.
