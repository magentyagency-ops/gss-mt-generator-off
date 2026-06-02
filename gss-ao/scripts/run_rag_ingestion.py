"""CLI — ingestion RAG de `SLIDE REP AO/`.

Usage :
    python -m scripts.run_rag_ingestion [--src "<dossier>"] [--out chunks.jsonl]
                                        [--max-chars N] [--overlap N]

Par défaut : source = CORPUS_SLIDE_REP_AO_DIR (.env), backend = VECTOR_STORE
(.env, 'jsonl' par défaut), embeddings = EMBEDDING_PROVIDER (.env, 'none').
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from backend.core.config import get_settings
from backend.rag.chunking import DEFAULT_MAX_CHARS, DEFAULT_OVERLAP
from backend.rag.embeddings import get_embedder
from backend.rag.ingestion import ingest_slide_rep_ao
from backend.rag.vector_store import JsonlVectorStore, get_vector_store


def main(argv: list[str] | None = None) -> int:
    settings = get_settings()
    parser = argparse.ArgumentParser(description="Ingestion RAG SLIDE REP AO -> vector store")
    parser.add_argument("--src", help="Dossier source (défaut: CORPUS_SLIDE_REP_AO_DIR)")
    parser.add_argument("--out", help="Chemin JSONL (force le backend JSONL)")
    parser.add_argument("--max-chars", type=int, default=DEFAULT_MAX_CHARS)
    parser.add_argument("--overlap", type=int, default=DEFAULT_OVERLAP)
    args = parser.parse_args(argv)

    root = Path(args.src) if args.src else settings.corpus_slide_rep_ao_dir
    if not root.exists():
        print(f"Source introuvable : {root}", file=sys.stderr)
        return 2

    store = JsonlVectorStore(Path(args.out)) if args.out else get_vector_store(settings)
    embedder = get_embedder(settings)

    print(f"Source       : {root}")
    print(f"Vector store : {type(store).__name__}")
    print(f"Embedder     : {type(embedder).__name__} (dim={embedder.dim})")
    print("Ingestion en cours...")

    stats = ingest_slide_rep_ao(
        root, store, embedder, max_chars=args.max_chars, overlap=args.overlap
    )

    print("\n=== Résultat ===")
    print(f"Fichiers ingérés : {stats.files}")
    print(f"Chunks produits  : {stats.chunks}")
    print(f"Chunks vectorisés: {stats.embedded} (0 attendu en mode dry-run)")
    print(f"Total en base    : {store.count()}")
    if stats.skipped:
        print(f"Ignorés ({len(stats.skipped)}):")
        for s in stats.skipped:
            print(f"  - {s}")
    print("\nChunks par catégorie :")
    for cat, n in sorted(stats.by_category.items()):
        print(f"  {n:4}  {cat}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
