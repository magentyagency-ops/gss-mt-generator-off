"""Bibliothèque des schémas GSS — habillage GSS, construction modernisée.

Règles (validées) :
  · fond #D9D9D9, contour #484545, texte #463A2F, police Lexend, flèches noires
  · couleur = rôle : bleu contrôle · orange action · rouge déclencheur / non-conformité
    · vert issue · sable / crème / or structure · sombre bandeau
  · carte = remplissage pâle + ombre pleine décalée de la teinte soutenue
  · format paysage 1200 × 660, pas de titre (la page du mémoire en porte un)

Le texte est mesuré avec la vraie police : tout débordement lève une erreur.
"""
import math, os
from functools import lru_cache
from PIL import ImageFont

ICI = os.path.dirname(os.path.abspath(__file__))
W, H = 1200, 660
FOND, CONTOUR, TEXTE, NOIR, CLAIR = "#D9D9D9", "#484545", "#463A2F", "#000000", "#F5F5DE"
POLICE = "Lexend, 'Arial Rounded MT Bold', Arial, sans-serif"
ROLES = {
    "bleu":   ("#6298C0", "#1D49A7"),
    "vert":   ("#B8CCB1", "#377E3F"),
    "rouge":  ("#E78E83", "#DD4E49"),
    "orange": ("#F0D3A3", "#E99842"),
    "sable":  ("#ECDEC2", "#47494B"),
    "or":     ("#E5CA97", "#47494B"),
    "creme":  ("#F5F5DE", "#47494B"),
    "sombre": ("#484545", "#2E2B2B"),
}
DATE = "#B9423C"


class Deborde(Exception):
    pass


# ── Mesure du texte ───────────────────────────────────────────────────────────
@lru_cache(maxsize=None)
def _police(taille, poids):
    f = ImageFont.truetype(os.path.join(ICI, "polices", "Lexend.ttf"), max(1, round(taille * 4)))
    f.set_variation_by_axes([poids])
    return f


def largeur(t, taille, poids=400):
    return _police(taille, poids).getlength(t) / 4


def couper(t, taille, poids, maxw):
    """Retour à la ligne glouton sur les mots ; None si un mot seul dépasse."""
    lignes, cour = [], ""
    for mot in t.split(" "):
        if not mot:
            continue
        essai = f"{cour} {mot}".strip()
        if largeur(essai, taille, poids) <= maxw:
            cour = essai
        else:
            if not cour or largeur(mot, taille, poids) > maxw:
                return None
            lignes.append(cour)
            cour = mot
    if cour:
        lignes.append(cour)
    return lignes


def esc(t):
    return str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def texte(x, y, t, taille, poids=400, couleur=TEXTE, ancre="middle", extra=""):
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-size="{taille:g}" font-weight="{poids}" fill="{couleur}" '
            f'text-anchor="{ancre}"{extra}>{esc(t)}</text>')


def bloc_texte(x, y, w, h, titre=None, corps=(), puces=False, align="middle", couleur=TEXTE,
               t_max=21, t_min=12, maj=False, b_ratio=0.8, b_min=11.5, t_poids=700, lignes_max_titre=3):
    """Titre + corps ajustés à la boîte (taille décroissante jusqu'à ce que tout tienne).
    corps : liste de paragraphes (ou de puces si puces=True)."""
    if isinstance(corps, str):
        corps = [corps]
    insec = lambda t: t.replace("« ", "«\u00a0").replace(" »", "\u00a0»").replace(" :", "\u00a0:").replace(" ?", "\u00a0?") if t else t
    corps = [insec(c) for c in corps]
    titre = insec(titre)
    titre_aff = (titre.upper() if (titre and maj) else titre)
    t = t_max
    while t >= t_min - 1e-9:
        b = max(b_min, round(t * b_ratio * 2) / 2)
        ind = b * 1.1 if puces else 0
        tl = couper(titre_aff, t, t_poids, w) if titre_aff else []
        ok = tl is not None and len(tl) <= lignes_max_titre
        cl = []
        if ok:
            for p in corps:
                r = couper(p, b, 400, w - ind)
                if r is None:
                    ok = False
                    break
                cl.append(r)
        if ok:
            ht, hb = t * 1.2, b * 1.36
            gap = b * 0.65 if (tl and corps) else 0
            gp = b * 0.35 if puces else 0
            total = len(tl) * ht + gap + sum(len(r) for r in cl) * hb + max(0, len(cl) - 1) * gp
            if total <= h:
                break
        t -= 0.5
    else:
        raise Deborde(f"texte trop long pour {w:.0f}×{h:.0f} : {titre!r} {corps!r}")
    out = []
    yy = y + (h - total) / 2
    ax = {"middle": x + w / 2, "start": x, "end": x + w}[align]
    for l in tl:
        out.append(texte(ax, yy + t * 0.93, l, t, t_poids, couleur, align))
        yy += ht
    yy += gap
    for i, r in enumerate(cl):
        if puces:
            out.append(f'<circle cx="{x + b * 0.35:.1f}" cy="{yy + hb * 0.5:.1f}" r="{b * 0.2:.1f}" fill="{couleur}"/>')
        for l in r:
            out.append(texte((x + ind) if puces else ax, yy + b * 1.02, l, b, 400, couleur,
                             "start" if puces else align))
            yy += hb
        yy += gp
    return "\n".join(out)


