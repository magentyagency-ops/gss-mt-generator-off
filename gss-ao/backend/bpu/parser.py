"""Module D — Pré-remplissage BPU/DPGF (mode ASSISTANT).

NON IMPLÉMENTÉ en itération 1 (interfaces seulement, brief §14).
⚠️ Risque financier maximal : le LLM est SUGGESTEUR, jamais remplisseur
automatique. Validation humaine obligatoire avant export (brief §8.1 D, §12).

Le format BPU est variable d'un AO à l'autre (souligné par Sacha) : le parseur
doit reconnaître la structure tabulaire sans la hardcoder.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, Field


class LigneBPU(BaseModel):
    """Une ligne de prix d'un BPU/DPGF."""

    libelle: str
    colonnes: dict[str, str | None] = Field(
        default_factory=dict,
        description="Valeurs par entête de colonne (ex. 'HT annuel', 'TVA'...)",
    )


class TableBPU(BaseModel):
    titre: str | None = None
    entetes: list[str] = Field(default_factory=list)
    lignes: list[LigneBPU] = Field(default_factory=list)


def parse_bpu(path: Path) -> list[TableBPU]:
    """Reconnaît les tables d'un BPU/DPGF fourni (structure tolérante)."""
    raise NotImplementedError("Module D (parseur BPU) — itération ultérieure")


def suggest_prices(tables: list[TableBPU]) -> list[TableBPU]:
    """Propose des prix (grille GSS + historique). Validation humaine requise."""
    raise NotImplementedError("Module D (suggestion prix) — itération ultérieure")
