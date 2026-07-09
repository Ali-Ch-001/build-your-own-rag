from __future__ import annotations

import re
from dataclasses import dataclass
from uuid import UUID

from neo4j import AsyncDriver, AsyncGraphDatabase

from rag_platform.config import Settings
from rag_platform.db.models import Chunk
from rag_platform.security.auth import AuthContext


@dataclass(frozen=True, slots=True)
class GraphHit:
    chunk_id: UUID
    score: float


_ENTITY_PATTERN = re.compile(
    r"\b(?:[A-Z][A-Za-z0-9&/-]+(?:\s+[A-Z][A-Za-z0-9&/-]+){0,3}|"
    r"[A-Z]{2,8}|[a-z]+(?:-[a-z]+)+)\b"
)


def extract_entities(text: str, limit: int = 40) -> list[str]:
    entities: list[str] = []
    seen: set[str] = set()
    for match in _ENTITY_PATTERN.finditer(text):
        entity = " ".join(match.group(0).split()).strip("-/")
        key = entity.casefold()
        if len(entity) < 3 or key in seen:
            continue
        seen.add(key)
        entities.append(entity[:200])
        if len(entities) >= limit:
            break
    return entities


class GraphStore:
    def __init__(self, settings: Settings) -> None:
        self.driver: AsyncDriver = AsyncGraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_username, settings.neo4j_password),
            connection_timeout=5,
        )

    async def close(self) -> None:
        await self.driver.close()

    async def ensure_schema(self) -> None:
        statements = (
            "CREATE INDEX chunk_tenant_id IF NOT EXISTS FOR (n:Chunk) ON (n.tenant_id, n.chunk_id)",
            "CREATE INDEX entity_tenant_name IF NOT EXISTS FOR (n:Entity) ON (n.tenant_id, n.name)",
            "CREATE INDEX document_tenant_id IF NOT EXISTS "
            "FOR (n:Document) ON (n.tenant_id, n.document_id)",
        )
        async with self.driver.session() as session:
            for statement in statements:
                result = await session.run(statement)
                await result.consume()

    async def index_chunks(self, chunks: list[Chunk]) -> None:
        rows = [
            {
                "tenant_id": str(chunk.tenant_id),
                "corpus_id": str(chunk.corpus_id),
                "document_id": str(chunk.document_id),
                "version_id": str(chunk.version_id),
                "chunk_id": str(chunk.chunk_id),
                "title": chunk.title,
                "section": chunk.heading_path,
                "classification": chunk.classification,
                "acl_groups": chunk.acl_groups,
                "entities": extract_entities(
                    f"{chunk.title}\n{chunk.heading_path or ''}\n{chunk.content}"
                ),
            }
            for chunk in chunks
        ]
        cypher = """
        UNWIND $rows AS row
        MERGE (document:Document {
          tenant_id: row.tenant_id,
          document_id: row.document_id,
          version_id: row.version_id
        })
        SET document.corpus_id = row.corpus_id, document.title = row.title
        MERGE (chunk:Chunk {tenant_id: row.tenant_id, chunk_id: row.chunk_id})
        SET chunk.corpus_id = row.corpus_id,
            chunk.document_id = row.document_id,
            chunk.version_id = row.version_id,
            chunk.section = row.section,
            chunk.classification = row.classification,
            chunk.acl_groups = row.acl_groups
        MERGE (document)-[:CONTAINS]->(chunk)
        WITH row, chunk
        UNWIND row.entities AS entity_name
        MERGE (entity:Entity {tenant_id: row.tenant_id, name: entity_name})
        MERGE (chunk)-[:MENTIONS]->(entity)
        WITH row, collect(entity) AS entities
        FOREACH (left IN entities |
          FOREACH (right IN entities |
            FOREACH (_ IN CASE WHEN left.name < right.name THEN [1] ELSE [] END |
              MERGE (left)-[:RELATED_TO {tenant_id: row.tenant_id}]->(right)
            )
          )
        )
        """
        async with self.driver.session() as session:
            for start in range(0, len(rows), 100):
                result = await session.run(cypher, rows=rows[start : start + 100])
                await result.consume()

    async def search(
        self,
        query: str,
        auth: AuthContext,
        corpus_ids: list[UUID],
        limit: int = 20,
        max_hops: int = 2,
    ) -> list[GraphHit]:
        terms = [item.casefold() for item in re.findall(r"[A-Za-z0-9][A-Za-z0-9_-]{2,}", query)][
            :12
        ]
        if not terms:
            return []
        max_hops = min(max(max_hops, 1), 3)
        cypher = f"""
        MATCH (seed:Entity {{tenant_id: $tenant_id}})
        WHERE any(term IN $terms WHERE toLower(seed.name) CONTAINS term)
        MATCH path=(seed)-[:RELATED_TO*0..{max_hops}]-(related:Entity)
                   <-[:MENTIONS]-(chunk:Chunk)
        WHERE chunk.tenant_id = $tenant_id
          AND chunk.corpus_id IN $corpus_ids
          AND chunk.classification <= $clearance
          AND (size(chunk.acl_groups) = 0 OR
               any(group IN $groups WHERE group IN chunk.acl_groups))
        RETURN chunk.chunk_id AS chunk_id,
               max(1.0 / (length(path) + 1)) + count(*) * 0.01 AS score
        ORDER BY score DESC
        LIMIT $limit
        """
        async with self.driver.session() as session:
            result = await session.run(
                cypher,
                tenant_id=str(auth.tenant_id),
                corpus_ids=[str(value) for value in corpus_ids],
                clearance=auth.clearance,
                groups=list(auth.groups),
                terms=terms,
                limit=limit,
            )
            return [
                GraphHit(chunk_id=UUID(record["chunk_id"]), score=float(record["score"]))
                async for record in result
            ]

    async def delete_document(self, tenant_id: UUID, document_id: UUID) -> None:
        cypher = """
        MATCH (document:Document {tenant_id: $tenant_id, document_id: $document_id})
        OPTIONAL MATCH (document)-[:CONTAINS]->(chunk:Chunk)
        DETACH DELETE chunk, document
        """
        async with self.driver.session() as session:
            result = await session.run(
                cypher, tenant_id=str(tenant_id), document_id=str(document_id)
            )
            await result.consume()
