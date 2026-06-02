"""Tests du parseur RC — assertions réelles sur le cas Université de Rouen.

Le RC est un .doc legacy : ces tests nécessitent une voie de conversion
(LibreOffice OU textutil macOS). Ils sont marqués `requires_corpus` et se
skippent proprement si ni le corpus ni un convertisseur ne sont disponibles.
"""

import os
from datetime import date
from pathlib import Path

import pytest

from backend.analysis.rc_parser import _parse_fr_date, _split_sections, parse_rc
from backend.ingestion.doc_converter import find_textutil, soffice_available
from backend.schemas.rc import RCDocument, TypePiece

_CORPUS = Path(os.environ.get("CORPUS_DCE_DIR", "../Cas-Univ-Rouen-MP2026-08"))
_RC = _CORPUS / "2-RC 2026-08.doc"

pytestmark = pytest.mark.requires_corpus


@pytest.fixture(scope="module")
def rc() -> RCDocument:
    if not _RC.exists():
        pytest.skip(f"Corpus absent : {_RC}")
    if not (soffice_available() or find_textutil()):
        pytest.skip("Aucun convertisseur .doc (LibreOffice/textutil) disponible")
    return parse_rc(_RC)


# --- unités (sans corpus) ----------------------------------------------------

@pytest.mark.parametrize(
    "txt,expected",
    [
        ("le lundi 16 mars 2026 à 10h00", date(2026, 3, 16)),
        ("Mercredi 08 avril 2026 jusqu'à 11h00", date(2026, 4, 8)),
        ("pas de date ici", None),
    ],
)
def test_parse_fr_date(txt, expected):
    assert _parse_fr_date(txt) == expected


def test_split_sections_ignores_cpv_like_lines():
    lines = [
        "1 – SYNOPTIQUE",
        "blabla",
        "79713000-5 Services de gardiennage",  # ne doit PAS créer de section
        "2 – CONDITIONS",
    ]
    nums = {s.num for s in _split_sections(lines)}
    assert nums == {"1", "2"}
    assert "79713000" not in nums


# --- intégration (corpus) ----------------------------------------------------

def test_identite_marche(rc):
    assert rc.objet and "rouen" in rc.objet.lower()
    assert rc.acheteur == "UNIVERSITE DE ROUEN NORMANDIE"
    assert rc.ccag == "CCAG-FCS"
    assert "79713000-5" in rc.cpv
    assert rc.source.warnings == []


def test_allotissement_trois_lots(rc):
    nums = sorted(lot.numero for lot in rc.allotissement)
    assert nums == [1, 2, 3]
    perims = {lot.numero: lot.perimetre for lot in rc.allotissement}
    assert perims[1] == "Département 76"
    assert perims[2] == "Département 27"
    assert perims[3] == "Télésécurité"


def test_visite_obligatoire_avec_date(rc):
    assert rc.visite.prevue is True
    assert rc.visite.obligatoire is True
    assert any(d.valeur == date(2026, 3, 16) for d in rc.visite.dates)


def test_bareme_notation(rc):
    c = rc.criteres
    assert c is not None
    assert c.valeur_technique_pts == 60
    assert c.prix_pts == 40
    # les 5 sous-critères de la valeur technique somment à 100 (répartis par lot)
    assert sum(s.points for s in c.sous_criteres) == 100
    libs = {s.libelle.lower(): s for s in c.sous_criteres}
    telesurv = next(s for k, s in libs.items() if "télésurveillance" in k)
    assert telesurv.points == 40 and telesurv.lots == [3]
    humains = next(s for k, s in libs.items() if "moyens humains" in k)
    assert humains.points == 20 and humains.lots == [1, 2]


def test_pieces_candidature(rc):
    noms = " | ".join(p.nom for p in rc.pieces_candidature).lower()
    for attendu in ("dc1", "dc2", "assurance", "fiscale", "références", "honneur"):
        assert attendu in noms, f"pièce candidature manquante : {attendu}"
    # DUME = alternative non obligatoire
    dume = next(p for p in rc.pieces_candidature if "dume" in p.nom.lower())
    assert dume.obligatoire is False and dume.alternative
    assert all(p.type is TypePiece.CANDIDATURE for p in rc.pieces_candidature)


def test_pieces_offre(rc):
    noms = " | ".join(p.nom for p in rc.pieces_offre).lower()
    for attendu in ("acte d'engagement", "bpu", "dpgf", "mémoire technique", "rib"):
        assert attendu in noms, f"pièce offre manquante : {attendu}"
    assert all(p.type is TypePiece.OFFRE for p in rc.pieces_offre)


def test_modalites_remise(rc):
    m = rc.modalites_remise
    assert m.plateforme and "achatpublic" in m.plateforme.lower()
    assert m.date_limite is not None
    assert m.date_limite.valeur == date(2026, 4, 8)
    assert m.signature_formats  # XAdES/CAdES/PAdES ou "Signature électronique (RGS)"
