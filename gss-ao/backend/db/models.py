"""Modèles SQLAlchemy — squelette (itération 1).

La table `rag_chunk` est alignée 1:1 sur `backend.schemas.rag.Chunk` afin de
garantir le passage sans refactor du fallback JSONL vers pgvector (DECISIONS.md
D2). La colonne `embedding` est de dimension `EMBEDDING_DIM` (config).

NB : `Vector` (pgvector.sqlalchemy) n'est importé que si la dépendance est
présente ; le squelette reste importable sans base.
"""

from __future__ import annotations

from backend.core.config import get_settings

try:
    from pgvector.sqlalchemy import Vector
    from sqlalchemy import JSON, Integer, String, Text
    from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

    _SQLALCHEMY_AVAILABLE = True
except ImportError:  # dépendances non installées (venv pas encore prêt)
    _SQLALCHEMY_AVAILABLE = False


if _SQLALCHEMY_AVAILABLE:
    _EMBEDDING_DIM = get_settings().embedding_dim

    class Base(DeclarativeBase):
        pass

    class RagChunk(Base):
        """Table d'indexation RAG (SLIDE REP AO). Voir schemas/rag.py."""

        __tablename__ = "rag_chunk"

        chunk_id: Mapped[str] = mapped_column(String, primary_key=True)
        text: Mapped[str] = mapped_column(Text, nullable=False)

        # --- métadonnées (colonnes dédiées = filtrables) ---
        categorie: Mapped[str] = mapped_column(String, index=True, nullable=False)
        source_file: Mapped[str] = mapped_column(String, nullable=False)
        source_path: Mapped[str] = mapped_column(String, nullable=False)
        page: Mapped[int | None] = mapped_column(Integer, nullable=True)
        chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)

        # extensible (keywords + futurs champs) sans migration
        extra: Mapped[dict] = mapped_column(JSON, default=dict)

        # None tant que provider d'embeddings = none (dry-run)
        embedding: Mapped[list[float] | None] = mapped_column(
            Vector(_EMBEDDING_DIM), nullable=True
        )