# ── Document ──────────────────────────────────────────────────────────────────
# Direction artistique validée (style A « Épuré ») : cartes claires, ombre douce,
# couleur de rôle en bandeau et en pastille, titres en minuscules, chevrons gris fins.
SURF = "#FBFAF4"          # surface des cartes
GRIS = "#7A726F"          # flèches et liaisons
LIEN = "#9A928E"          # traits de liaison
# Teinte soutenue des pastilles (glyphe blanc) : celle du rôle GSS
FONCE = {"bleu": "#1D49A7", "vert": "#377E3F", "rouge": "#DD4E49", "orange": "#E99842",
         "sable": "#8A7550", "or": "#8A7550", "creme": "#8A817C", "sombre": "#484545"}
_CLIP = [0]


class Svg:
    def __init__(self):
        self.el = []

    def add(self, *e):
        self.el.extend(e)
        return self

    def rendu(self):
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
                f'font-family="{POLICE}">\n<rect width="{W}" height="{H}" fill="{FOND}"/>\n<defs>'
                f'<filter id="od" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="6" '
                f'stdDeviation="10" flood-color="#2B2826" flood-opacity="0.14"/></filter>'
                f'<filter id="op" x="-30%" y="-30%" width="160%" height="190%"><feDropShadow dx="0" dy="3" '
                f'stdDeviation="4" flood-color="#2B2826" flood-opacity="0.14"/></filter>'
                f'<marker id="f" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.2" markerHeight="4.2" '
                f'orient="auto"><path d="M2,1.5 L8,5 L2,8.5" fill="none" stroke="{GRIS}" stroke-width="1.6" '
                f'stroke-linecap="round" stroke-linejoin="round"/></marker>'
                f'<marker id="fb" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" '
                f'orient="auto"><path d="M2,1.5 L8,5 L2,8.5" fill="none" stroke="#FFFFFF" stroke-width="1.6" '
                f'stroke-linecap="round" stroke-linejoin="round"/></marker></defs>\n'
                + "\n".join(self.el) + "\n</svg>\n")


# ── Primitives ────────────────────────────────────────────────────────────────
def _pale(role):
    return SURF if role == "creme" else ROLES[role][0]


def forme(x, y, w, h, role="creme", rx=24, ombre=8, trait=3):
    """Aplat de la couleur pâle du rôle (surface claire pour « crème »), ombre douce, sans contour."""
    f = ' filter="url(#od)"' if ombre and ombre > 5 else (' filter="url(#op)"' if ombre else "")
    return (f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{min(rx, h / 2, w / 2):.1f}" '
            f'fill="{_pale(role)}"{f}/>')


def surface(x, y, w, h, rx=22, ombre=True):
    f = ' filter="url(#od)"' if ombre else ""
    return f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx}" fill="{SURF}"{f}/>'


def _bande(x, y, w, h, rx, bx, by, bw, bh, couleur):
    """Bandeau de couleur découpé dans la forme arrondie de la carte."""
    _CLIP[0] += 1
    i = f"cb{_CLIP[0]}"
    return (f'<clipPath id="{i}"><rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx}"/></clipPath>'
            f'<rect x="{bx:.1f}" y="{by:.1f}" width="{bw:.1f}" height="{bh:.1f}" fill="{couleur}" clip-path="url({"#" + i})"/>')


