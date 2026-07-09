.PHONY: install format lint test migrate api worker compose-up compose-down

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
