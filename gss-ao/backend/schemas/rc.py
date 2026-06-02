"""Schéma de sortie du parseur RC (Règlement de Consultation).

Conforme au brief §5.1 (cas Université de Rouen 2026-08). Sérialisé en JSON
via `RCDocument.model_dump_json()`.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field

from backend.schemas.common import DateEcheance, Lot, SourceMeta


class TypePiece(str, Enum):
    """Catégorie d'une pièce à fournir."""

    CANDIDATURE = "candidature"
    OFFRE = "offre"


class PieceAFournir(BaseModel):
    """Une pièce exigée par le RC (alimente la check-list de conformité, Module E)."""

    nom: str = Field(description="Intitulé de la pièce (ex. 'Acte d'Engagement signé')")
    type: TypePiece
    obligatoire: bool = True
    alternative: str | None = Field(
        default=None,
        description="Alternative admise (ex. 'DUME' au lieu de 'DC1+DC2')",
    )
    ref_texte: str | None = Field(
        default=None, description="Extrait du RC justifiant l'exigence"
    )


class SousCritere(BaseModel):
    """Un sous-critère pondéré du barème de notation."""

    libelle: str
    points: float
    lots: list[int] = Field(
        default_factory=list,
        description="Lots concernés ; vide = tous lots",
    )


class CriteresNotation(BaseModel):
    """Barème de jugement des offres (brief §5.1.6)."""

    valeur_technique_pts: float
    prix_pts: float
    sous_criteres: list[SousCritere] = Field(default_factory=list)


class Visite(BaseModel):
    """Visite des locaux (brief §5.1.2)."""

    prevue: bool = False
    obligatoire: bool | None = None
    dates: list[DateEcheance] = Field(default_factory=list)
    lieu: str | None = None
    ref_texte: str | None = None


class ModalitesRemise(BaseModel):
    """Modalités de remise des offres (brief §5.1.5)."""

    plateforme: str | None = None
    signature_formats: list[str] = Field(
        default_factory=list, description="Ex. ['XAdES', 'CAdES', 'PAdES']"
    )
    date_limite: DateEcheance | None = None


class RCDocument(BaseModel):
    """Sortie structurée complète du parseur RC."""

    objet: str | None = None
    acheteur: str | None = None
    ccag: str | None = None
    cpv: list[str] = Field(default_factory=list)
    duree: str | None = None
    allotissement: list[Lot] = Field(default_factory=list)

    visite: Visite = Field(default_factory=Visite)
    pieces_candidature: list[PieceAFournir] = Field(default_factory=list)
    pieces_offre: list[PieceAFournir] = Field(default_factory=list)
    criteres: CriteresNotation | None = None
    modalites_remise: ModalitesRemise = Field(default_factory=ModalitesRemise)

    source: SourceMeta
