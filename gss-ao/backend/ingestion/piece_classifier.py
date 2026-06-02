"""Module A — Détection/classification des pièces d'un DCE.

NON IMPLÉMENTÉ en itération 1 (interface seulement, brief §14).
Classe chaque fichier uploadé : RC / CCAP / CCTP / BPU / DPGF / Mémoire cadre /
Annexe, à partir d'indices (nom de fichier, structure, mots-clés contenu).
"""

from __future__ import annotations

from enum import Enum
from pathlib import Path

from pydantic import BaseModel


class TypePiece(str, Enum):
    RC = "rc"
    CCAP = "ccap"
    CCTP = "cctp"
    BPU = "bpu"
    DPGF = "dpgf"
    MEMOIRE_CADRE = "memoire_cadre"
    ACTE_ENGAGEMENT = "acte_engagement"
    ANNEXE = "annexe"
    INCONNU = "inconnu"


class PieceClassifiee(BaseModel):
    path: str
    type: TypePiece
    confiance: float = 0.0
    indices: list[str] = []


def classify_piece(path: Path) -> PieceClassifiee:
    """Classe un fichier du DCE."""
    raise NotImplementedError("Module A (classification) — itération ultérieure")


def classify_dce(files: list[Path]) -> list[PieceClassifiee]:
    """Classe l'ensemble des pièces d'un DCE."""
    raise NotImplementedError("Module A (classification DCE) — itération ultérieure")
