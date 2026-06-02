"""Schéma de sortie du parseur CCTP (Cahier des Clauses Techniques Particulières).

Conforme au brief §5.3. Pièce centrale pour la génération (Module C, futur).
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field

from backend.schemas.common import SourceMeta


class TypePrestation(str, Enum):
    BASE = "base"
    SUPPLEMENTAIRE = "supplementaire"
    TELESECURITE = "telesecurite"


class CategorieExigence(str, Enum):
    """Nature d'une exigence portant sur les agents (brief §5.3)."""

    QUALIFICATION = "qualification"  # SSIAP1/2, APS, CNAPS, recyclage...
    EQUIPEMENT = "equipement"
    TENUE = "tenue"
    COMPORTEMENT = "comportement"
    VEHICULE = "vehicule"
    AUTRE = "autre"


class SectionCCTP(BaseModel):
    """Nœud de l'arborescence hiérarchique du CCTP (Titre1 > Titre2 > Titre3)."""

    niveau: int = Field(description="1, 2 ou 3 (profondeur du titre)")
    numero: str | None = Field(default=None, description="Ex. 'Article 1', '2.3'")
    titre: str
    texte: str = Field(default="", description="Texte propre à la section (hors enfants)")
    enfants: list[SectionCCTP] = Field(default_factory=list)


class Prestation(BaseModel):
    """Une prestation attendue, rattachée à un lot/campus."""

    type: TypePrestation
    lot: int | None = None
    campus: str | None = None
    description: str
    ref_section: str | None = Field(
        default=None, description="Titre/numéro de section d'origine"
    )


class ExigenceAgent(BaseModel):
    """Une exigence opérationnelle portant sur les agents."""

    categorie: CategorieExigence
    libelle: str
    valeur: str | None = Field(
        default=None, description="Détail (ex. 'SSIAP2', 'chaussures de sécurité')"
    )
    ref_section: str | None = None


class CCTPDocument(BaseModel):
    """Sortie structurée complète du parseur CCTP."""

    objet: str | None = None
    arborescence: list[SectionCCTP] = Field(default_factory=list)
    prestations: list[Prestation] = Field(default_factory=list)
    exigences_agents: list[ExigenceAgent] = Field(default_factory=list)
    contraintes_site: list[str] = Field(default_factory=list)
    reprise_personnel: bool | None = Field(
        default=None, description="Reprise du personnel en poste détectée (brief §5.3)"
    )

    source: SourceMeta


# Pydantic v2 : résoudre la référence récursive SectionCCTP.enfants
SectionCCTP.model_rebuild()
