# Generation Review Workflow

Use this workflow after animation, renderer, prompt, or deployment changes to verify that the generated video actually improved.

## Local API

Start the API first:

```bash
make dev-api
```

Run a real generation/export review:

```bash
METAVIEW_REVIEW_API_KEY="$OPENAI_API_KEY" make review-real-generation
```

If the API server already has `METAVIEW_OPENAI_API_KEY` configured in `.env`, omit the request override:

```bash
python3 apps/api/tools/review_generation_workflow.py --no-provider-override
```

## Remote API

```bash
METAVIEW_REVIEW_API_BASE=http://115.191.22.22 \
METAVIEW_REVIEW_API_KEY="$OPENAI_API_KEY" \
make review-real-generation
```

## Outputs

The workflow writes to `/tmp/metaview-review` by default:

- MP4 export
- extracted review frames
- JSON report
- Markdown checklist

The report includes run ID, export job ID, snapshot kinds, `ffprobe` metadata, and `blackdetect` findings. The final pass is still human: inspect the extracted frames and mark the checklist only when the animation is visually and pedagogically better than the previous baseline.
