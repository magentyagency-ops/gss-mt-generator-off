"""Schéma des chunks RAG (base de connaissances SLIDE REP AO).

CONTRAT CRITIQUE (cf. DECISIONS.md D2/D3) : ce schéma est strictement identique
entre le fallback JSONL (dry-run local) et le backend pgvector. Le passage de
l'un à l'autre ne doit demander AUCUN refactor côté code appelant — seulement un
swap d'implémentation dans `backend/rag/vector_store.py`.

Mapping vers la table pgvector (voir backend/db/models.py) :
    chunk_id          -> PK (text)
    embedding         -> vector(EMBEDDING_DIM)   (None tant que provider=none)
    text              -> text
    <champs metadata> -> colonnes dédiées + JSONB pour l'extensible
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class ChunkMetadata(BaseModel):
    """Métadonnées indexables d'un chunk. Le filtrage par section du mémoire
    (brief §7) s'appuie sur `categorie`."""

    categorie: str = Field(
        description="Une des 21 catégories thématiques SLIDE REP AO (nom du dossier)"
    )
    source_file: str = Field(description="Nom du PDF source")
    source_path: str = Field(description="Chemin relatif depuis la racine SLIDE REP AO")
    page: int | None = Field(default=None, description="Page du PDF (1-indexé)")
    chunk_index: int = Field(description="Index du chunk dans le document source")
    keywords: list[str] = Field(
        default_factory=list, description="Mots-clés extraits (optionnel)"
    )


class Chunk(BaseModel):
    """Unité indexée dans le vector store. Structure IDENTIQUE JSONL <-> pgvector."""

    chunk_id: str = Field(
        description="Identifiant stable et déterministe (hash source_path + chunk_index)"
    )
    text: str
    metadata: ChunkMetadata
    embedding: list[float] | None = Field(
        default=None,
        description="Vecteur de dimension EMBEDDING_DIM ; None en mode dry-run "
        "(provider=none). Sa présence/absence ne change pas le schéma de stockage.",
    )

    def embedding_dim(self) -> int | None:
        return len(self.embedding) if self.embedding is not None else None
