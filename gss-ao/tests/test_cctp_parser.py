"""Tests du parseur CCTP — assertions réelles sur le cas Université de Rouen."""

import os
from pathlib import Path

import pytest

from backend.analysis.cctp_parser import _heading_level, parse_cctp
from backend.schemas.cctp import CategorieExigence, CCTPDocument, TypePrestation

_CORPUS = Path(os.environ.get("CORPUS_DCE_DIR", "../Cas-Univ-Rouen-MP2026-08"))
_CCTP = _CORPUS / "4-CCTP 2026-08.docx"

pytestmark = pytest.mark.requires_corpus


@pytest.fixture(scope="module")
def cctp() -> CCTPDocument:
    if not _CCTP.exists():
        pytest.skip(f"Corpus absent : {_CCTP}")
    return parse_cctp(_CCTP)


def test_parse_cctp_rejects_non_docx(tmp_path):
    bad = tmp_path / "x.doc"
    bad.write_bytes(b"\xd0\xcf")
    with pytest.raises(ValueError):
        parse_cctp(bad)


def test_objet_detected(cctp):
    assert cctp.objet is not None
    assert "sûreté" in cctp.objet.lower() or "securite" in cctp.objet.lower()
    assert "rouen" in cctp.objet.lower()


def test_hierarchy_built(cctp):
    # Les grands articles L1 attendus (brief §5.3).
    titres_l1 = [s.titre for s in cctp.arborescence]
    assert any("CONTENU GENERAL" in t for t in titres_l1)
    assert any("OBLIGATIONS DU TITULAIRE" in t for t in titres_l1)
    assert any("AGENTS" in t.upper() for t in titres_l1)
    # profondeur : au moins un L1 avec enfants L2, et un L2 avec enfants L3
    assert any(s.enfants for s in cctp.arborescence)
    assert any(c.enfants for s in cctp.arborescence for c in s.enfants)


def test_reprise_personnel_detected(cctp):
    assert cctp.reprise_personnel is True


def test_prestations_cover_three_types(cctp):
    types = {p.type for p in cctp.prestations}
    assert TypePrestation.BASE in types
    assert TypePrestation.SUPPLEMENTAIRE in types
    assert TypePrestation.TELESECURITE in types
    # télésécurité rattachée au lot 3
    assert any(
        p.type is TypePrestation.TELESECURITE and p.lot == 3 for p in cctp.prestations
    )
    # lots 1 et 2 présents
    lots = {p.lot for p in cctp.prestations}
    assert 1 in lots and 2 in lots


def test_exigences_agents(cctp):
    cats = {e.categorie for e in cctp.exigences_agents}
    for expected in (
        CategorieExigence.QUALIFICATION,
        CategorieExigence.TENUE,
        CategorieExigence.EQUIPEMENT,
        CategorieExigence.VEHICULE,
        CategorieExigence.COMPORTEMENT,
    ):
        assert expected in cats, f"catégorie manquante : {expected}"
    # qualifications réglementaires clés détectées
    valeurs = " ".join((e.valeur or "") for e in cctp.exigences_agents).upper()
    assert "SSIAP2" in valeurs.replace(" ", "")
    assert "SSIAP1" in valeurs.replace(" ", "")


def test_contraintes_site_zrr(cctp):
    assert any("ZRR" in c for c in cctp.contraintes_site)


def test_no_warnings(cctp):
    assert cctp.source.warnings == []


def test_heading_level_helper():
    # robustesse de la détection de niveau (Heading vs Titre)
    class _Style:
        def __init__(self, name):
            self.name = name

    class _P:
        def __init__(self, name):
            self.style = _Style(name)

    assert _heading_level(_P("Heading 1")) == 1
    assert _heading_level(_P("Titre3")) == 3
    assert _heading_level(_P("Normal")) is None
