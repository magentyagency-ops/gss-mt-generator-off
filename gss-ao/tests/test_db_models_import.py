"""Garde-fou : vérifie que le try/except d'import dans backend.db.models n'est
pas un cache-misère silencieux.

- Si SQLAlchemy + pgvector sont absents : on SKIP explicitement (état attendu
  tant que le venv n'est pas installé) — pas de faux positif.
- S'ils sont présents : le modèle ORM DOIT s'être déclaré (table `rag_chunk`
  avec sa colonne vectorielle), sinon le try/except masquerait un vrai bug.
"""

import importlib.util

import pytest

_HAS_SQLALCHEMY = importlib.util.find_spec("sqlalchemy") is not None
_HAS_PGVECTOR = importlib.util.find_spec("pgvector") is not None


@pytest.mark.skipif(
    not (_HAS_SQLALCHEMY and _HAS_PGVECTOR),
    reason="SQLAlchemy/pgvector non installés (venv absent) — modèle ORM non testable",
)
def test_rag_chunk_table_is_declared():
    from backend.core.config import get_settings
    from backend.db import models

    # Le flag interne doit refléter la présence réelle des dépendances.
    assert models._SQLALCHEMY_AVAILABLE is True

    # La classe ORM doit exister et déclarer la table attendue.
    assert hasattr(models, "RagChunk"), "RagChunk non déclaré malgré deps présentes"
    assert models.RagChunk.__tablename__ == "rag_chunk"

    cols = models.RagChunk.__table__.columns
    assert "chunk_id" in cols and cols["chunk_id"].primary_key
    assert "embedding" in cols  # colonne vectorielle

    # Dimension du vecteur alignée sur la config (DECISIONS.md D2/D3).
    assert cols["embedding"].type.dim == get_settings().embedding_dim


def test_db_models_importable_without_deps():
    """Le module doit s'importer même sans SQLAlchemy (skeleton tolérant)."""
    from backend.db import models

    if not (_HAS_SQLALCHEMY and _HAS_PGVECTOR):
        assert models._SQLALCHEMY_AVAILABLE is False
        assert not hasattr(models, "RagChunk")
