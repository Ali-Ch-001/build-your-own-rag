from __future__ import annotations

import re
from collections.abc import Callable

from rag_platform.retrieval.reranker import RerankCandidate, terms


def _similarity(left: str, right: str) -> float:
    left_terms = terms(left)
    right_terms = terms(right)
    if not left_terms or not right_terms:
        return 0.0
    return len(left_terms & right_terms) / len(left_terms | right_terms)


def select_mmr(
    candidates: list[RerankCandidate],
    limit: int,
    lambda_value: float,
    document_id: Callable[[RerankCandidate], str],
) -> list[RerankCandidate]:
    remaining = list(candidates)
    selected: list[RerankCandidate] = []
    document_counts: dict[str, int] = {}
    while remaining and len(selected) < limit:
        best: RerankCandidate | None = None
        best_score = float("-inf")
        for candidate in remaining:
            doc_id = document_id(candidate)
            if document_counts.get(doc_id, 0) >= 2:
                continue
            redundancy = max(
                (_similarity(candidate.content, item.content) for item in selected), default=0.0
            )
            score = lambda_value * candidate.reranker_score - (1 - lambda_value) * redundancy
            if score > best_score:
                best = candidate
                best_score = score
        if best is None:
            break
        selected.append(best)
        remaining.remove(best)
        doc_id = document_id(best)
        document_counts[doc_id] = document_counts.get(doc_id, 0) + 1
    return selected


def extractive_compress(query: str, content: str, token_count: int) -> str:
    if token_count <= 300:
        return content
    sentences = [item.strip() for item in re.split(r"(?<=[.!?])\s+", content) if item.strip()]
    if len(sentences) <= 3:
        return content
    query_terms = terms(query)
    ranked = sorted(
        enumerate(sentences),
        key=lambda item: len(query_terms & terms(item[1])) / max(1, len(query_terms)),
        reverse=True,
    )
    selected_indexes = sorted(index for index, _ in ranked[: max(3, len(sentences) // 2)])
    compressed = " ".join(sentences[index] for index in selected_indexes)
    return compressed if len(compressed) < len(content) else content
