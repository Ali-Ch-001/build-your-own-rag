from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from uuid import UUID

from qdrant_client import AsyncQdrantClient, models
from qdrant_client.http.exceptions import UnexpectedResponse

from rag_platform.config import Settings
from rag_platform.db.models import Chunk
from rag_platform.security.auth import AuthContext


@dataclass(frozen=True, slots=True)
class DenseHit:
    chunk_id: UUID
    score: float


@dataclass(frozen=True, slots=True)
class VectorStats:
    points_count: int
    indexed_vectors_count: int
    estimated_size_gb: float


class VectorStore:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = AsyncQdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key)
        self.collection = settings.qdrant_collection

    async def ensure_collection(self) -> None:
        if not await self.client.collection_exists(self.collection):
            try:
                await self.client.create_collection(
                    collection_name=self.collection,
                    vectors_config=models.VectorParams(
                        size=self.settings.qdrant_vector_size,
                        distance=models.Distance.COSINE,
                        on_disk=True,
                    ),
                    hnsw_config=models.HnswConfigDiff(m=16, ef_construct=128),
                    replication_factor=self.settings.qdrant_replication_factor,
                    shard_number=1 if self.settings.environment == "local" else 32,
                )
            except UnexpectedResponse as exc:
                if exc.status_code != 409:
                    raise
        for field, schema in (
            ("tenant_id", models.PayloadSchemaType.KEYWORD),
            ("corpus_id", models.PayloadSchemaType.KEYWORD),
            ("document_id", models.PayloadSchemaType.KEYWORD),
            ("version_id", models.PayloadSchemaType.KEYWORD),
            ("document_type", models.PayloadSchemaType.KEYWORD),
            ("language", models.PayloadSchemaType.KEYWORD),
            ("source_date", models.PayloadSchemaType.DATETIME),
            ("classification", models.PayloadSchemaType.INTEGER),
            ("deleted", models.PayloadSchemaType.BOOL),
            ("acl_groups", models.PayloadSchemaType.KEYWORD),
        ):
            await self.client.create_payload_index(
                collection_name=self.collection,
                field_name=field,
                field_schema=schema,
                wait=True,
            )

    async def upsert_chunks(self, chunks: list[Chunk], vectors: list[list[float]]) -> None:
        points = [
            models.PointStruct(
                id=str(chunk.chunk_id),
                vector=vector,
                payload={
                    "tenant_id": str(chunk.tenant_id),
                    "corpus_id": str(chunk.corpus_id),
                    "document_id": str(chunk.document_id),
                    "version_id": str(chunk.version_id),
                    "document_type": chunk.document_type,
                    "language": chunk.language,
                    "source_date": chunk.source_date.isoformat() if chunk.source_date else None,
                    "classification": chunk.classification,
                    "acl_groups": chunk.acl_groups,
                    "deleted": False,
                },
            )
            for chunk, vector in zip(chunks, vectors, strict=True)
        ]
        for start in range(0, len(points), 256):
            await self.client.upsert(
                collection_name=self.collection,
                points=points[start : start + 256],
                wait=True,
            )

    def _filter(
        self,
        auth: AuthContext,
        corpus_ids: list[UUID],
        document_types: list[str],
        date_from: date | None,
        date_to: date | None,
    ) -> models.Filter:
        must: list[models.Condition] = [
            models.FieldCondition(
                key="tenant_id", match=models.MatchValue(value=str(auth.tenant_id))
            ),
            models.FieldCondition(
                key="corpus_id", match=models.MatchAny(any=[str(value) for value in corpus_ids])
            ),
            models.FieldCondition(key="deleted", match=models.MatchValue(value=False)),
            models.FieldCondition(
                key="classification", range=models.Range(lte=float(auth.clearance))
            ),
        ]
        if document_types:
            must.append(
                models.FieldCondition(
                    key="document_type", match=models.MatchAny(any=document_types)
                )
            )
        if date_from or date_to:
            must.append(
                models.FieldCondition(
                    key="source_date",
                    range=models.DatetimeRange(
                        gte=f"{date_from.isoformat()}T00:00:00Z" if date_from else None,
                        lte=f"{date_to.isoformat()}T23:59:59Z" if date_to else None,
                    ),
                )
            )
        should: list[models.Condition] | None = None
        if auth.groups:
            should = [
                models.IsEmptyCondition(is_empty=models.PayloadField(key="acl_groups")),
                models.FieldCondition(
                    key="acl_groups", match=models.MatchAny(any=list(auth.groups))
                ),
            ]
        return models.Filter(
            must=must,
            min_should=(models.MinShould(conditions=should, min_count=1) if should else None),
        )

    async def search(
        self,
        vector: list[float],
        auth: AuthContext,
        corpus_ids: list[UUID],
        document_types: list[str],
        date_from: date | None,
        date_to: date | None,
        limit: int,
    ) -> list[DenseHit]:
        response = await self.client.query_points(
            collection_name=self.collection,
            query=vector,
            query_filter=self._filter(auth, corpus_ids, document_types, date_from, date_to),
            search_params=models.SearchParams(hnsw_ef=128, exact=False),
            limit=limit,
            with_payload=False,
            with_vectors=False,
        )
        return [
            DenseHit(chunk_id=UUID(str(point.id)), score=point.score) for point in response.points
        ]

    async def delete_version(self, tenant_id: UUID, version_id: UUID) -> None:
        await self.client.delete(
            collection_name=self.collection,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="tenant_id", match=models.MatchValue(value=str(tenant_id))
                        ),
                        models.FieldCondition(
                            key="version_id", match=models.MatchValue(value=str(version_id))
                        ),
                    ]
                )
            ),
            wait=True,
        )

    async def stats(self) -> VectorStats:
        info = await self.client.get_collection(self.collection)
        points = int(info.points_count or 0)
        indexed = int(info.indexed_vectors_count or 0)
        raw_bytes = points * self.settings.qdrant_vector_size * 4
        estimated_bytes = raw_bytes * 1.8 * self.settings.qdrant_replication_factor
        return VectorStats(
            points_count=points,
            indexed_vectors_count=indexed,
            estimated_size_gb=round(estimated_bytes / (1024**3), 3),
        )
