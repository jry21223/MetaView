# Agent Demo Acceptance

This document defines the minimum acceptance evidence for the AgentPipeline /
RuntimeToolHub path before merging or promoting agent mode. The demo suite is
not a benchmark; it is a reproducible smoke test that proves core domains can
produce schema-valid, renderer-consumable PlaybookScript output.

## Commands

Dry-run lists the cases and expected generation paths without calling the API:

```bash
python apps/api/scripts/run_agent_skill_demo.py --dry-run
```

Live run submits all cases to a running API and writes a JSON report:

```bash
METAVIEW_GENERATION_MODE=agent \
METAVIEW_AGENT_PROVIDER=codex \
python apps/api/scripts/run_agent_skill_demo.py \
  --api http://127.0.0.1:8000 \
  --output eval/reports/agent_skill_demo_local.json
```

Video export should be used for the strongest 1-3 demo cases after the live run
path is stable. It always requests silent export (`with_audio=false`):

```bash
METAVIEW_GENERATION_MODE=agent \
METAVIEW_AGENT_PROVIDER=codex \
python apps/api/scripts/run_agent_skill_demo.py \
  --api http://127.0.0.1:8000 \
  --ids math-derivative-guided algorithm-bfs-runtime code-recursion-stack \
  --export-videos \
  --output eval/reports/agent_skill_demo_export_local.json
```

Reports are written to `eval/reports/`. Downloaded videos are written to
`eval/videos/agent_skill_demo/`. These are local evidence artifacts and should
not be committed.

## Report Fields

- `status`: final run status from `/runs/{run_id}`; must be `succeeded`.
- `expected_path`: path declared by the fixture: `deterministic`, `agent`, or `single`.
- `actual_path`: path inferred from `review.actions`.
- `path_ok`: true when `actual_path` matches `expected_path`, or no expected path is set.
- `contract_score`: structural PlaybookScript score from `eval.scorers`.
- `passed_contract_score`: true when the structural contract score passes.
- `review_actions`: persisted actions that explain routing, generator, repair, and review steps.
- `video_path`: local file path when export succeeds.
- `video_error`: per-case export failure message when generation succeeds but export fails.

The suite passes only when every case has `status=succeeded`, `path_ok=true`,
and `passed_contract_score=true`.

## Failure Triage

1. Open the report entry and copy the `run_id`.
2. Inspect `/api/v1/runs/{run_id}` and its `review.actions`.
3. Use `actual_path` to decide whether the failure is routing, deterministic
   SkillPack output, agent output, schema validation, reviewer repair, or export.
4. For export failures, inspect `video_error` first; if it is not enough, check
   the export job error because it includes the tail of the Remotion stderr.

The acceptance suite should not change PlaybookScript schema or agent behavior.
It only records whether the current pipeline is demonstrably usable.

## Director Product Loop Cases

Director product-loop checks live in `eval/prompts/director_product_loop_cases.yaml`.
They exercise generated PlaybookScript, generated DirectorScript, visible
Inspector state, follow-up Director patches, and versioned export consistency.

Run the local recorded product-loop check with:

```bash
make eval-director-product-loop
```

Reports should be written to:

```text
eval/reports/director_product_loop_<timestamp>.json
```

Required report fields:

- `run_status`
- `has_playbook`
- `has_director`
- `step_count`
- `beat_count`
- `current_beat_visible_in_inspector`
- `followup_ok`
- `director_patch_ok`
- `playbook_unchanged_when_director_patch`
- `export_ok`
- `errors`

`eval/reports/`, `eval/videos/`, and `eval/shots/` remain local evidence only
and must not be committed.
