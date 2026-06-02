"""Module C — Génération mémoire technique, cas CADRE IMPOSÉ.

NON IMPLÉMENTÉ en itération 1 (interfaces seulement, brief §14).
Remplit chaque question du template fourni par l'acheteur en s'appuyant sur le
RAG (SLIDE REP AO) + le contexte CCTP.
"""

from __future__ import annotations

from backend.schemas.cctp import CCTPDocument


def fill_template(
    template_path: str,
    cctp: CCTPDocument,
    *,
    top_k: int = 5,
) -> dict[str, str]:
    """Pour chaque question du cadre imposé, retourne une réponse rédigée.

    Returns: mapping {question -> réponse rédigée}.
    """
    raise NotImplementedError("Module C (cadre imposé) — itération ultérieure")
