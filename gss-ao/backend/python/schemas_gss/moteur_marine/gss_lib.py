"""Moteur des schémas GSS — primitives de dessin du style « Marine & signal », version 3 (A4 portrait).

Copie propre au style marine (styles/marine/moteur). Version 3, après la critique indépendante :
  · ÉCHELLE COMMUNE : toutes les tailles viennent du palier typographique courant (jetons typo.paliers :
    « standard » = texte 13 pt, titre de carte 18 pt, panneau 24 pt, chiffre clé 60 pt ; « dense » = 11 / 15 /
    20 / 48 pt). Un gabarit n'agrandit plus le texte pour remplir la page : il adapte la mise en page ;
  · COULEURS : le marine porte la structure et le fil de lecture ; l'orange « signal » ne sert qu'aux chiffres
    clés (chiffre_cle) ; les couleurs de rôle sont des touches (plaque de pictogramme, colonne, barre, étiquette),
    au plus deux par schéma (theme.regler_roles) ; le point d'arrivée d'un process est un panneau plein ;
  · TYPOGRAPHIE : apostrophe typographique (’) et ordinaux en exposant (1er, 4e) au rendu ; titres équilibrés
    sur leurs lignes ; le contrôle des mots normalise de la même façon ;
  · REGISTRE DE CONTRÔLE : textes, cadres (opaques ou non), points, traits, étiquettes posées sur une branche et
    décors sont inscrits avec leur ordre de dessin : le contrôle vérifie les chevauchements texte / texte,
    cadre / cadre, point / texte, point caché sous un cadre, trait / texte, l'étiquette sur sa branche et
    l'occupation réelle du dessin ;
  · les TEXTES ne sont jamais modifiés : mêmes chaînes, mêmes capitales ; seule leur mise en forme change.
"""
import html as _html
import math
import re
from functools import lru_cache

from PIL import ImageFont

from . import theme
from .pictos import picto

MARGE_MESURE = 1.03   # marge de sécurité : mesure Pillow sans crénage avancé ≈ rendu navigateur


class Deborde(Exception):
    pass


def T():
    return theme.courant()


def P():
    """Palier typographique courant (dict : texte, carte, panneau, chiffre, etiquette, numero, plaque, pad)."""
    return T().palier


def t_min():
    return T().t_min


def t_min_():
    return T().t_min


# ── Typographie ───────────────────────────────────────────────────────────────
ORDINAL = re.compile(r"(?<![\w.,])(\d{1,3})(er|re|e|ème|es|ers)(?=[\s\u00a0.,;:!?)]|$)")


def typo(t):
    """Typographie de rendu : apostrophe typographique. Aucun mot n'est changé (le contrôle normalise ’ en ')."""
    return str(t).replace("'", "\u2019")


def _lier(t):
    """Règles de coupure (aucun mot changé) : pas de coupure autour d'une barre oblique isolée (« 24 h / 24 »),
    ni entre un nombre et « % », « h », « min », « km », « ans », « m² », ni après « n° »."""
    t = t.replace(" / ", "\u00a0/\u00a0")
    t = re.sub(r"(\d) (%|h\b|min\b|minutes\b|km\b|ans\b|m²|agents\b|j\b|heures?\b|jours?\b|mois\b|semaines?\b|secondes\b)",
               "\\1\u00a0\\2", t)
    t = re.sub(r"\b(n°|N°) ", "\\1\u00a0", t)
    t = re.sub(r"\b(SSIAP|CQP|APS|ERP|IGH|SST|PSC|ISO|J|H0B0|HOB0) (\d)", "\\1\u00a0\\2", t)
    return t


def insec(t):
    """Espaces insécables typographiques — même règle que le moteur d'origine — et apostrophe typographique."""
    if not t:
        return t
    t = t.replace("« ", "«\u00a0").replace(" »", "\u00a0»").replace(" :", "\u00a0:").replace(" ?", "\u00a0?")
    return typo(t)


def esc(t):
    return str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _avec_exposants(t_esc, taille):
    """Ordinaux en exposant : « 1er » → 1<tspan>er</tspan> (texte inchangé une fois les balises retirées)."""
    def rep(m):
        return (f'{m.group(1)}<tspan baseline-shift="super" font-size="{taille * 0.62:.1f}">'
                f'{m.group(2)}</tspan>')
    return ORDINAL.sub(rep, t_esc)


def clamp(v, a, b):
    return max(a, min(b, v))


# ── Mesure du texte ───────────────────────────────────────────────────────────
@lru_cache(maxsize=None)
def _pf(chemin, taille4):
    # Moteur simple imposé (Pillow sans raqm, comme sur le Mac) : mêmes largeurs mesurées sur le serveur Linux.
    simple = ImageFont.Layout.BASIC if hasattr(ImageFont, "Layout") else ImageFont.LAYOUT_BASIC
    return ImageFont.truetype(chemin, max(1, taille4), layout_engine=simple)


def police(usage, taille, poids):
    chemin, _ = T().fichier_police(usage, poids)
    return _pf(chemin, max(1, round(taille * 4)))


def _ls(usage, taille):
    return T().typo.get("interlettrage_titre", 0) * taille if usage == "titre" else 0


def largeur(t, taille, poids=400, usage="texte", espacement=0.0):
    if not t:
        return 0.0
    t = typo(t)
    return (police(usage, taille, poids).getlength(t) / 4 * MARGE_MESURE + _ls(usage, taille) * max(0, len(t) - 1)
            + espacement * max(0, len(t) - 1))


