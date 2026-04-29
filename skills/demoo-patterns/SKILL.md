---
name: demoo-patterns
description: Coding patterns extracted from demoo educational visualization platform
version: 1.0.0
source: local-git-analysis
analyzed_commits: 34
---

# Demoo Platform Patterns

Educational visualization platform (数智化学科可视化平台) — a full-stack monorepo that generates interactive manim-web animations from natural-language prompts.

## Commit Conventions

This project uses **conventional commits** with optional scopes:

- `feat:` - New features
- `fix:` - Bug fixes
- `perf:` - Performance optimizations
- `chore:` - Maintenance tasks
- `docs:` - Documentation updates
- `build:` - Build/dependency changes

Scoped variants:
- `feat(ui):` / `feat(api):` - Feature scoped to frontend/backend
- `fix(web):` / `fix(api):` - Fix scoped to frontend/backend
- `chore(deploy):` - Deployment-related maintenance

**Evidence**: 33/34 commits follow conventional format (~97%)

## Code Architecture

### Monorepo Layout

```
apps/
├── api/               # Python 3.11 FastAPI backend
│   ├── app/
│   │   ├── config.py         # Pydantic Settings (ALGO_VIS_ prefix)
│   │   ├── main.py           # FastAPI entry point
│   │   ├── schemas.py        # CIR and API schemas
│   │   └── services/
│   │       ├── orchestrator.py   # Main pipeline orchestration
│   │       ├── agents.py         # LLM agent implementations
│   │       ├── providers/        # ModelProvider protocol + implementations
│   │       ├── prompts/          # Prompt templates (router, planner, coder, critic)
│   │       └── history.py        # SQLite persistence
│   └── tests/               # pytest tests (test_*.py)
│
├── web/               # TypeScript React 19 frontend (Vite 8)
│   └── src/
│       ├── App.tsx           # Main application component
│       ├── api/client.ts     # Fetch-based API client
│       ├── types.ts          # TypeScript type definitions
│       └── components/       # React components (PascalCase.tsx)
│
skills/                # Domain skill definitions
├── generate-subject-manim-prompts/   # Prompt generation skill
│   ├── SKILL.md
│   ├── agents/openai.yaml
│   ├── references/*.md              # Domain reference materials
│   └── scripts/*.py                 # Generation scripts
│
docs/                  # Architecture and roadmap docs
├── architecture.md
└── roadmap.md
```

### Backend Patterns

**Provider Protocol**: All model providers implement `ModelProvider` protocol with methods:
- `route()` - Domain classification
- `plan()` - CIR generation
- `code()` - Script generation
- `critique()` - Quality check
- `repair_code()` - Fix issues

**Configuration**: Pydantic Settings with `ALGO_VIS_` env prefix. Key settings:
- `ALGO_VIS_OPENAI_API_KEY`, `ALGO_VIS_OPENAI_BASE_URL`
- `ALGO_VIS_HISTORY_DB_PATH`, `ALGO_VIS_PREVIEW_MEDIA_ROOT`
- `ALGO_VIS_MANIM_*` for rendering options

**Services**: Each service in `app/services/` is a focused module (~200-800 lines). Services use dependency injection via `@lru_cache` for settings.

### Frontend Patterns

**Components**: PascalCase.tsx files in `src/components/`
**Types**: Centralized in `src/types.ts`
**API Client**: Single `client.ts` with fetch-based methods
**Styling**: `index.css` with Tailwind-inspired utilities

## Workflows

### Development

```bash
make bootstrap          # Initial setup: npm install + .venv + pip install
make bootstrap-manim    # Optional: .venv-manim for manim rendering
make setup-hooks        # Configure git hooks
make dev                # Run both API (:8000) and web (:5173)
make dev-api            # Just API with uvicorn --reload
make dev-web            # Just web with vite
```

### Quality Checks

```bash
make lint               # ruff (api) + eslint (web)
make test               # pytest apps/api/tests -q
make build              # vite build (web)
make check              # lint + test + build (pre-commit hook)
```

### Production

```bash
make start              # docker compose up (production-like)
make stop               # docker compose down
```

### Adding New Backend Service

1. Create module in `apps/api/app/services/new_service.py`
2. Import and wire into `orchestrator.py` if needed
3. Add `ALGO_VIS_*` config to `config.py` if needed
4. Create `apps/api/tests/test_new_service.py`
5. Update `.env.example` and `README.md` if config added

### Adding New Frontend Component

1. Create `apps/web/src/components/ComponentName.tsx`
2. Import in `App.tsx` or parent component
3. Add any new types to `src/types.ts`
4. Add API methods to `src/api/client.ts` if needed

### Adding New Skill Domain

1. Create `skills/domain-name/SKILL.md`
2. Add reference materials in `skills/generate-subject-manim-prompts/references/domain.md`
3. Register domain in `schemas.py` TopicDomain enum
4. Add domain detection rules in `domain_router.py`

## Testing Patterns

- **Framework**: pytest with `-q` (quiet mode)
- **Location**: `apps/api/tests/test_*.py`
- **Setup**: `conftest.py` sets env vars and clears test DB
- **Test DB**: `.tmp/pipeline_runs_test.db` (isolated)
- **Naming**: `test_<service_name>.py` mirrors service structure
- **Run**: `.venv/bin/pytest apps/api/tests -q`

### Test Configuration

```python
# conftest.py patterns
os.environ["ALGO_VIS_HISTORY_DB_PATH"] = str(TEST_DB_PATH)
os.environ["ALGO_VIS_PREVIEW_RENDER_BACKEND"] = "fallback"
```

## File Co-Change Patterns

Common change bundles:

1. **Backend feature**: `services/*.py` + `schemas.py` + `tests/test_*.py`
2. **Config change**: `config.py` + `.env.example` + `README.md`
3. **Frontend feature**: `App.tsx` + `types.ts` + `client.ts` + `components/*.tsx`
4. **Prompt update**: `prompts/*.py` + `skills/*/references/*.md`
5. **Deployment**: `Dockerfile` + `docker-compose.yml` + `nginx.conf`

## Docker Patterns

- Multi-stage builds in `apps/api/Dockerfile`
- Separate `.venv-manim` for Manim rendering deps
- nginx reverse proxy in `apps/web/nginx.conf`
- Media volume: `data/media` → `/media` URL prefix