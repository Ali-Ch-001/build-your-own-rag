.PHONY: install format lint test migrate api worker compose-up compose-down quickstart status smoke down clean-local

install:
	uv sync

format:
	uv run ruff format .
	uv run ruff check --fix .

lint:
	uv run ruff check .
	uv run ruff format --check .
	uv run mypy src

test:
	uv run pytest --cov=rag_platform --cov-report=term-missing

migrate:
	uv run alembic upgrade head

api:
	uv run uvicorn rag_platform.api.app:app --reload

worker:
	uv run python -m rag_platform.workers.ingestion

compose-up:
	docker compose up -d postgres redis minio qdrant kafka

compose-down:
	docker compose down

quickstart:
	./scripts/quickstart.sh

status:
	docker compose ps

smoke:
	curl -fsS http://localhost:8000/health/live
	curl -fsS http://localhost:8000/health/ready
	curl -fsS http://localhost:3000 >/dev/null

down:
	docker compose down

clean-local:
	docker compose down --volumes --remove-orphans
