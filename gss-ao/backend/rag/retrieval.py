"""RAG — récupération (retrieval). NON IMPLÉMENTÉ en itération 1 (interface).

Retrieval hybride prévu (BM25 + vecteur) avec filtrage par catégorie selon le
mapping section->catégories du brief §7.
"""

from __future__ import annotations

from backend.schemas.rag import Chunk


def retrieve(
    query: str,
    *,
    categories: list[str] | None = None,
    top_k: int = 5,
) -> list[Chunk]:
    """Retourne les top_k chunks pertinents, filtrés optionnellement par catégorie."""
    raise NotImplementedError("RAG retrieval — itération ultérieure (Module C)")
