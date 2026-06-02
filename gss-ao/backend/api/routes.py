"""Routes API FastAPI — squelette (itération 1, brief §14.1).

Le workflow UI (brief §8.3) sera branché ici. Les endpoints lèvent
NotImplementedError tant que les modules correspondants ne sont pas livrés.
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["gss-ao"])


@router.get("/health")
def health() -> dict[str, str]:
    """Sonde de disponibilité (le seul endpoint réellement actif)."""
    return {"status": "ok"}


@router.post("/dce/upload")
def upload_dce() -> dict:
    """Module A — upload ZIP/multi-fichiers + classification des pièces."""
    raise NotImplementedError("Endpoint upload DCE — itération ultérieure")


@router.get("/dce/{dossier_id}/synthese")
def get_synthese(dossier_id: str) -> dict:
    """Module B — fiche de synthèse DCE."""
    raise NotImplementedError("Endpoint synthèse — itération ultérieure")


@router.get("/dce/{dossier_id}/checklist")
def get_checklist(dossier_id: str) -> dict:
    """Module E — check-list de conformité."""
    raise NotImplementedError("Endpoint check-list — itération ultérieure")


@router.post("/dce/{dossier_id}/memoire")
def generate_memoire(dossier_id: str) -> dict:
    """Module C — génération mémoire technique."""
    raise NotImplementedError("Endpoint génération mémoire — itération ultérieure")
