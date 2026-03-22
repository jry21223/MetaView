.SHELLFLAGS := -eu -o pipefail -c

.PHONY: bootstrap bootstrap-manim setup-hooks dev-web dev-api dev start stop lint test build check docker-build docker-up docker-down

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
