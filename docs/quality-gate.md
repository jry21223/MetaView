# Canonical Quality Gate

Status: Active

The API backend is the final authority for whether a generated PlaybookScript is
usable. Agent self-checks and the Web visual diagnostics are advisory inputs;
neither can turn a backend-blocked candidate into a successful run.

## Runtime flow

```text
SkillPack / Agent / legacy single
  -> PlaybookScript schema validation
  -> quality_gate_playbook(...)
  -> clean | warnings | repairable | blocked
  -> DirectorScript persistence
  -> pipeline_runs.status = succeeded | failed
```

- `clean`: no issues; the run may continue.
- `warnings`: non-blocking issues are persisted and visible in History.
- `repairable`: every error has a supported repair target. Agent and legacy
  single get one canonical repair attempt; deterministic SkillPack output fails
  closed because runtime code generation is not allowed.
- `blocked`: at least one error is not repairable, or repair attempts were
  exhausted. A blocked report cannot enter `succeeded`.

Terminal failures before a Playbook exists, including provider errors, invalid
CIR, skill consistency failures, and timeouts, also persist a blocked
QualityReport. This keeps failed History records diagnosable instead of leaving
the report empty.

## Current rule set

The initial backend rule set covers:

- empty Playbook, payload, narration, or primary renderer contract;
- unsupported snapshot kinds and subject-domain array fallback;
- non-monotonic or truncated timelines and narration-duration warnings;
- unresolved Asset Manifest references;
- math prompts that require a rich plot but receive formula-only output;
- BFS/graph traversal state, including one current-node checkpoint per visited
  node, recursion call-stack state, and explicit projectile
  velocity-decomposition state;
- Code Sync source bounds plus current/queue/visited agreement with the graph
  scene and current-frame variable agreement for recursion; missing BFS or
  recursion Code Sync tracks are repairable errors;
- aggregate LessonPlan adherence for registered fact IDs, semantic visual
  roles, preferred scene types and exact Gold conclusions; missing evidence is
  repairable, while per-SceneIntent order/narration tracing remains a documented
  PlaybookAssembler follow-up;
- final teaching step that does not address an explicit request;
- forbidden alternate rendering paths;
- Director persistence/load failures and export-readiness failures.

Quality scores expose the ten backend dimensions requested by the product
contract. They explain the gate; they do not override blocking issues.

## Persistence and versions

`pipeline_runs.quality_report_json` is separate from legacy `review_json`.
`PipelineRunResponse.quality_report` returns the parsed model, and the History
page displays it read-only. Follow-up patches and version restores rerun the
canonical gate before becoming the active Playbook, so the report describes the
current version rather than a stale candidate.

## Export boundary

Export requires an already-succeeded run and reruns the gate against the active
Playbook. Fresh errors replace stale export errors while prior non-blocking
review warnings remain visible. A Director repository read failure blocks the
job. Export receives the current light/dark theme and always renders with
`showDiagnostics=false` and `showInlineCode=false`. Code Sync stays in the
learning console beside the player and never enters preview/export pixels.

## Contract ownership

The canonical snapshot-kind source is the Pydantic `SnapshotKind` /
`AnySnapshot` contract. Tests compare it with the Agent allow-list, Web
`SnapshotKind`, and renderer registry through TypeScript AST extraction. Shared
issue codes such as `timeline.voiceover_too_short` and
`step.does_not_answer_prompt` also have cross-runtime severity checks.

The Agent self-check is intentionally a lightweight subset, not a second copy
of the canonical backend rule set. Any issue code emitted by both runtimes must
keep the same severity and path meaning, while API-only domain rules (for
example structured algorithm-state checks) remain authoritative and may still
trigger backend repair after the Agent pre-check passes.

Run focused verification with:

```bash
uv run pytest apps/api/tests/test_snapshot_contract_consistency.py \
  apps/api/tests/test_playbook_review_self_check.py \
  apps/api/tests/test_quality_report.py
```
