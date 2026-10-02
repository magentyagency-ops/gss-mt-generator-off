"""Moteur des schémas GSS — primitives de dessin PARAMÉTRÉES PAR UN THÈME (format page A4 portrait).

Version retravaillée de backend/python/schemas_gss/gss_lib.py :
  · toutes les couleurs, polices, épaisseurs, arrondis, ombres, flèches, numéros, puces, coches et
    pictogrammes viennent du thème courant (theme.utiliser(style)) ; aucune valeur de style en dur ;
  · les TEXTES ne sont jamais modifiés : mêmes chaînes, mêmes espaces insécables (insec), mêmes
    capitales que le moteur d'origine (étiquettes en capitales, etc.) ; seule leur mise en forme change ;
  · chaque ligne de texte porte data-b (numéro de bloc : un titre, un paragraphe, un libellé) et est
    inscrite dans le registre du schéma (position, taille, couleur, fond) : le contrôle automatique vérifie
    les chaînes, les débordements, les chevauchements et les contrastes ;
  · le texte est mesuré avec la vraie police du thème : tout débordement lève Deborde ;
  · une même taille de texte est retenue pour toutes les cartes d'un schéma (ajuster_cartes) ;
  · identifiants SVG préfixés : plusieurs schémas peuvent cohabiter dans une même page HTML.
"""
import math
import os
from functools import lru_cache

from PIL import ImageFont

from . import theme
from .pictos import picto

MARGE_MESURE = 1.03   # marge de sécurité : mesure Pillow sans crénage avancé ≈ rendu navigateur


class Deborde(Exception):
    pass


def T():
    return theme.courant()


# ── Mesure du texte ───────────────────────────────────────────────────────────
# Moteur de mise en forme simple imposé : c'est celui du Mac (Pillow sans raqm). Un Pillow de serveur Linux avec raqm
# mesurerait sinon les textes autrement, et les contrôles de débordement faits sur le Mac ne vaudraient plus.
MOTEUR_TEXTE_SIMPLE = ImageFont.Layout.BASIC if hasattr(ImageFont, "Layout") else ImageFont.LAYOUT_BASIC  # Pillow < 9.1 : constante


@lru_cache(maxsize=None)
def _pf(chemin, taille4):
    return ImageFont.truetype(chemin, max(1, taille4), layout_engine=MOTEUR_TEXTE_SIMPLE)


def police(usage, taille, poids):
    chemin, _ = T().fichier_police(usage, poids)
    return _pf(chemin, max(1, round(taille * 4)))


def _ls(usage, taille):
    """Interlettrage (px) : jeton en em, appliqué aux titres seulement."""
    return T().typo.get("interlettrage_titre", 0) * taille if usage == "titre" else 0


def largeur(t, taille, poids=400, usage="texte"):
    if not t:
        return 0.0
    return police(usage, taille, poids).getlength(t) / 4 * MARGE_MESURE + _ls(usage, taille) * max(0, len(t) - 1)


def couper(t, taille, poids, maxw, usage="texte"):
    """Retour à la ligne glouton sur les espaces (les insécables restent collées) ; None si un mot dépasse."""
    lignes, cour = [], ""
    for mot in t.split(" "):
        if not mot:
            continue
        essai = f"{cour} {mot}".strip()
        if largeur(essai, taille, poids, usage) <= maxw:
            cour = essai
        else:
            if not cour or largeur(mot, taille, poids, usage) > maxw:
                return None
            lignes.append(cour)
            cour = mot
    if cour:
        lignes.append(cour)
    return lignes


def esc(t):
    return str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def insec(t):
    """Espaces insécables typographiques — exactement la même règle que le moteur d'origine."""
    if not t:
        return t
    return t.replace("« ", "« ").replace(" »", " »").replace(" :", " :").replace(" ?", " ?")


def clamp(v, a, b):
    return max(a, min(b, v))


# ── Document ──────────────────────────────────────────────────────────────────
_ETAT = {"n": 0, "svg": None, "zoom": 1.0, "etirer": 0.0}


def courant():
    return _ETAT["svg"]


class Svg:
    """Toile d'un schéma. Tient le registre des textes (contrôles) et les définitions (filtres, motifs)."""

    def __init__(self, W=None, H=None):
        th = T()
        # Zoom (en_grand, gabarits.py) : toile réduite de même proportion, affichée à la même taille → dessin agrandi.
        self.W = W or th.W / _ETAT["zoom"]
        self.H = H or th.H / _ETAT["zoom"]
        _ETAT["n"] += 1
        self.p = f"s{_ETAT['n']}"
        self.el, self.defs, self.textes = [], {}, []
        self.bloc = 0
        self.zones = []          # cadres des cartes (contrôle des chevauchements de cartes)
        _ETAT["svg"] = self

    def nouveau_bloc(self):
        self.bloc += 1
        return self.bloc

    def ident(self, base):
        return f"{self.p}-{base}"

    def defn(self, cle, contenu):
        self.defs.setdefault(cle, contenu)
        return self.ident(cle)

    def add(self, *e):
        self.el.extend(x for x in e if x)
        return self

    def rendu(self, fond=True):
        th = T()
        W, H = self.W, self.H
        c = th.c
        tete = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:g} {H:g}" width="{W:g}" height="{H:g}" '
                f'font-family="{esc(th.css_famille("texte"))}" data-style="{th.id}" data-format="{th.format}">')
        corps = []
        if fond:
            corps.append(f'<rect width="{W:g}" height="{H:g}" fill="{c["fond_schema"]}"/>')
            if th.motif == "points":
                pid = self.defn("pt", "")
                self.defs["pt"] = (f'<pattern id="{pid}" width="24" height="24" patternUnits="userSpaceOnUse">'
                                   f'<circle cx="12" cy="12" r="1.2" fill="#1A2744"/></pattern>')
                corps.append(f'<rect width="{W:g}" height="{H:g}" fill="url(#{pid})"/>')
        d = f"<defs>{''.join(v for v in self.defs.values() if v)}</defs>\n" if any(self.defs.values()) else ""
        return tete + "\n" + d + "\n".join(corps + self.el) + "\n</svg>\n"


