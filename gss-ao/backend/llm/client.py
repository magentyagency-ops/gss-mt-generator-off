"""Wrapper LLM (Anthropic). NON APPELÉ en itération 1 (interface seulement).

Centralise le choix du modèle (Sonnet pour génération longue, Haiku pour tâches
utilitaires) et l'isolement de la dépendance fournisseur (brief §9.1, §15 :
multi-providers / souveraineté à acter).
"""

from __future__ import annotations

from backend.core.config import Settings, get_settings


class LLMClient:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    def complete(self, prompt: str, *, long_form: bool = True) -> str:
        """Appel de complétion. Choisit Sonnet (long_form) ou Haiku."""
        raise NotImplementedError("Wrapper LLM — itération ultérieure (Module C)")
