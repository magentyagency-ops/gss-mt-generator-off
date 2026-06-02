"""RAG — reranking. NON IMPLÉMENTÉ en itération 1 (interface).

Reranker (Cohere/Voyage) appliqué après le retrieval hybride (brief §9.4).
"""

from __future__ import annotations

from backend.schemas.rag import Chunk


def rerank(query: str, chunks: list[Chunk], *, top_k: int = 5) -> list[Chunk]:
    """Réordonne les chunks par pertinence au regard de la requête."""
    raise NotImplementedError("RAG reranker — itération ultérieure (Module C)")
