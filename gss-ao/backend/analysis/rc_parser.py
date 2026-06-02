"""Module B — Parseur RC (Règlement de Consultation).

OPÉRATIONNEL (brief §14.2). Cible : `2-RC 2026-08.doc` (Université de Rouen).

Le RC est un `.doc` legacy : l'extraction de texte est déléguée à
`backend.ingestion.doc_converter.extract_doc_text` (LibreOffice si dispo, sinon
textutil natif macOS). Le parsing est ensuite textuel, fondé sur les sections
numérotées du RC (1, 1.4, 2.6, 4.1, 4.2, 6, ...) et des motifs canoniques pour
les pièces à fournir — robuste à la variabilité de mise en forme.

Produit un `RCDocument` conforme au schéma §5.1 du brief.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import date
from pathlib import Path

from backend.ingestion.doc_converter import extract_doc_text, load_docx_text
from backend.schemas.common import DateEcheance, ExtractionMethod, Lot, SourceMeta
from backend.schemas.rc import (
    CriteresNotation,
    ModalitesRemise,
    PieceAFournir,
    RCDocument,
    SousCritere,
    TypePiece,
    Visite,
)

# --- utilitaires ------------------------------------------------------------

_MONTHS_FR = {
    "janvier": 1, "fevrier": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6,
    "juillet": 7, "aout": 8, "septembre": 9, "octobre": 10, "novembre": 11,
    "decembre": 12,
}

_DATE_RE = re.compile(
    r"(\d{1,2})\s+([A-Za-zéûôîèà]+)\s+(\d{4})", re.IGNORECASE
)

# CPV : 8 chiffres + clé (ex. 79713000-5)
_CPV_RE = re.compile(r"\b(\d{8}-\d)\b")

# Sous-critère : "Libellé ... : 20 points (lot 1 et 2)," (virgule/point final tolérés)
_SOUSCRIT_RE = re.compile(
    r"^(?P<lib>.+?)\s*:\s*(?P<pts>\d+)\s*points?\s*(?:\((?P<scope>[^)]*)\))?[\s,.;]*$",
    re.IGNORECASE,
)

# En-tête de section : "4.1 - Candidature", "2 – CONDITIONS", "1.4 – Allotissement".
# Le séparateur doit être ENTOURÉ d'espaces et le numéro tenir sur ≤ 2 niveaux,
# pour ne pas confondre une CPV ("79713000-5 Services...") avec une section.
_SECTION_RE = re.compile(r"^\s*(\d{1,2}(?:\.\d{1,2})?)\s+[–—\-]\s+(.+?)\s*$")


def _strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )


def _parse_fr_date(text: str) -> date | None:
    m = _DATE_RE.search(text)
    if not m:
        return None
    day = int(m.group(1))
    month = _MONTHS_FR.get(_strip_accents(m.group(2)).lower())
    year = int(m.group(3))
    if not month:
        return None
    try:
        return date(year, month, day)
    except ValueError:
        return None


# --- découpage en sections --------------------------------------------------

class _Section:
    __slots__ = ("num", "title", "start", "end", "lines")

    def __init__(self, num: str, title: str, start: int):
        self.num = num
        self.title = title
        self.start = start
        self.end = -1
        self.lines: list[str] = []

    @property
    def text(self) -> str:
        return "\n".join(self.lines).strip()


def _split_sections(lines: list[str]) -> list[_Section]:
    """Découpe le document en sections d'après les en-têtes numérotés.

    Ignore les en-têtes du SOMMAIRE (sans corps), en ne gardant que la dernière
    occurrence d'un même numéro (le sommaire précède le corps réel).
    """
    raw: list[_Section] = []
    for i, line in enumerate(lines):
        m = _SECTION_RE.match(line)
        if m:
            raw.append(_Section(m.group(1), m.group(2).strip(), i))
    # bornes
    for idx, sec in enumerate(raw):
        nxt = raw[idx + 1].start if idx + 1 < len(raw) else len(lines)
        sec.end = nxt
        sec.lines = [ln for ln in lines[sec.start + 1 : nxt]]

    # dédoublonnage sommaire : garder la section au corps le plus long par num
    by_num: dict[str, _Section] = {}
    for sec in raw:
        prev = by_num.get(sec.num)
        if prev is None or len(sec.text) > len(prev.text):
            by_num[sec.num] = sec
    return list(by_num.values())


def _find(sections: list[_Section], num: str) -> _Section | None:
    for s in sections:
        if s.num == num:
            return s
    return None


# --- extraction des pièces (motifs canoniques) ------------------------------
# (regex, libellé canonique). Scannés DANS la section concernée pour fiabilité.
_PIECES_CANDIDATURE = [
    (r"d[ée]claration sur l.honneur", "Déclaration sur l'honneur"),
    (r"\bDC1\b", "DC1 — Lettre de candidature"),
    (r"\bDC2\b", "DC2 — Déclaration du candidat"),
    (r"note de pr[ée]sentation", "Note de présentation de l'entreprise"),
    (
        r"r[ée]f[ée]rences.*?(moins de\s*)?3\s*ans|liste.*?r[ée]f[ée]rences",
        "Liste de références (< 3 ans)",
    ),
    (r"r[ée]gularit[ée].*fiscale|attestation.*fiscale", "Attestation de régularité fiscale"),
    (r"attestations?\s*d.assurance", "Attestations d'assurance"),
]
_PIECE_DUME = (r"\bDUME\b", "DUME (alternative à DC1/DC2)")

_PIECES_OFFRE = [
    (r"acte d.engagement", "Acte d'Engagement complété, daté et signé"),
    (r"\bBPU\b|bordereau de prix", "BPU — Bordereau de Prix Unitaire"),
    (r"\bDPGF\b|d[ée]composition du prix", "DPGF — Décomposition du Prix Global et Forfaitaire"),
    (r"m[ée]moire technique", "Mémoire technique valant cadre de réponse"),
    (r"\bRIB\b", "RIB de l'entreprise"),
]


def _extract_pieces(
    section: _Section | None, specs: list[tuple[str, str]], type_: TypePiece
) -> list[PieceAFournir]:
    pieces: list[PieceAFournir] = []
    if section is None:
        return pieces
    text = section.text
    for pattern, label in specs:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            # ligne contenant le match -> ref_texte
            ref = next(
                (ln for ln in section.lines if re.search(pattern, ln, re.IGNORECASE)),
                None,
            )
            pieces.append(
                PieceAFournir(nom=label, type=type_, obligatoire=True, ref_texte=ref)
            )
    return pieces


# --- extracteurs de champs --------------------------------------------------

def _extract_objet(lines: list[str], sections: list[_Section]) -> str | None:
    for i, ln in enumerate(lines):
        if "ayant pour objet" in ln.lower():
            after = ln.split(":", 1)[1].strip() if ":" in ln else ""
            # joindre les lignes de continuation (objet souvent coupé en fin de ligne)
            parts = [after] if after else []
            for nxt in lines[i + 1 : i + 4]:
                s = nxt.strip()
                if not s or "mode de passation" in s.lower():
                    break
                parts.append(s)
            objet = " ".join(parts).strip()
            # recoller les césures de fin de ligne : "télé-" + "sécurité" -> "télé-sécurité"
            objet = re.sub(r"(\w)-\s+(\w)", r"\1-\2", objet)
            if objet:
                return objet
    sec = _find(sections, "1.1") or _find(sections, "1")
    if sec and sec.text:
        return sec.text.split("\n")[0]
    return None


def _extract_acheteur(lines: list[str]) -> str | None:
    for i, ln in enumerate(lines):
        if "pouvoir adjudicateur" in ln.lower():
            for nxt in lines[i + 1 : i + 6]:
                s = nxt.strip()
                if s and s[0].isupper() and "universit" in _strip_accents(s).lower():
                    return s
    # repli : raison sociale en capitales (évite de capter une phrase courante)
    m = re.search(r"\b(UNIVERSIT[EÉ]\s+DE\s+[A-ZÉÈÀ ]{3,})", "\n".join(lines))
    return m.group(1).strip() if m else None


def _extract_ccag(lines: list[str]) -> str | None:
    m = re.search(r"CCAG\s*[–\-]?\s*([A-Z]{2,4})", "\n".join(lines))
    return f"CCAG-{m.group(1)}" if m else None


def _extract_cpv(lines: list[str]) -> list[str]:
    found = _CPV_RE.findall("\n".join(lines))
    return sorted(set(found))


def _extract_allotissement(sections: list[_Section]) -> list[Lot]:
    sec = _find(sections, "1.4")
    if sec is None:
        return []
    lots: list[Lot] = []
    lines = [ln.strip() for ln in sec.lines]
    for i, ln in enumerate(lines):
        if re.fullmatch(r"[1-9]", ln):
            # l'intitulé est la 1re ligne non vide suivante non purement numérique
            intitule = next(
                (
                    x
                    for x in lines[i + 1 : i + 4]
                    if x and not re.fullmatch(r"[\d\s,.\-]+", x)
                ),
                None,
            )
            if intitule and not any(lot.numero == int(ln) for lot in lots):
                perimetre = None
                mdept = re.search(r"d[ée]partement\s*(\d{2})", intitule, re.IGNORECASE)
                if mdept:
                    perimetre = f"Département {mdept.group(1)}"
                elif "télé" in intitule.lower() or "tele" in _strip_accents(intitule).lower():
                    perimetre = "Télésécurité"
                lots.append(Lot(numero=int(ln), intitule=intitule, perimetre=perimetre))
    return lots


def _extract_duree(sections: list[_Section]) -> str | None:
    sec = _find(sections, "1.9")
    if sec and sec.text:
        return " ".join(sec.text.split())
    return None


def _extract_visite(sections: list[_Section]) -> Visite:
    sec = _find(sections, "2.6")
    if sec is None:
        return Visite(prevue=False)
    text = sec.text
    low = text.lower()
    if not text or "sans objet" in low:
        return Visite(prevue=False, ref_texte=text or None)
    obligatoire = "obligatoire" in low
    dates: list[DateEcheance] = []
    for ln in sec.lines:
        if re.search(r"pr[ée]vue|aura lieu|organis", ln, re.IGNORECASE) or _DATE_RE.search(ln):
            d = _parse_fr_date(ln)
            if d or "visite" in ln.lower():
                dates.append(
                    DateEcheance(
                        libelle="Visite des locaux",
                        valeur=d,
                        texte_brut=ln.strip() if d is None else None,
                    )
                )
    lieu = None
    for i, ln in enumerate(sec.lines):
        if "lieu de rendez-vous" in ln.lower():
            lieu = " ".join(
                x.strip() for x in sec.lines[i + 1 : i + 4] if x.strip()
            ) or None
            break
    return Visite(
        prevue=True,
        obligatoire=obligatoire,
        dates=[d for d in dates if d.valeur is not None] or dates,
        lieu=lieu,
        ref_texte=text[:500],
    )


def _scope_to_lots(scope: str | None) -> list[int]:
    if not scope:
        return []
    low = scope.lower()
    if "tous" in low:
        return []
    lots = [int(n) for n in re.findall(r"\d+", low)]
    return lots


def _extract_criteres(sections: list[_Section]) -> CriteresNotation | None:
    sec = _find(sections, "6")
    if sec is None:
        return None
    vt = prix = None
    sous: list[SousCritere] = []
    for ln in sec.lines:
        s = ln.strip()
        if not s:
            continue
        m = _SOUSCRIT_RE.match(s)
        if not m:
            continue
        lib = m.group("lib").strip().strip("«»").strip()
        pts = float(m.group("pts"))
        low = _strip_accents(lib).lower()
        if low.startswith("valeur technique"):
            vt = pts
        elif low.startswith("prix"):
            prix = pts
        else:
            sous.append(
                SousCritere(libelle=lib, points=pts, lots=_scope_to_lots(m.group("scope")))
            )
    if vt is None and prix is None and not sous:
        return None
    return CriteresNotation(
        valeur_technique_pts=vt or 0.0, prix_pts=prix or 0.0, sous_criteres=sous
    )


def _extract_modalites(lines: list[str]) -> ModalitesRemise:
    joined = "\n".join(lines)
    plateforme = None
    mplat = re.search(
        r"(achatpublic\.com|[\w.-]+\.nukema\.com|[\w.-]+marches[\w.-]*)",
        joined,
        re.IGNORECASE,
    )
    if mplat:
        plateforme = mplat.group(1)
    signature_formats: list[str] = []
    for fmt in ("XAdES", "CAdES", "PAdES"):
        if re.search(fmt, joined, re.IGNORECASE):
            signature_formats.append(fmt)
    if not signature_formats and re.search(
        r"signature\s+électronique|\bRGS\b", joined, re.IGNORECASE
    ):
        signature_formats.append("Signature électronique (RGS)")
    date_limite = None
    for ln in lines:
        if "date limite" in ln.lower() and "offre" in ln.lower():
            date_limite = DateEcheance(
                libelle="Date limite de dépôt des offres",
                valeur=_parse_fr_date(ln),
                texte_brut=ln.strip(),
            )
            break
    return ModalitesRemise(
        plateforme=plateforme,
        signature_formats=signature_formats,
        date_limite=date_limite,
    )


# --- point d'entrée ---------------------------------------------------------

def parse_rc(path: Path, settings=None) -> RCDocument:
    """Parse un RC (`.doc` ou `.docx`) et retourne un `RCDocument` structuré."""
    path = Path(path)
    warnings: list[str] = []

    ext = path.suffix.lower()
    if ext == ".doc":
        text, method = extract_doc_text(path, settings=settings)
    elif ext == ".docx":
        text, method = load_docx_text(path), ExtractionMethod.DOCX_NATIVE
    else:
        raise ValueError(f"parse_rc attend un .doc ou .docx (reçu {ext}).")

    lines = [ln.rstrip() for ln in text.splitlines()]
    sections = _split_sections(lines)
    if not sections:
        warnings.append("Aucune section numérotée détectée — structure inattendue.")

    sec_cand = _find(sections, "4.1")
    pieces_cand = _extract_pieces(sec_cand, _PIECES_CANDIDATURE, TypePiece.CANDIDATURE)
    dume = _extract_pieces(sec_cand, [_PIECE_DUME], TypePiece.CANDIDATURE)
    for p in dume:
        p.obligatoire = False
        p.alternative = "Remplace DC1+DC2"
    pieces_cand.extend(dume)
    pieces_offre = _extract_pieces(_find(sections, "4.2"), _PIECES_OFFRE, TypePiece.OFFRE)

    criteres = _extract_criteres(sections)
    if criteres is None:
        warnings.append("Barème de notation non détecté (section 6).")
    if not pieces_cand:
        warnings.append("Aucune pièce de candidature détectée (section 4.1).")
    if not pieces_offre:
        warnings.append("Aucune pièce d'offre détectée (section 4.2).")

    return RCDocument(
        objet=_extract_objet(lines, sections),
        acheteur=_extract_acheteur(lines),
        ccag=_extract_ccag(lines),
        cpv=_extract_cpv(lines),
        duree=_extract_duree(sections),
        allotissement=_extract_allotissement(sections),
        visite=_extract_visite(sections),
        pieces_candidature=pieces_cand,
        pieces_offre=pieces_offre,
        criteres=criteres,
        modalites_remise=_extract_modalites(lines),
        source=SourceMeta(
            fichier=path.name, methode_extraction=method, warnings=warnings
        ),
    )
