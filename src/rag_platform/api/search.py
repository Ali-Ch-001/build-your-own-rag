from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from rag_platform.api.dependencies import get_retrieval_service
from rag_platform.db.session import get_session
from rag_platform.domain.models import SearchRequest, SearchResponse
from rag_platform.security.auth import AuthContext, require_permission
from rag_platform.security.guardrails import GuardrailViolation, inspect_input
from rag_platform.services.retrieval import RetrievalService

router = APIRouter(prefix="/v1/search", tags=["retrieval"])


@router.post("", response_model=SearchResponse)
async def search(
    request: SearchRequest,
    auth: AuthContext = Depends(require_permission("documents:read")),
    session: AsyncSession = Depends(get_session),
    service: RetrievalService = Depends(get_retrieval_service),
) -> SearchResponse:
    try:
        inspected = inspect_input(request.query, reject_injection=True)
    except GuardrailViolation as exc:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return await service.search(session, auth, request.model_copy(update={"query": inspected.text}))