def couper(t, taille, poids, maxw, usage="texte"):
    """Retour à la ligne glouton sur les espaces (les insécables restent collées) ; None si un mot dépasse."""
    lignes, cour = [], ""
    t = _lier(t)
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


def couper_equilibre(t, taille, poids, maxw, usage="texte"):
    """Comme couper(), puis rééquilibre les lignes (même nombre de lignes, ligne la plus longue la plus courte) :
    pas de mot seul en dernière ligne (équivalent de text-wrap: balance)."""
    l0 = couper(t, taille, poids, maxw, usage)
    if not l0 or len(l0) == 1:
        return l0
    n = len(l0)
    lo, hi = maxw * 0.40, maxw
    best = l0
    for _ in range(14):
        mid = (lo + hi) / 2
        l = couper(t, taille, poids, mid, usage)
        if l is not None and len(l) <= n:
            best, hi = l, mid
        else:
            lo = mid
    return best


# ── Document et registre de contrôle ──────────────────────────────────────────
_ETAT = {"n": 0, "svg": None, "zoom": 1.0}


def regler_zoom(z):
    """Zoom de la page remplie (dessin.py, dernier recours) : toile réduite de même proportion, affichée à la même
    taille sur la page (tout le dessin est agrandi, rien n'est ajouté ni retiré)."""
    _ETAT["zoom"] = z


def courant():
    return _ETAT["svg"]


class Svg:
    """Toile d'un schéma. Tient le registre de contrôle : textes, cadres, points, traits, étiquettes, décors,
    chacun avec son ordre de dessin (z)."""

    def __init__(self, W=None, H=None):
        th = T()
        self.W = W or th.W / _ETAT["zoom"]
        self.H = H or th.H / _ETAT["zoom"]
        _ETAT["n"] += 1
        self.p = f"s{_ETAT['n']}"
        self.el, self.defs = [], {}
        self.textes, self.zones, self.points, self.traits, self.etiquettes, self.decors = [], [], [], [], [], []
        self.bloc = 0
        self.z = 0
        self.palier = th.palier_nom
        _ETAT["svg"] = self

    def zz(self):
        self.z += 1
        return self.z

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
        tete = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:g} {H:g}" width="{W:g}" height="{H:g}" '
                f'font-family="{esc(th.css_famille("texte"))}" data-style="{th.id}" data-format="{th.format}" '
                f'data-palier="{self.palier}">')
        corps = [f'<rect width="{W:g}" height="{H:g}" fill="{th.c["fond_schema"]}"/>'] if fond else []
        d = f"<defs>{''.join(v for v in self.defs.values() if v)}</defs>\n" if any(self.defs.values()) else ""
        return tete + "\n" + d + "\n".join(corps + self.el) + "\n</svg>\n"


def nouveau_bloc():
    s = courant()
    return s.nouveau_bloc() if s else 0


def zone(x, y, w, h, opaque=True, type_="carte"):
    """Inscrit un cadre (carte, panneau, étiquette) : contrôle des chevauchements et des masquages."""
    s = courant()
    if s is not None:
        s.zones.append({"x0": x, "y0": y, "x1": x + w, "y1": y + h, "z": s.zz(), "opaque": opaque, "type": type_})


def point(cx, cy, r, type_="point", porteur=None):
    """Inscrit un point (disque, nœud, site) ; porteur = bloc du texte qu'il porte (numéro dans son disque)."""
    s = courant()
    if s is not None:
        s.points.append({"cx": cx, "cy": cy, "r": r, "z": s.zz(), "type": type_, "porteur": porteur})


def inscrire_trait(pts, ep, type_="trait"):
    s = courant()
    if s is not None:
        s.traits.append({"pts": [tuple(p) for p in pts], "ep": ep, "z": s.zz(), "type": type_})


def decor(x0, y0, x1, y1, type_="decor"):
    """Inscrit un élément graphique (plaque, pictogramme, forme) : occupation réelle et collisions avec les textes."""
    s = courant()
    if s is not None:
        s.decors.append({"x0": min(x0, x1), "y0": min(y0, y1), "x1": max(x0, x1), "y1": max(y0, y1), "z": s.zz(),
                         "type": type_})


# ── Texte ─────────────────────────────────────────────────────────────────────
def texte(x, y, t, taille, poids=None, couleur=None, ancre="middle", usage="texte", extra="", bloc=None, fond=None,
          espacement=0.0):
    th = T()
    if poids is None:
        poids = {"titre": th.typo["titre_graisse"], "chiffres": th.typo["chiffres_graisse"]}.get(usage, th.typo["texte_graisse"])
    couleur = couleur or th.c["encre"]
    _, p_reel = th.fichier_police(usage, poids)
    t_aff = typo(t)
    ls = _ls(usage, taille) + espacement
    lsa = f' letter-spacing="{ls:.2f}"' if ls else ""
    b = f' data-b="{bloc}"' if bloc is not None else ""
    s = courant()
    if s is not None:
        lw = largeur(t_aff, taille, p_reel, usage, espacement)
        x0 = {"start": x, "middle": x - lw / 2, "end": x - lw}[ancre]
        s.textes.append({"t": t_aff, "x0": x0, "x1": x0 + lw, "y0": y - taille * 0.76, "y1": y + taille * 0.22,
                         "taille": taille, "poids": p_reel, "couleur": couleur,
                         "fond": fond or th.c["fond_schema"], "b": bloc, "z": s.zz(), "usage": usage})
    contenu = _avec_exposants(esc(t_aff), taille)
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-family="{esc(th.css_famille(usage))}" font-size="{taille:.1f}" '
            f'font-weight="{p_reel}" fill="{couleur}" text-anchor="{ancre}"{lsa}{b}{extra}>{contenu}</text>')


