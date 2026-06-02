"""RAG — interface d'embeddings + implémentations.

En itération 1, le provider par défaut est `none` (dry-run) : le chunking et les
métadonnées sont produits SANS calculer d'embeddings (pas de clé API requise,
cf. DECISIONS.md D3). Les providers réels (Voyage / OpenAI / bge local) seront
branchés derrière la même interface `Embedder` — sans changer le code appelant.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from backend.core.config import EmbeddingProvider, Settings, get_settings


class Embedder(ABC):
    """Interface d'embeddings. `dim` est la dimension des vecteurs produits."""

    dim: int

    @abstractmethod
    def embed(self, texts: list[str]) -> list[list[float] | None]:
        """Retourne un vecteur par texte (ou None si calcul différé)."""
        ...


class NullEmbedder(Embedder):
    """Mode dry-run : ne calcule rien, renvoie None pour chaque texte.

    La dimension reste connue (config) pour rester iso-schéma avec pgvector :
    on pourra recalculer les embeddings plus tard sans toucher au stockage.
    """

    def __init__(self, dim: int) -> None:
        self.dim = dim

    def embed(self, texts: list[str]) -> list[list[float] | None]:
        return [None] * len(texts)


def get_embedder(settings: Settings | None = None) -> Embedder:
    """Fabrique l'Embedder selon la config.

    Itération 1 : seul `none` est implémenté. Les autres providers lèvent
    NotImplementedError explicite (à brancher au Module C).
    """
    settings = settings or get_settings()
    provider = settings.embedding_provider
    if provider is EmbeddingProvider.NONE:
        return NullEmbedder(dim=settings.embedding_dim)
    raise NotImplementedError(
        f"Provider d'embeddings '{provider.value}' non implémenté en itération 1 "
        "(seul 'none'/dry-run est disponible). À brancher au Module C."
    )
