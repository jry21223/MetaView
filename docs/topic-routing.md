# Topic Routing

MetaView routes each prompt before building the CIR prompt. Routing chooses the
prompt skill mode only; it does not change the CIR or PlaybookScript schema.

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

## Auto Routing

The main pipeline calls:

```python
route_topic(prompt, explicit_domain=request.domain, source_code=request.source_code)
```

Routing order:

1. Valid explicit `domain` request wins and routes to `specialized`.
2. Non-empty `source_code` routes to the `code` specialized skill.
3. Keyword match routes to the matched specialized skill.
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
array/graph guidance.

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
