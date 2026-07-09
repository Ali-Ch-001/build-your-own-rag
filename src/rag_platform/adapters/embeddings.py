from __future__ import annotations

import hashlib
import math
import random
from abc import ABC, abstractmethod

from openai import AsyncOpenAI

from rag_platform.config import Settings


class EmbeddingProvider(ABC):
    dimension: int
    model_name: str

    @abstractmethod
    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError

    async def embed_query(self, text: str) -> list[float]:
        return (await self.embed_documents([text]))[0]


class DeterministicEmbeddingProvider(EmbeddingProvider):
    """Stable local embeddings for integration tests, not semantic production search."""

    def __init__(self, dimension: int) -> None:
        self.dimension = dimension
        self.model_name = f"deterministic-sha256-{dimension}"

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for text in texts:
            seed = int.from_bytes(hashlib.sha256(text.encode()).digest()[:8], "big")
            generator = random.Random(seed)  # noqa: S311 - deterministic test vector, not cryptography
            vector = [generator.uniform(-1, 1) for _ in range(self.dimension)]
            norm = math.sqrt(sum(value * value for value in vector)) or 1.0
            vectors.append([value / norm for value in vector])
        return vectors


class OpenAIEmbeddingProvider(EmbeddingProvider):
    def __init__(self, settings: Settings) -> None:
        self.dimension = settings.qdrant_vector_size
        self.model_name = settings.openai_embedding_model
        self.client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
            timeout=settings.openai_timeout_seconds,
            max_retries=2,
        )

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        response = await self.client.embeddings.create(
            model=self.model_name,
            input=texts,
            dimensions=self.dimension,
            encoding_format="float",
        )
        return [item.embedding for item in sorted(response.data, key=lambda item: item.index)]


def create_embedding_provider(settings: Settings) -> EmbeddingProvider:
    if settings.model_provider == "openai":
        return OpenAIEmbeddingProvider(settings)
    return DeterministicEmbeddingProvider(settings.qdrant_vector_size)
