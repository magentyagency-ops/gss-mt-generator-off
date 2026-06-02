"""CLI — parse un RC et imprime le JSON structuré.

Usage :
    python -m scripts.run_rc_parser "<chemin.doc|.docx>" [--out fichier.json]

Le `.doc` legacy est extrait via LibreOffice si présent, sinon textutil (macOS).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from backend.analysis.rc_parser import parse_rc


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Parseur RC -> JSON")
    parser.add_argument("path", help="Chemin du RC (.doc ou .docx)")
    parser.add_argument("--out", help="Fichier JSON de sortie (sinon stdout)")
    args = parser.parse_args(argv)

    src = Path(args.path)
    if not src.exists():
        print(f"Fichier introuvable : {src}", file=sys.stderr)
        return 2

    rc = parse_rc(src)
    payload = rc.model_dump_json(indent=2)

    if args.out:
        Path(args.out).write_text(payload, encoding="utf-8")
        print(f"Écrit : {args.out}")
    else:
        print(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