def texte_seul(x, y, t, taille, poids=None, couleur=None, ancre="middle", usage="texte", extra="", fond=None,
               espacement=0.0):
    return texte(x, y, t, taille, poids, couleur, ancre, usage, extra, bloc=nouveau_bloc(), fond=fond,
                 espacement=espacement)


def preparer(titre, corps, w, t, b, puces=False, usage_titre="titre", t_poids=None, b_poids=None, maj=False,
             lignes_max_titre=4, n_lt=None, equilibrer=True):
    """Coupe le titre (taille t) et le corps (taille b) à la largeur w. None si un mot ne tient pas."""
    th = T()
    ty = th.typo
    t_poids = t_poids or (ty["titre_graisse"] if usage_titre == "titre" else 600)
    b_poids = b_poids or ty["texte_graisse"]
    if isinstance(corps, str):
        corps = [corps]
    corps = [insec(c) for c in (corps or ()) if c]
    titre = insec(titre)
    ta = titre.upper() if (titre and maj) else titre
    cp = couper_equilibre if equilibrer else couper
    tl = cp(ta, t, t_poids, w, usage_titre) if ta else []
    if tl is None or len(tl) > lignes_max_titre:
        return None
    ind = b * 1.15 if puces else 0
    cl = []
    for p in corps:
        r = cp(p, b, b_poids, w - ind, "texte")
        if r is None:
            return None
        cl.append(r)
    ht = t * ty.get("interligne_titre", 1.12)
    hb = b * ty.get("interligne_texte", 1.38)
    nlt = max(len(tl), n_lt or 0) if tl else 0
    gap = b * 0.45 if (tl and cl) else 0
    gp = b * 0.55 if puces else b * 0.40
    total = nlt * ht + gap + sum(len(r) for r in cl) * hb + max(0, len(cl) - 1) * gp
    return {"tl": tl, "cl": cl, "tt": t, "bb": b, "ht": ht, "hb": hb, "gap": gap, "gp": gp, "nlt": nlt,
            "total": total, "ind": ind, "t_poids": t_poids, "b_poids": b_poids, "usage_titre": usage_titre,
            "puces": puces, "w": w}


def dessiner(x, y, w, h, P_, align="start", couleur=None, couleur_titre=None, v_align="top", puce_couleur=None,
             fond=None, titre_extra=""):
    """Dessine une mise en lignes préparée dans la boîte (x, y, w, h)."""
    th = T()
    couleur = couleur or th.c["encre_2"]
    couleur_titre = couleur_titre or th.c["structure"]
    yy = y + {"top": 0, "middle": (h - P_["total"]) / 2, "bottom": h - P_["total"]}[v_align]
    ax = {"middle": x + w / 2, "start": x, "end": x + w}[align]
    out = []
    tt, bb = P_["tt"], P_["bb"]
    if P_["tl"]:
        bt = nouveau_bloc()
        for i, l in enumerate(P_["tl"]):
            base = yy + P_["ht"] * i + (P_["ht"] - tt) / 2 + tt * 0.80
            out.append(texte(ax, base, l, tt, P_["t_poids"], couleur_titre, align, P_["usage_titre"], titre_extra,
                             bloc=bt, fond=fond))
        yy += P_["nlt"] * P_["ht"] + P_["gap"]
    for r in P_["cl"]:
        bb_ = nouveau_bloc()
        if P_["puces"]:
            out.append(puce(x + bb * 0.30, yy + P_["hb"] * 0.5 + bb * 0.02, bb, puce_couleur))
        for l in r:
            base = yy + (P_["hb"] - bb) / 2 + bb * 0.80
            out.append(texte((x + P_["ind"]) if P_["puces"] else ax, base, l, bb, P_["b_poids"], couleur,
                             "start" if P_["puces"] else align, "texte", bloc=bb_, fond=fond))
            yy += P_["hb"]
        yy += P_["gp"]
    return "\n".join(out)


def bloc_texte(x, y, w, h, titre=None, corps=(), puces=False, align="middle", couleur=None, couleur_titre=None,
               t=None, b=None, v_align="middle", fond=None, usage_titre="titre", t_poids=None, b_poids=None,
               lignes_max_titre=4, maj=False, puce_couleur=None, **_ignore):
    """Titre + corps dans la boîte, aux tailles du palier (titre de carte, texte) sauf tailles données."""
    pal = P()
    t = t or pal["carte"]
    b = b or pal["texte"]
    P_ = preparer(titre, corps, w, t, b, puces, usage_titre, t_poids, b_poids, maj, lignes_max_titre)
    if P_ is None or P_["total"] > h + 0.5:
        raise Deborde(f"texte trop long pour {w:.0f}×{h:.0f} : {titre!r} {corps!r}")
    return dessiner(x, y, w, h, P_, align, couleur, couleur_titre, v_align, puce_couleur, fond)


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


def surface(x, y, w, h, rx=None, ombre_force=0, fill=None, bordure=True, couleur_bordure=None):
    th = T()
    ca = th.carte
    rx = ca["rayon"] if rx is None else rx
    fill = fill or th.c[ca.get("remplissage", "carte_fond")]
    return rect(x, y, w, h, fill, rx)


def ombre(*a, **k):
    return ""