def couleur_texte(role):
    return CLAIR if role == "sombre" else TEXTE


def carte(x, y, w, h, role="creme", titre=None, corps=(), icone=None, num=None, puces=False,
          align=None, rx=22, pad=18, t_max=22, t_min=12, maj=False, ombre=8, icone_haut=False, b_ratio=0.8):
    """Carte : surface claire, bandeau de la couleur du rôle (haut ou gauche), pastille, texte ajusté."""
    rx = min(rx, 22, h / 2)
    bande = SURF if role == "creme" else ROLES[role][0]
    if role == "creme" and icone:
        bande = "#ECE9E2"
    fonce = FONCE[role]
    o = [surface(x, y, w, h, rx, bool(ombre))]
    if align is None:
        align = "start" if (icone and not icone_haut) or puces else "middle"
    txt, err = None, None
    if icone and icone_haut:
        for hb in (min(96, max(50, h * 0.30)), 44, 36):
            r = min(26, hb * 0.62)
            ty = y + hb + r + 12
            try:
                txt = bloc_texte(x + pad, ty, w - 2 * pad, y + h - pad * 0.8 - ty, titre, corps, puces, align,
                                 TEXTE, t_max, t_min, maj, b_ratio)
                break
            except Deborde as e:
                err = e
        if txt is None:
            raise err
        o.append(_bande(x, y, w, h, rx, x, y, w, hb, bande))
        o.append(pastille_icone(x + w / 2, y + hb, icone, role, r))
        if num is not None:
            o.append(texte(x + 18, y + 26, f"{num:02d}", 15, 700, fonce, "start", ' letter-spacing="1"'))
    elif icone:
        wb = 72
        o.append(_bande(x, y, w, h, rx, x, y, wb, h, bande))
        o.append(pastille_icone(x + wb / 2, y + h / 2, icone, role, min(22, h * 0.3)))
        txt = bloc_texte(x + wb + 16, y + pad * 0.7, w - wb - 16 - pad, h - 1.4 * pad, titre, corps, puces, align,
                         TEXTE, t_max, t_min, maj, b_ratio)
        if num is not None:
            o.append(texte(x + wb / 2, y + 22, f"{num:02d}", 13, 700, fonce, "middle"))
    else:
        hb = 0 if role == "creme" else (34 if num is not None else (12 if h >= 70 else 7))
        if hb:
            o.append(_bande(x, y, w, h, rx, x, y, w, hb, bande))
        if num is not None:
            o.append(texte(x + 18, y + 24, f"{num:02d}", 15, 700, fonce, "start", ' letter-spacing="1"'))
        ty = y + hb + pad * 0.6
        txt = bloc_texte(x + pad, ty, w - 2 * pad, y + h - pad * 0.7 - ty, titre, corps, puces, align,
                         TEXTE, t_max, t_min, maj, b_ratio)
    o.append(txt)
    return "\n".join(o)


def pastille_icone(cx, cy, nom, role="creme", r=27):
    return (f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r + 6:.1f}" fill="{SURF}"/>'
            f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{FONCE[role]}"/>'
            + icone(nom, cx, cy, r / 29, "#FFFFFF"))


def numero(cx, cy, n):
    return (f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="16" fill="{CONTOUR}" stroke="{SURF}" stroke-width="3"/>'
            + texte(cx, cy + 5.5, str(n), 14, 700, CLAIR))


def _chevron(x, y, couleur=GRIS, s=1.3, angle=0):
    return (f'<path d="M-5,-8 L4,0 L-5,8" fill="none" stroke="{couleur}" stroke-width="3" stroke-linecap="round" '
            f'stroke-linejoin="round" transform="translate({x:.1f},{y:.1f}) rotate({angle:.1f}) scale({s})"/>')


