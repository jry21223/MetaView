# Teaching Deck MVP 0.1

This MVP validates the seam between PPTMaster-style slide authoring and MetaView's existing dynamic explanation pipeline.

## Scope

- Route: `/create/teaching-deck` (`/teaching-deck` redirects here)
- Reference lesson: 高中数学《椭圆及其标准方程》
- Default output: 11 editable slide intents
- Default dynamic pages: 2
- Ordinary pages: exported as native OOXML text/shapes
- Dynamic pages: submitted one-by-one through the existing MetaView pipeline and linked back by Run ID
- Export: browser-generated 16:9 `.pptx` without adding a new runtime dependency

## Flow

```text
Topic / grade / duration / goals / optional text material
  -> deterministic lesson outline
  -> teacher reviews every slide intent
  -> ordinary page => PPTMaster-native OOXML
  -> dynamic page => existing MetaView pipeline
  -> PPTX export
```

The important boundary is `TeachingDeckSlide.renderer`:

```ts
renderer: "pptmaster" | "metaview"
```

This routing field does not replace `PlaybookScript`. A MetaView page still goes through the current pipeline and existing Playbook/Director renderer contract.

## Current dynamic-page contract

A dynamic page submits a bounded prompt containing only the current course context, slide number, teaching goal, required facts, visual strategy, and target duration. The resulting Run ID is stored on that slide and can be reopened in the normal MetaView player.

The exported PPTX currently represents dynamic pages with editable teaching content plus their MetaView Run metadata/link. **MP4 embedding is intentionally not claimed in this MVP.** Automatic render polling, media download, and video insertion are the next integration milestone.

## Persistence and privacy

Projects without pasted source material are saved in browser `localStorage`. If source material is present, the entire project remains session-only and any previously persisted draft is removed. This prevents generated excerpts derived from unpublished teaching material from being persisted indirectly through slide content.

## Acceptance criteria

- Generate the ellipse reference deck as 11 ordered slides.
- Route exactly two reference slides to MetaView by default.
- Edit title, teaching goal, page kind, renderer, content, visual strategy, and duration.
- Add, delete, and reorder slides without regenerating the whole deck.
- Generate one dynamic slide without regenerating the whole lesson.
- Reopen the returned MetaView Run.
- Export a real 16:9 `.pptx` package with editable ordinary text/shapes.
- Keep source-backed projects out of automatic local persistence.

## Deliberate exclusions

- PDF/DOCX parsing
- model-generated full-deck planning
- external PPTMaster repository adapter
- embedded MetaView MP4 media
- PowerPoint-like freeform canvas editing
- server-side project persistence and collaboration
- all-subject factual validation
