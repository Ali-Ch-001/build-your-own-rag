#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  printf 'Docker is required. Install Docker Desktop or Docker Engine first.\n' >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  printf 'The Docker daemon is not running. Start Docker and retry.\n' >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  printf 'Created .env from the safe local example.\n'
fi

docker compose up -d --build

for _ in {1..90}; do
  if curl -fsS http://localhost:8000/health/ready >/dev/null 2>&1 \
    && curl -fsS http://localhost:3000 >/dev/null 2>&1; then
    printf '\nAtlas RAG is ready.\n'
    printf 'Frontend: http://localhost:3000\n'
    printf 'API docs: http://localhost:8000/docs\n'
    printf 'MinIO:    http://localhost:9001\n'
    exit 0
  fi
  sleep 2
done

printf 'The stack did not become ready before the timeout.\n' >&2
docker compose ps
docker compose logs api ingestion-worker deletion-worker
exit 1