def fleche(x1, y1, x2, y2, larg=4.5, couleur=NOIR, tirets=False):
    c = "#FFFFFF" if couleur == "#FFFFFF" else GRIS
    lg = math.hypot(x2 - x1, y2 - y1)
    if not tirets and lg <= 110 and abs(y2 - y1) < 1:
        # Flèche courte entre deux cartes : un chevron seul, comme sur le style validé
        return _chevron((x1 + x2) / 2 + 2, (y1 + y2) / 2, c, 1.3, math.degrees(math.atan2(y2 - y1, x2 - x1)))
    d = ' stroke-dasharray="8 7"' if tirets else ""
    m = "fb" if c == "#FFFFFF" else "f"
    return (f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{c}" stroke-width="2.6" '
            f'stroke-linecap="round"{d} marker-end="url(#{m})"/>')


def trait(pts, larg=4.5, pointe=True, couleur=NOIR, tirets=False):
    c = couleur if couleur not in (NOIR, CONTOUR) else (GRIS if pointe else LIEN)
    d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)
    m = ' marker-end="url(#f)"' if pointe else ""
    t = ' stroke-dasharray="8 7"' if tirets else ""
    return (f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{min(larg, 2.6)}" stroke-linejoin="round" '
            f'stroke-linecap="round"{t}{m}/>')


def etiquette(cx, cy, t, role="rouge", taille=13, maxw=180):
    """Étiquette posée sur une flèche (décision, condition) : pastille arrondie."""
    lignes = couper(t.upper(), taille, 700, maxw) or [t.upper()]
    w = max(largeur(l, taille, 700) for l in lignes) + 30
    h = len(lignes) * taille * 1.2 + 16
    o = [f'<rect x="{cx - w / 2:.1f}" y="{cy - h / 2:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{min(h / 2, 16):.1f}" '
         f'fill="{_pale(role)}" filter="url(#op)"/>']
    y0 = cy - h / 2 + 8
    for i, l in enumerate(lignes):
        o.append(texte(cx, y0 + taille * (0.93 + 1.2 * i), l, taille, 700, couleur_texte(role), "middle",
                       ' letter-spacing="0.6"'))
    return "\n".join(o)


def pt(cx, cy, r, a):
    t = math.radians(a)
    return cx + r * math.sin(t), cy - r * math.cos(t)


def secteur(cx, cy, ri, ro, a0, a1, fond, ombre=None, dec=8, partie="tout", trait_=3):
    """Secteur d'anneau : aplat, séparateurs clairs, ombre douce (plus d'ombre décalée)."""
    if partie == "ombre":
        return ""
    large = 1 if (a1 - a0) % 360 > 180 else 0
    x0, y0 = pt(cx, cy, ro, a0); x1, y1 = pt(cx, cy, ro, a1)
    if ri <= 0:
        d = f'M{cx:.1f},{cy:.1f} L{x0:.1f},{y0:.1f} A{ro},{ro} 0 {large} 1 {x1:.1f},{y1:.1f} Z'
    else:
        x2, y2 = pt(cx, cy, ri, a1); x3, y3 = pt(cx, cy, ri, a0)
        d = (f'M{x0:.1f},{y0:.1f} A{ro},{ro} 0 {large} 1 {x1:.1f},{y1:.1f} L{x2:.1f},{y2:.1f} '
             f'A{ri},{ri} 0 {large} 0 {x3:.1f},{y3:.1f} Z')
    return f'<path d="{d}" fill="{fond}" stroke="{SURF}" stroke-width="4" stroke-linejoin="round" filter="url(#op)"/>'


def chevron_rot(cx, cy, r, a, couleur=NOIR, s=1):
    px, py = pt(cx, cy, r, a)
    c = GRIS if couleur == NOIR else couleur
    return _chevron(px, py, c, 1.1 * s, a)


def disque(cx, cy, r, role="creme", ombre=7):
    f = ' filter="url(#od)"' if ombre else ""
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{_pale(role)}"{f}/>'


# ── Pictogrammes (trait, 32 px, coins ronds) ─────────────────────────────────
def icone(nom, cx, cy, s=1.0, couleur=TEXTE):
    k = f'fill="none" stroke="{couleur}" stroke-width="{2.4 / s:.2f}" stroke-linecap="round" stroke-linejoin="round"'
    p = ICONES.get(nom)
    if p is None:
        raise KeyError(f"pictogramme inconnu : {nom}")
    return f'<g transform="translate({cx:.1f},{cy:.1f}) scale({s:.3f})" {k}>{p}</g>'