# ── Pictogrammes ──────────────────────────────────────────────────────────────
def glyphe(nom, cx, cy, taille, couleur, graisse=None, libelle=None):
    th = T()
    g = graisse or th.carte["icone"]["graisse"]
    decor(cx - taille / 2, cy - taille / 2, cx + taille / 2, cy + taille / 2, "picto")
    return picto(nom, cx, cy, taille, couleur, g, libelle=libelle)


def plaque(x, y, s, nom, role="sable", libelle=None, k=0.60):
    """Plaque carrée du rôle (touche de couleur) avec pictogramme blanc."""
    th = T()
    R = th.role(role)
    decor(x, y, x + s, y + s, "plaque")
    return rect(x, y, s, s, R.fonce, max(3, s * 0.07)) + picto(nom, x + s / 2, y + s / 2, s * k, R.sur_fonce, "bold",
                                                               libelle=libelle)


def pastille(cx, cy, nom, role="creme", s=56, mode=None, sur=None, libelle=None):
    return plaque(cx - s / 2, cy - s / 2, s, nom, role, libelle)


# ── Numéros, puces, coches ────────────────────────────────────────────────────
def taille_numero(taille=None):
    taille = taille or P()["numero"]
    return taille * 2.1


def numero(cx, cy, t, role=None, taille=None, sur=None, inverse=False):
    """Numéro d'ordre (chaîne exacte : « 01 », « 3 »…) : disque marine, chiffres blancs (IBM Plex Mono).
    inverse=True (sur un aplat foncé) : disque blanc, chiffres marine."""
    th = T()
    taille = taille or P()["numero"]
    r = taille * 1.05
    fond, coul = (th.c["structure"], "#FFFFFF") if not inverse else ("#FFFFFF", th.c["structure"])
    b = nouveau_bloc()
    point(cx, cy, r, "numero", porteur=b)
    return (f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fond}"/>'
            + texte(cx, cy + taille * 0.36, t, taille, 600, coul, "middle", "numero", bloc=b, fond=fond))


def puce(cx, cy, taille, couleur=None):
    th = T()
    c = couleur or th.c["structure"]
    s = taille * 0.30
    return rect(cx - s / 2, cy - s / 2, s, s, c, 0.6)


def coche(cx, cy, s=30, role="vert"):
    th = T()
    R = th.role(role)
    x, y = cx - s / 2, cy - s / 2
    decor(x, y, x + s, y + s, "coche")
    trace = (f'<path d="M{x + s * 0.26:.1f},{y + s * 0.53:.1f} L{x + s * 0.43:.1f},{y + s * 0.70:.1f} '
             f'L{x + s * 0.76:.1f},{y + s * 0.33:.1f}" fill="none" stroke="{R.sur_fonce}" '
             f'stroke-width="{max(2.6, s * 0.12):.1f}" stroke-linecap="round" stroke-linejoin="round"/>')
    return rect(x, y, s, s, R.fonce, max(2, s * 0.10)) + trace


def chiffre_cle(x, y, valeur, taille=None, ancre="start", fond=None, couleur=None):
    """Chiffre clé : orange « signal », IBM Plex Sans Condensed 700 (la seule couleur des chiffres clés)."""
    th = T()
    taille = taille or P()["chiffre"]
    return texte_seul(x, y, valeur, taille, 700, couleur or th.c["chiffre_cle"], ancre, "chiffres", fond=fond)


# ── Fil de lecture, flèches, liens ────────────────────────────────────────────
def _pointe(x, y, ang, couleur, taille):
    ca, sa = math.cos(ang), math.sin(ang)
    bx, by = x - taille * ca, y - taille * sa
    px, py = -sa, ca
    lx, ly = bx + px * taille * 0.60, by + py * taille * 0.60
    rx_, ry_ = bx - px * taille * 0.60, by - py * taille * 0.60
    return (f'<path d="M{x:.1f},{y:.1f} L{lx:.1f},{ly:.1f} L{rx_:.1f},{ry_:.1f} Z" fill="{couleur}" '
            f'stroke="{couleur}" stroke-width="1" stroke-linejoin="miter"/>')


def trait(pts, ep=None, pointe=True, couleur=None, tirets=False, lueur=None, taille=None, bout="round",
          type_="trait", inscrire=True):
    """Ligne brisée ; avec pointe = flèche (pointe triangulaire pleine)."""
    th = T()
    f = th.fleches
    couleur = couleur or f["couleur"]
    ep = ep or f["epaisseur"]
    taille = taille or max(f["taille"], ep * 3.2)
    pts = [tuple(p) for p in pts]
    if pointe:
        (x1, y1), (x2, y2) = pts[-2], pts[-1]
        ang = math.atan2(y2 - y1, x2 - x1)
        recul = taille * 0.85
        pts_l = pts[:-1] + [(x2 - recul * math.cos(ang), y2 - recul * math.sin(ang))]
    else:
        pts_l = pts
    if inscrire:
        inscrire_trait(pts, ep, type_)
    d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts_l)
    t = f' stroke-dasharray="{ep * 2.2:.1f} {ep * 1.8:.1f}"' if tirets else ""
    o = [f'<path d="{d}" fill="none" stroke="{couleur}" stroke-width="{ep:.1f}" stroke-linejoin="round" '
         f'stroke-linecap="{bout if not tirets else "butt"}"{t}/>']
    if pointe:
        (x1, y1), (x2, y2) = pts[-2], pts[-1]
        o.append(_pointe(x2, y2, math.atan2(y2 - y1, x2 - x1), couleur, taille))
    return "".join(o)


