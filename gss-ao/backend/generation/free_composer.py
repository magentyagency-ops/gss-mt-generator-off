"""Module C — Génération mémoire technique, cas RÉPONSE LIBRE.

NON IMPLÉMENTÉ en itération 1 (interfaces seulement, brief §14).
Compose un plan structuré (modèle GSS) puis rédige chaque section via RAG.
"""

from __future__ import annotations

from backend.schemas.cctp import CCTPDocument


def compose_free_response(cctp: CCTPDocument, *, top_k: int = 5) -> dict[str, str]:
    """Retourne {section -> texte rédigé} selon le plan structurel GSS."""
    raise NotImplementedError("Module C (réponse libre) — itération ultérieure")
