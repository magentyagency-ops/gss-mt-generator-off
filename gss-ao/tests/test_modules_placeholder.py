"""Placeholders : modules hors périmètre itération 1 (doivent lever NotImplementedError).

Ces tests verrouillent le contrat (signature importable) sans exiger l'implémentation.
"""

import pytest

from backend.compliance.checklist import build_checklist
from backend.generation.free_composer import compose_free_response
from backend.generation.scenario_agent import suggest_scenarios
from backend.generation.template_filler import fill_template
from backend.schemas.cctp import CCTPDocument
from backend.schemas.common import ExtractionMethod, SourceMeta


def _cctp() -> CCTPDocument:
    return CCTPDocument(
        source=SourceMeta(fichier="x", methode_extraction=ExtractionMethod.DOCX_NATIVE)
    )


@pytest.mark.parametrize(
    "call",
    [
        lambda: fill_template("t.docx", _cctp()),
        lambda: compose_free_response(_cctp()),
        lambda: suggest_scenarios(_cctp()),
    ],
)
def test_generation_not_implemented(call):
    with pytest.raises(NotImplementedError):
        call()


def test_compliance_not_implemented():
    from backend.schemas.rc import RCDocument

    rc = RCDocument(
        source=SourceMeta(fichier="x", methode_extraction=ExtractionMethod.DOC_LIBREOFFICE)
    )
    with pytest.raises(NotImplementedError):
        build_checklist(rc)
