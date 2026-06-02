"""Module B — point d'entrée parseur BPU (délègue à backend.bpu.parser).

NON IMPLÉMENTÉ en itération 1 (interface seulement, brief §14). Le détail vit
dans `backend/bpu/parser.py`.
"""

from __future__ import annotations

from pathlib import Path

from backend.bpu.parser import TableBPU, parse_bpu


def analyze_bpu(path: Path) -> list[TableBPU]:
    return parse_bpu(path)
