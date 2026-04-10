# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Educational visualization platform (数智化学科可视化平台) in a monorepo. A user prompt is routed to a subject skill, transformed into a CIR (Curriculum Intermediate Representation), then rendered either as:

- an interactive HTML animation preview (default Studio path), or
- a Manim-based video preview with optional TTS narration.

## Repository Shape

- `apps/api/` — FastAPI backend, orchestration, providers, persistence, render pipeline
- `apps/web/` — React 19 + Vite 8 frontend for Studio / History / Tools
- `skills/` — subject prompt packs and reference material used by planner/coder/critic flows
- `data/` — SQLite history/runtime data in local and Docker setups
- `docs/` — architecture and operational docs

## Commands

```bash
make bootstrap          # npm install + create .venv + install backend dev deps
make bootstrap-manim    # create .venv-manim + install manim render deps
npm run setup:git-hooks # enable repo git hooks after bootstrap
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

- `POST /api/v1/pipeline` — run the generation flow inline
- `POST /api/v1/pipeline/submit` — queue a background run and poll later
- static mounts for generated media and HTML previews, including `/api/v1/html_preview`

The app also wires structured error responses, request security checks, runtime settings, provider CRUD, and history APIs.

### CIR (Curriculum Intermediate Representation)

The shared data contract between planner, coder, and critic. Key fields:

- `title`, `domain`, `summary` — scene metadata
- `steps[]` — time-ordered visualization steps, each with `visual_kind` and `tokens[]`
- `visual_kind` — `array` / `graph` / `formula` / `flow` / `text` / `motion` / `circuit` / `molecule` / `map` / `cell`
- `tokens[]` — core entities rendered on screen per step

`domain` is optional in `PipelineRequest`; `DomainRouter` (`services/domain_router.py`) classifies it automatically. The legacy `provider` field on requests is a backward-compat alias for `generation_provider`.

### Pipeline orchestrator

`apps/api/app/services/orchestrator.py` is the main integration point. It owns:

- provider registry and runtime provider selection
- `PlannerAgent`, `CoderAgent`, `HtmlCoderAgent`, `CriticAgent`
- CIR validation / repair
- HTML renderer, preview video renderer, sandbox, and TTS service
- history persistence and background run coordination

The important split is by `request.output_mode`:

#### HTML mode

Current HTML generation is scaffold-based, not raw full-page HTML generation.

Flow:

1. provider returns structured `HtmlAnimationPayload` data
2. backend assembles a fixed HTML scaffold
3. `HtmlRenderer` writes the preview asset under the configured HTML output dir
4. frontend loads that asset in an iframe sandbox

The scaffold owns the runtime shell, not the model: document structure, message bridge, theme/playback/step/param handling, and ready signaling. This is the current architecture described in `docs/architecture.md`.

Key files:

- `apps/api/app/services/agents.py` — `HtmlCoderAgent` execution, payload parsing/validation/fallback
- `apps/api/app/services/prompts/html_coder.py` — HTML payload prompt, fallback payload generation, scaffold assembly
- `apps/api/app/schemas.py` — `HtmlAnimationPayload` and related HTML payload models

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

This path is still the source of preview video artifacts and should be preserved when changing HTML behavior.

### Other key backend services

- `services/skill_catalog.py` — `SubjectSkillRegistry`, maps domain → skill metadata and prompt reference files at runtime
- `services/domain_router.py` — `infer_domain()`, classifies a prompt/image into a `TopicDomain`
- `services/validation.py` — `CirValidator`, structural checks on the CIR
- `services/repair.py` — `PipelineRepairService`, retries CIR repair up to `max_repair_attempts`
- `services/html_renderer.py` — `HtmlRenderer`, writes assembled scaffold HTML to `preview_html_output_dir`
- `services/execution_map.py` — `build_execution_map()`, converts CIR steps into a flat execution timeline

### Providers

The system uses separate provider roles:

- `router_provider` — lightweight classification/model routing
- `generation_provider` — planner/coder/critic/HTML generation

Provider implementations conform to the `ModelProvider` protocol. Built-ins include the mock provider and OpenAI-compatible provider; custom providers are persisted and exposed through runtime settings APIs.

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

### App shell

`apps/web/src/App.tsx` is the top-level shell. It is a small hash-router over three surfaces:

- `studio`
- `history`
- `tools`

It also owns selected run state, active polling, resolved preview URLs, theme state, and the default output mode. The Studio currently defaults to `html` output mode.

### Studio page

`apps/web/src/pages/Studio/StudioPage.tsx` composes the main authoring experience:

- control panel / request form
- task progress and run status
- HTML preview panel or video preview depending on output mode
- execution explorer / debug surfaces

### HTML preview contract

`apps/web/src/components/HtmlSandbox.tsx` defines the iframe protocol expected from generated HTML. The preview must emit `ready`, and the host can send messages for:

- `goToStep`
- `playback`
- `setParam`
- `theme`

If HTML changes break this contract, the iframe may load but never become interactive.

### API client

`apps/web/src/api/client.ts` is the canonical frontend API layer. It covers:

- pipeline execution
- history fetching
- runtime settings
- provider CRUD
- active run polling

Use it as the reference shape when changing request/response contracts.

### Frontend hooks organization

- `hooks/core/` — shared infrastructure: `useTheme`, `useRuntimeCatalog`, `useMouseGlow`
- `hooks/features/` — business logic: `useTaskProgress` (polls active runs), `useHistoryRuns`, `useVideoSync`, `usePipelineStats`

## Prompt and Skill System

Prompt builders live in `apps/api/app/services/prompts/`.

Important split:

- `router.py` — domain classification
- `planner.py` — CIR generation
- `coder.py` — Manim/video renderer generation
- `critic.py` — quality review
- `html_coder.py` — HTML payload generation + scaffold assembly
- `domain_guidance.py` — per-domain guidance injection

The `skills/` directory contains the domain-specific reference material used to enrich planner/coder/critic behavior. Supported subjects in the current product/docs include algorithm, math, physics, chemistry, biology, geography, and code-oriented flows.

## Configuration

Backend settings are defined in `apps/api/app/config.py` with the `ALGO_VIS_` env prefix.

Important settings to check before debugging runtime behavior:

- provider defaults and OpenAI-compatible model settings
- `history_db_path`
- `preview_media_root`
- `preview_html_output_dir`
- TTS configuration
- manim render settings
- enabled domains

In Docker, `docker-compose.yml` mounts `./data` and `./skills` into the API container, so persistence and prompt/reference data survive container restarts.

## Notes for Future Changes

- HTML preview work should follow the scaffold-injection architecture in `docs/architecture.md`, not revert to asking the model for a full standalone HTML document.
- Preserve the distinction between HTML preview generation and Manim/video generation; they share request plumbing but diverge inside the orchestrator.
- When debugging a “HTML loaded but never became ready” issue, check both backend scaffold assembly and the `HtmlSandbox` message contract before changing prompt text.
- When updating request/response fields, inspect both `apps/api/app/schemas.py` and `apps/web/src/api/client.ts` / `apps/web/src/types.ts` together.