def fleche(x1, y1, x2, y2, ep=None, couleur=None, tirets=False, taille=None):
    return trait([(x1, y1), (x2, y2)], ep, True, couleur, tirets, taille=taille, type_="fleche")


def fil(pts, pointe=False, ep=None, taille=None, tirets=False):
    """Fil de lecture marine : relie les étapes d'un process (séquence)."""
    th = T()
    f = th.fil
    ep = ep or f["epaisseur"]
    return trait(pts, ep, pointe, f["couleur"], tirets, taille=taille or max(18, ep * 3.2), type_="fil")


def lien(pts, couleur=None, tirets=False, ep=None):
    """Filet de rattachement neutre (ensemble sans ordre) : gris, sans flèche."""
    th = T()
    return trait(pts, ep or th.liens["epaisseur"], False, couleur or th.liens["couleur"], tirets, type_="lien")


def noeud(cx, cy, r=None, couleur=None, fond=None):
    th = T()
    r = r or th.liens["noeud"]
    couleur = couleur or th.c["structure"]
    point(cx, cy, r, "noeud")
    return (f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r + 3:.1f}" fill="{fond or th.c["fond_schema"]}"/>'
            f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{couleur}"/>')


def chevron_bas(cx, cy, taille=22, couleur=None, ep=None):
    th = T()
    couleur = couleur or th.fil["couleur"]
    decor(cx - taille * 0.72, cy - taille * 0.4, cx + taille * 0.72, cy + taille * 0.46, "pointe")
    return (f'<path d="M{cx - taille * 0.72:.1f},{cy - taille * 0.40:.1f} L{cx + taille * 0.72:.1f},{cy - taille * 0.40:.1f} '
            f'L{cx:.1f},{cy + taille * 0.46:.1f} Z" fill="{couleur}" stroke="{couleur}" stroke-width="1" '
            f'stroke-linejoin="miter"/>')


# ── Étiquette (décision posée sur une branche) ────────────────────────────────
def etiquette_dim(t, taille=None, maxw=360):
    taille = max(taille or P()["etiquette"], t_min_())
    lignes = couper(t.upper(), taille, 700, maxw - taille * 1.8) or [t.upper()]
    w = max(largeur(l, taille, 700, espacement=1.0) for l in lignes) + taille * 1.9
    h = len(lignes) * taille * 1.22 + taille * 1.05
    return lignes, w, h


def etiquette(cx, cy, t, role="rouge", taille=None, maxw=360, branche=None):
    """Étiquette pleine du rôle, libellé en capitales (même chaîne que le moteur d'origine). « branche » : la
    ligne sur laquelle l'étiquette est posée (contrôle : l'étiquette doit être sur sa branche)."""
    th = T()
    taille = max(taille or P()["etiquette"], t_min_())
    R = th.role(role)
    lignes, w, h = etiquette_dim(t, taille, maxw)
    fond, coul = R.fonce, R.sur_fonce
    o = [rect(cx - w / 2, cy - h / 2, w, h, fond, min(h / 2, 6))]
    zone(cx - w / 2, cy - h / 2, w, h, True, "etiquette")
    s = courant()
    if s is not None and branche:
        s.etiquettes.append({"cx": cx, "cy": cy, "w": w, "h": h, "t": t, "branche": [tuple(p) for p in branche]})
    b = nouveau_bloc()
    y0 = cy - (len(lignes) * taille * 1.22) / 2
    for i, l in enumerate(lignes):
        o.append(texte(cx, y0 + taille * (0.92 + 1.22 * i), l, taille, 700, coul, "middle", "texte",
                       bloc=b, fond=fond, espacement=1.0))
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


def disque(cx, cy, r, fill, stroke=None, sw=0, ombre_force=0.0, type_=None):
    s = f' stroke="{stroke}" stroke-width="{sw}"' if stroke and sw else ""
    if type_:
        point(cx, cy, r, type_)
    return f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fill}"{s}/>'


# ── Cartes ────────────────────────────────────────────────────────────────────
def _geom_v(w, titre, corps, icone, num, puces, maj, n_lt, s_plaque, centre, cle=None):
    """Géométrie d'une carte verticale : renvoie dict ou lève Deborde."""
    pal = P()
    pad = pal["pad"]
    tc, tx = pal["carte"], pal["texte"]
    S = s_plaque or pal["plaque"]
    a_pl = bool(icone or num)
    wi = w - 2 * pad
    if centre:                     # tuile « titre seul » : plaque centrée, titre centré dessous
        Pt = preparer(titre, (), wi, tc, tx, maj=maj, n_lt=n_lt) if titre else None
        if titre and Pt is None:
            raise Deborde(f"titre trop long pour {wi:.0f} : {titre!r}")
        h_c = (S * 1.15 + 0.55 * tc if a_pl else 0) + (Pt["total"] if Pt else 0)
        return {"mode": "centre", "pad": pad, "S": S * 1.15, "Pt": Pt, "besoin": h_c + 2 * pad, "h_c": h_c}
    cote = a_pl and (wi - S - 0.6 * pad) >= 250
    wt = (wi - S - 0.6 * pad) if cote else wi
    Pt = preparer(titre, (), wt, tc, tx, maj=maj, n_lt=n_lt) if titre else None
    if titre and (Pt is None or (cote and len(Pt["tl"]) > 3)):
        if cote:                   # titre trop long à côté de la plaque : on le passe dessous
            cote, wt = False, wi
            Pt = preparer(titre, (), wt, tc, tx, maj=maj, n_lt=n_lt)
        if Pt is None:
            raise Deborde(f"titre trop long pour {wt:.0f} : {titre!r}")
    PK = preparer_cle(corps[0], cle, wi) if (cle and corps and len(corps) == 1) else None
    Pc = PK or (preparer(None, corps, wi, tc, tx, puces=puces) if corps else None)
    if corps and Pc is None:
        raise Deborde(f"texte trop long pour {wi:.0f} : {corps!r}")
    ht = Pt["total"] if Pt else 0
    if cote:
        tete = max(S, ht)
    else:
        tete = (S + 0.50 * tx if a_pl else 0) + ht
    g = 0.62 * tx if (Pc and tete) else 0
    besoin = pad + tete + g + (Pc["total"] if Pc else 0) + pad
    return {"mode": "cote" if cote else "dessous", "pad": pad, "S": S, "Pt": Pt, "Pc": Pc, "tete": tete, "g": g,
            "wt": wt, "besoin": besoin, "cle": bool(PK)}


