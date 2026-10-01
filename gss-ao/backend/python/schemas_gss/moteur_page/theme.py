"""Thème courant du moteur de schémas GSS au format page (A4 portrait).

Un thème = les jetons d'un style de themes/themes.json (couleurs par rôle, polices, cartes, bandeaux,
flèches, liens, numéros, puces, coches, pictogrammes, épaisseurs, arrondis, ombres) + un format de toile.
Le moteur lit TOUJOURS le thème courant au moment du dessin : changer de thème ne touche à aucun texte.

    from moteur_page import theme
    theme.utiliser("marine")            # style (clé de themes.json) ; format « page » = A4 portrait
    theme.utiliser()                    # style par défaut de themes.json (ou variable GSS_THEME)

Le choix du thème pour l'application (variable GSS_THEME, retour arrière « gss-2026-09 ») est fait par
themes_gss.py ; ce module ne sert que les styles dessinés par ce moteur.
"""
import json
import os
from functools import lru_cache

ICI = os.path.dirname(os.path.abspath(__file__))
MOTEUR = os.path.dirname(ICI)          # python/schemas_gss : les chemins de polices de themes.json en partent
FICHIER_THEMES = os.environ.get("GSS_THEMES_JSON") or os.path.join(MOTEUR, "themes", "themes.json")


def _lum(h):
    h = h.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4  # noqa: E731
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


class Role:
    __slots__ = ("nom", "fonce", "vif", "clair", "sur_fonce", "sens")

    def __init__(self, nom, d):
        self.nom = nom
        self.fonce, self.vif, self.clair = d["fonce"], d["vif"], d["clair"]
        self.sur_fonce = d["sur_fonce"]
        self.sens = d.get("role_gss", "")


class Theme:
    def __init__(self, ident, d, fmt, formats):
        self.id = ident
        self.d = d
        self.nom = d["nom"]
        self.format = fmt
        self.W, self.H = formats[fmt]["W"], formats[fmt]["H"]
        self.c = d["couleurs"]
        self.roles = {k: Role(k, v) for k, v in d["roles"].items()}
        self.typo = d["typo"]
        self.carte = d["carte"]
        self.fleches = d["fleches"]
        self.liens = d["liens"]
        self.bandeau = d["bandeau"]
        self.etiquettes = d["etiquettes"]
        self.numeros = d["numeros"]
        self.puces = d["puces"]
        self.coche = d["coche"]
        self.motif = d.get("motif_fond")
        self.polices = d["polices"]

    # ── couleurs ──
    def role(self, nom):
        return self.roles.get(nom) or self.roles["creme"]

    @property
    def sombre(self):
        """Vrai si le fond du schéma est foncé (style « sombre »)."""
        return _lum(self.c["fond_schema"]) < 0.08

    # ── polices ──
    def famille(self, usage):
        return self.polices[usage]["famille"]

    def fichier_police(self, usage, poids):
        f = self.polices[usage]["fichiers"]
        dispo = sorted(int(p) for p in f)
        p = min(dispo, key=lambda w: (abs(w - poids), -w))
        return os.path.join(MOTEUR, f[str(p)]), p

    def css_famille(self, usage):
        p = self.polices[usage]
        return f"'{p['famille']}', {p.get('repli', 'sans-serif')}"


@lru_cache(maxsize=None)
def _charger():
    d = json.load(open(FICHIER_THEMES, encoding="utf-8"))
    return d["styles"], d["formats"], d.get("style_par_defaut", "marine")


def styles():
    return list(_charger()[0].keys())


def par_defaut():
    st, _, defaut = _charger()
    v = os.environ.get("GSS_THEME")
    return v if v in st else defaut


T = None  # thème courant


def utiliser(ident=None, fmt="page"):
    """Active un style (clé de themes.json ; à défaut le style par défaut) et un format de toile."""
    global T
    st, fm, _ = _charger()
    ident = ident or par_defaut()
    if ident not in st:
        raise KeyError(f"style inconnu : {ident} (styles : {', '.join(st)})")
    T = Theme(ident, st[ident], fmt, fm)
    return T


def courant():
    if T is None:
        raise RuntimeError("aucun thème actif : appeler theme.utiliser(style)")
    return T
