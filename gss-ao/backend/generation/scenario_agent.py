"""Module C — Agent « scénarios anticipés » (différenciation qualitative).

NON IMPLÉMENTÉ en itération 1 (interfaces seulement, brief §14).
Matérialise le gisement de valeur identifié par Mme Vaché : proposer des cas de
figure pertinents pour le site, non explicitement demandés par le DCE.
"""

from __future__ import annotations

from backend.schemas.cctp import CCTPDocument


def suggest_scenarios(cctp: CCTPDocument) -> list[str]:
    """Retourne des scénarios de risque contextuels suggérés pour le site."""
    raise NotImplementedError("Module C (scénarios anticipés) — itération ultérieure")