def nouveau_bloc():
    s = courant()
    return s.nouveau_bloc() if s else 0


# ── Texte ─────────────────────────────────────────────────────────────────────
def texte(x, y, t, taille, poids=None, couleur=None, ancre="middle", usage="texte", extra="", bloc=None, fond=None):
    th = T()
    if poids is None:
        poids = {"titre": th.typo["titre_graisse"], "chiffres": th.typo["chiffres_graisse"]}.get(usage, th.typo["texte_graisse"])
    couleur = couleur or th.c["encre"]
    _, p_reel = th.fichier_police(usage, poids)
    ls = _ls(usage, taille)
    lsa = f' letter-spacing="{ls:.2f}"' if ls else ""
    b = f' data-b="{bloc}"' if bloc is not None else ""
    s = courant()
    if s is not None:
        lw = largeur(t, taille, p_reel, usage)
        x0 = {"start": x, "middle": x - lw / 2, "end": x - lw}[ancre]
        s.textes.append({"t": t, "x0": x0, "x1": x0 + lw, "y0": y - taille * 0.78, "y1": y + taille * 0.22,
                         "taille": taille, "poids": p_reel, "couleur": couleur,
                         "fond": fond or th.c["fond_schema"], "b": bloc})
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-family="{esc(th.css_famille(usage))}" font-size="{taille:.1f}" '
            f'font-weight="{p_reel}" fill="{couleur}" text-anchor="{ancre}"{lsa}{b}{extra}>{esc(t)}</text>')


def texte_seul(x, y, t, taille, poids=None, couleur=None, ancre="middle", usage="texte", extra="", fond=None):
    """Texte d'une ligne formant un bloc à lui seul (valeur, numéro, libellé)."""
    return texte(x, y, t, taille, poids, couleur, ancre, usage, extra, bloc=nouveau_bloc(), fond=fond)


def preparer(titre, corps, w, t, b, puces=False, usage_titre="titre", t_poids=None, b_poids=None, maj=False,
             lignes_max_titre=4, n_lt=None):
    """Coupe le titre et le corps aux tailles nominales t (titre) et b (corps).
    Renvoie la mise en lignes et la hauteur totale, ou None si un mot ne tient pas dans la largeur."""
    th = T()
    ty = th.typo
    tt = t * (ty.get("echelle_titre", 1.0) if usage_titre == "titre" else 1.0)
    bb = b * ty.get("echelle_texte", 1.0)
    t_poids = t_poids or (ty["titre_graisse"] if usage_titre == "titre" else 600)
    b_poids = b_poids or ty["texte_graisse"]
    if isinstance(corps, str):
        corps = [corps]
    corps = [insec(c) for c in (corps or ()) if c]
    titre = insec(titre)
    ta = titre.upper() if (titre and maj) else titre
    tl = couper(ta, tt, t_poids, w, usage_titre) if ta else []
    if tl is None or len(tl) > lignes_max_titre:
        return None
    ind = bb * 1.25 if puces else 0
    cl = []
    for p in corps:
        r = couper(p, bb, b_poids, w - ind, "texte")
        if r is None:
            return None
        cl.append(r)
    ht = tt * ty.get("interligne_titre", 1.15)
    hb = bb * ty.get("interligne_texte", 1.34)
    nlt = max(len(tl), n_lt or 0) if tl else 0
    gap = bb * 0.55 if (tl and cl) else 0
    gp = bb * 0.45 if puces else bb * 0.35
    total = nlt * ht + gap + sum(len(r) for r in cl) * hb + max(0, len(cl) - 1) * gp
    return {"tl": tl, "cl": cl, "tt": tt, "bb": bb, "ht": ht, "hb": hb, "gap": gap, "gp": gp, "nlt": nlt,
            "total": total, "ind": ind, "t_poids": t_poids, "b_poids": b_poids, "usage_titre": usage_titre,
            "puces": puces}


def dessiner(x, y, w, h, P, align="start", couleur=None, couleur_titre=None, v_align="top", puce_couleur=None,
             fond=None, titre_extra=""):
    """Dessine une mise en lignes préparée dans la boîte (x, y, w, h)."""
    th = T()
    couleur = couleur or th.c["encre_2"]
    couleur_titre = couleur_titre or th.c["encre"]
    yy = y + {"top": 0, "middle": (h - P["total"]) / 2, "bottom": h - P["total"]}[v_align]
    ax = {"middle": x + w / 2, "start": x, "end": x + w}[align]
    out = []
    tt, bb = P["tt"], P["bb"]
    if P["tl"]:
        bt = nouveau_bloc()
        for i, l in enumerate(P["tl"]):
            base = yy + P["ht"] * i + (P["ht"] - tt) / 2 + tt * 0.80
            out.append(texte(ax, base, l, tt, P["t_poids"], couleur_titre, align, P["usage_titre"], titre_extra,
                             bloc=bt, fond=fond))
        yy += P["nlt"] * P["ht"] + P["gap"]
    for k, r in enumerate(P["cl"]):
        bb_ = nouveau_bloc()
        if P["puces"]:
            out.append(puce(x + bb * 0.32, yy + P["hb"] * 0.5 + bb * 0.02, bb, puce_couleur))
        for i, l in enumerate(r):
            base = yy + (P["hb"] - bb) / 2 + bb * 0.80
            out.append(texte((x + P["ind"]) if P["puces"] else ax, base, l, bb, P["b_poids"], couleur,
                             "start" if P["puces"] else align, "texte", bloc=bb_, fond=fond))
            yy += P["hb"]
        yy += P["gp"]
    return "\n".join(out)


