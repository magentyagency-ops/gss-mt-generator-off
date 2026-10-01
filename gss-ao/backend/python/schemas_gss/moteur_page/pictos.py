"""Pictogrammes du moteur GSS, par graisse de trait (thin, light, regular, bold, duotone, fill).

Le NOM du pictogramme reste celui des spécifications GSS (velo, bouclier, talkie…) : seul le dessin
change. Les dessins viennent de Phosphor Icons 2.1.1 (licence MIT, fichier LICENCE-Phosphor-MIT.txt),
sur une grille de 256 px. Cinq pictogrammes absents de Phosphor (talkie, gilet, compteur, detecteur,
nacelle) sont dessinés ici au même gabarit (traits à bouts ronds de la même épaisseur).
"""
import json
import os
import re
from functools import lru_cache

ICI = os.path.dirname(os.path.abspath(__file__))
DOSSIER = os.path.join(ICI, "pictos")
CORRESP = json.load(open(os.path.join(DOSSIER, "correspondance.json"), encoding="utf-8"))
EPAISSEUR = {"thin": 8, "light": 12, "regular": 16, "bold": 24, "duotone": 16, "fill": 16}

# Dessins maison (grille 256, traits) : liste de tracés + zone de remplissage pour la version « duotone ».
PERSO = {
    "talkie": {
        "traits": ["M92,92 H164 A20,20 0 0 1 184,112 V212 A20,20 0 0 1 164,232 H92 A20,20 0 0 1 72,212 V112 A20,20 0 0 1 92,92 Z",
                   "M100,92 V28", "M104,136 H152", "M104,164 H152", "M104,192 H132"],
        "zone": "M92,92 H164 A20,20 0 0 1 184,112 V212 A20,20 0 0 1 164,232 H92 A20,20 0 0 1 72,212 V112 A20,20 0 0 1 92,92 Z",
    },
    "gilet": {
        "traits": ["M96,32 L60,52 C70,88 70,118 58,138 L58,224 H198 L198,138 C186,118 186,88 196,52 L160,32 L128,84 Z",
                   "M128,84 V224", "M80,180 H108", "M148,180 H176"],
        "zone": "M96,32 L60,52 C70,88 70,118 58,138 L58,224 H198 L198,138 C186,118 186,88 196,52 L160,32 L128,84 Z",
    },
    "compteur": {
        "traits": ["M128,76 A76,76 0 1 1 127.9,76 Z", "M100,132 H156 A8,8 0 0 1 164,140 V164 A8,8 0 0 1 156,172 H100 A8,8 0 0 1 92,164 V140 A8,8 0 0 1 100,132 Z",
                   "M112,76 V52 A16,16 0 0 1 144,52 V76", "M104,200 H152"],
        "zone": "M128,76 A76,76 0 1 1 127.9,76 Z",
    },
    "detecteur": {
        "traits": ["M100,24 H156 A28,28 0 0 1 184,52 V104 A28,28 0 0 1 156,132 H100 A28,28 0 0 1 72,104 V52 A28,28 0 0 1 100,24 Z",
                   "M116,132 V224 A12,12 0 0 0 140,224 V132", "M210,52 C222,68 222,92 210,108", "M36,108 C24,92 24,68 36,52"],
        "zone": "M100,24 H156 A28,28 0 0 1 184,52 V104 A28,28 0 0 1 156,132 H100 A28,28 0 0 1 72,104 V52 A28,28 0 0 1 100,24 Z",
    },
    "nacelle": {
        "traits": ["M40,176 H184 V204 H40 Z", "M72,220 A12,12 0 1 1 71.9,220", "M160,220 A12,12 0 1 1 159.9,220",
                   "M120,176 L176,92", "M156,44 H228 V92 H156 Z", "M168,44 V28"],
        "zone": "M156,44 H228 V92 H156 Z",
    },
}


def _interne(svg):
    m = re.search(r"<svg[^>]*>(.*)</svg>", svg, re.S)
    return m.group(1).strip()


@lru_cache(maxsize=None)
def _phosphor(nom, graisse):
    f = os.path.join(DOSSIER, graisse, nom + ".svg")
    return _interne(open(f, encoding="utf-8").read())


def connu(nom):
    return nom in CORRESP and not nom.startswith("_")


def picto(nom, cx, cy, taille, couleur, graisse="regular", opacite_duo=0.2, couleur_duo=None):
    """Pictogramme centré en (cx, cy), de côté « taille » px, dans la couleur donnée."""
    if not connu(nom):
        raise KeyError(f"pictogramme inconnu : {nom}")
    cible = CORRESP[nom]
    s = taille / 256
    tr = f'transform="translate({cx - taille / 2:.1f},{cy - taille / 2:.1f}) scale({s:.4f})"'
    if cible.startswith("perso:"):
        d = PERSO[cible[6:]]
        ep = EPAISSEUR.get(graisse, 16)
        o = []
        if graisse in ("duotone", "fill"):
            op = 1 if graisse == "fill" else opacite_duo
            o.append(f'<path d="{d["zone"]}" fill="{couleur_duo or couleur}" opacity="{op}"/>')
        for t in d["traits"]:
            o.append(f'<path d="{t}"/>')
        return (f'<g {tr} fill="none" stroke="{couleur}" stroke-width="{ep}" stroke-linecap="round" '
                f'stroke-linejoin="round" data-picto="{nom}">' + "".join(o) + "</g>")
    interne = _phosphor(cible, graisse)
    if graisse == "duotone":
        interne = interne.replace('opacity="0.2"', f'opacity="{opacite_duo}"' + (f' fill="{couleur_duo}"' if couleur_duo else ""))
    return f'<g {tr} fill="{couleur}" data-picto="{nom}">{interne}</g>'
