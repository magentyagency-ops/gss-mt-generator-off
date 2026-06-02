"""RAG — découpage des documents en chunks indexables.

Les PDF de `SLIDE REP AO/` sont des slides souvent courtes : on découpe
page par page, en re-découpant les pages longues sur des frontières de
paragraphe/phrase, avec un léger chevauchement pour préserver le contexte.

Les `chunk_id` sont DÉTERMINISTES (hash de source_path + index) : ré-ingérer le
même corpus produit les mêmes ids → idempotence (upsert) côté vector store.
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

from backend.ingestion.doc_converter import extract_pdf_text
from backend.schemas.rag import Chunk, ChunkMetadata

DEFAULT_MAX_CHARS = 1200
DEFAULT_OVERLAP = 150

_WS_RE = re.compile(r"[ \t]+")
_MULTINL_RE = re.compile(r"\n{3,}")


def normalize_text(text: str) -> str:
    """Nettoyage léger : espaces multiples, lignes vides excessives."""
    text = text.replace("\xa0", " ")
    text = _WS_RE.sub(" ", text)
    text = _MULTINL_RE.sub("\n\n", text)
    return text.strip()


def make_chunk_id(source_path: str, chunk_index: int) -> str:
    digest = hashlib.sha1(f"{source_path}#{chunk_index}".encode()).hexdigest()
    return digest[:16]


def split_text(
    text: str,
    *,
    max_chars: int = DEFAULT_MAX_CHARS,
    overlap: int = DEFAULT_OVERLAP,
) -> list[str]:
    """Découpe un texte en segments <= max_chars, sur frontières de paragraphe
    puis de phrase, avec chevauchement `overlap`."""
    text = text.strip()
    if not text:
        return []
    if len(text) <= max_chars:
        return [text]

    # unités atomiques : paragraphes, puis phrases si un paragraphe est trop long
    units: list[str] = []
    for para in re.split(r"\n\s*\n", text):
        para = para.strip()
        if not para:
            continue
        if len(para) <= max_chars:
            units.append(para)
        else:
            for sent in re.split(r"(?<=[.!?])\s+", para):
                sent = sent.strip()
                if sent:
                    units.append(sent)

    chunks: list[str] = []
    current = ""
    for unit in units:
        candidate = f"{current}\n\n{unit}".strip() if current else unit
        if len(candidate) <= max_chars:
            current = candidate
            continue
        if current:
            chunks.append(current)
            # chevauchement : on repart de la fin du chunk précédent
            tail = current[-overlap:] if overlap else ""
            current = f"{tail}\n\n{unit}".strip() if tail else unit
        else:
            # unité seule > max_chars : découpage dur
            for i in range(0, len(unit), max_chars):
                chunks.append(unit[i : i + max_chars])
            current = ""
    if current:
        chunks.append(current)
    return chunks


def chunk_pdf(
    path: Path,
    *,
    categorie: str,
    source_path: str,
    max_chars: int = DEFAULT_MAX_CHARS,
    overlap: int = DEFAULT_OVERLAP,
) -> list[Chunk]:
    """Découpe un PDF en chunks avec métadonnées (page conservée)."""
    raw = extract_pdf_text(Path(path))
    pages = raw.split("\f")
    chunks: list[Chunk] = []
    idx = 0
    for page_num, page_text in enumerate(pages, start=1):
        norm = normalize_text(page_text)
        for piece in split_text(norm, max_chars=max_chars, overlap=overlap):
            chunks.append(
                Chunk(
                    chunk_id=make_chunk_id(source_path, idx),
                    text=piece,
                    metadata=ChunkMetadata(
                        categorie=categorie,
                        source_file=Path(path).name,
                        source_path=source_path,
                        page=page_num,
                        chunk_index=idx,
                    ),
                    embedding=None,
                )
            )
            idx += 1
    return chunks
