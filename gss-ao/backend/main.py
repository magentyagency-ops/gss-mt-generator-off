"""Point d'entrée FastAPI — squelette (itération 1).

Lancement : `uvicorn backend.main:app --reload`
Seul `/api/health` est fonctionnel à ce stade.
"""

from __future__ import annotations

from fastapi import FastAPI

from backend.api.routes import router

app = FastAPI(
    title="GSS-AO — Automatisation appels d'offres",
    version="0.1.0",
    description="Backend GSS-AO (itération 1 : parseurs RC/CCTP + ingestion RAG).",
)
app.include_router(router)
