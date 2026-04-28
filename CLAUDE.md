# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Educational visualization platform (数智化学科可视化平台) in a monorepo. A user prompt is routed to a subject skill, transformed into a CIR (Curriculum Intermediate Representation), then rendered either as:

- an interactive HTML animation preview (default Studio path), or
- a Manim-based video preview with optional TTS narration.

Both output modes are first-class citizens. HTML is the default for speed; video is retained for artifact generation with narration.

## Repository Shape

- `apps/api/` — FastAPI backend, orchestration, providers, persistence, render pipeline
- `apps/web/` — React 19 + Vite 8 frontend for Studio / History / Tools
- `skills/` — subject prompt packs and reference material used by planner/coder/critic flows
  - `skills/demoo-patterns/` — YAML-codified architecture instincts (commit conventions, config patterns, provider protocol, test naming, frontend type centralization)
  - `skills/generate-subject-manim-prompts/` — per-domain reference markdown files (algorithm, math, code, physics, chemistry, biology, geography)
- `data/` — SQLite history/runtime data in local and Docker setups
- `docs/` — architecture and operational docs (architecture.md is in Chinese)
- `.github/` — CI workflows
- `.githooks/` — Git hooks (commitlint via commitlint.config.cjs)

## Commands

```bash
make bootstrap          # npm install + create .venv + install backend dev deps
make bootstrap-manim    # create .venv-manim + install manim render deps
npm run setup:git-hooks # enable repo git hooks after bootstrap (sets core.hooksPath .githooks)
cp .env.example .env    # required before local or Docker runs

make dev                # run API (:8000) and web (:5173)
make dev-api            # FastAPI with reload
make dev-web            # Vite dev server

make lint               # eslint (web) + ruff (api)
make test               # pytest apps/api/tests -q
make build              # frontend typecheck + vite build
make check              # lint + test + build

make start              # docker compose up --build
make stop               # docker compose down
```

Single backend tests:

```bash
.venv/bin/pytest apps/api/tests/test_main.py -q
.venv/bin/pytest apps/api/tests/test_main.py::test_pipeline_mock -q
.venv/bin/pytest apps/api/tests/test_sandbox.py -q   # sandbox validation tests
```

Frontend lint only:

```bash
npm --workspace apps/web run lint
```

## Backend Architecture

### Entry points

`apps/api/app/main.py` exposes both synchronous and async pipeline entry points:

**Pipeline:**
- `POST /api/v1/pipeline` — run the generation flow inline
- `POST /api/v1/pipeline/submit` — queue a background run and poll later
- `GET /api/v1/runs` — list all pipeline runs (limit query param)
- `GET /api/v1/runs/{request_id}` — fetch detailed run results
- `DELETE /api/v1/runs/{request_id}` — delete a run from history

**Manim:**
- `POST /api/v1/manim/prepare` — AST-validate and prepare a Manim script
- `POST /api/v1/manim/render` — render a Manim script to video with optional narration

**Runtime configuration:**
- `GET /api/v1/runtime` — full runtime catalog (providers, skills, settings, sandbox modes)
- `GET /api/v1/runtime/settings` — current runtime settings
- `PUT /api/v1/runtime/settings` — update runtime settings dynamically (persisted to SQLite)

**Providers:**
- `POST /api/v1/providers/custom` — register/upsert a custom OpenAI-compatible provider
- `POST /api/v1/providers/custom/test` — test provider connectivity
- `DELETE /api/v1/providers/custom/{name}` — remove a custom provider

**Prompt tooling:**
- `POST /api/v1/prompts/reference` — generate domain guidance markdown
- `POST /api/v1/prompts/custom-subject` — generate a custom subject prompt pack

**Static mounts:** `/media` (generated videos). Note: `/api/v1/html_preview` static mount has been removed on branch `claude/metaview-engine-architecture-ppdCR` (HTML iframe path retired, replaced by Remotion engine).

