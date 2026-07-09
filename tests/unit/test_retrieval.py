from uuid import UUID

from rag_platform.adapters.embeddings import DeterministicEmbeddingProvider
from rag_platform.adapters.vector_store import DenseHit
from rag_platform.config import Settings
from rag_platform.services.retrieval import RetrievalService, SparseHit


def test_rrf_combines_sparse_and_dense_without_raw_score_mixing() -> None:
    service = object.__new__(RetrievalService)
    service.settings = Settings(rrf_k=60, fusion_candidates=20)
    first = UUID("00000000-0000-0000-0000-000000000001")
    second = UUID("00000000-0000-0000-0000-000000000002")
    fused = service._rrf(
        [SparseHit(first, 100), SparseHit(second, 1)],
        [DenseHit(second, 0.99), DenseHit(first, 0.5)],
    )
    assert {item[0] for item in fused} == {first, second}
    assert fused[0][1] == fused[1][1]


async def test_deterministic_embeddings_are_stable_and_normalized() -> None:
    provider = DeterministicEmbeddingProvider(16)
    first, second = await provider.embed_documents(["same", "same"])
    assert first == second
    assert abs(sum(value * value for value in first) - 1.0) < 1e-6
