.PHONY: bootstrap setup-hooks dev-web dev-api lint test build check

bootstrap:
	npm install
	python3 -m venv .venv
	.venv/bin/pip install -r apps/api/requirements-dev.txt

setup-hooks:
	git config core.hooksPath .githooks

dev-web:
	npm --workspace apps/web run dev -- --host 0.0.0.0 --port 5173

dev-api:
	.venv/bin/uvicorn app.main:app --app-dir apps/api --reload --host 0.0.0.0 --port 8000

lint:
	npm --workspace apps/web run lint
	.venv/bin/ruff check apps/api/app apps/api/tests

test:
	.venv/bin/pytest apps/api/tests -q

build:
	npm --workspace apps/web run build

check: lint test build

