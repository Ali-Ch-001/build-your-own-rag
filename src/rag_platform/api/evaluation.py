from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from rag_platform.api.dependencies import (
    get_evaluation_service,
)
from rag_platform.config import get_settings
from rag_platform.db.session import get_session
from rag_platform.evaluation.service import EvaluationService, RunSummary
from rag_platform.security.auth import AuthContext, require_permission

router = APIRouter(prefix="/v1/evaluation", tags=["evaluation"])


@router.get("/results", response_model=RunSummary)
async def get_evaluation_results(
    auth: AuthContext = Depends(require_permission("documents:read")),
    session: AsyncSession = Depends(get_session),
    service: EvaluationService = Depends(get_evaluation_service),
) -> RunSummary:
    result = await service.get_latest_results(session, auth)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No evaluation results found. Run an evaluation first.",
        )
    return result


@router.post("/run", response_model=RunSummary)
async def run_evaluation(
    auth: AuthContext = Depends(require_permission("documents:write")),
    session: AsyncSession = Depends(get_session),
    service: EvaluationService = Depends(get_evaluation_service),
    corpus_id: str | None = None,
    dataset_name: str = "sample-golden",
) -> RunSummary:
    from uuid import UUID

    if corpus_id is None:
        settings = get_settings()
        corpus_id = str(settings.dev_tenant_id)

    return await service.run_evaluation(
        session,
        auth,
        UUID(corpus_id),
        dataset_name,
    )
