from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from rag_platform.api.dependencies import (
    get_evaluation_service,
)
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
    corpus_id: Annotated[str, Query(min_length=1)] = "",
    dataset_name: str = "sample-golden",
) -> RunSummary:
    from uuid import UUID

    if not corpus_id:
        raise HTTPException(status_code=400, detail="corpus_id is required")

    return await service.run_evaluation(
        session,
        auth,
        UUID(corpus_id),
        dataset_name,
    )
