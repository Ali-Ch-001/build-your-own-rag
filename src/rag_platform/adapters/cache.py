from __future__ import annotations

import hashlib
import json
from array import array
from dataclasses import dataclass
from uuid import UUID, uuid4

import redis.asyncio as redis
from redis.exceptions import ResponseError

from rag_platform.config import Settings


@dataclass(frozen=True, slots=True)
class SemanticCacheHit:
    payload: str
    similarity: float


class CacheStore:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = redis.from_url(  # type: ignore[no-untyped-call]
            settings.redis_url, decode_responses=False
        )
        self.semantic_index = f"rag_semantic_cache_{settings.qdrant_vector_size}"

    async def ping(self) -> bool:
        return bool(await self.client.ping())

    async def close(self) -> None:
        await self.client.aclose()

    async def ensure_semantic_index(self) -> None:
        try:
            await self.client.execute_command(
                "FT.CREATE",
                self.semantic_index,
                "ON",
                "HASH",
                "PREFIX",
                "1",
                "rag:semantic:",
                "SCHEMA",
                "tenant",
                "TAG",
                "acl",
                "TAG",
                "scope",
                "TAG",
                "query_vector",
                "VECTOR",
                "HNSW",
                "6",
                "TYPE",
                "FLOAT32",
                "DIM",
                str(self.settings.qdrant_vector_size),
                "DISTANCE_METRIC",
                "COSINE",
            )
        except ResponseError as exc:
            if "Index already exists" not in str(exc):
                raise

    async def corpus_epoch(self, tenant_id: UUID, corpus_ids: list[UUID]) -> str:
        keys = [f"rag:epoch:{tenant_id}:{corpus_id}" for corpus_id in sorted(corpus_ids)]
        values = await self.client.mget(keys)
        return ":".join(
            f"{corpus_id}={int(value) if value is not None else 0}"
            for corpus_id, value in zip(sorted(corpus_ids), values, strict=True)
        )

    async def bump_corpus_epoch(self, tenant_id: UUID, corpus_id: UUID) -> int:
        return int(await self.client.incr(f"rag:epoch:{tenant_id}:{corpus_id}"))

    async def get_exact(self, key: str) -> str | None:
        value = await self.client.get(f"rag:exact:{key}")
        return value.decode() if value else None

    async def set_exact(self, key: str, payload: str, *, stable: bool = False) -> None:
        ttl = (
            self.settings.cache_stable_ttl_seconds
            if stable
            else self.settings.cache_volatile_ttl_seconds
        )
        await self.client.set(f"rag:exact:{key}", payload, ex=ttl)

    @staticmethod
    def vector_bytes(vector: list[float]) -> bytes:
        values = array("f", vector)
        if values.itemsize != 4:
            raise RuntimeError("Semantic cache requires 32-bit floats")
        return values.tobytes()

    async def get_semantic(
        self,
        *,
        tenant_id: UUID,
        acl_fingerprint: str,
        scope_hash: str,
        query_vector: list[float],
    ) -> SemanticCacheHit | None:
        query = (
            f"(@tenant:{{{tenant_id}}} @acl:{{{acl_fingerprint}}} "
            f"@scope:{{{scope_hash}}})=>[KNN 1 @query_vector $vector AS distance]"
        )
        try:
            result = await self.client.execute_command(
                "FT.SEARCH",
                self.semantic_index,
                query,
                "PARAMS",
                "2",
                "vector",
                self.vector_bytes(query_vector),
                "SORTBY",
                "distance",
                "RETURN",
                "2",
                "payload",
                "distance",
                "DIALECT",
                "2",
            )
        except ResponseError:
            return None
        if not result or int(result[0]) == 0:
            return None
        fields = result[2]
        decoded = {
            fields[index].decode(): fields[index + 1].decode() for index in range(0, len(fields), 2)
        }
        similarity = 1.0 - float(decoded["distance"])
        if similarity < self.settings.semantic_cache_threshold:
            return None
        return SemanticCacheHit(payload=decoded["payload"], similarity=similarity)

    async def set_semantic(
        self,
        *,
        tenant_id: UUID,
        acl_fingerprint: str,
        scope_hash: str,
        query_vector: list[float],
        payload: str,
        stable: bool = False,
    ) -> None:
        ttl = (
            self.settings.cache_stable_ttl_seconds
            if stable
            else self.settings.cache_volatile_ttl_seconds
        )
        key = f"rag:semantic:{uuid4()}"
        await self.client.hset(
            key,
            mapping={
                "tenant": str(tenant_id),
                "acl": acl_fingerprint,
                "scope": scope_hash,
                "query_vector": self.vector_bytes(query_vector),
                "payload": payload,
            },
        )
        await self.client.expire(key, ttl)

    async def get_embedding(self, model: str, text_hash: str) -> list[float] | None:
        model_hash = hashlib.sha256(model.encode()).hexdigest()[:16]
        value = await self.client.get(f"rag:embedding:{model_hash}:{text_hash}")
        return json.loads(value) if value else None

    async def set_embedding(
        self, model: str, text_hash: str, vector: list[float], ttl: int = 86400
    ) -> None:
        model_hash = hashlib.sha256(model.encode()).hexdigest()[:16]
        await self.client.set(
            f"rag:embedding:{model_hash}:{text_hash}",
            json.dumps(vector, separators=(",", ":")),
            ex=ttl,
        )

    async def cancel_response(self, response_id: UUID, ttl: int = 300) -> None:
        await self.client.set(f"rag:cancel:{response_id}", "1", ex=ttl)

    async def is_cancelled(self, response_id: UUID) -> bool:
        return bool(await self.client.exists(f"rag:cancel:{response_id}"))
