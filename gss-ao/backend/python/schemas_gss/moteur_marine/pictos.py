"""Pictogrammes du moteur GSS — style « Marine & signal », version 3.

Le NOM du pictogramme reste celui des spécifications GSS (velo, bouclier, talkie…) : seul le dessin change.
Les dessins viennent de Phosphor Icons 2.1.1 (licence MIT, fichier LICENCE-Phosphor-MIT.txt), graisse « bold »,
sur une grille de 256 px.

Version 3 :
  · « route » (horizon routier, lu comme un π) devient le pictogramme Phosphor « path » (itinéraire, circuit) ;
  · pictogrammes LITTÉRAUX selon le libellé de la carte (PAR_LIBELLE) : bus pour les transports en commun,
    borne de recharge pour la flotte électrique, caméra pour la visioconférence, poignée de main pour le respect,
    voiture et passagers pour le covoiturage, maison et ordinateur pour le télétravail… Le libellé n'est pas
    modifié : il sert seulement à choisir le dessin ;
  · les cinq dessins maison (talkie, gilet, compteur, détecteur, nacelle) sont redessinés sur la grille Phosphor
    (256 px, trait de 24 px à bouts ronds, comme la graisse « bold ») ;
  · pictogrammes composés (COMPOSES) : deux dessins Phosphor assemblés sur la même grille.
"""
import json
import os
import re
import unicodedata
from functools import lru_cache

ICI = os.path.dirname(os.path.abspath(__file__))
DOSSIER = os.path.join(ICI, "pictos")
CORRESP = json.load(open(os.path.join(DOSSIER, "correspondance.json"), encoding="utf-8"))
# v3 : l'horizon routier se lisait comme un π ; le chemin balisé dit « itinéraire »
CORRESP["route"] = "path"
# pictogrammes ajoutés (noms du style, utilisés par PAR_LIBELLE et par les gabarits)
CORRESP.update({
    "bus": "bus", "borne": "charging-station", "visio": "video-camera", "poignee": "handshake",
    "chemin": "path", "plan": "map-trifold", "soleil": "sun", "lune": "moon", "cle_plate": "key",
    "covoiturage": "compose:covoiturage", "teletravail": "compose:teletravail", "presse": "clipboard-text",
    "liste": "list-checks", "personne_badge": "identification-badge", "loupe_controle": "magnifying-glass",
    "qualite": "seal-check", "minuteur": "timer", "agent_course": "person-simple-run", "panneau": "signpost",
})
EPAISSEUR = {"thin": 8, "light": 12, "regular": 16, "bold": 24, "duotone": 16, "fill": 16}


def _norm(t):
    t = unicodedata.normalize("NFKD", (t or "").replace("’", "'").lower())
    return re.sub(r"\s+", " ", "".join(c for c in t if not unicodedata.combining(c))).strip()


# Choix du dessin selon le libellé (le texte n'est jamais modifié) : libellé normalisé → nom de pictogramme
PAR_LIBELLE = {
    "transports en commun": "bus",
    "transports en commun et velo": "bus",
    "covoiturage": "covoiturage",
    "visioconference": "visio",
    "teletravail": "teletravail",
    "flotte electrique": "borne",
    "respect": "poignee",
    "mapo": "plan",
    "itineraire": "chemin",
    "circuit convenu": "chemin",
    # II-ENC-10 : un pictogramme par fonction de contrôle (critique : « ajouter un picto par fonction »)
    "responsables de site": "personne_badge",
    "controleurs dedies": "loupe_controle",
    "responsable qualite": "qualite",
    # cartes sans pictogramme dans les spécifications (le dessin seul est ajouté, jamais un mot)
    "affectation sur un autre site": "lieu",
    "telesurveillance": "camera",
}


def choisir(nom, libelle=None):
    """Nom de pictogramme à dessiner : celui des spécifications, précisé par le libellé quand il est connu."""
    k = _norm(libelle)
    if k in PAR_LIBELLE:
        return PAR_LIBELLE[k]
    return nom


