"""Module B — Fiche de synthèse DCE (équivalent du mail récap de Sacha).

NON IMPLÉMENTÉ en itération 1 (interface seulement, brief §14).
Agrège les sorties RC + CCTP (+ annexes) en une fiche destinée à
Marchani / Vaché / Louis, avec détection du mode de réponse (cadre/libre).
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel

from backend.schemas.cctp import CCTPDocument
from backend.schemas.rc import RCDocument


class ModeReponse(str, Enum):
    CADRE_IMPOSE = "cadre_impose"
    LIBRE = "libre"


class FicheSynthese(BaseModel):
    objet: str | None = None
    acheteur: str | None = None
    mode_reponse: ModeReponse | None = None
    points_cles: list[str] = []


def build_synthesis(rc: RCDocument, cctp: CCTPDocument) -> FicheSynthese:
    """Construit la fiche de synthèse DCE."""
    raise NotImplementedError("Module B (fiche de synthèse) — itération ultérieure")
