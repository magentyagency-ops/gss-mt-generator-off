"""Module E — Check-list de conformité administrative.

NON IMPLÉMENTÉ en itération 1 (interface seulement, brief §14).
Consomme la sortie du parseur RC (pièces à fournir) pour produire une check-list
et alerter sur les pièces manquantes (offre éliminée si pièce absente).
"""

from __future__ import annotations

from pydantic import BaseModel

from backend.schemas.rc import PieceAFournir, RCDocument


class ItemChecklist(BaseModel):
    piece: PieceAFournir
    present: bool = False


def build_checklist(rc: RCDocument) -> list[ItemChecklist]:
    """Construit la check-list à partir des pièces extraites du RC."""
    raise NotImplementedError("Module E (check-list) — itération ultérieure")