**Safety inspection:** Every pipeline request goes through `inspect_pipeline_request()` (from `services/request_security.py`), which returns a `SafetyVerdict` of BLOCK, REVIEW, or ALLOW. REVIEW downgrades the run to `DRY_RUN` + `HTML` output mode.

### CIR (Curriculum Intermediate Representation)

The shared data contract between planner, coder, and critic. Key fields:

- `title`, `domain`, `summary` — scene metadata
- `steps[]` — time-ordered visualization steps, each with `visual_kind` and `tokens[]`
- `visual_kind` — `array` / `graph` / `formula` / `flow` / `text` / `motion` / `circuit` / `molecule` / `map` / `cell`
- `tokens[]` — core entities rendered on screen per step

`domain` is optional in `PipelineRequest`; `DomainRouter` (`services/domain_router.py`) classifies it automatically. The legacy `provider` field on requests is a backward-compat alias for `generation_provider`.

In HTML mode the pipeline now produces a `PlaybookScript` (defined in `schemas.py`) instead of `HtmlAnimationPayload`. `PlaybookScript` contains `MetaStep[]`, each with an `end_frame`, `snapshot` (discriminated union: `AlgorithmArraySnapshot` | `AlgorithmTreeSnapshot`), and `voiceover_text`. This drives the Remotion player on the frontend. See `docs/metaview-engine-architecture.md` for the full engine architecture.

### Pipeline orchestrator

`apps/api/app/services/orchestrator.py` is the main integration point. It owns:

- provider registry and runtime provider selection
- `PlannerAgent`, `CoderAgent`, `CriticAgent` (HtmlCoderAgent retired on this branch)
- CIR validation / repair (multi-trigger: CIR validation failure, sandbox failure, critic feedback, render failure)
- PlaybookBuilder (HTML mode), preview video renderer, sandbox, and TTS service
- history persistence and background run coordination (thread pool executor, status tracking)
- stage-specific model dispatch: `openai_router_model`, `openai_planning_model`, `openai_coding_model`, `openai_critic_model` can differ

The important split is by `request.output_mode`:

#### HTML mode (Remotion Playbook Engine — active on branch `claude/metaview-engine-architecture-ppdCR`)

**Retired:** `HtmlCoderAgent`, `HtmlRenderer`, `html_coder.py` prompts, iframe sandbox, `/api/v1/html_preview` static mount.

**Replaced by:** deterministic `CIR + ExecutionMap → PlaybookScript` mapping.

Flow:
1. `PlannerAgent` → `CirDocument` (unchanged)
2. `ExecutionMapBuilder` → `ExecutionMap` with checkpoint timing (unchanged for ALGORITHM/CODE domains)
3. `PlaybookBuilder` (`services/playbook_builder.py`) maps CIR steps to `MetaStep[]` with `end_frame` and `snapshot`
4. `PlaybookScript` is returned inline in `PipelineResponse.playbook` (no file written to disk)
5. Frontend `PlaybookPlayer` renders via `@remotion/player` with `AlgorithmRenderer` / `BinaryTreeRenderer`

Key files:

- `apps/api/app/services/playbook_builder.py` — deterministic CIR → PlaybookScript mapping
- `apps/api/app/schemas.py` — `PlaybookScript`, `MetaStep`, `AlgorithmArraySnapshot`, `AlgorithmTreeSnapshot`
- `apps/web/src/engine/` — full Remotion engine (see `docs/metaview-engine-architecture.md`)

#### Video / Manim mode

The original CIR → renderer path is still present for video output:

```text
Prompt + optional source code/image
  → domain routing / skill lookup
  → PlannerAgent → CIR
  → CIR validation + repair
  → CoderAgent → renderer script
  → py2ts / preview sandbox validation
  → CriticAgent
  → PreviewVideoRenderer → MP4 (+ optional narration)
```

