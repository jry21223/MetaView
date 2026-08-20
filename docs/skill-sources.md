# Skill Sources

Registered deterministic skills use public references as source maps, not as
text to copy. Each skill should summarize formulas and procedures into MetaView-owned
`ProblemSpec`, deterministic kernel, and `PlaybookScript` adapter code.
This file documents source-backed expansion packs; compact algebra/calculus
packs without external source requirements stay covered by their manifests and
tests.

## Common Rules

- Do not copy long textbook passages into prompts, manifests, fixtures, or
  generated lessons. Keep source-derived wording short and attribute links.
- Summarize formulas as implementation notes and tests; do not mirror full
  chapters or worked examples.
- Build deterministic parser plus kernel first. Add rendering only after the
  spec, solve path, and adapter contract are stable.
- Return no heuristic match when parse or validation safety is uncertain. If
  solving becomes unsafe after specialized selection, return `handled=False`
  with a `fallback_reason`; the pipeline fails closed.
- Use handwritten fixtures that cover supported cases, unsafe cases, and
  fallback cases. Do not scrape textbook examples into test data.
- Runtime and test paths must not access the network. Any source tables needed
  by kernels must be checked in as reviewed, minimal data.

## physics_mechanics

Sources:

- [OpenStax University Physics 1: 3.4 Motion with Constant Acceleration](https://openstax.org/books/university-physics-volume-1/pages/3-4-motion-with-constant-acceleration)
- [OpenStax University Physics 1: 4.3 Projectile Motion](https://openstax.org/books/university-physics-volume-1/pages/4-3-projectile-motion)
- [OpenStax University Physics 1: 5.6 Common Forces](https://openstax.org/books/university-physics-volume-1/pages/5-6-common-forces)

Registered V1 scope:

- Constant-acceleration one-dimensional motion with known units and a single
  unknown.
- Projectile motion as independent horizontal and vertical kinematics, without
  drag or variable gravity.
- Newton's second law for a single body with explicit mass and net force.
- Frictionless incline acceleration with explicit angle and optional mass.

Implementation notes:

- Parse knowns, requested unknown, sign convention, and unit family before
  solving.
- Keep the kernel algebraic and deterministic. Use `Decimal` for parsed
  quantities and explicit display rounding.
- Fall back for missing units, friction, variable acceleration, fluid drag,
  springs, collisions, multi-body systems, ambiguous axes, unclear contact
  geometry, or multi-stage narratives that cannot be segmented safely.

Supported formulas:

- `v = v_0 + at`
- `s = v_0t + 1/2 at^2`
- `t = sqrt(2h/g)` for horizontal projectile drop time
- `F = ma`
- `a = g sin(theta)` for frictionless incline

Handwritten fixture examples:

- Supported: "小球从静止开始做匀加速直线运动，加速度 2m/s^2，求 5 秒后的速度和位移"
- Supported: "质量 2kg 的物体受到 10N 水平拉力，忽略摩擦，求加速度"
- Fallback: "斜面倾角 30 度，物体质量 1kg，摩擦系数 0.2，求加速度"

## chemistry_stoichiometry

Sources:

- [OpenStax Chemistry 2e: 4.1 Writing and Balancing Chemical Equations](https://openstax.org/books/chemistry-2e/pages/4-1-writing-and-balancing-chemical-equations)
- [OpenStax Chemistry 2e: 4.3 Reaction Stoichiometry](https://openstax.org/books/chemistry-2e/pages/4-3-reaction-stoichiometry)
- [IUPAC Atomic Weights](https://iupac.qmul.ac.uk/AtWt/)
- [Python `decimal`](https://docs.python.org/3/library/decimal.html)
- [Python `fractions`](https://docs.python.org/3/library/fractions.html)

Registered V1 scope:

- Parse common chemical formulas and reaction equations.
- Balance equations with integer coefficients.
- Convert between amount, mass, molar mass, and stoichiometric ratios for one
  limiting-reactant style question.
- Compute solution concentration from explicit amount in mol and volume in L.

Implementation notes:

- Store a reviewed minimal atomic-mass table derived from IUPAC data; never
  fetch atomic weights at runtime or during tests.
- Use exact `Fraction` arithmetic for coefficients and mole ratios; use
  `Decimal` only for controlled display rounding.
- Fall back for unsupported notation, redox half-reactions, hydrates,
  ambiguous significant-figure requirements, or missing atomic masses.

Supported formulas and procedures:

- Chemical equation balancing via element-count matrix nullspace.
- Molar mass from a small reviewed atomic-mass table.
- `n = m / M`, limiting reagent by smallest `n_i / nu_i`.
- `c = n / V` for solution concentration.

Handwritten fixture examples:

- Supported: "配平 H2 + O2 -> H2O"
- Supported: "10g H2 与 80g O2 反应生成 H2O，求限量反应物和理论产量"
- Fallback: "求 Uuo2 的摩尔质量"

## algorithm_graph_core

Sources:

- [NetworkX Shortest Paths](https://networkx.org/documentation/stable/reference/algorithms/shortest_paths.html)
- [NetworkX Traversal](https://networkx.org/documentation/stable/reference/algorithms/traversal.html)
- [NetworkX Directed Acyclic Graphs](https://networkx.org/documentation/stable/reference/algorithms/dag.html)

Registered V1 scope:

- Parse small explicit graphs from edge lists, adjacency lists, or simple
  natural-language prompts.
- Explain BFS, DFS, shortest path on non-negative weighted graphs, and DAG
  topological ordering.
- Produce deterministic trace steps suitable for existing code/math snapshots
  before adding custom animated graph renderers.

Implementation notes:

- Treat NetworkX docs as the terminology and behavior reference only; do not
  add NetworkX as a production dependency for this first-batch skill.
- Implement a small local kernel and lock expected visit order plus tie-breaking
  rules in tests.
- Fall back for malformed graphs, negative weights in Dijkstra-style tasks,
  cyclic graphs in DAG-only tasks, or prompts that require algorithm choice
  beyond the manifest scope.

Supported procedures:

- BFS with queue order determined by first-seen node order.
- DFS with recursive neighbor order determined by first-seen node order.
- Dijkstra for directed, non-negative weighted graphs.
- Kahn-style topological sort for explicit DAGs.

Handwritten fixture examples:

- Supported: "用 BFS 遍历图 A-B, A-C, B-D, C-D，从 A 开始"
- Supported: "解释 Dijkstra：A->B=2, A->C=5, B->C=1, C->D=3，求 A 到 D 最短路"
- Fallback: "对有向图 A->B, B->A 做拓扑排序"

## biology_genetics

Sources:

- [OpenStax Biology 2e: 12.1 Mendel's Experiments and the Laws of Probability](https://openstax.org/books/biology-2e/pages/12-1-mendels-experiments-and-the-laws-of-probability)
- [OpenStax Biology 2e: 12.3 Laws of Inheritance](https://openstax.org/books/biology-2e/pages/12-3-laws-of-inheritance)
- [Python `fractions`](https://docs.python.org/3/library/fractions.html)

Registered V1 scope:

- One-trait and two-trait Mendelian crosses with explicit parent genotypes such
  as `Aa x Aa`, `Aa x aa`, and `AaBb x AaBb`.
- Exact gamete, genotype, and phenotype probability arithmetic using
  `Fraction`.
- Punnett table, genotype ratio, phenotype ratio, genotype probability, and
  phenotype probability outputs.

Implementation notes:

- Heuristics may draft parent genotypes, dominance assumptions, and a requested
  target such as `P(aa)` or `P(A_B_)`; they must not compute ratios or final
  probabilities.
- Phenotype questions require explicit dominance assumptions. Without them, the
  skill must return `handled=False`.
- Fall back for linkage, epistasis, sex linkage, pedigrees, incomplete
  dominance, unknown dominance, or more than two traits.

Supported procedures:

- Enumerate parent gametes and cross them with exact product probabilities.
- Canonicalize genotype order per locus as homozygous dominant, heterozygous,
  homozygous recessive.
- Reduce probability counts into Mendelian ratios such as `1:2:1` and
  `9:3:3:1`.

Handwritten fixture examples:

- Supported: "A 对 a 显性，亲本 Aa x Aa，求基因型比例、表现型比例和 P(aa)"
- Supported: "A 对 a 显性，B 对 b 显性，亲本 AaBb x AaBb，求表现型比例和 P(A_B_)"
- Fallback: "A 对 a 显性，伴性遗传亲本 Aa x Aa，求表现型比例"

## probability_statistics_core

Sources:

- [OpenStax Introductory Statistics 2e: 3.3 Two Basic Rules of Probability](https://openstax.org/books/introductory-statistics-2e/pages/3-3-two-basic-rules-of-probability)
- [OpenStax Introductory Statistics 2e: 4.3 Binomial Distribution](https://openstax.org/books/introductory-statistics-2e/pages/4-3-binomial-distribution)
- [OpenStax Introductory Statistics 2e: 6.1 The Standard Normal Distribution](https://openstax.org/books/introductory-statistics-2e/pages/6-1-the-standard-normal-distribution)
- [Python `decimal`](https://docs.python.org/3/library/decimal.html)
- [Python `fractions`](https://docs.python.org/3/library/fractions.html)

Registered V1 scope:

- Descriptive statistics for explicit numeric lists.
- Probability union and conditional probability from explicit event
  probabilities.
- Small contingency-table totals.
- Binomial point probability with explicit `n`, `p`, and `k`.
- Z-score and standard normal CDF display using `math.erf`.

Implementation notes:

- Use `statistics`, `math`, `Fraction`, and `Decimal`; do not introduce
  pandas, numpy, or runtime network calls.
- Treat population variance and standard deviation as supported only when the
  prompt says `总体`; require `样本` for sample spread.
- Fall back for hypothesis tests, regression, unsupported distributions,
  missing dependence assumptions, malformed tables, or ambiguous variance
  scope.
- The skill uses `domain="math"` because MetaView has no dedicated statistics
  domain.

Supported formulas and procedures:

- `P(A union B) = P(A) + P(B) - P(A intersection B)`
- `P(A|B) = P(A intersection B) / P(B)`
- `P(X=k) = C(n,k) p^k (1-p)^(n-k)`
- `z = (x - mu) / sigma`

Handwritten fixture examples:

- Supported: "总体数据 [2,4,4,4,5,5,7,9]，求均值、中位数、众数和极差"
- Supported: "P(A)=0.6, P(B)=0.5, P(A∩B)=0.2，求 P(A∪B)"
- Supported: "二项分布 n=5, p=0.2, k=2，求概率"
- Fallback: "对数据 [1,2,3,4] 做回归分析并检验假设"

## geography_climate

Sources:

- [NOAA U.S. Climate Normals](https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals)

Registered V1 scope:

- Offline educational normals for a tiny checked-in fixture, clearly labelled
  as teaching data and not live NOAA downloads.
- Annual temperature mean, annual precipitation total, warmest/coldest month,
  wettest/driest month, station comparison, and anomaly from normal.
- Explicit station IDs only. Inline observed values are required for anomaly
  questions.

Implementation notes:

- Fixture station labels must include "offline educational normal" so generated
  lessons do not imply live climate lookup.
- Do not fetch NOAA data at runtime or in tests. NOAA is a source reference for
  normals concepts and field naming only.
- Fall back for unknown stations, arbitrary maps, live climate lookups, spatial
  interpolation, trend analysis, or missing month/unit data.

Supported formulas and procedures:

- `annual mean temperature = sum(monthly temperatures) / 12`
- `annual precipitation = sum(monthly precipitation)`
- Month extremes by max/min monthly normal value.
- `anomaly = observed - normal`

Handwritten fixture examples:

- Supported: "离线教学站点 EDU_TEMPERATE 的气候常年值摘要"
- Supported: "比较 EDU_TEMPERATE 和 EDU_ARID 的年均温和年降水"
- Supported: "EDU_TEMPERATE 7月观测气温 28C，求距平"
- Fallback: "查询 UNKNOWN_STATION 的气候常年值摘要"
