"""Module C — Export du mémoire technique généré (DOCX + PDF).

NON IMPLÉMENTÉ en itération 1 (interfaces seulement, brief §14).
"""

from __future__ import annotations

from pathlib import Path


def export_docx(sections: dict[str, str], out_path: Path) -> Path:
    """Exporte le mémoire rédigé en DOCX (charte GSS à fournir)."""
    raise NotImplementedError("Export DOCX — itération ultérieure")


def export_pdf(docx_path: Path, out_path: Path) -> Path:
    """Convertit le DOCX en PDF (LibreOffice headless)."""
    raise NotImplementedError("Export PDF — itération ultérieure")
