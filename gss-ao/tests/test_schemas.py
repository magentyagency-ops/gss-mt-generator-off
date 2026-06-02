"""Smoke tests des schémas Pydantic (contrats de données)."""

from backend.schemas.cctp import CCTPDocument
from backend.schemas.common import ExtractionMethod, SourceMeta
from backend.schemas.rag import Chunk, ChunkMetadata
from backend.schemas.rc import RCDocument


def _source(method: ExtractionMethod) -> SourceMeta:
    return SourceMeta(fichier="x", methode_extraction=method)


def test_rc_document_roundtrip():
    rc = RCDocument(source=_source(ExtractionMethod.DOC_LIBREOFFICE))
    data = rc.model_dump_json()
    assert RCDocument.model_validate_json(data) == rc


def test_cctp_document_roundtrip():
    cctp = CCTPDocument(source=_source(ExtractionMethod.DOCX_NATIVE))
    data = cctp.model_dump_json()
    assert CCTPDocument.model_validate_json(data) == cctp


def test_chunk_schema_is_store_agnostic():
    """Le schéma Chunk doit être identique JSONL <-> pgvector (DECISIONS.md D2)."""
    chunk = Chunk(
        chunk_id="abc",
        text="hello",
        metadata=ChunkMetadata(
            categorie="PROCEDURE",
            source_file="x.pdf",
            source_path="PROCEDURE/x.pdf",
            chunk_index=0,
        ),
    )
    assert chunk.embedding is None  # dry-run par défaut
    assert chunk.embedding_dim() is None
    # sérialisation JSONL = exactement les mêmes clés que la table pgvector
    assert set(chunk.model_dump().keys()) == {"chunk_id", "text", "metadata", "embedding"}