Rendering supports two backends: local Manim Python process or GVisor Docker container (configurable resource limits: memory_limit_mb, cpu_limit, pids_limit, network_enabled). The `preview_render_backend` config setting selects between `manim`, `fallback`, or `auto` (tries manim, falls back).

This path is still the source of preview video artifacts and should be preserved when changing HTML behavior.

### Other key backend services

- `services/skill_catalog.py` — `SubjectSkillRegistry`, maps domain → skill metadata and prompt reference files at runtime
- `services/domain_router.py` — `infer_domain()`, classifies a prompt/image into a `TopicDomain`
- `services/validation.py` — `CirValidator`, structural checks on the CIR
- `services/repair.py` — `PipelineRepairService`, retries CIR repair up to `max_repair_attempts`
- `services/html_renderer.py` — `HtmlRenderer`, writes assembled scaffold HTML to `preview_html_output_dir`
- `services/execution_map.py` — `build_execution_map()`, converts CIR steps into a flat execution timeline with checkpoints and parameter controls
- `services/request_security.py` — `SafetyVerdict` (BLOCK/REVIEW/ALLOW) for prompts, source code, and images
- `services/tts_service.py` — pluggable TTS backends (`system`, `openai_compatible`); default model mimotts-v2 with graceful fallback
- `services/video_narration.py` — narration embedding via ffmpeg
- `services/manim_script.py` — Manim script AST validation, preparation, timing calculation
- `services/source_code_module.py` — Python/C++ source AST inspection for the CODE domain
- `services/preview_video_renderer.py` — local Manim + GVisor Docker render paths
- `services/prompt_authoring.py` — advanced prompt customization and preset knowledge point injection
- `services/providers/registry.py` — provider lifecycle management and custom provider CRUD
- `services/sandbox.py` — `PreviewDryRunSandbox`, hybrid static + dry-run validation (detects HTML vs Manim output)

### Providers

The system uses separate provider roles:

- `router_provider` — lightweight classification/model routing
- `generation_provider` — planner/coder/critic/HTML generation

Provider implementations conform to the `ModelProvider` protocol (`services/providers/base.py`). Built-ins include the mock provider and OpenAI-compatible provider; custom providers are persisted and exposed through runtime settings APIs. The OpenAI-compatible provider supports vision (`openai_supports_vision`) and per-stage model overrides.

### Persistence

`apps/api/app/services/history.py` stores more than run history. SQLite is also used for:

- pipeline request/response history
- queued/running/succeeded/failed run state
- runtime settings
- custom provider definitions

Default DB path is `data/pipeline_runs.db` unless overridden by config.

## Frontend Architecture

### Frontend env var

`VITE_API_BASE_URL` — set in `.env` for production-like static deployments where the frontend is served separately from the API. Leave blank for local dev (Vite proxy handles it).

Vite dev proxy routes `/api`, `/health`, `/media` to `http://127.0.0.1:8000`.

### App shell

`apps/web/src/App.tsx` is the top-level shell. It is a small hash-router over three surfaces:

- `studio` (default)
- `history`
- `tools`

It owns selected run state, active polling (stops after 3 consecutive errors), resolved preview URLs, theme state, and the default output mode. Session state is persisted to localStorage (`metaview-active-run-id`, `metaview-selected-run-id`, `metaview-theme`). Preview panels are lazy-loaded with `React.lazy` + `Suspense`.

### Studio page

`apps/web/src/pages/Studio/StudioPage.tsx` composes the main authoring experience:

- control panel / request form
- task progress and run status
- HTML preview panel or video preview depending on output mode
- execution explorer / debug surfaces

### History page

`apps/web/src/pages/History/HistoryPage.tsx` — two-panel layout: run list on the left, run detail (metadata badges, preview replay, delete) on the right.

### Tools page

`apps/web/src/pages/Tools/ToolsPage.tsx` — settings and debugging:

- Provider Manager (create/test/delete custom providers)
- TTS Settings (backend, model, voice, rate/speed/max_chars/timeout)
- Prompt Reference Tool (generate domain guidance, A/B test across providers)
- Pipeline stats sidebar