def _geom_h(w, titre, corps, icone, num, puces, maj, s_col):
    pal = P()
    pad = pal["pad"]
    tc, tx = pal["carte"], pal["texte"]
    a_col = bool(icone or num)
    ws = (s_col or pal["plaque"] * 1.45) if a_col else 0
    barre = 0 if a_col else T().carte.get("epaisseur_barre", 10)
    wt = w - ws - barre - 2 * pad
    P_ = preparer(titre, corps, wt, tc, tx, puces=puces, maj=maj)
    if P_ is None:
        raise Deborde(f"carte : mot trop long pour {wt:.0f} : {titre!r} {corps!r}")
    min_col = (ws * 0.92 if a_col else 0) + (pal["numero"] * 1.6 if (num and icone) else 0)
    besoin = max(min_col, P_["total"] + 2 * pad)
    return {"ws": ws, "barre": barre, "wt": wt, "P": P_, "pad": pad, "besoin": besoin}


def carte(x, y, w, h, role="creme", titre=None, corps=(), icone=None, num=None, puces=False, t=None, b=None,
          orient="v", align=None, mesure=False, n_lt=None, maj=False, fond_carte=None, ombre_force=0, v_align=None,
          decal=0, centre=False, plein=False, s_plaque=None, s_col=None, neutre=False, cle=None):
    """Carte du style marine v3 (tailles du palier courant).
    orient « v » : panneau clair, plaque du rôle (pictogramme blanc) à côté du titre (carte large) ou au-dessus
    (carte étroite), titre marine, texte ; « h » : colonne du rôle à gauche (pictogramme blanc, numéro), titre et
    texte à droite ; centre=True (sans texte) : tuile, plaque et titre centrés ; plein=True : point d'arrivée,
    panneau entièrement coloré, textes blancs ; neutre=True : plaque marine quel que soit le rôle.
    mesure=True : renvoie la hauteur nécessaire."""
    th = T()
    ca = th.carte
    R = th.role("sable" if neutre else role)
    rx = ca["rayon"]
    if isinstance(corps, str):
        corps = [corps]
    corps = [c for c in (corps or ()) if c]
    num_s = f"{num:02d}" if isinstance(num, int) else num
    fond = fond_carte or th.c[ca.get("remplissage", "carte_fond")]
    pal = P()
    if orient == "h":
        G = _geom_h(w, titre, corps, icone, num_s, puces, maj, s_col)
        if mesure:
            return G["besoin"]
        zone(x, y, w, h, True, "carte")
        o = []
        if plein:
            fond = R.fonce
            o.append(rect(x, y, w, h, R.fonce, rx))
        else:
            o.append(rect(x, y, w, h, fond, rx))
        ws = G["ws"]
        if ws:
            if not plein:
                o.append(f'<path d="{chemin_arrondi(x, y, ws, h, rx, 0, 0, rx)}" fill="{R.fonce}"/>')
            else:
                o.append(rect(x + ws - 1.5, y + h * 0.16, 3, h * 0.68, "#FFFFFF", 0, extra=' opacity="0.35"'))
            S_ic = min(ws * 0.56, h * 0.62)
            if num_s and icone:
                tn = pal["numero"]
                bloc_h = tn * 1.1 + 14 + S_ic
                ty = y + (h - bloc_h) / 2
                bn = nouveau_bloc()
                o.append(texte(x + ws / 2, ty + tn * 0.9, num_s, tn, 600, R.sur_fonce, "middle", "numero",
                               bloc=bn, fond=R.fonce))
                o.append(glyphe(icone, x + ws / 2, ty + tn * 1.1 + 14 + S_ic / 2, S_ic, R.sur_fonce, libelle=titre))
            elif num_s:
                tn = pal["numero"] * 1.5
                o.append(texte_seul(x + ws / 2, y + h / 2 + tn * 0.36, num_s, tn, 600, R.sur_fonce, "middle", "numero",
                                    fond=R.fonce))
            else:
                o.append(glyphe(icone, x + ws / 2, y + h / 2, S_ic, R.sur_fonce, libelle=titre))
        if G["barre"]:
            o.append(f'<path d="{chemin_arrondi(x, y, G["barre"], h, rx, 0, 0, rx)}" fill="{R.fonce}"/>')
        coul_t = R.sur_fonce if plein else th.c["structure"]
        coul_c = R.sur_fonce if plein else th.c["encre_2"]
        o.append(dessiner(x + ws + G["barre"] + G["pad"], y, G["wt"], h, G["P"], align or "start", coul_c, coul_t,
                          v_align or "middle", puce_couleur=(R.sur_fonce if plein else R.fonce), fond=fond))
        return "\n".join(o)

    G = _geom_v(w, titre, corps, icone, num_s, puces, maj, n_lt, s_plaque, centre and not corps, cle)
    if mesure:
        return G["besoin"]
    zone(x, y, w, h, True, "carte")
    pad = G["pad"]
    o = [rect(x, y, w, h, R.fonce if plein else fond, rx)]
    if plein:
        fond = R.fonce
    coul_t = R.sur_fonce if plein else th.c["structure"]
    coul_c = R.sur_fonce if plein else th.c["encre_2"]
    if G["mode"] == "centre":
        S = G["S"]
        yy = y + (h - G["h_c"]) / 2
        if icone or num_s:
            if icone:
                o.append(plaque(x + w / 2 - S / 2, yy, S, icone, role if not neutre else "sable", libelle=titre))
            else:
                o.append(numero(x + w / 2, yy + S / 2, num_s, None, pal["numero"] * 1.3))
            yy += S + 0.55 * pal["carte"]
        if G["Pt"]:
            o.append(dessiner(x + pad, yy, w - 2 * pad, G["Pt"]["total"], G["Pt"], "middle", coul_c, coul_t, "top",
                              fond=fond))
        return "\n".join(o)
    S = G["S"]
    yy = y + pad + decal
    xx = x + pad
    if G["mode"] == "cote":
        tete = G["tete"]
        if icone:
            o.append(plaque(xx, yy + (tete - S) / 2, S, icone, role if not neutre else "sable", libelle=titre))
        elif num_s:
            o.append(numero(xx + S / 2, yy + tete / 2, num_s, None))
        if G["Pt"]:
            Pt = G["Pt"]
            o.append(dessiner(xx + S + 0.6 * pad, yy, G["wt"], tete, Pt, "start", coul_c, coul_t, "middle", fond=fond))
        yy += tete + G["g"]
    else:
        if icone or num_s:
            if icone:
                o.append(plaque(xx, yy, S, icone, role if not neutre else "sable", libelle=titre))
            else:
                o.append(numero(xx + S * 0.45, yy + S * 0.45, num_s, None))
            yy += S + 0.50 * pal["texte"]
        if G["Pt"]:
            o.append(dessiner(xx, yy, G["wt"], G["Pt"]["total"], G["Pt"], "start", coul_c, coul_t, "top", fond=fond))
            yy += G["Pt"]["total"]
        yy += G["g"]
    if G["Pc"] and G.get("cle"):
        o.append(dessiner_cle(xx, yy, G["Pc"], coul_c, fond))
    elif G["Pc"]:
        o.append(dessiner(xx, yy, w - 2 * pad, G["Pc"]["total"], G["Pc"], align or "start", coul_c, coul_t, "top",
                          puce_couleur=(R.sur_fonce if plein else R.fonce), fond=fond))
    return "\n".join(o)