def bloc_texte(x, y, w, h, titre=None, corps=(), puces=False, align="middle", couleur=None, couleur_titre=None,
               t_max=24, t_min=14, maj=False, b_ratio=0.78, b_min=17, t_poids=None, b_poids=None,
               lignes_max_titre=4, v_align="middle", puce_couleur=None, usage_titre="titre", fond=None, t=None, b=None):
    """Titre + corps dans la boîte : tailles fixes (t, b) ou plus grande taille qui tient (t_max → t_min)."""
    if t is not None:
        P = preparer(titre, corps, w, t, b if b is not None else max(b_min, t * b_ratio), puces, usage_titre,
                     t_poids, b_poids, maj, lignes_max_titre)
        if P is None or P["total"] > h + 0.5:
            raise Deborde(f"texte trop long pour {w:.0f}×{h:.0f} : {titre!r} {corps!r}")
    else:
        P = None
        tt = t_max
        while tt >= t_min - 1e-9:
            bb = max(b_min, round(tt * b_ratio * 2) / 2)
            P = preparer(titre, corps, w, tt, bb, puces, usage_titre, t_poids, b_poids, maj, lignes_max_titre)
            if P is not None and P["total"] <= h:
                break
            P = None
            tt -= 0.5
        if P is None:
            raise Deborde(f"texte trop long pour {w:.0f}×{h:.0f} : {titre!r} {corps!r}")
    return dessiner(x, y, w, h, P, align, couleur, couleur_titre, v_align, puce_couleur, fond)


def ajuster(essai, t_max, t_min, b_ratio=0.72, b_min=17, pas=0.5, quoi="", b_max=29):
    """essai(t, b) -> vrai si tout tient. Renvoie la plus grande taille (t, b) qui tient.
    Corps de texte : b = t × b_ratio, borné entre b_min et b_max (≈ 8,7 à 15 pt sur la page)."""
    t = t_max
    while t >= t_min - 1e-9:
        b = min(b_max, max(b_min, round(t * b_ratio * 2) / 2))
        if essai(t, b):
            return t, b
        t -= pas
    raise Deborde(f"contenu trop long ({quoi}) même à {t_min}px")


# ── Formes ────────────────────────────────────────────────────────────────────
def chemin_arrondi(x, y, w, h, r_hg=0, r_hd=0, r_bd=0, r_bg=0):
    m = min(w, h) / 2
    a, b, c, d = (min(r, m) for r in (r_hg, r_hd, r_bd, r_bg))
    return (f"M{x + a:.1f},{y:.1f} H{x + w - b:.1f} " + (f"A{b:.1f},{b:.1f} 0 0 1 {x + w:.1f},{y + b:.1f} " if b else "")
            + f"V{y + h - c:.1f} " + (f"A{c:.1f},{c:.1f} 0 0 1 {x + w - c:.1f},{y + h:.1f} " if c else "")
            + f"H{x + d:.1f} " + (f"A{d:.1f},{d:.1f} 0 0 1 {x:.1f},{y + h - d:.1f} " if d else "")
            + f"V{y + a:.1f} " + (f"A{a:.1f},{a:.1f} 0 0 1 {x + a:.1f},{y:.1f} " if a else "") + "Z")


def rect(x, y, w, h, fill, rx=0, stroke=None, sw=0, extra=""):
    s = f' stroke="{stroke}" stroke-width="{sw:g}"' if stroke and sw else ""
    return (f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{min(rx, w / 2, h / 2):.1f}" '
            f'fill="{fill}"{s}{extra}/>')


def ombre(x, y, w, h, rx, force=1.0, forme="rect"):
    """Ombre douce selon le jeton « ombre » du thème (flou gaussien appliqué à une silhouette séparée :
    le texte et les formes restent vectoriels)."""
    o = T().carte.get("ombre")
    if not o or force <= 0:
        return ""
    s = courant()
    fl = o["flou"] * force
    fid = s.defn(f"om{int(fl * 10)}", "")
    s.defs[f"om{int(fl * 10)}"] = (f'<filter id="{fid}" x="-25%" y="-25%" width="150%" height="160%">'
                                   f'<feGaussianBlur stdDeviation="{fl / 2.2:.1f}"/></filter>')
    dy = o["dy"] * force
    if forme == "cercle":
        return (f'<circle cx="{x + w / 2:.1f}" cy="{y + h / 2 + dy:.1f}" r="{w / 2:.1f}" fill="{o["couleur"]}" '
                f'opacity="{o["opacite"] * 1.6:.3f}" filter="url(#{fid})"/>')
    return rect(x + 2, y + dy, w - 4, h, o["couleur"], rx, extra=f' opacity="{o["opacite"] * 1.6:.3f}" filter="url(#{fid})"')


def surface(x, y, w, h, rx=None, ombre_force=1.0, fill=None, bordure=True):
    th = T()
    ca = th.carte
    rx = ca["rayon"] if rx is None else rx
    fill = fill or th.c[ca.get("remplissage", "carte_fond")]
    sw = ca.get("bordure", 0) if bordure else 0
    return ombre(x, y, w, h, rx, ombre_force) + rect(x, y, w, h, fill, rx, ca.get("couleur_bordure"), sw)


def zone(x, y, w, h):
    """Inscrit un cadre de carte dans le registre (contrôle des chevauchements)."""
    s = courant()
    if s is not None:
        s.zones.append((x, y, x + w, y + h))


# ── Pictogrammes et pastilles ─────────────────────────────────────────────────
def glyphe(nom, cx, cy, taille, couleur, graisse=None):
    th = T()
    g = graisse or th.carte["icone"]["graisse"]
    op = 0.30 if th.sombre else 0.22
    return picto(nom, cx, cy, taille, couleur, g, op)


def pastille(cx, cy, nom, role="creme", s=56, mode=None, sur=None):
    """Pictogramme dans son contenant (côté s), selon le mode du thème."""
    th = T()
    R = th.role(role)
    mode = mode or th.carte["icone"]["mode"]
    g = th.carte["icone"]["graisse"]
    r = s / 2
    if mode == "dans_bande":
        return glyphe(nom, cx, cy, s * 0.92, R.sur_fonce, g)
    if mode == "carre":
        return rect(cx - r, cy - r, s, s, R.fonce, s * 0.16) + glyphe(nom, cx, cy, s * 0.66, R.sur_fonce, g)
    if mode == "nu":
        return glyphe(nom, cx, cy, s * 1.0, R.vif, g)
    if mode == "pastille_teinte":
        return (f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{R.clair}"/>'
                + glyphe(nom, cx, cy, s * 0.62, R.fonce, g))
    if mode == "tuile_contour":
        return (rect(cx - r, cy - r, s, s, R.clair, s * 0.24, R.vif, 1.5)
                + glyphe(nom, cx, cy, s * 0.64, R.vif, g))
    if mode == "disque_plein":
        return (f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r + s * 0.09:.1f}" fill="{R.clair}"/>'
                f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{R.fonce}"/>'
                + glyphe(nom, cx, cy, s * 0.6, R.sur_fonce, g))
    raise ValueError(mode)


