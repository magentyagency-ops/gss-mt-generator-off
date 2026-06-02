"""Schémas Pydantic — contrats de données du backend GSS-AO."""

from backend.schemas.cctp import (
    CategorieExigence,
    CCTPDocument,
    ExigenceAgent,
    Prestation,
    SectionCCTP,
    TypePrestation,
)
from backend.schemas.common import (
    DateEcheance,
    ExtractionMethod,
    Lot,
    SourceMeta,
)
from backend.schemas.rag import Chunk, ChunkMetadata
from backend.schemas.rc import (
    CriteresNotation,
    ModalitesRemise,
    PieceAFournir,
    RCDocument,
    SousCritere,
    TypePiece,
    Visite,
)

__all__ = [
    # common
    "DateEcheance",
    "ExtractionMethod",
    "Lot",
    "SourceMeta",
    # rc
    "CriteresNotation",
    "ModalitesRemise",
    "PieceAFournir",
    "RCDocument",
    "SousCritere",
    "TypePiece",
    "Visite",
    # cctp
    "CategorieExigence",
    "CCTPDocument",
    "ExigenceAgent",
    "Prestation",
    "SectionCCTP",
    "TypePrestation",
    # rag
    "Chunk",
    "ChunkMetadata",
]
