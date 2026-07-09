from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from rag_platform.api.dependencies import get_document_service
from rag_platform.db.session import get_session
from rag_platform.domain.models import DocumentListResponse, DocumentResponse, DocumentState
from rag_platform.security.auth import AuthContext, require_permission
from rag_platform.services.documents import DocumentService, UploadTooLargeError

router = APIRouter(prefix="/v1/documents", tags=["documents"])


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    file: Annotated[UploadFile, File(description="PDF document")],
    corpus_id: Annotated[UUID, Form()],
    title: Annotated[str, Form(min_length=1, max_length=1000)],
    document_type: Annotated[str, Form(min_length=1, max_length=100)],
    source_date: Annotated[date | None, Form()] = None,
    auth: AuthContext = Depends(require_permission("documents:write")),
    session: AsyncSession = Depends(get_session),
    service: DocumentService = Depends(get_document_service),
) -> DocumentResponse:
    if file.content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(status_code=415, detail="Only PDF uploads are accepted")
    try:
        return await service.create(
            session,
            auth,
            file.file,
            corpus_id=corpus_id,
            title=title,
            document_type=document_type,
            source_date=source_date,
        )
    except UploadTooLargeError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    corpus_id: UUID | None = None,
    state_filter: DocumentState | None = Query(default=None, alias="state"),
    query: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    auth: AuthContext = Depends(require_permission("documents:read")),
    session: AsyncSession = Depends(get_session),
    service: DocumentService = Depends(get_document_service),
) -> DocumentListResponse:
    return await service.list(
        session,
        auth,
        corpus_id=corpus_id,
        state=state_filter,
        query=query,
        limit=limit,
        offset=offset,
    )


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: UUID,
    auth: AuthContext = Depends(require_permission("documents:read")),
    session: AsyncSession = Depends(get_session),
    service: DocumentService = Depends(get_document_service),
) -> DocumentResponse:
    result = await service.get(session, auth, document_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return result


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: UUID,
    auth: AuthContext = Depends(require_permission("documents:write")),
    session: AsyncSession = Depends(get_session),
    service: DocumentService = Depends(get_document_service),
) -> None:
    if not await service.delete(session, auth, document_id):
        raise HTTPException(status_code=404, detail="Document not found")