# ── Numéros, puces, coches ────────────────────────────────────────────────────
def taille_numero(taille):
    """Encombrement (côté) d'un numéro de taille de police « taille » dans le style courant."""
    mode = T().numeros["mode"]
    return {"carre": taille * 1.9, "grand": taille * 1.9, "cercle_contour": taille * 2.1,
            "mono": taille * 2.1, "serif": taille * 2.2}[mode]


def numero(cx, cy, t, role=None, taille=20, sur=None):
    """Numéro d'ordre (chaîne exacte fournie : « 01 », « 3 »…) dans le style du thème, centré en (cx, cy)."""
    th = T()
    mode = th.numeros["mode"]
    R = th.role(role) if role else None
    sur = sur or th.c["fond_schema"]
    o = []
    if mode == "carre":
        s = taille * 1.9
        o.append(rect(cx - s / 2, cy - s / 2, s, s, th.c["accent_texte"], 4))
        o.append(texte_seul(cx, cy + taille * 0.36, t, taille, 700, "#FFFFFF", "middle", "chiffres", fond=th.c["accent_texte"]))
    elif mode == "grand":
        tg = taille * 1.75
        o.append(texte_seul(cx, cy + tg * 0.36, t, tg, 700, th.c["accent"], "middle", "chiffres", fond=sur))
    elif mode == "cercle_contour":
        r = taille * 1.05
        o.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{th.c["surface"]}" stroke="{th.c["accent"]}" stroke-width="2.4"/>')
        o.append(texte_seul(cx, cy + taille * 0.35, t, taille, 700, th.c["accent_texte"], "middle", "chiffres", fond=th.c["surface"]))
    elif mode == "mono":
        r = taille * 1.05
        col = R.vif if R else th.c["accent"]
        o.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r + 4:.1f}" fill="{col}" opacity="0.14"/>')
        o.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{th.c["fond_schema"]}" stroke="{col}" stroke-width="2"/>')
        o.append(texte_seul(cx, cy + taille * 0.35, t, taille, 700, col, "middle", "chiffres", fond=th.c["fond_schema"]))
    elif mode == "serif":
        r = taille * 1.1
        o.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{th.c["surface"]}" stroke="{th.c["accent"]}" stroke-width="1.8"/>')
        o.append(texte_seul(cx, cy + taille * 0.36, t, taille * 1.05, 600, th.c["accent_texte"], "middle", "chiffres", fond=th.c["surface"]))
    else:
        raise ValueError(mode)
    return "".join(o)


def puce(cx, cy, taille, couleur=None):
    th = T()
    c = couleur or th.c["accent"]
    f = th.puces["forme"]
    s = taille * 0.36
    if f == "carre":
        return rect(cx - s / 2, cy - s / 2, s, s, c, 1)
    if f == "tiret":
        return rect(cx - s * 0.75, cy - 1.6, s * 1.5, 3.2, c, 0)
    if f == "losange":
        return (f'<path d="M{cx:.1f},{cy - s * 0.7:.1f} L{cx + s * 0.7:.1f},{cy:.1f} L{cx:.1f},{cy + s * 0.7:.1f} '
                f'L{cx - s * 0.7:.1f},{cy:.1f} Z" fill="{c}"/>')
    return f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{s * 0.5:.1f}" fill="{c}"/>'


def coche(cx, cy, s=30, role="vert"):
    """Coche de liste de contrôle centrée en (cx, cy), côté s."""
    th = T()
    R = th.role(role)
    mode = th.coche["mode"]
    x, y = cx - s / 2, cy - s / 2
    trace = (f'<path d="M{x + s * 0.27:.1f},{y + s * 0.53:.1f} L{x + s * 0.44:.1f},{y + s * 0.70:.1f} '
             f'L{x + s * 0.75:.1f},{y + s * 0.33:.1f}" fill="none" stroke="{{c}}" stroke-width="{max(2.4, s * 0.11):.1f}" '
             f'stroke-linecap="round" stroke-linejoin="round"/>')
    if mode == "plein":
        return rect(x, y, s, s, R.fonce, s * 0.16) + trace.replace("{c}", R.sur_fonce)
    if mode == "trait":
        return (rect(x, y, s, s, "none", 0, R.vif, 2.2) + trace.replace("{c}", R.vif))
    if mode == "teinte":
        return f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{s / 2:.1f}" fill="{R.clair}"/>' + trace.replace("{c}", R.fonce)
    if mode == "contour":
        return (f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{s / 2:.1f}" fill="{R.clair}" stroke="{R.vif}" stroke-width="1.8"/>'
                + trace.replace("{c}", R.vif))
    if mode == "disque":
        return f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{s / 2:.1f}" fill="{R.fonce}"/>' + trace.replace("{c}", R.sur_fonce)
    raise ValueError(mode)


# ── Flèches, liens, nœuds ─────────────────────────────────────────────────────
def _pointe(x, y, ang, couleur, taille, ep):
    th = T()
    ca, sa = math.cos(ang), math.sin(ang)
    bx, by = x - taille * ca, y - taille * sa
    px, py = -sa, ca
    lx, ly = bx + px * taille * 0.6, by + py * taille * 0.6
    rx_, ry_ = bx - px * taille * 0.6, by - py * taille * 0.6
    if th.fleches["pointe"] == "triangle":
        return (f'<path d="M{x:.1f},{y:.1f} L{lx:.1f},{ly:.1f} L{rx_:.1f},{ry_:.1f} Z" fill="{couleur}" '
                f'stroke="{couleur}" stroke-width="1.2" stroke-linejoin="round"/>')
    return (f'<path d="M{lx:.1f},{ly:.1f} L{x:.1f},{y:.1f} L{rx_:.1f},{ry_:.1f}" fill="none" stroke="{couleur}" '
            f'stroke-width="{ep:.1f}" stroke-linecap="round" stroke-linejoin="round"/>')