_CLES_CARTE = ("role", "titre", "corps", "icone", "num", "puces", "orient", "maj", "align", "centre", "plein",
               "s_plaque", "s_col", "neutre", "cle")


def _kw(c):
    return {k: c[k] for k in _CLES_CARTE if k in c}


def besoin(c, w=None):
    """Hauteur nécessaire d'une carte décrite par un dict."""
    return carte(0, 0, w or c["w"], 9999, mesure=True, **_kw(c))


def n_lt_de(n_lt, c):
    return n_lt.get(c.get("r", 0)) if isinstance(n_lt, dict) else n_lt


# ── Panneau plein (sujet, racine, en-tête de colonne) ─────────────────────────
def bandeau(x, y, w, h, role="sombre", titre=None, corps=(), icone=None, t=None, b=None, align="middle",
            mesure=False, maj=False, v_align="middle", filet=None, s_icone=None, couleur_corps=None):
    """Panneau plein du sujet : marine (ou couleur du rôle), titre blanc au corps « panneau », sous-titre clair."""
    th = T()
    pal = P()
    R = th.role(role)
    rx = th.bandeau.get("rayon", 0)
    t = t or pal["panneau"]
    b = b or pal["texte"]
    pad = clamp(0.62 * t, 22, 36)
    S = (s_icone or clamp(1.5 * t, 50, 84)) if icone else 0
    dx = (S + pad * 0.7) if icone else 0
    wt = w - 2 * pad - dx
    P_ = preparer(titre, corps, wt, t, b, maj=maj)
    if P_ is None:
        raise Deborde(f"bandeau : mot trop long pour {wt:.0f} px : {titre!r}")
    besoin_ = max(S, P_["total"]) + 2 * pad
    if mesure:
        return besoin_
    zone(x, y, w, h, True, "panneau")
    o = [f'<path d="{chemin_arrondi(x, y, w, h, rx, rx, rx, rx)}" fill="{R.fonce}"/>']
    tx = x + pad
    if icone:
        o.append(glyphe(icone, tx + S / 2, y + h / 2, S * 0.9, R.sur_fonce, libelle=titre))
        tx += dx
    al = align if not icone else "start"
    cc = couleur_corps or (th.c["clair_sur_structure"] if R.fonce in (th.c["structure"], th.c["structure_2"]) else R.sur_fonce)
    o.append(dessiner(tx, y + pad, wt, h - 2 * pad, P_, al, cc, R.sur_fonce, v_align, fond=R.fonce))
    return "\n".join(o)