### Components

Full inventory in `apps/web/src/components/`:

- `AppChrome.tsx` — brand bar + navigation (sidebar on desktop ≥1024px, compact topbar on mobile), theme toggle
- `ControlPanel.tsx` — prompt textarea, image drag-drop, provider/sandbox/output-mode selectors, submit button
- `HtmlSandbox.tsx` — iframe wrapper implementing the postMessage protocol (see HTML preview contract below)
- `HtmlPreviewPanel.tsx` — HtmlSandbox container with header and metadata
- `HtmlPlaybackControls.tsx` — prev/next/seek/speed playback controls
- `HtmlParameterPanel.tsx` — dynamic parameter controls from `ExecutionParameterControl[]`
- `HtmlDebugPanel.tsx` — raw output diagnostics and fallback reason inspection
- `VideoPreview.tsx` — MP4 player with title/meta and download link
- `InteractiveExecutionExplorer.tsx` — video+code sync: checkpoint stepping, code line highlighting, parameter scenario builder, array track visualization
- `TaskProgressCard.tsx` — animated stage progression (domain_routing → cir_planning → script_coding → render_output)
- `HistoryPanel.tsx` — virtualized run list with status badges and delete
- `ProviderManager.tsx` — custom provider CRUD form
- `PromptReferenceTool.tsx` — domain guidance generation
- `TTSSettingsPanel.tsx` — TTS backend/model/voice settings
- `CodeAdapterPanel.tsx` — source code input/display
- `HighlightedCode.tsx` — syntax highlighting with emphasis line detection
- `ToolsSidebar.tsx` — skill list, provider stats
- `ToolsDebugOverview.tsx` — debug summary panel

### HTML preview contract

`apps/web/src/components/HtmlSandbox.tsx` defines the iframe protocol expected from generated HTML.

The preview must emit `ready` when initialized. The iframe should also send a `capabilities` message announcing which features it supports (playback, params, theme, reducedMotionAware).

The host can send messages to the iframe:

- `goToStep` — navigate to a specific step index
- `playback` — pause/play/speed/autoplay control
- `setParam` — update a named parameter without reload
- `theme` — sync dark/light mode

If HTML changes break this contract, the iframe may load but never become interactive. Debug in `HtmlDebugPanel` before changing prompt text.

### API client

`apps/web/src/api/client.ts` is the canonical frontend API layer. It covers:

- `submitPipeline()` / `getPipelineRun()` — pipeline execution and polling
- `getPipelineRuns()` / `deletePipelineRun()` — history management
- `getRuntimeCatalog()` / `updateRuntimeSettings()` — runtime catalog and settings
- `upsertCustomProvider()` / `deleteCustomProvider()` / `testCustomProvider()` — provider CRUD
- `generatePromptReference()` / `generateCustomSubjectPrompt()` — prompt tooling
- `prepareManimScript()` / `renderManimScript()` — direct Manim operations

Error handling extracts JSON payload fields (`detail`, `message`, `error_type`, `error_id`, `log_hint`); 413 responses emit an actionable message about image size.

Use this file as the reference shape when changing request/response contracts.

### Frontend hooks organization

- `hooks/core/` — shared infrastructure: `useTheme`, `useRuntimeCatalog`, `useMouseGlow`
- `hooks/features/` — business logic: `useTaskProgress` (simulates stage progression), `useHistoryRuns`, `useVideoSync` (maps video currentTime to step via ExecutionMap checkpoints), `usePipelineStats`
- `hooks/useHtmlPreviewSync.ts` — manages iframe state (step count, current step, playback config, parameter controls, capabilities)

### TypeScript types

`apps/web/src/types.ts` mirrors backend schema. Key types to know:

- `ExecutionCheckpoint`, `ExecutionMap`, `ExecutionParameterControl`, `ExecutionArrayTrack` — execution timeline types consumed by `InteractiveExecutionExplorer`
- `PipelineRunStatus` (`queued | running | succeeded | failed`), `PipelineStage` — run lifecycle
- `ProviderDescriptor` — includes `stage_models`, `supports_vision`, `is_custom`
- `SandboxMode` (`"dry_run" | "off"`) — controls backend validation level
- `OutputMode` (`"video" | "html"`) — selects render path

## Prompt and Skill System

Prompt builders live in `apps/api/app/services/prompts/`.

Important split:

- `router.py` — domain classification
- `planner.py` — CIR generation
- `coder.py` — Manim/video renderer generation
- `critic.py` — quality review
- `html_coder.py` — HTML payload generation + scaffold assembly/fallback
- `domain_guidance.py` — per-domain guidance injection
- `repair.py` — CIR and script repair prompts
- `preset_injector.py` — knowledge point tagging from preset library
- `reference_materials.py` — domain-specific reference material injection
- `shared_rules.py` — common visual contracts and runtime rules
- `sections.py` — prompt section formatting utilities
- `code_domain.py` — code source analysis and profile building

The `skills/` directory contains the domain-specific reference material used to enrich planner/coder/critic behavior. Supported domains: algorithm, math, physics, chemistry, biology, geography, code.

`skills/demoo-patterns/` contains YAML-codified team conventions. Check these before introducing new patterns (commit format, config env prefix, provider protocol, test file naming, frontend type centralization).

## Configuration

Backend settings are defined in `apps/api/app/config.py` with the `ALGO_VIS_` env prefix.

Important settings to check before debugging runtime behavior:

- provider defaults: `default_provider`, `default_router_provider`, `default_generation_provider`
- per-stage model overrides: `openai_router_model`, `openai_planning_model`, `openai_coding_model`, `openai_critic_model`
- `history_db_path`
- `preview_media_root`
- `preview_html_output_dir`
- `preview_render_backend` (`auto` / `manim` / `fallback`)
- TTS: `preview_tts_enabled`, `preview_tts_model`, `preview_tts_backend`, `preview_tts_speed`
- Manim: `manim_python_path`, `manim_quality`, `manim_format`, `manim_disable_caching`
- GVisor: `gvisor_docker_binary`, `gvisor_runtime`, `gvisor_image`, `gvisor_memory_limit_mb`, `gvisor_network_enabled`
- `max_repair_attempts` (default 2)
- `enabled_domains`
- `cors_origin_regex`

In Docker, `docker-compose.yml` mounts `./data` and `./skills` into the API container, so persistence and prompt/reference data survive container restarts.

## Notes for Future Changes

- **Remotion engine (this branch):** HTML mode now produces a `PlaybookScript` via `services/playbook_builder.py` and renders via `apps/web/src/engine/`. The iframe sandbox path is fully retired. See `docs/metaview-engine-architecture.md` for the full engine spec.
- When adding a new `SnapshotKind`, update `schemas.py` (backend), `engine/types.ts` (frontend), `playbook_builder.py` (`_build_snapshot` dispatch), and register a new renderer in `engine/renderers/registry.ts`.
- Preserve the distinction between Playbook (HTML mode) and Manim/video generation; they share CIR plumbing but diverge inside the orchestrator. Playbook gets `build_playbook()`; video gets `CoderAgent` + `PreviewVideoRenderer`.
- When updating request/response fields, inspect both `apps/api/app/schemas.py` and `apps/web/src/api/client.ts` / `apps/web/src/types.ts` together.
- `InteractiveExecutionExplorer` depends on the `ExecutionMap` structure produced by `services/execution_map.py`. If checkpoint or parameter control shapes change, update both files together.
- Stage-specific models may differ across router/planning/coding/critic stages. Never assume a single model applies to all agents — check `openai_*_model` config fields.
- Before introducing new architectural patterns, check `skills/demoo-patterns/` YAML files for codified team conventions.
