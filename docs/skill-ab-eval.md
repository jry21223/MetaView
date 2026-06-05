# Skill A/B Evaluation

This workflow compares the same prompt in two prompt modes:

- specialized skill: domain-specific guidance is injected.
- generic skill: no subject-specific guidance is injected.

The comparison does not call real LLMs in CI. Tests only validate prompt
differences and metric extraction against fixed JSON fixtures.

## Prompt-Only Comparison

Use `build_cir_prompt` directly in tests:

```python
specialized_system, _ = build_cir_prompt(
    prompt,
    TopicDomain.PHYSICS,
    skill_mode=SkillMode.SPECIALIZED,
)
generic_system, _ = build_cir_prompt(
    prompt,
    None,
    skill_mode=SkillMode.GENERIC,
)
```

Expected result:

- prompts differ;
- specialized prompt contains the matched domain guidance;
- generic prompt does not contain any domain-specific guidance block.

## Manual Real-LLM Eval

Run from the repo root after setting a real OpenAI-compatible provider:

```bash
METAVIEW_OPENAI_API_KEY=... \
METAVIEW_OPENAI_MODEL=gpt-4o-mini \
python apps/api/scripts/eval_skill_ab.py \
  --prompt "斜面小球受力分析，解释摩擦力和加速度" \
  --domain physics \
  --out data/evals/skill_ab/physics_incline.json
```

Optional overrides:

```bash
--api-key ...
--base-url https://api.openai.com/v1
--model gpt-4o-mini
```

## Output

The script saves:

- original prompt;
- specialized system/user prompt and raw output;
- generic system/user prompt and raw output;
- parsed summaries;
- automatic metrics for both outputs;
- simple deltas between the two metric sets.

Metrics include:

- `domain`;
- `step_count`;
- `visual_kind_counts`;
- `has_scene`;
- `has_formula`;
- `has_array`;
- `narration_total_chars`;
- `parse_ok`;
- validation error/warning counts.

## Limitations

These metrics describe output shape only. They do not judge teaching quality,
visual beauty, factual correctness, or whether one answer is pedagogically
better. Use them to find structural differences, then inspect selected outputs
manually.
