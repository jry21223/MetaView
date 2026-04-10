# Contributing

This project is a monorepo for MetaView (数智化学科可视化平台), with a FastAPI backend in `apps/api` and a React + Vite frontend in `apps/web`.

## Development environment

### Prerequisites

- Node.js 20+
- npm 10+
- Python 3.11+
- Docker Desktop with Docker Compose v2 for containerized runs
- Optional: system fonts / manim dependencies for real preview rendering

### Initial setup

<!-- AUTO-GENERATED: setup-commands -->
1. Install workspace and backend dependencies:
   ```bash
   make bootstrap
   ```
2. Install manim rendering dependencies when you need real MP4 preview rendering:
   ```bash
   make bootstrap-manim
   ```
3. Enable the repository git hooks:
   ```bash
   make setup-hooks
   ```
4. Create a local env file from the example if needed:
   ```bash
   cp .env.example .env
   ```
<!-- END AUTO-GENERATED: setup-commands -->

## Command reference

<!-- AUTO-GENERATED: commands -->
| Command | Description |
|---|---|
| `make bootstrap` | Install npm dependencies, create `.venv`, and install backend dev dependencies. |
| `make bootstrap-manim` | Create `.venv-manim` and install manim rendering dependencies. |
| `make setup-hooks` | Point git hooks to the repository `.githooks` directory. |
| `make dev-web` | Start the Vite dev server on `0.0.0.0:5173`. |
| `make dev-api` | Start the FastAPI app with `uvicorn` reload on `0.0.0.0:8000`. |
| `make dev` | Start the API and web dev servers together. |
| `make lint` | Run frontend ESLint and backend Ruff checks. |
| `make test` | Run the backend pytest suite. |
| `make build` | Run the frontend TypeScript check and production Vite build. |
| `make check` | Run lint, tests, and frontend build together. |
| `make docker-build` | Build the Docker Compose services after verifying Compose is installed. |
| `make docker-up` | Start the Compose stack with a rebuild. |
| `make docker-down` | Stop the Compose stack. |
| `make start` | Alias for `make docker-up`. |
| `make stop` | Alias for `make docker-down`. |
| `npm run build:web` | Build the frontend workspace from the monorepo root. |
| `npm run lint:web` | Run the frontend workspace lint task from the monorepo root. |
| `npm run setup:git-hooks` | Configure git to use `.githooks` directly. |
| `npm --workspace apps/web run dev` | Run the frontend dev server from the workspace. |
| `npm --workspace apps/web run build` | Run TypeScript checking and build the frontend bundle. |
| `npm --workspace apps/web run lint` | Lint the frontend workspace. |
| `npm --workspace apps/web run preview` | Serve the built frontend locally with Vite preview. |
<!-- END AUTO-GENERATED: commands -->

## Testing

<!-- AUTO-GENERATED: testing -->
- Backend tests:
  ```bash
  make test
  ```
- Run the full local verification set:
  ```bash
  make check
  ```
- Run a single backend test file:
  ```bash
  .venv/bin/pytest apps/api/tests/test_main.py -q
  ```
- Run a single backend test case:
  ```bash
  .venv/bin/pytest apps/api/tests/test_main.py::test_pipeline_mock -q
  ```
- Frontend validation is included in `make lint` and `make build`.
<!-- END AUTO-GENERATED: testing -->

## Code style and quality gates

<!-- AUTO-GENERATED: quality -->
- Frontend linting uses `eslint`.
- Backend linting uses `ruff`.
- Conventional commit messages are enforced by the repo commit hook.
- Pre-commit hooks run frontend lint plus backend Ruff and pytest when `.venv` is available.
<!-- END AUTO-GENERATED: quality -->

## Pull request checklist

- Keep changes focused.
- Run `make check` before opening a PR.
- Update docs or examples when behavior or configuration changes.
- Include test evidence for backend or UI changes.