def trait(pts, ep=None, pointe=True, couleur=None, tirets=False, lueur=None, taille=None):
    """Ligne brisée ; avec pointe = flèche de lecture (couleur et forme du thème)."""
    th = T()
    f = th.fleches
    couleur = couleur or f["couleur"]
    ep = ep or f["epaisseur"]
    taille = taille or f["taille"]
    pts = list(pts)
    if pointe:
        (x1, y1), (x2, y2) = pts[-2], pts[-1]
        ang = math.atan2(y2 - y1, x2 - x1)
        recul = taille * (0.8 if f["pointe"] == "triangle" else 0.1)
        pts_l = pts[:-1] + [(x2 - recul * math.cos(ang), y2 - recul * math.sin(ang))]
    else:
        pts_l = pts
    d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts_l)
    t = ' stroke-dasharray="8 7"' if tirets else ""
    o = []
    if (lueur if lueur is not None else th.carte.get("lueur")) and not tirets:
        o.append(f'<path d="{d}" fill="none" stroke="{couleur}" stroke-width="{ep * 4:.1f}" stroke-linecap="round" '
                 f'stroke-linejoin="round" opacity="0.13"/>')
    o.append(f'<path d="{d}" fill="none" stroke="{couleur}" stroke-width="{ep:.1f}" stroke-linejoin="round" '
             f'stroke-linecap="round"{t}/>')
    if pointe:
        (x1, y1), (x2, y2) = pts[-2], pts[-1]
        o.append(_pointe(x2, y2, math.atan2(y2 - y1, x2 - x1), couleur, taille, ep))
    return "".join(o)


def fleche(x1, y1, x2, y2, ep=None, couleur=None, tirets=False, taille=None):
    return trait([(x1, y1), (x2, y2)], ep, True, couleur, tirets, taille=taille)


def lien(pts, couleur=None, tirets=False, ep=None):
    """Trait de liaison sans pointe (couleur « liens » du thème)."""
    th = T()
    return trait(pts, ep or th.liens["epaisseur"], False, couleur or th.liens["couleur"], tirets, lueur=False)


def noeud(cx, cy, r=None, couleur=None, fond=None):
    th = T()
    r = r or th.liens["noeud"]
    couleur = couleur or th.liens["couleur"]
    return (f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r + 3:.1f}" fill="{fond or th.c["fond_schema"]}"/>'
            f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{couleur}"/>')


def chevron_bas(cx, cy, taille=22, couleur=None, ep=None):
    """Chevron de lecture pointant vers le bas (entre deux étapes empilées)."""
    th = T()
    couleur = couleur or th.fleches["couleur"]
    ep = ep or max(3, th.fleches["epaisseur"] * 1.1)
    if th.fleches["pointe"] == "triangle":
        return (f'<path d="M{cx - taille * 0.75:.1f},{cy - taille * 0.38:.1f} L{cx + taille * 0.75:.1f},{cy - taille * 0.38:.1f} '
                f'L{cx:.1f},{cy + taille * 0.48:.1f} Z" fill="{couleur}" stroke="{couleur}" stroke-width="1.5" stroke-linejoin="round"/>')
    return (f'<path d="M{cx - taille * 0.75:.1f},{cy - taille * 0.32:.1f} L{cx:.1f},{cy + taille * 0.40:.1f} '
            f'L{cx + taille * 0.75:.1f},{cy - taille * 0.32:.1f}" fill="none" stroke="{couleur}" stroke-width="{ep:.1f}" '
            f'stroke-linecap="round" stroke-linejoin="round"/>')


# ── Étiquette (décision posée sur une flèche) ─────────────────────────────────
def etiquette_dim(t, taille=18, maxw=260):
    lignes = couper(t.upper(), taille, 700, maxw) or [t.upper()]
    w = max(largeur(l, taille, 700) for l in lignes) + taille * 1.8
    h = len(lignes) * taille * 1.22 + taille * 1.0
    return lignes, w, h


def etiquette(cx, cy, t, role="rouge", taille=18, maxw=260):
    """Même chaîne que le moteur d'origine : le libellé est passé en capitales."""
    th = T()
    R = th.role(role)
    lignes, w, h = etiquette_dim(t, taille, maxw)
    mode = th.etiquettes["mode"]
    rx = min(h / 2, 20) if th.carte["rayon"] >= 6 else (3 if th.carte["rayon"] else 0)
    if mode == "plein":
        fond, bord, coul = R.fonce, None, R.sur_fonce
    elif mode == "contour":
        fond, bord, coul = th.c["fond_schema"], (R.vif if th.sombre else R.fonce), (R.vif if th.sombre else R.fonce)
    else:
        fond, bord, coul = R.clair, None, (R.vif if th.sombre else R.fonce)
    o = [rect(cx - w / 2, cy - h / 2, w, h, fond, rx, bord, 2 if bord else 0)]
    b = nouveau_bloc()
    y0 = cy - (len(lignes) * taille * 1.22) / 2
    for i, l in enumerate(lignes):
        o.append(texte(cx, y0 + taille * (0.92 + 1.22 * i), l, taille, 700, coul, "middle", "texte",
                       ' letter-spacing="0.9"', bloc=b, fond=fond))
    zone(cx - w / 2, cy - h / 2, w, h)
    return "\n".join(o)


# ── Géométrie circulaire ──────────────────────────────────────────────────────
def pt(cx, cy, r, a):
    t = math.radians(a)
    return cx + r * math.sin(t), cy - r * math.cos(t)