# Dessins maison v3 (grille 256, traits de 24 à bouts ronds — même gabarit que Phosphor « bold »)
PERSO = {
    # talkie-walkie : boîtier, antenne, grille du haut-parleur, bouton latéral
    "talkie": ["M96,92 H160 A24,24 0 0 1 184,116 V212 A24,24 0 0 1 160,236 H96 A24,24 0 0 1 72,212 V116 "
               "A24,24 0 0 1 96,92 Z", "M100,92 V22", "M104,136 H152", "M104,168 H152", "M104,200 H128",
               "M72,132 H58"],
    # gilet sans manches : encolure en V, fermeture centrale, deux poches
    "gilet": ["M92,28 L56,48 C66,84 66,112 52,136 V212 A16,16 0 0 0 68,228 H188 A16,16 0 0 0 204,212 V136 "
              "C190,112 190,84 200,48 L164,28 L128,92 Z", "M128,92 V228", "M76,172 H104", "M152,172 H180"],
    # compteur à main : corps rond, fenêtre à trois chiffres, bouton poussoir
    "compteur": ["M128,72 A84,84 0 1 1 127.9,72 Z", "M84,132 H172 A8,8 0 0 1 180,140 V172 A8,8 0 0 1 172,180 H84 "
                 "A8,8 0 0 1 76,172 V140 A8,8 0 0 1 84,132 Z", "M110,132 V180", "M146,132 V180",
                 "M128,72 V48", "M108,36 H148"],
    # détecteur de métaux portatif (raquette) : boucle de détection ovale, long manche, ondes au-dessus
    "detecteur": ["M84,40 H172 A44,44 0 0 1 172,128 H84 A44,44 0 0 1 84,40 Z", "M128,128 V148",
                  "M114,148 H142 A10,10 0 0 1 152,158 V230 A10,10 0 0 1 142,240 H114 A10,10 0 0 1 104,230 V158 "
                  "A10,10 0 0 1 114,148 Z", "M92,14 C116,2 140,2 164,14"],
    # nacelle élévatrice à ciseaux : panier à garde-corps, ciseaux, châssis sur roues
    "nacelle": ["M40,72 H216", "M48,72 V32", "M208,72 V32", "M48,32 H208", "M128,32 V72",
                "M64,72 L192,132", "M192,72 L64,132", "M64,132 L192,192", "M192,132 L64,192",
                "M36,192 H220 V212 H36 Z", "M72,236 A10,10 0 1 1 71.9,236", "M184,236 A10,10 0 1 1 183.9,236"],
}

# Pictogrammes composés : (dessin, échelle, dx, dy) sur la grille 256
COMPOSES = {
    "covoiturage": [("users", 0.50, 0, -66), ("car", 0.66, 0, 44)],
    "teletravail": [("house-simple", 1.0, 0, 0), ("laptop", 0.46, 0, 42)],
}


def _interne(svg):
    m = re.search(r"<svg[^>]*>(.*)</svg>", svg, re.S)
    return m.group(1).strip()


@lru_cache(maxsize=None)
def _phosphor(nom, graisse):
    f = os.path.join(DOSSIER, graisse, nom + ".svg")
    if not os.path.exists(f):
        f = os.path.join(DOSSIER, "bold", nom + ".svg")
    return _interne(open(f, encoding="utf-8").read())


def connu(nom):
    return nom in CORRESP and not nom.startswith("_")


def picto(nom, cx, cy, taille, couleur, graisse="bold", opacite_duo=0.2, couleur_duo=None, libelle=None):
    """Pictogramme centré en (cx, cy), de côté « taille » px, dans la couleur donnée. « libelle » (titre de la
    carte) précise le dessin quand il est connu (PAR_LIBELLE) ; le nom GSS sert sinon."""
    nom = choisir(nom, libelle)
    if not connu(nom):
        raise KeyError(f"pictogramme inconnu : {nom}")
    cible = CORRESP[nom]
    s = taille / 256
    tr = f'transform="translate({cx - taille / 2:.1f},{cy - taille / 2:.1f}) scale({s:.4f})"'
    if cible.startswith("perso:"):
        ep = EPAISSEUR.get(graisse, 24)
        o = "".join(f'<path d="{t}"/>' for t in PERSO[cible[6:]])
        return (f'<g {tr} fill="none" stroke="{couleur}" stroke-width="{ep}" stroke-linecap="round" '
                f'stroke-linejoin="round" data-picto="{nom}">{o}</g>')
    if cible.startswith("compose:"):
        o = []
        for dessin, k, dx, dy in COMPOSES[cible[8:]]:
            o.append(f'<g transform="translate({128 + dx - 128 * k:.1f},{128 + dy - 128 * k:.1f}) scale({k})">'
                     f'{_phosphor(dessin, "bold")}</g>')
        return f'<g {tr} fill="{couleur}" data-picto="{nom}">{"".join(o)}</g>'
    interne = _phosphor(cible, graisse)
    return f'<g {tr} fill="{couleur}" data-picto="{nom}">{interne}</g>'
