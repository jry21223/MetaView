SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

.PHONY: bootstrap bootstrap-manim setup-hooks dev-web dev-api dev start stop lint test test-coverage build check docker-build docker-up docker-down

DOCKER_COMPOSE_CMD := $(shell sh -lc 'if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then printf "%s" "docker compose"; elif command -v docker-compose >/dev/null 2>&1; then printf "%s" "docker-compose"; fi')

bootstrap:
	npm install
	python3 -m venv .venv
	.venv/bin/pip install -r apps/api/requirements-dev.txt

bootstrap-manim:
	python3 -m venv .venv-manim
	.venv-manim/bin/pip install -r apps/api/requirements-manim.txt

setup-hooks:
	git config core.hooksPath .githooks

dev-web:
	npm --workspace apps/web run dev -- --host 0.0.0.0 --port 5173

dev-api:
	.venv/bin/uvicorn app.main:app --app-dir apps/api --reload --host 0.0.0.0 --port 8000

dev:
	@trap 'kill 0' INT TERM EXIT; $(MAKE) dev-api & $(MAKE) dev-web & wait

lint:
	npm --workspace apps/web run lint
	.venv/bin/ruff check apps/api/app apps/api/tests

test:
	.venv/bin/pytest apps/api/tests -q
	npm --workspace apps/web run test

# Issue #66 — coverage reporting + per-side thresholds. Kept off the
# default ``check`` target so CI fast path stays fast; opt in via
# ``make test-coverage`` locally or in a dedicated CI job.
# Issue #73 — backend currently sits at ~82% line coverage; the floor is
# 75% so any meaningful regression trips the gate but flake-level noise
# (a tiny PR touching a low-coverage path) doesn't.
test-coverage:
	.venv/bin/pytest apps/api/tests \
		--cov=apps/api/app \
		--cov-report=term-missing \
		--cov-report=html:coverage/api \
		--cov-fail-under=75
	npm --workspace apps/web run test:coverage

build:
	npm --workspace apps/web run build

check: lint test build

docker-check:
	@if [ -z "$(DOCKER_COMPOSE_CMD)" ]; then \
		echo "Docker Compose 未安装。请安装 Docker Compose v2（docker compose）或 docker-compose。"; \
		exit 127; \
	fi

docker-build: docker-check
	$(DOCKER_COMPOSE_CMD) build

docker-up: docker-check
	$(DOCKER_COMPOSE_CMD) up --build

docker-down: docker-check
	$(DOCKER_COMPOSE_CMD) down

start: docker-up

stop: docker-down