def secteur(cx, cy, ri, ro, a0, a1, fond, bord=None, ep=4):
    large = 1 if (a1 - a0) % 360 > 180 else 0
    x0, y0 = pt(cx, cy, ro, a0)
    x1, y1 = pt(cx, cy, ro, a1)
    if ri <= 0:
        d = f'M{cx:.1f},{cy:.1f} L{x0:.1f},{y0:.1f} A{ro},{ro} 0 {large} 1 {x1:.1f},{y1:.1f} Z'
    else:
        x2, y2 = pt(cx, cy, ri, a1)
        x3, y3 = pt(cx, cy, ri, a0)
        d = (f'M{x0:.1f},{y0:.1f} A{ro},{ro} 0 {large} 1 {x1:.1f},{y1:.1f} L{x2:.1f},{y2:.1f} '
             f'A{ri},{ri} 0 {large} 0 {x3:.1f},{y3:.1f} Z')
    b = f' stroke="{bord}" stroke-width="{ep}" stroke-linejoin="round"' if bord else ""
    return f'<path d="{d}" fill="{fond}"{b}/>'


def arc(cx, cy, r, a0, a1, couleur, ep, extra=""):
    large = 1 if (a1 - a0) % 360 > 180 else 0
    x0, y0 = pt(cx, cy, r, a0)
    x1, y1 = pt(cx, cy, r, a1)
    return (f'<path d="M{x0:.1f},{y0:.1f} A{r:.1f},{r:.1f} 0 {large} 1 {x1:.1f},{y1:.1f}" fill="none" stroke="{couleur}" '
            f'stroke-width="{ep}" stroke-linecap="butt"{extra}/>')


def disque(cx, cy, r, fill, stroke=None, sw=0, ombre_force=0.0):
    s = f' stroke="{stroke}" stroke-width="{sw}"' if stroke and sw else ""
    o = ombre(cx - r, cy - r, 2 * r, 2 * r, r, ombre_force, "cercle") if ombre_force else ""
    return o + f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fill}"{s}/>'


# ── Carte ─────────────────────────────────────────────────────────────────────
def _dims(w, t, orient, a_icone, a_num):
    """Géométrie interne d'une carte de largeur w pour un titre nominal t (partagée mesure / dessin)."""
    th = T()
    ca = th.carte
    ent = ca["entete"]
    pad = clamp(0.9 * t, 18, 34)
    S = clamp(2.6 * t, 56, 124) if orient == "h" else clamp(2.3 * t, 48, 100)
    tnum = clamp(0.82 * t, 18, 30)
    sn = taille_numero(tnum)
    d = {"pad": pad, "S": S, "tnum": tnum, "sn": sn, "ent": ent}
    if ent == "bande_titre":
        if orient == "h":
            ws = (S + 2 * pad) if (a_icone or a_num) else 12
            d.update(ws=ws, wt=w - ws - 2 * pad, wc=w - ws - 2 * pad)
        else:
            Sb = clamp(1.75 * t, 42, 72)
            padb = clamp(0.6 * t, 15, 24)
            empile = a_icone and w < 340      # carte étroite : pictogramme au-dessus du titre, dans le bandeau
            dx_num = (tnum * 1.9 + 12) if (a_num and not empile) else 0
            dx_ic = (Sb + 14) if (a_icone and not empile) else 0
            d.update(Sb=Sb, padb=padb, dx_num=dx_num, dx_ic=dx_ic, empile=empile,
                     wt=w - 2 * padb - dx_num - dx_ic, wc=w - 2 * pad)
    else:
        ep_t = ca.get("epaisseur_filet", 0) if ent == "filet_haut" else 0
        ep_g = ca.get("epaisseur_barre", 0) if ent == "barre_gauche" else 0
        w0 = w - ep_g
        if orient == "h":
            g_ic = pad * 0.85
            col = (S + g_ic) if a_icone else ((sn + g_ic) if a_num else 0)
            wt = w0 - 2 * pad - col - ((sn + 10) if (a_num and a_icone) else 0)
        else:
            g_ic = pad * 0.7
            wt = w0 - 2 * pad
        d.update(ep_t=ep_t, ep_g=ep_g, g_ic=g_ic, wt=wt, wc=wt)
    return d


def _couleur_titre(R, th):
    return R.fonce if not th.sombre else th.c["encre"]


def lignes_titre(w, t, b, titre, orient="v", icone=None, num=None, maj=False):
    """Nombre de lignes du titre d'une carte (None si un mot dépasse)."""
    if not titre:
        return 0
    d = _dims(w, t, orient, bool(icone), num is not None)
    P = preparer(titre, (), d["wt"], t, b, maj=maj)
    return None if P is None else len(P["tl"])


