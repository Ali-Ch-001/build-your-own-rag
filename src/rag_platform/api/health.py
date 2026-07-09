from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from rag_platform.adapters.cache import CacheStore
from rag_platform.api.dependencies import get_cache_store
from rag_platform.db.models import Chunk, Document, DocumentVersion
from rag_platform.db.session import get_session
from rag_platform.db.tenant import set_tenant_context
from rag_platform.security.auth import AuthContext, require_permission

router = APIRouter(tags=["health"])


@router.get("/health/live")
async def live() -> dict[str, str]:
    return {"status": "ok", "time": datetime.now(UTC).isoformat()}


@router.get("/health/ready")
async def ready(
    session: AsyncSession = Depends(get_session),
    cache: CacheStore = Depends(get_cache_store),
) -> dict[str, object]:
    checks: dict[str, bool] = {}
    try:
        await session.execute(text("SELECT 1"))
        checks["postgres"] = True
    except Exception:
        checks["postgres"] = False
    try:
        checks["redis"] = await cache.ping()
    except Exception:
        checks["redis"] = False
    if not all(checks.values()):
        raise HTTPException(status_code=503, detail={"status": "not_ready", "checks": checks})
    return {"status": "ready", "checks": checks}


@router.get("/metrics/summary")
async def metrics_summary(
    auth: AuthContext = Depends(require_permission("documents:read")),
    session: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    await set_tenant_context(session, auth.tenant_id)
    documents = await session.scalar(
        select(func.count())
        .select_from(Document)
        .where(Document.tenant_id == auth.tenant_id, Document.deleted_at.is_(None))
    )
    chunks = await session.scalar(
        select(func.count())
        .select_from(Chunk)
        .where(Chunk.tenant_id == auth.tenant_id, Chunk.deleted_at.is_(None))
    )
    state_rows = (
        await session.execute(
            select(DocumentVersion.state, func.count())
            .where(DocumentVersion.tenant_id == auth.tenant_id)
            .group_by(DocumentVersion.state)
        )
    ).all()
    states: dict[str, int] = {state: int(count) for state, count in state_rows}
    return {
        "documents": documents or 0,
        "chunks": chunks or 0,
        "document_states": states,
        "retrieval_p95_ms": None,
        "cache_hit_rate": None,
        "ingestion_docs_per_minute": None,
        "generated_at": datetime.now(UTC).isoformat(),
    }