ICONES = {
    "mail": '<rect x="-15" y="-10" width="30" height="21" rx="3"/><path d="M-14,-8 L0,3 L14,-8"/>',
    "tel": '<rect x="-9" y="-15" width="18" height="30" rx="4"/><line x1="-3" y1="10" x2="3" y2="10"/>',
    "lieu": '<path d="M0,15 C-13,0 -12,-14 0,-14 C12,-14 13,0 0,15 z"/><circle cx="0" cy="-4" r="4.5"/>',
    "personne": '<circle cx="0" cy="-7" r="6.5"/><path d="M-12,14 C-12,3 12,3 12,14"/>',
    "groupe": '<circle cx="-7" cy="-6" r="5"/><circle cx="8" cy="-6" r="5"/><path d="M-16,12 C-16,3 2,3 2,12"/><path d="M0,12 C0,3 17,3 17,12"/>',
    "bouclier": '<path d="M0,-15 L13,-10 L13,0 C13,8 7,13 0,16 C-7,13 -13,8 -13,0 L-13,-10 z"/><path d="M-5,0 L-1,4 L6,-4"/>',
    "cle": '<circle cx="-7" cy="0" r="6"/><path d="M-1,0 L14,0 M9,0 L9,5 M13,0 L13,4"/>',
    "badge": '<rect x="-13" y="-10" width="26" height="20" rx="3"/><circle cx="-5" cy="-1" r="3.5"/><path d="M-10,7 C-10,3 0,3 0,7 M4,-3 L9,-3 M4,2 L9,2"/>',
    "voiture": '<path d="M-15,4 L-15,-1 L-10,-8 L10,-8 L15,-1 L15,4 z"/><circle cx="-8" cy="6" r="3.5"/><circle cx="8" cy="6" r="3.5"/>',
    "velo": '<circle cx="-9" cy="5" r="6"/><circle cx="9" cy="5" r="6"/><path d="M-9,5 L-3,-6 L6,-6 L9,5 M-3,-6 L0,5 L6,-6 M-5,-9 L-1,-9"/>',
    "trottinette": '<circle cx="-10" cy="10" r="4"/><circle cx="10" cy="10" r="4"/><path d="M-10,10 L10,10 M8,10 L4,-12 L0,-12"/>',
    "marche": '<circle cx="1" cy="-12" r="3.5"/><path d="M1,-7 L-1,4 L-6,14 M-1,4 L5,14 M-7,-2 L0,-6 L6,-1"/>',
    "tablette": '<rect x="-12" y="-15" width="24" height="30" rx="3"/><path d="M-6,-7 L6,-7 M-6,-1 L6,-1 M-6,5 L2,5"/>',
    "talkie": '<rect x="-8" y="-8" width="16" height="23" rx="3"/><path d="M-4,-8 L-4,-16 M-4,-2 L4,-2 M-4,3 L4,3"/>',
    "lampe": '<path d="M-5,-15 L5,-15 L5,-5 L3,0 L3,14 L-3,14 L-3,0 L-5,-5 z"/><path d="M-9,-19 L-6,-17 M9,-19 L6,-17 M0,-21 L0,-18"/>',
    "horloge": '<circle cx="0" cy="0" r="14"/><path d="M0,-8 L0,0 L6,4"/>',
    "document": '<path d="M-10,-15 L5,-15 L11,-9 L11,15 L-10,15 z"/><path d="M-5,-4 L6,-4 M-5,2 L6,2 M-5,8 L2,8"/>',
    "check": '<rect x="-13" y="-13" width="26" height="26" rx="5"/><path d="M-6,0 L-1,5 L7,-5"/>',
    "alerte": '<path d="M0,-14 L15,12 L-15,12 z"/><path d="M0,-4 L0,4 M0,8 L0,8.5"/>',
    "feu": '<path d="M0,15 C-10,15 -12,6 -9,0 C-7,-5 -3,-7 -3,-13 C3,-10 6,-5 5,1 C7,-1 8,-3 8,-5 C12,1 11,15 0,15 z"/>',
    "camera": '<rect x="-15" y="-8" width="22" height="14" rx="2"/><path d="M7,-4 L15,-8 L15,6 L7,2 M-8,6 L-8,13 M-13,13 L-3,13"/>',
    "feuille": '<path d="M-12,12 C-14,-6 0,-14 14,-14 C14,2 6,14 -12,12 z"/><path d="M-12,12 L4,-4"/>',
    "recycle": '<path d="M-3,-13 L3,-13 L9,-3 M9,-3 L11,-9 M9,-3 L3,-4 M11,4 L8,11 L-4,11 M-4,11 L0,15 M-4,11 L0,7 M-9,8 L-13,2 L-7,-8 M-7,-8 L-12,-6 M-7,-8 L-5,-2"/>',
    "eclair": '<path d="M3,-15 L-9,2 L0,2 L-3,15 L9,-2 L0,-2 z"/>',
    "chien": '<path d="M-12,4 L-12,-4 L-6,-8 L-6,-13 L-2,-9 L6,-9 L10,-5 L13,-5 L13,-1 L8,1 L8,12 M-12,4 L-12,12 M-12,4 L4,4 L4,12"/>',
    "batiment": '<path d="M-12,15 L-12,-14 L6,-14 L6,15 M6,-4 L13,-4 L13,15 M-16,15 L16,15"/><path d="M-7,-8 L-3,-8 M1,-8 L1,-8 M-7,-2 L-3,-2 M-7,4 L-3,4 M-4,15 L-4,9"/>',
    "ecole": '<path d="M-16,-3 L0,-12 L16,-3 L0,6 z"/><path d="M-9,1 L-9,9 C-4,13 4,13 9,9 L9,1 M16,-3 L16,7"/>',
    "caddie": '<path d="M-16,-11 L-11,-11 L-7,6 L11,6 L14,-6 L-9,-6"/><circle cx="-5" cy="12" r="2.5"/><circle cx="9" cy="12" r="2.5"/>',
    "banque": '<path d="M-15,-5 L0,-14 L15,-5 z M-15,14 L15,14 M-11,-2 L-11,10 M-4,-2 L-4,10 M4,-2 L4,10 M11,-2 L11,10"/>',
    "usine": '<path d="M-15,14 L-15,-2 L-6,-8 L-6,-2 L3,-8 L3,-2 L15,-8 L15,14 z M9,-8 L9,-15 L13,-15 L13,-6"/><path d="M-9,6 L-5,6 M1,6 L5,6"/>',
    "hopital": '<rect x="-13" y="-13" width="26" height="26" rx="4"/><path d="M0,-7 L0,7 M-7,0 L7,0"/>',
    "lit": '<path d="M-16,10 L-16,-8 M-16,4 L16,4 L16,10 M-16,-1 L16,-1 L16,4"/><circle cx="-9" cy="-5" r="3"/>',
    "camion": '<path d="M-16,7 L-16,-8 L4,-8 L4,7 M4,-3 L11,-3 L15,2 L15,7 L4,7"/><circle cx="-9" cy="9" r="3"/><circle cx="9" cy="9" r="3"/>',
    "ballon": '<circle cx="0" cy="0" r="14"/><path d="M0,-6 L6,-2 L4,5 L-4,5 L-6,-2 z M0,-6 L0,-14 M6,-2 L13,-5 M4,5 L8,12 M-4,5 L-8,12 M-6,-2 L-13,-5"/>',
    "masque": '<path d="M-15,-8 C-15,6 -8,14 0,14 C8,14 15,6 15,-8 C8,-12 -8,-12 -15,-8 z"/><path d="M-8,-2 L-3,-2 M3,-2 L8,-2 M-5,7 C-2,9 2,9 5,7"/>',
    "etoile": '<path d="M0,-15 L4.5,-5 L15,-4.5 L7,3 L9.5,14 L0,8 L-9.5,14 L-7,3 L-15,-4.5 L-4.5,-5 z"/>',
    "calendrier": '<rect x="-14" y="-11" width="28" height="25" rx="3"/><path d="M-14,-3 L14,-3 M-7,-15 L-7,-8 M7,-15 L7,-8 M-6,4 L-2,4 M3,4 L7,4 M-6,9 L-2,9"/>',
    "oeil": '<path d="M-16,0 C-9,-11 9,-11 16,0 C9,11 -9,11 -16,0 z"/><circle cx="0" cy="0" r="4.5"/>',
    "cadenas": '<rect x="-11" y="-3" width="22" height="17" rx="3"/><path d="M-6,-3 L-6,-8 C-6,-16 6,-16 6,-8 L6,-3 M0,4 L0,8"/>',
    "diplome": '<path d="M-16,-6 L0,-13 L16,-6 L0,1 z"/><path d="M-9,-2 L-9,6 C-4,10 4,10 9,6 L9,-2 M16,-6 L16,4"/>',
    "drone": '<rect x="-5" y="-3" width="10" height="7" rx="2"/><path d="M-5,0 L-11,-6 M5,0 L11,-6 M-5,3 L-11,9 M5,3 L11,9"/><circle cx="-12" cy="-7" r="4"/><circle cx="12" cy="-7" r="4"/><circle cx="-12" cy="10" r="4"/><circle cx="12" cy="10" r="4"/>',
    "detecteur": '<rect x="-4" y="-15" width="8" height="18" rx="4"/><path d="M0,3 L0,15 M-3,15 L3,15"/><path d="M-9,-11 C-12,-7 -12,-3 -9,1 M9,-11 C12,-7 12,-3 9,1"/>',
    "compteur": '<rect x="-12" y="-14" width="24" height="28" rx="6"/><rect x="-7" y="-8" width="14" height="8" rx="1"/><circle cx="0" cy="7" r="3"/>',
    "gilet": '<path d="M-6,-14 L-13,-9 L-13,14 L13,14 L13,-9 L6,-14 L3,-8 L-3,-8 z M0,-8 L0,14"/>',
    "chaussure": '<path d="M-15,8 L-15,-8 L-6,-8 L-4,-2 L10,1 C14,2 15,5 15,8 z M-15,4 L15,4"/>',
    "prise": '<path d="M-6,-15 L-6,-7 M6,-15 L6,-7 M-11,-7 L11,-7 L11,1 C11,7 6,10 0,10 C-6,10 -11,7 -11,1 z M0,10 L0,16"/>',
    "ascenseur": '<rect x="-13" y="-15" width="26" height="30" rx="2"/><path d="M0,-15 L0,15 M-8,-5 L-5,-9 L-2,-5 M2,5 L5,9 L8,5"/>',
    "goutte": '<path d="M0,-15 C6,-5 11,1 11,5 C11,11 6,15 0,15 C-6,15 -11,11 -11,5 C-11,1 -6,-5 0,-15 z"/>',
    "ordinateur": '<rect x="-15" y="-12" width="30" height="20" rx="2"/><path d="M-5,14 L5,14 M0,8 L0,14"/>',
    "poubelle": '<path d="M-10,-8 L-8,14 L8,14 L10,-8 M-13,-8 L13,-8 M-4,-8 L-4,-13 L4,-13 L4,-8 M-3,-3 L-3,9 M3,-3 L3,9"/>',
    "tasse": '<path d="M-12,-8 L8,-8 L6,12 L-10,12 z M8,-4 C14,-4 14,6 7,6"/>',
    "ampoule": '<path d="M-5,8 L-5,4 C-11,0 -11,-14 0,-14 C11,-14 11,0 5,4 L5,8 z M-4,12 L4,12"/>',
    "loupe": '<circle cx="-3" cy="-3" r="10"/><path d="M4,4 L14,14"/>',
    "papier": '<path d="M-11,-15 L11,-15 L11,15 L-11,15 z M-6,-8 L6,-8 M-6,-2 L6,-2 M-6,4 L6,4 M-6,10 L1,10"/>',
    "monde": '<circle cx="0" cy="0" r="14"/><path d="M-14,0 L14,0 M0,-14 C-7,-6 -7,6 0,14 C7,6 7,-6 0,-14"/>',
    "euro": '<path d="M10,-11 C3,-17 -10,-12 -10,0 C-10,12 3,17 10,11 M-15,-4 L4,-4 M-15,4 L4,4"/>',
    "cadeau": '<rect x="-13" y="-4" width="26" height="18" rx="2"/><path d="M-15,-9 L15,-9 L15,-4 L-15,-4 z M0,-9 L0,14 M0,-9 C-3,-15 -10,-15 -8,-10 M0,-9 C3,-15 10,-15 8,-10"/>',
    "coeur": '<path d="M0,13 C-16,2 -14,-12 -6,-12 C-2,-12 0,-8 0,-8 C0,-8 2,-12 6,-12 C14,-12 16,2 0,13 z"/>',
    "oreille": '<path d="M-6,12 C-2,12 0,9 1,6 C2,3 8,1 8,-5 C8,-12 3,-15 -2,-15 C-8,-15 -11,-10 -11,-5"/><path d="M-4,-4 C-4,-8 3,-8 3,-3 C3,1 -2,1 -2,4"/>',
    "main": '<path d="M-8,14 L-11,2 C-12,-1 -8,-2 -7,1 L-6,4 L-6,-10 C-6,-13 -2,-13 -2,-10 L-2,-1 L-2,-13 C-2,-16 2,-16 2,-13 L2,-1 L2,-11 C2,-14 6,-14 6,-11 L6,0 L6,-7 C6,-10 10,-10 10,-7 L10,6 C10,11 7,14 3,14 z"/>',
    "cible": '<circle cx="0" cy="0" r="14"/><circle cx="0" cy="0" r="8"/><circle cx="0" cy="0" r="2.5"/>',
    "carte_pro": '<rect x="-15" y="-10" width="30" height="20" rx="3"/><circle cx="-7" cy="-1" r="4"/><path d="M-12,7 C-12,3 -2,3 -2,7 M3,-4 L11,-4 M3,1 L11,1 M3,6 L8,6"/>',
    "sirene": '<path d="M-10,10 L-10,-2 C-10,-9 10,-9 10,-2 L10,10 z M-14,10 L14,10 M0,-12 L0,-16 M-11,-10 L-14,-13 M11,-10 L14,-13"/>',
    "casque": '<path d="M-14,6 C-14,-8 -6,-13 0,-13 C6,-13 14,-8 14,6 z M-16,6 L16,6 M0,-13 L0,-3"/>',
    "extincteur": '<rect x="-6" y="-8" width="12" height="23" rx="4"/><path d="M-3,-8 L-3,-12 L3,-12 L3,-8 M0,-12 L0,-15 L9,-15 L12,-10"/>',
    "porte": '<path d="M-10,15 L-10,-15 L10,-15 L10,15 M-14,15 L14,15"/><circle cx="5" cy="1" r="1.6"/>',
    "route": '<path d="M-8,15 L-3,-15 M8,15 L3,-15 M0,11 L0,6 M0,1 L0,-3 M0,-8 L0,-11"/>',
    "reunion": '<circle cx="-9" cy="-8" r="4"/><circle cx="9" cy="-8" r="4"/><circle cx="0" cy="-11" r="4"/><path d="M-15,6 L15,6 L15,10 L-15,10 z M-12,10 L-12,15 M12,10 L12,15"/>',
    "graphique": '<path d="M-14,14 L-14,-14 M-14,14 L15,14"/><path d="M-8,8 L-8,2 M-1,8 L-1,-6 M6,8 L6,-2 M13,8 L13,-10"/>',
    "echange": '<path d="M-13,-5 L11,-5 M5,-11 L11,-5 L5,1 M13,5 L-11,5 M-5,-1 L-11,5 L-5,11"/>',
    "pompier": '<path d="M-12,4 C-12,-9 12,-9 12,4 z M-15,4 L15,4 L15,8 L-15,8 z M0,-6 L0,1"/>',
    "fumee": '<path d="M-9,13 C-15,7 -3,3 -9,-3 C-14,-8 -5,-12 -7,-16 M1,13 C-5,7 7,3 1,-3 C-4,-8 5,-12 3,-16 M11,13 C6,8 15,4 10,-2"/>',
    "echelle": '<path d="M-7,-15 L-7,15 M7,-15 L7,15 M-7,-9 L7,-9 M-7,-3 L7,-3 M-7,3 L7,3 M-7,9 L7,9"/>',
    "escalier": '<path d="M-15,14 L-8,14 L-8,7 L-1,7 L-1,0 L6,0 L6,-7 L13,-7 L13,-14"/>',
    "nacelle": '<rect x="-13" y="3" width="26" height="9" rx="2"/><path d="M-5,3 L5,-13 L12,-13 M-10,12 L-10,16 M10,12 L10,16"/>',
    "croix": '<path d="M-5,-14 L5,-14 L5,-5 L14,-5 L14,5 L5,5 L5,14 L-5,14 L-5,5 L-14,5 L-14,-5 L-5,-5 z"/>',
}
