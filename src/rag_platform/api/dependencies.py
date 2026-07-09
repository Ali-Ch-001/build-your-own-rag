from functools import lru_cache

from rag_platform.adapters.cache import CacheStore
from rag_platform.adapters.embeddings import EmbeddingProvider, create_embedding_provider
from rag_platform.adapters.graph_store import GraphStore
from rag_platform.adapters.llm import GenerationProvider, create_generation_provider
from rag_platform.adapters.object_store import ObjectStore
from rag_platform.adapters.vector_store import VectorStore
from rag_platform.adapters.web_search import TavilySearch
from rag_platform.agent.router import SemanticRouter
from rag_platform.config import get_settings
from rag_platform.retrieval.reranker import Reranker, create_reranker
from rag_platform.services.agent import AgentService
from rag_platform.services.documents import DocumentService
from rag_platform.services.retrieval import RetrievalService


@lru_cache
def get_object_store() -> ObjectStore:
    return ObjectStore(get_settings())


@lru_cache
def get_embedding_provider() -> EmbeddingProvider:
    return create_embedding_provider(get_settings())


@lru_cache
def get_vector_store() -> VectorStore:
    return VectorStore(get_settings())


@lru_cache
def get_cache_store() -> CacheStore:
    return CacheStore(get_settings())


@lru_cache
def get_graph_store() -> GraphStore | None:
    settings = get_settings()
    return GraphStore(settings) if settings.neo4j_enabled else None


@lru_cache
def get_reranker() -> Reranker:
    return create_reranker(get_settings())


@lru_cache
def get_generation_provider() -> GenerationProvider:
    return create_generation_provider(get_settings())


@lru_cache
def get_document_service() -> DocumentService:
    return DocumentService(get_settings(), get_object_store())


@lru_cache
def get_retrieval_service() -> RetrievalService:
    return RetrievalService(
        get_settings(),
        get_embedding_provider(),
        get_vector_store(),
        get_cache_store(),
        get_reranker(),
    )


@lru_cache
def get_agent_service() -> AgentService:
    settings = get_settings()
    return AgentService(
        settings,
        SemanticRouter(settings),
        get_retrieval_service(),
        TavilySearch(settings),
        get_generation_provider(),
        get_cache_store(),
        get_graph_store(),
    )
