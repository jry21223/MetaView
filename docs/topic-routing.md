# Topic Routing

MetaView routes each prompt before building the CIR prompt. Topic routing chooses
prompt guidance; Skill routing proposes a deterministic candidate. Neither is the
final capability verdict. `CoverageResolver` validates both signals against registered
manifests, ProblemSpec, tools and SceneBlueprint before LessonPlan/provider execution.

## Modes

- `specialized`: injects domain-specific prompt guidance for one existing
  `TopicDomain`.
- `generic`: injects generic visual pedagogy guidance and asks the LLM to choose
  the final `cir.domain` itself.

`generic` is not a domain. Do not add `TopicDomain.GENERIC`; final CIR output
must still use one of:

```text
algorithm, math, code, physics, chemistry, biology, geography
```

Do not confuse topic `SkillMode.SPECIALIZED` with CoverageDecision `specialized`.
The latter requires a verified registered SkillPack and deterministic runtime contracts.

## Auto Routing

The main pipeline calls:

```python
route_topic(prompt, explicit_domain=request.domain, source_code=request.source_code)
```

Routing order:

1. Valid explicit `domain` request wins and routes to `specialized`.
2. Non-empty `source_code` routes to the `code` specialized skill.
3. Keyword evidence is scored by match count and specificity; the strongest domain wins,
   while the existing map order remains the final tie-breaker.
4. No keyword match routes to `generic` with `domain=None`.

The old behavior was:

```text
unknown prompt -> TopicDomain.ALGORITHM
```

The new behavior is:

```text
unknown prompt -> skill_mode=generic, domain_hint=None
```

This prevents vague or uncategorized prompts from inheriting algorithm-specific
array/graph guidance. In the production pipeline, a request that also lacks verified
Skill/profile evidence becomes `CoverageDecision(mode="unsupported")` and is rejected;
the raw `route_topic()` helper still returns generic context for callers that only inspect routing.

## Explicit Domain

When the client passes `domain="physics"`, the route is:

```text
skill_mode=specialized
domain=physics
reason=explicit_domain
```

Invalid explicit domains are ignored and normal source-code/keyword/no-match
routing continues.

## Source Code

When `source_code` is present and non-blank, the route is:

```text
skill_mode=specialized
domain=code
reason=source_code_present
```

This preserves code-line tracking and code explanation guidance.

## Skill Override

`PipelineRequest.skill_mode_override` is an optional dev/eval field:

- `auto` or `None`: use normal route selection.
- `generic`: force generic prompt mode, even if a keyword matches.
- `specialized`: force specialized mode when a domain can be determined.

If `specialized` is requested but no domain can be determined, the router falls
back to generic mode with reason `skill_mode_override_specialized_no_domain`.

Use this for A/B prompt comparison; it is not required for default user flows.

Request-level `router_min_confidence` values below the configured refine threshold are valid;
the effective refine threshold is clamped to the requested minimum before routing and Coverage
resolution. A value of `0` is preserved rather than replaced by the default.

`generic` prevents direct Skill execution, but does not erase an independently resolved
domain or a registered SkillPack's negative capability evidence from CoverageDecision. An exact
controlled composition profile may still be reported as `composable`; no Generalist Skill is
registered and no SkillRecipe is executed in this phase.