def disque_sujet(cx, cy, titre, corps=(), role="or", r_min=150, r_max=215, t=None, b=None, mesure=False,
                 meme_corps=False):
    """Disque plein du sujet (centre d'un hub) : titre « panneau » et sous-titre, en blanc. Renvoie le rayon
    nécessaire si mesure=True. meme_corps : le sous-titre est composé comme le titre (même corps, même graisse)."""
    th = T()
    pal = P()
    t = t or pal["panneau"]
    b = b or pal["texte"]
    R = th.role(role)
    if isinstance(corps, str):
        corps = [corps]
    for r in range(int(r_min), int(r_max) + 1, 4):
        wi = r * 1.42
        if meme_corps:
            P_ = preparer(titre, (), wi, t, b)
            Pc = preparer(corps[0], (), wi, t, b) if corps else None
            ok = P_ is not None and (not corps or Pc is not None)
            tot = (P_["total"] if P_ else 0) + ((Pc["total"] + 0.1 * t) if Pc else 0)
        else:
            P_ = preparer(titre, corps, wi, t, b, lignes_max_titre=3)
            ok = P_ is not None
            tot = P_["total"] if P_ else 0
        if ok and tot <= r * 1.30:
            break
    else:
        raise Deborde(f"sujet trop long : {titre!r}")
    if mesure:
        return r
    zone(cx - r * 0.72, cy - r * 0.72, r * 1.44, r * 1.44, True, "panneau")
    decor(cx - r, cy - r, cx + r, cy + r, "disque")
    o = [f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{R.fonce}"/>']
    if meme_corps and corps:
        y0 = cy - tot / 2
        o.append(dessiner(cx - wi / 2, y0, wi, P_["total"], P_, "middle", R.sur_fonce, R.sur_fonce, "top", fond=R.fonce))
        o.append(dessiner(cx - wi / 2, y0 + P_["total"] + 0.1 * t, wi, Pc["total"], Pc, "middle", R.sur_fonce,
                          R.sur_fonce, "top", fond=R.fonce))
    else:
        cc = th.c["clair_sur_structure"] if R.fonce in (th.c["structure"], th.c["structure_2"]) else R.sur_fonce
        o.append(dessiner(cx - wi / 2, cy - tot / 2, wi, tot, P_, "middle", cc, R.sur_fonce, "top", fond=R.fonce))
    return "\n".join(o)


# ── Paragraphe à chiffre clé intégré (« … vers une flotte 100 % électrique. ») ─────
def preparer_cle(texte_, cle, w, tx=None, tk=None):
    """Coupe un paragraphe dont une partie (cle, ex. « 100 % », « 15 minutes ») est composée en chiffre clé
    (orange, Condensed 700) dans le fil du texte : mêmes mots, même ordre. Renvoie None si la clé est absente
    ou si un mot dépasse."""
    pal = P()
    tx = tx or pal["texte"]
    tk = tk or pal["chiffre_moyen"]
    t = insec(texte_)
    c = insec(cle)
    i = t.find(c)
    if i < 0:
        return None
    avant, apres = t[:i].strip(), t[i + len(c):].strip()
    jet = [(m, tx, "A") for m in _lier(avant).split(" ") if m] + [(c.replace(" ", " "), tk, "K")] + \
          [(m, tx, "B") for m in _lier(apres).split(" ") if m]
    lignes, cour, lw = [], [], 0.0
    for mot, taille, blk in jet:
        poids = 700 if blk == "K" else T().typo["texte_graisse"]
        usage = "chiffres" if blk == "K" else "texte"
        lm = largeur(mot, taille, poids, usage)
        esp = largeur(" ", tx, 400) if cour else 0
        if cour and lw + esp + lm > w:
            lignes.append(cour)
            cour, lw = [], 0.0
            esp = 0
        if lm > w:
            return None
        cour.append((mot, taille, blk, lw + esp, lm))
        lw += esp + lm
    if cour:
        lignes.append(cour)
    hb = tx * T().typo.get("interligne_texte", 1.38)
    hs = []
    for l in lignes:
        hs.append(tk * 1.02 if any(b == "K" for _, _, b, _, _ in l) else hb)
    return {"lignes": lignes, "hs": hs, "total": sum(hs), "tx": tx, "tk": tk, "cle": c}


def dessiner_cle(x, y, PK, couleur=None, fond=None, couleur_cle=None):
    th = T()
    couleur = couleur or th.c["encre_2"]
    couleur_cle = couleur_cle or th.c["chiffre_cle"]
    blocs = {"A": nouveau_bloc(), "K": nouveau_bloc(), "B": nouveau_bloc()}
    out = []
    yy = y
    for l, hl in zip(PK["lignes"], PK["hs"]):
        a_k = any(b == "K" for _, _, b, _, _ in l)
        base = yy + (PK["tk"] * 0.84 if a_k else (hl - PK["tx"]) / 2 + PK["tx"] * 0.80)
        # regroupe les mots consécutifs d'un même bloc en un seul texte
        grp = []
        for mot, taille, blk, dx, lm in l:
            if grp and grp[-1][2] == blk:
                grp[-1][0].append(mot)
            else:
                grp.append([[mot], taille, blk, dx])
        for mots, taille, blk, dx in grp:
            if blk == "K":
                out.append(texte(x + dx, base, " ".join(mots), taille, 700, couleur_cle, "start", "chiffres",
                                 bloc=blocs[blk], fond=fond))
            else:
                out.append(texte(x + dx, base, " ".join(mots), taille, None, couleur, "start", "texte",
                                 bloc=blocs[blk], fond=fond))
        yy += hl
    return "\n".join(out)
