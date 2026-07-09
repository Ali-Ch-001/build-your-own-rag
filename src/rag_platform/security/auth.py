from __future__ import annotations

import asyncio
from dataclasses import dataclass
from time import monotonic
from typing import Any
from uuid import UUID

import httpx
import jwt
from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from rag_platform.config import Settings, get_settings

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True, slots=True)
class AuthContext:
    tenant_id: UUID
    subject_id: str
    groups: tuple[str, ...]
    permissions: frozenset[str]
    clearance: int


class JwksCache:
    def __init__(self) -> None:
        self._keys: dict[str, Any] = {}
        self._expires_at = 0.0
        self._lock = asyncio.Lock()

    async def get_key(self, domain: str, kid: str) -> Any:
        if monotonic() >= self._expires_at or kid not in self._keys:
            await self._refresh(domain)
        key = self._keys.get(kid)
        if key is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown signing key"
            )
        return key

    async def _refresh(self, domain: str) -> None:
        async with self._lock:
            if monotonic() < self._expires_at and self._keys:
                return
            normalized = domain.removeprefix("https://").rstrip("/")
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"https://{normalized}/.well-known/jwks.json")
                response.raise_for_status()
            jwks = response.json()
            self._keys = {
                item["kid"]: jwt.PyJWK.from_dict(item).key
                for item in jwks.get("keys", [])
                if item.get("kid")
            }
            self._expires_at = monotonic() + 3600


jwks_cache = JwksCache()


def _claim_list(claims: dict[str, Any], *names: str) -> tuple[str, ...]:
    for name in names:
        value = claims.get(name)
        if isinstance(value, list):
            return tuple(str(item) for item in value)
        if isinstance(value, str):
            return tuple(item for item in value.split() if item)
    return ()


async def get_auth_context(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    x_tenant_id: str | None = Header(default=None),
    x_subject_id: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> AuthContext:
    if settings.auth_disabled:
        if settings.environment not in {"local", "test"}:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Unsafe authentication configuration",
            )
        tenant_id = UUID(x_tenant_id) if x_tenant_id else settings.dev_tenant_id
        return AuthContext(
            tenant_id=tenant_id,
            subject_id=x_subject_id or settings.dev_subject_id,
            groups=("local-developers",),
            permissions=frozenset({"documents:read", "documents:write", "agents:run"}),
            clearance=100,
        )

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token required"
        )

    try:
        header = jwt.get_unverified_header(credentials.credentials)
        key = await jwks_cache.get_key(settings.auth0_domain, header["kid"])
        issuer = f"https://{settings.auth0_domain.removeprefix('https://').rstrip('/')}/"
        claims = jwt.decode(
            credentials.credentials,
            key=key,
            algorithms=[item.strip() for item in settings.auth0_algorithms.split(",")],
            audience=settings.auth0_audience,
            issuer=issuer,
            options={"require": ["exp", "iat", "iss", "sub"]},
        )
        tenant_value = claims.get("https://atlas-rag.example.com/tenant_id") or claims.get(
            "tenant_id"
        )
        if not tenant_value:
            raise ValueError("tenant_id claim is required")
        return AuthContext(
            tenant_id=UUID(str(tenant_value)),
            subject_id=str(claims["sub"]),
            groups=_claim_list(claims, "https://atlas-rag.example.com/groups", "groups"),
            permissions=frozenset(_claim_list(claims, "permissions", "scope")),
            clearance=int(claims.get("clearance", 0)),
        )
    except (jwt.PyJWTError, KeyError, TypeError, ValueError, httpx.HTTPError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token",
        ) from exc


def require_permission(permission: str):  # type: ignore[no-untyped-def]
    async def dependency(auth: AuthContext = Depends(get_auth_context)) -> AuthContext:
        if permission not in auth.permissions:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
        return auth

    return dependency
