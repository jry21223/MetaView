# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Educational visualization platform (数智化学科可视化平台) — a full-stack monorepo that takes a natural-language prompt about an educational topic, routes it to a domain-specific skill, generates a CIR (Curriculum Intermediate Representation), produces a renderer script, and displays an interactive manim-web animation in the browser.

## Monorepo Layout

- `apps/api/` — Python 3.11 FastAPI backend (uvicorn)
- `apps/web/` — TypeScript React 19 frontend (Vite 8)
- `skills/` — Six domain skill definitions (algorithm, math, physics, chemistry, biology, geography)
- `docs/` — Architecture and roadmap docs

## Commands

```bash
make bootstrap          # npm install + create .venv + pip install dev deps
make dev-api            # uvicorn on :8000 with --reload
make dev-web            # vite dev on :5173 (proxies /api to :8000)
make lint               # eslint (web) + ruff (api)
make test               # pytest apps/api/tests -q
make build              # vite build (web)
make check              # lint + test + build
```

Run a single backend test:
```bash
.venv/bin/pytest apps/api/tests/test_main.py -q
.venv/bin/pytest apps/api/tests/test_main.py::test_pipeline_mock -q
```

## Architecture

### Pipeline flow (orchestrator.py)

```
Prompt + optional image
  → Domain Router (auto-classify or explicit)
  → Skill Lookup (SubjectSkillRegistry)
  → PlannerAgent → CIR document
  → CirValidator + auto-repair (up to max_repair_attempts)
  → CoderAgent → renderer script
  → Python Manim → TypeScript conversion (py2ts)
  → PreviewDryRunSandbox (static + node validation)
  → CriticAgent → quality check
  → PipelineResponse (CIR + scripts + diagnostics)
```

### Dual-provider model

The system uses two separate provider roles:
- **router_provider** — cheap model for domain classification
- **generation_provider** — capable model for planning, coding, critique

Both implement the `ModelProvider` protocol (`providers/base.py`) with methods: `route()`, `plan()`, `code()`, `critique()`. Built-in providers: `MockModelProvider` (deterministic), `OpenAICompatibleProvider` (remote LLM). Custom providers can be registered at runtime via API and are persisted to SQLite.

### CIR (Curriculum Intermediate Representation)

Defined in `schemas.py` as `CirDocument`: `title`, `domain`, `summary`, `steps[]`. Each `CirStep` has: `id`, `title`, `narration`, `visual_kind`, `layout`, `tokens[]`, `annotations[]`. Visual kinds: `array`, `flow`, `formula`, `graph`, `text`, `motion`, `circuit`, `molecule`, `map`, `cell`.

### Frontend ↔ Backend

- API client: `apps/web/src/api/client.ts` (fetch-based)
- Vite dev proxy: `/api` and `/health` → `http://127.0.0.1:8000`
- Production: `VITE_API_BASE_URL` env var
- Animation rendering: manim-web + three.js in `PreviewCanvas`

## Configuration

Backend settings use Pydantic Settings with `ALGO_VIS_` env prefix (see `apps/api/app/config.py`). Key vars: `DEFAULT_PROVIDER`, `DEFAULT_ROUTER_PROVIDER`, `DEFAULT_GENERATION_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, `HISTORY_DB_PATH` (default: `data/pipeline_runs.db`).

## Git Conventions

- Conventional Commits enforced by commit-msg hook (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`)
- Pre-commit hook runs frontend lint + backend ruff/pytest when `.venv` exists
- Setup hooks: `npm install && npm run setup:git-hooks` (or `make setup-hooks`)
- Branch naming: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, `chore/<topic>`

## Backend Linting

ruff config: line-length 100, rule sets E, F, I, B.
