"""Types partagés entre les schémas RC / CCTP / RAG."""

from __future__ import annotations

from datetime import date
from enum import Enum

from pydantic import BaseModel, Field


class ExtractionMethod(str, Enum):
    """Méthode ayant produit l'extraction (traçabilité)."""

    DOCX_NATIVE = "docx_native"  # python-docx sur .docx natif
    DOC_LIBREOFFICE = "doc_libreoffice"  # .doc -> .docx via soffice puis python-docx
    DOC_TEXTUTIL = "doc_textutil"  # .doc -> texte via textutil (natif macOS)
    DOC_OLEFILE_FALLBACK = "doc_olefile_fallback"  # plan B pur-Python
    PDF_PYMUPDF = "pdf_pymupdf"
    PDF_PDFPLUMBER = "pdf_pdfplumber"
    PDF_OCR = "pdf_ocr"


class SourceMeta(BaseModel):
    """Métadonnées de traçabilité attachées à chaque document parsé.

    Permet à l'utilisateur (Vaché/Sacha) de savoir d'où vient une donnée et
    avec quel niveau de confiance — exigence du brief (revue humaine).
    """

    fichier: str = Field(description="Nom du fichier source")
    methode_extraction: ExtractionMethod
    warnings: list[str] = Field(
        default_factory=list,
        description="Anomalies non bloquantes détectées pendant le parsing",
    )


class Lot(BaseModel):
    """Un lot de l'allotissement."""

    numero: int
    intitule: str
    perimetre: str | None = Field(
        default=None, description="Ex. 'Seine-Maritime (76)', 'Eure (27)', 'télésécurité'"
    )


class DateEcheance(BaseModel):
    """Une date clé du marché, avec son libellé d'origine (souvent ambigu)."""

    libelle: str = Field(description="Intitulé tel que dans le document")
    valeur: date | None = Field(
        default=None, description="Date normalisée si parsable, sinon None"
    )
    texte_brut: str | None = Field(
        default=None, description="Chaîne d'origine si non normalisable"
    )
