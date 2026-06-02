"""Tests du doc_converter : détection soffice + extraction docx/pdf.

La détection est testée sans dépendre de la présence réelle de LibreOffice
(on simule via SOFFICE_BIN). La conversion .doc réelle est marquée
`requires_libreoffice` (skip si soffice absent).
"""

import os
from pathlib import Path

import pytest

from backend.core.config import Settings
from backend.ingestion.doc_converter import (
    LibreOfficeNotFoundError,
    convert_doc_to_docx,
    extract_text,
    find_soffice,
    soffice_available,
)


def _settings(**over) -> Settings:
    return Settings(_env_file=None, **over)


# --- détection ---------------------------------------------------------------

def test_find_soffice_uses_config_bin(tmp_path):
    fake = tmp_path / "soffice"
    fake.write_text("#!/bin/sh\n")
    s = _settings(soffice_bin=str(fake))
    assert find_soffice(s) == str(fake)
    assert soffice_available(s) is True


def test_find_soffice_ignores_missing_config_bin():
    s = _settings(soffice_bin="/chemin/inexistant/soffice")
    # Retombe sur PATH/candidats macOS ; peut être None si rien d'installé.
    result = find_soffice(s)
    assert result is None or Path(result).exists()


def test_convert_doc_raises_when_soffice_missing(tmp_path):
    src = tmp_path / "x.doc"
    src.write_bytes(b"\xd0\xcf\x11\xe0")  # magic OLE2 bidon
    s = _settings(soffice_bin="/chemin/inexistant/soffice")
    # On force l'absence en vidant aussi le PATH via monkey: ici on s'appuie sur
    # le fait que le binaire de config est invalide ; si un soffice système
    # existe, le test devient non pertinent -> on skip dans ce cas.
    if soffice_available(s):
        pytest.skip("LibreOffice présent sur la machine : cas 'absent' non testable")
    with pytest.raises(LibreOfficeNotFoundError):
        convert_doc_to_docx(src, settings=s)


def test_extract_text_unsupported_format(tmp_path):
    f = tmp_path / "data.txt"
    f.write_text("hello")
    from backend.ingestion.doc_converter import DocConverterError

    with pytest.raises(DocConverterError):
        extract_text(f)


# --- extraction réelle sur le corpus (si présent) ----------------------------

_CORPUS = Path(os.environ.get("CORPUS_DCE_DIR", "../Cas-Univ-Rouen-MP2026-08"))


@pytest.mark.requires_corpus
def test_extract_docx_cctp_has_text():
    cctp = _CORPUS / "4-CCTP 2026-08.docx"
    if not cctp.exists():
        pytest.skip(f"Corpus absent : {cctp}")
    text = extract_text(cctp)
    assert len(text) > 1000
    assert "prestation" in text.lower()