def carte(x, y, w, h, role="creme", titre=None, corps=(), icone=None, num=None, puces=False,
          t=26, b=20, orient="v", align=None, mesure=False, n_lt=None, maj=False, fond_carte=None,
          ombre_force=1.0, v_align=None, decal=0):
    """Carte thémée à tailles de texte fixes (t = titre nominal, b = corps).
    orient « v » : pictogramme en haut ; « h » : pictogramme à gauche (cartes larges).
    mesure=True : renvoie la hauteur nécessaire (lève Deborde si un mot ne tient pas en largeur).
    n_lt : nombre de lignes de titre réservé (alignement d'une rangée) ; decal : marge haute ajoutée."""
    th = T()
    ca = th.carte
    R = th.role(role)
    rx = ca["rayon"]
    if isinstance(corps, str):
        corps = [corps]
    corps = [c for c in (corps or ()) if c]
    num_s = f"{num:02d}" if isinstance(num, int) else num
    d = _dims(w, t, orient, bool(icone), num_s is not None)
    pad, S, tnum, sn, ent = d["pad"], d["S"], d["tnum"], d["sn"], d["ent"]
    fond = fond_carte or th.c[ca.get("remplissage", "carte_fond")]
    centrer = ca.get("centrer_titre") and orient == "v"
    al = align or ("middle" if centrer else "start")
    o = []

    def prep(wt, avec_titre=True, avec_corps=True, nl=None):
        P = preparer(titre if avec_titre else None, corps if avec_corps else (), wt, t, b, puces, maj=maj, n_lt=nl)
        if P is None:
            raise Deborde(f"mot trop long pour {wt:.0f} px : {titre!r} {corps!r}")
        return P

    # ─────────────────────────────── recette « bande_titre » (marine)
    if ent == "bande_titre":
        if orient == "h":
            ws = d["ws"]
            P = prep(d["wt"])
            besoin = max((S + 2 * pad + (tnum * 2.3 if (num_s and icone) else 0)) if (icone or num_s) else 0,
                         P["total"] + 2 * pad)
            if mesure:
                return besoin
            zone(x, y, w, h)
            o.append(surface(x, y, w, h, rx, ombre_force, fond))
            o.append(f'<path d="{chemin_arrondi(x, y, ws, h, rx, 0, 0, rx)}" fill="{R.fonce}"/>')
            cy_ic = y + h / 2
            if num_s and icone:
                ty = y + h / 2 - (S * 0.9 + tnum * 2.0) / 2
                o.append(texte_seul(x + ws / 2, ty + tnum * 0.95, num_s, tnum, 700, R.sur_fonce, "middle", "chiffres",
                                    fond=R.fonce))
                cy_ic = ty + tnum * 2.0 + S * 0.45
            elif num_s:
                o.append(texte_seul(x + ws / 2, y + h / 2 + tnum * 0.6, num_s, tnum * 1.6, 700, R.sur_fonce, "middle",
                                    "chiffres", fond=R.fonce))
            if icone:
                o.append(pastille(x + ws / 2, cy_ic, icone, role, S * 0.9, "dans_bande"))
            o.append(dessiner(x + ws + pad, y, d["wt"], h, P, align or "start", th.c["encre_2"], _couleur_titre(R, th),
                              v_align or "middle", fond=fond))
            return "\n".join(o)
        Sb, padb, empile = d["Sb"], d["padb"], d["empile"]
        Pt = prep(d["wt"], True, False, n_lt) if titre else None
        Pc = prep(d["wc"], False, True) if corps else None
        if titre and empile:
            hb = padb + Sb + 0.4 * t + Pt["total"] + padb
        elif titre:
            hb = max(Sb if icone else 0, tnum * 1.9 if num_s else 0, Pt["total"]) + 2 * padb
        else:
            hb = 10
        besoin = hb + ((pad * 0.8 + Pc["total"] + pad) if corps else 0)
        if mesure:
            return besoin
        zone(x, y, w, h)
        o.append(surface(x, y, w, h, rx, ombre_force, fond))
        if not corps:
            hb = h
        o.append(f'<path d="{chemin_arrondi(x, y, w, hb, rx, rx, rx if hb >= h else 0, rx if hb >= h else 0)}" fill="{R.fonce}"/>')
        xx = x + padb
        cn = th.c["structure"] if R.fonce.upper() == th.c["accent_texte"].upper() else th.c["accent_texte"]
        s_ = tnum * 1.9
        if empile:
            o.append(pastille(xx + Sb / 2, y + padb + Sb / 2, icone, role, Sb, "dans_bande"))
            if num_s:
                o.append(rect(x + w - padb - s_, y + padb + Sb / 2 - s_ / 2, s_, s_, cn, 4))
                o.append(texte_seul(x + w - padb - s_ / 2, y + padb + Sb / 2 + tnum * 0.36, num_s, tnum, 700, "#FFFFFF",
                                    "middle", "chiffres", fond=cn))
            if titre:
                yt = y + padb + Sb + 0.4 * t
                o.append(dessiner(xx, yt, d["wt"], Pt["total"], Pt, "start", couleur_titre=R.sur_fonce, v_align="top",
                                  fond=R.fonce))
        else:
            if num_s:
                o.append(rect(xx, y + hb / 2 - s_ / 2, s_, s_, cn, 4))
                o.append(texte_seul(xx + s_ / 2, y + hb / 2 + tnum * 0.36, num_s, tnum, 700, "#FFFFFF", "middle",
                                    "chiffres", fond=cn))
                xx += d["dx_num"]
            if icone:
                o.append(pastille(xx + Sb / 2, y + hb / 2, icone, role, Sb, "dans_bande"))
                xx += d["dx_ic"]
            if titre:
                o.append(dessiner(xx, y + padb, d["wt"], hb - 2 * padb, Pt, "start", couleur_titre=R.sur_fonce,
                                  v_align="middle", fond=R.fonce))
        if corps:
            o.append(dessiner(x + pad, y + hb + pad * 0.8 + decal, d["wc"], h - hb - pad * 1.8 - decal, Pc, al,
                              th.c["encre_2"], v_align=v_align or "top", fond=fond))
        return "\n".join(o)

    # ─────────────────────────────── recettes « filet_haut », « barre_gauche », « aucun »
    ep_t, ep_g, g_ic, wt = d["ep_t"], d["ep_g"], d["g_ic"], d["wt"]
    x0, y0, w0, h0 = x + ep_g, y + ep_t, w - ep_g, h - ep_t
    mode_num = th.numeros["mode"]

    def deco():
        zone(x, y, w, h)
        o.append(surface(x, y, w, h, rx, ombre_force, fond))
        if ent == "filet_haut" and ep_t:
            if ca.get("lueur"):
                o.append(rect(x + 14, y - 2, w - 28, ep_t + 8, R.vif, (ep_t + 8) / 2, extra=' opacity="0.16"'))
            o.append(f'<path d="{chemin_arrondi(x, y, w, ep_t, rx, rx, 0, 0)}" fill="{R.vif}"/>')
        elif ent == "barre_gauche" and ep_g:
            o.append(f'<path d="{chemin_arrondi(x, y, ep_g, h, rx, 0, 0, rx)}" fill="{R.vif}"/>')

    if orient == "h":
        P = prep(wt)
        besoin = ep_t + max(S if icone else (sn if num_s else 0), P["total"]) + 2 * pad
        if mesure:
            return besoin
        deco()
        tx = x0 + pad
        cy = y0 + h0 / 2
        if icone:
            o.append(pastille(tx + S / 2, cy, icone, role, S, sur=fond))
            tx += S + g_ic
        elif num_s:
            o.append(numero(tx + sn / 2, cy, num_s, role, tnum, sur=fond))
            tx += sn + g_ic
        if num_s and icone:
            o.append(numero(x0 + w0 - pad - sn / 2, y0 + pad + sn / 2, num_s, role, tnum, sur=fond))
        o.append(dessiner(tx, y0, wt, h0, P, align or "start", th.c["encre_2"], _couleur_titre(R, th),
                          v_align or "middle", fond=fond))
        return "\n".join(o)

    # vertical
    haut_ic = S if icone else (sn if num_s else 0)
    P = prep(wt, nl=n_lt)
    besoin = ep_t + pad + (haut_ic + g_ic if haut_ic else 0) + P["total"] + pad
    if mesure:
        return besoin
    deco()
    ty = y0 + pad + decal
    if icone:
        icx = x0 + w0 / 2 if centrer else x0 + pad + S / 2
        o.append(pastille(icx, ty + S / 2, icone, role, S, sur=fond))
        if num_s:
            nx = x0 + w0 - pad - sn / 2 if not centrer else x0 + pad + sn / 2
            o.append(numero(nx, ty + sn / 2 - (4 if mode_num == "grand" else 0), num_s, role, tnum, sur=fond))
        ty += S + g_ic
    elif num_s:
        nx = x0 + w0 / 2 if centrer else x0 + pad + sn / 2
        o.append(numero(nx, ty + sn / 2, num_s, role, tnum, sur=fond))
        ty += sn + g_ic
    o.append(dessiner(x0 + pad, ty, wt, y0 + h0 - pad - ty, P, al, th.c["encre_2"], _couleur_titre(R, th),
                      v_align or "top", fond=fond))
    return "\n".join(o)


