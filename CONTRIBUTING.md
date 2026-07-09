# Contributing

Contributions that improve correctness, security, portability, evaluation quality, and operational clarity are welcome.

## Development

1. Open an issue for substantial architecture or contract changes.
2. Keep changes focused and backward compatible unless a migration is included.
3. Run backend and frontend quality gates before opening a pull request.
4. Add tests for behavior changes and tenant-isolation invariants.
5. Update architecture decisions and deployment examples when contracts change.

```bash
uv sync
uv run ruff format .
uv run ruff check .
uv run mypy src
uv run pytest

npm --prefix frontend ci
npm --prefix frontend run lint
npm --prefix frontend run test
npm --prefix frontend run build
```

Never include real customer documents, credentials, production endpoints, Terraform state, or copied proprietary evaluation data in a contribution.
