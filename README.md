# Hyperscale RAG Platform

## Current Delivery Target

The first runnable slice provides:

- Auth0-compatible tenant authentication with a local development mode.
- Quarantined PDF upload to S3/MinIO and durable PostgreSQL metadata.
- Kafka-driven, idempotent extraction, semantic chunking, SHA-256 deduplication, offline embedding, and Qdrant indexing.
- PostgreSQL full-text plus filtered Qdrant dense retrieval, RRF, CPU reranking adapter, MMR, extractive compression, caching, and citations.
- A bounded router for internal RAG, Tavily web search, and calculator tools.
- OpenAI-compatible generation and SSE response streaming.
- Docker Compose for local development, Helm for Kubernetes, and an AWS Terraform foundation.

## Local Quick Start

1. Install Python 3.12 through uv: `uv python install 3.12`.
2. Create local settings: `cp .env.example .env`.
3. Start dependencies: `docker compose up -d postgres redis minio qdrant kafka`.
4. Install dependencies: `uv sync`.
5. Apply migrations: `uv run alembic upgrade head`.
6. Start the API: `uv run uvicorn rag_platform.api.app:app --reload`.
7. Start the ingestion worker: `uv run python -m rag_platform.workers.ingestion`.

OpenAPI is available at `http://localhost:8000/docs`. Local development authentication uses the tenant and subject IDs configured in `.env`; production disables this mode and validates Auth0 JWTs.

See [`docs/SETUP.md`](docs/SETUP.md) for credentials, AWS prerequisites, and deployment steps.
