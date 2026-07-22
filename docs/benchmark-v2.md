# Benchmark V2

Status: Eval

Benchmark V2 is the strict product-quality gate for the four initial Gold Cases
and eval-only subject packs such as conic sections. The legacy scorer remains available as `legacy_structural_score` so a
schema-valid but educationally weak result is visible rather than silently
reclassified as good.

## Gold Cases

| Case | Required product evidence |
|---|---|
| `math-derivative-tangent` | curve, target `x=1`, tangent, slope `2`, semantic math plot |
| `algorithm-bfs-tree` | graph nodes/edges, valid node references, changing current/visited/queue state, breadth-first order |
| `code-recursion-factorial` | changing stack frames, active code line, push and unwind, structured return propagation, `factorial(4)=24` |
| `physics-projectile` | body, parabolic trajectory, horizontal/vertical velocity components, gravity |

Numeric aliases use value boundaries, so `=2` does not match `=20`. BFS checks
node-reference integrity, monotonic visited state, full traversal, graph depth,
and the FIFO queue transitions implied by the displayed edges. The derivative
case verifies that the line is tangent to `y=x²` at `(1,1)` with slope `2`, not
just that it is labelled “tangent.” Recursion requires the structured unwind
values `1, 2, 6, 24`; narration containing the word “return” cannot stand in
for visual propagation. Projectile validation rejects a straight trajectory,
non-axis-aligned velocity components, upward or unbounded gravity vectors, and
vectors whose targets are absent from the scene.

## Score

| Dimension | Points |
|---|---:|
| Contract and schema | 15 |
| Knowledge correctness | 25 |
| Pedagogical structure | 20 |
| Visual requirement coverage | 15 |
| Code Sync | 5 |
| Narration-visual consistency | 10 |
| Timing and export readiness | 10 |

A total score of 90 is necessary but not sufficient. Any declared hard-fail
condition fails the attempt regardless of total score. The expectation schema
supports required/forbidden snapshot kinds, scene types, semantic roles,
assets, text facts, state fields and values, conclusion aliases, warning limit,
and hard-fail conditions. Code-backed cases additionally declare accepted Code
Sync languages and required variables. Missing overlays, out-of-range active
lines, or variables that disagree with the current graph/call-stack state are
hard failures. Code Sync is a parallel workbench track; it is not rendered into
the lesson stage or exported video. Cases without a meaningful code track keep
the 100-point denominator unchanged but report the Code Sync dimension as N/A.
BFS sibling order is derived from the demonstrated visit order rather than JSON
edge order, while FIFO transitions and completion of the reachable component
remain mandatory.

## Commands

```bash
# Checked-in legacy fixtures, repeated three times for report aggregation.
make eval-gold

# Four cases x three independent real pipeline runs.
make eval-gold LIVE=1 API=http://localhost:8000 REPEAT=3

# Twelve eval-only conic variants derived from one hidden manifest.
make eval-conic-gold LIVE=1 API=http://localhost:8000 REPEAT=1

# One hidden case while developing a verified capability.
make eval-conic-gold LIVE=1 API=http://localhost:8000 \
  ID=conic-hidden-ellipse-focus-01 REPEAT=1
```

## Hidden conic variants

`eval/hidden-cases/conic-sections/variants.json` contains two variants for each
of six archetypes. Variants change numbers, axis direction, line form,
near-tangent conditions, chord families, or pole position. They retain their
hidden prompt, parameters, conclusion aliases, forbidden claims, and exact
instance evidence keyed by catalog fact ID, with no Playbook or duplicated fact
rule descriptions. `apps/api/eval/conic_hidden_cases.py` validates those IDs and
resolves shared fact rules, semantic roles, and state fields from the public-safe
archetype catalog before deriving Benchmark V2 expectations.

The live runner submits those prompts through the normal API Pipeline. It never
imports a public template builder, and the scorer has no `caseId` answer branch.
`apps/api/eval/conic_math_validation.py` resolves the archetype's deterministic
rule and verifies the generated scene's parameters, geometry, and narration
evidence. It checks focal definitions, directrices, asymptotes, discriminants,
intersections, chord midpoints/loci, tangency, and pole/polar relations without
branching on a hidden `caseId`. Invalid deterministic mathematics is an
additional hard fail for conic expectations; the global 90-point threshold and
the existing mandatory hard-fail set are unchanged. The gate then checks schema,
stated facts, pedagogical structure, required semantic objects,
narration/visual agreement, timing, export readiness, and zero warning budget.
Failed attempts remain in the timestamped local report.

Reports are written under ignored `eval/reports/`. A missing live
QualityReport/warning count is itself an invalid live result; the harness does
not invent a zero. Available latency, repair, token, and cost fields are
recorded, and unsupported telemetry stays `null`.

The checked-in legacy CIR fixtures currently serve as negative migration
evidence and are expected to fail the strict V2 gate. Do not lower thresholds
or rewrite only those fixtures to make the command green. A green release gate
requires the production generators to emit the required semantic states, then
three independent live passes per case.
