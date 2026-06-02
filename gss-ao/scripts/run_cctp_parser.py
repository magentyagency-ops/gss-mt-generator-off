"""CLI — parse un CCTP et imprime le JSON structuré.

Usage :
    python -m scripts.run_cctp_parser "<chemin.docx>" [--out fichier.json]

Un .doc legacy est converti automatiquement en .docx (LibreOffice requis).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from backend.analysis.cctp_parser import parse_cctp
from backend.ingestion.doc_converter import convert_doc_to_docx


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Parseur CCTP -> JSON")
    parser.add_argument("path", help="Chemin du CCTP (.docx ou .doc)")
    parser.add_argument("--out", help="Fichier JSON de sortie (sinon stdout)")
    args = parser.parse_args(argv)

    src = Path(args.path)
    if not src.exists():
        print(f"Fichier introuvable : {src}", file=sys.stderr)
        return 2

    if src.suffix.lower() == ".doc":
        src = convert_doc_to_docx(src)

    cctp = parse_cctp(src)
    payload = cctp.model_dump_json(indent=2)

    if args.out:
        Path(args.out).write_text(payload, encoding="utf-8")
        print(f"Écrit : {args.out}")
    else:
        print(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