_CLES_CARTE = ("role", "titre", "corps", "icone", "num", "puces", "orient", "maj", "align")


def _kw(c):
    return {k: c[k] for k in _CLES_CARTE if k in c}


def ajuster_cartes(cartes, t_max=30, t_min=19, b_ratio=0.72, b_min=17, aligner=True, quoi="cartes", b_max=29):
    """Taille commune à un ensemble de cartes : cartes = liste de dicts (w, h, role, titre, corps, icone,
    num, puces, orient). Renvoie (t, b, n_lt, besoin_max) : la plus grande taille qui tient partout ;
    n_lt = nombre de lignes de titre réservé dans chaque carte verticale (titres et textes alignés)."""
    res = {}

    def essai(t, b):
        n_lt = None
        if aligner:
            n = 0
            for c in cartes:
                if c.get("orient", "v") != "v" or not c.get("titre"):
                    continue
                k = lignes_titre(c["w"], t, b, c["titre"], "v", c.get("icone"), c.get("num"), c.get("maj", False))
                if k is None:
                    return False
                n = max(n, k)
            n_lt = n or None
        besoins = []
        try:
            for c in cartes:
                v = carte(0, 0, c["w"], c["h"], t=t, b=b, mesure=True, n_lt=n_lt, **_kw(c))
                if v > c["h"] + 0.5:
                    return False
                besoins.append(v)
        except Deborde:
            return False
        res["n_lt"], res["besoin"] = n_lt, max(besoins) if besoins else 0
        return True

    t, b = ajuster(essai, t_max, t_min, b_ratio, b_min, quoi=quoi, b_max=b_max)
    essai(t, b)
    return t, b, res.get("n_lt"), res.get("besoin", 0)


# ── Bandeau (sujet d'une étoile, racine d'un arbre, en-tête de liste ou de colonne) ─────
def bandeau(x, y, w, h, role="sombre", titre=None, corps=(), icone=None, t=40, b=24, align="middle",
            mesure=False, maj=False, v_align="middle"):
    th = T()
    R = th.role(role)
    mode = th.bandeau["mode"]
    rx = th.bandeau.get("rayon", 0)
    pad = clamp(0.75 * t, 22, 40)
    S = clamp(1.7 * t, 40, 84) if icone else 0
    dx = (S + pad * 0.8) if icone else 0
    ep_bas = 10 if mode == "plein_filet" else 0
    ep_g = 10 if mode == "teinte_barre" else 0
    wt = w - 2 * pad - dx - ep_g
    P = preparer(titre, corps, wt, t, b, maj=maj)
    if P is None:
        raise Deborde(f"bandeau : mot trop long pour {wt:.0f} px : {titre!r}")
    besoin = max(S, P["total"]) + 2 * pad + ep_bas
    if mesure:
        return besoin
    zone(x, y, w, h)
    o = []
    if mode == "plein":
        fond, ct, cb = R.fonce, R.sur_fonce, R.sur_fonce
        o.append(ombre(x, y, w, h, rx, 1.0) + rect(x, y, w, h, fond, rx))
    elif mode == "plein_filet":
        fond, ct, cb = R.fonce, R.sur_fonce, R.sur_fonce
        o.append(rect(x, y, w, h, fond, rx))
        if role in ("or", "sable", "sombre", "creme"):
            o.append(rect(x, y + h - ep_bas, w, ep_bas, th.c["accent"], 0))
        else:
            o.append(rect(x, y + h - ep_bas, w, ep_bas, R.vif, 0, extra=' opacity="0.55"'))
    elif mode == "teinte_barre":
        fond, ct, cb = R.clair, R.fonce, th.c["encre_2"]
        o.append(rect(x, y, w, h, fond, rx))
        o.append(f'<path d="{chemin_arrondi(x, y, ep_g, h, rx, 0, 0, rx)}" fill="{R.vif}"/>')
    elif mode == "verre":
        fond, ct, cb = th.c["surface"], th.c["encre"], th.c["encre_2"]
        o.append(rect(x - 4, y - 4, w + 8, h + 8, R.vif, rx + 4, extra=' opacity="0.10"'))
        o.append(rect(x, y, w, h, fond, rx, R.vif, 1.8))
    else:
        raise ValueError(mode)
    tx = x + pad + ep_g
    if icone:
        if mode in ("plein", "plein_filet"):
            o.append(glyphe(icone, tx + S / 2, y + (h - ep_bas) / 2, S, R.sur_fonce))
        else:
            o.append(pastille(tx + S / 2, y + (h - ep_bas) / 2, icone, role, S, sur=fond))
        tx += dx
    al = align if not icone else "start"
    o.append(dessiner(tx, y + pad, wt, h - 2 * pad - ep_bas, P, al, cb, ct, v_align, fond=fond))
    return "\n".join(o)
