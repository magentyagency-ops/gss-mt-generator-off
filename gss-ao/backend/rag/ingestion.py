"""RAG — ingestion de la base de connaissances `SLIDE REP AO/`.

Pipeline :
  1. parcourir l'arborescence (catégorie = dossier de 1er niveau) ;
  2. extraire + chunker chaque PDF (métadonnées : catégorie, source, page) ;
  3. calculer les embeddings via l'`Embedder` (None en dry-run) ;
  4. upsert dans le `VectorStore` (JSONL dry-run ou pgvector).

Idempotent : ré-ingérer le même corpus réécrit les mêmes chunk_id.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from backend.core.config import Settings, get_settings
from backend.rag.chunking import DEFAULT_MAX_CHARS, DEFAULT_OVERLAP, chunk_pdf
from backend.rag.embeddings import Embedder, get_embedder
from backend.rag.vector_store import VectorStore, get_vector_store
from backend.schemas.rag import Chunk


@dataclass
class IngestionStats:
    files: int = 0
    chunks: int = 0
    embedded: int = 0
    skipped: list[str] = field(default_factory=list)
    by_category: Counter = field(default_factory=Counter)

    def as_dict(self) -> dict:
        return {
            "files": self.files,
            "chunks": self.chunks,
            "embedded": self.embedded,
            "skipped": self.skipped,
            "by_category": dict(self.by_category),
        }


def iter_pdfs(root: Path):
    """Itère (path, categorie, source_path) sur les PDF de la base.

    `categorie` = nom du dossier de 1er niveau ; `source_path` = chemin relatif
    à `root` (identifiant stable du document).
    """
    root = Path(root)
    for pdf in sorted(root.rglob("*.pdf")):
        rel = pdf.relative_to(root)
        categorie = rel.parts[0] if len(rel.parts) > 1 else "_RACINE_"
        yield pdf, categorie, str(rel)


def ingest_slide_rep_ao(
    root: Path,
    store: VectorStore,
    embedder: Embedder,
    *,
    max_chars: int = DEFAULT_MAX_CHARS,
    overlap: int = DEFAULT_OVERLAP,
    batch_size: int = 64,
) -> IngestionStats:
    """Ingestion complète. Retourne des statistiques."""
    stats = IngestionStats()
    buffer: list[Chunk] = []

    def flush() -> None:
        if not buffer:
            return
        vectors = embedder.embed([c.text for c in buffer])
        for c, v in zip(buffer, vectors, strict=True):
            c.embedding = v
            if v is not None:
                stats.embedded += 1
        store.upsert(buffer)
        buffer.clear()

    for pdf, categorie, source_path in iter_pdfs(root):
        try:
            chunks = chunk_pdf(
                pdf, categorie=categorie, source_path=source_path,
                max_chars=max_chars, overlap=overlap,
            )
        except Exception as exc:  # pragma: no cover - robustesse ingestion
            stats.skipped.append(f"{source_path}: {exc}")
            continue
        if not chunks:
            stats.skipped.append(f"{source_path}: aucun texte extrait")
            continue
        stats.files += 1
        stats.chunks += len(chunks)
        stats.by_category[categorie] += len(chunks)
        buffer.extend(chunks)
        if len(buffer) >= batch_size:
            flush()
    flush()
    return stats


def run_ingestion(settings: Settings | None = None, root: Path | None = None) -> IngestionStats:
    """Point d'entrée haut niveau : assemble store + embedder depuis la config."""
    settings = settings or get_settings()
    root = Path(root) if root else settings.corpus_slide_rep_ao_dir
    store = get_vector_store(settings)
    embedder = get_embedder(settings)
    return ingest_slide_rep_ao(root, store, embedder)
