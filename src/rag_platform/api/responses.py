from __future__ import annotations

from collections.abc import AsyncIterator

import orjson
from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from rag_platform.adapters.cache import CacheStore
from rag_platform.api.dependencies import get_agent_service, get_cache_store
from rag_platform.db.session import get_session
from rag_platform.domain.models import AgentRequest
from rag_platform.security.auth import AuthContext, require_permission
from rag_platform.services.agent import AgentService

router = APIRouter(prefix="/v1/responses", tags=["agents"])


def sse(event_type: str, payload: dict[str, object]) -> bytes:
    event_id = payload.get("event_id", "")
    return b"".join(
        [
            f"id: {event_id}\n".encode(),
            f"event: {event_type}\n".encode(),
            b"data: ",
            orjson.dumps(payload),
            b"\n\n",
        ]
    )


@router.post("")
async def create_response(
    body: AgentRequest,
    request: Request,
    auth: AuthContext = Depends(require_permission("agents:run")),
    session: AsyncSession = Depends(get_session),
    service: AgentService = Depends(get_agent_service),
) -> StreamingResponse:
    from uuid import uuid4

    response_id = uuid4()

    async def stream() -> AsyncIterator[bytes]:
        async for event in service.stream(session, auth, body, response_id):
            if await request.is_disconnected() and body.disconnect_behavior == "cancel":
                await service.cache.cancel_response(response_id)
                return
            yield sse(event["type"], event)

    return StreamingResponse(
        stream(),
        status_code=status.HTTP_200_OK,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Location": f"/v1/responses/{response_id}",
        },
    )


@router.delete("/{response_id}", status_code=status.HTTP_202_ACCEPTED)
async def cancel_response(
    response_id: str,
    _: AuthContext = Depends(require_permission("agents:run")),
    cache: CacheStore = Depends(get_cache_store),
) -> dict[str, str]:
    from uuid import UUID

    parsed = UUID(response_id)
    await cache.cancel_response(parsed)
    return {"response_id": response_id, "status": "cancellation_requested"}
