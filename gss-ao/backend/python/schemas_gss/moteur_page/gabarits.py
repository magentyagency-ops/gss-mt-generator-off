"""Gabarits des schémas GSS au format PAGE (A4 portrait, toile 1000 × 1270), paramétrés par le thème.

Mêmes noms, mêmes signatures et mêmes paramètres que backend/python/schemas_gss/gabarits.py : chaque
spécification de la bibliothèque (specs.json) se redessine telle quelle. Les paramètres qui ne portaient
que la mise en page paysage (cols, hauteur_max, gap, h_racine, h_enfant, largeur_label, w_carte, x0, x1,
y, zone…) sont acceptés et ignorés : la disposition est recalculée pour la page portrait.

Règles de forme (consignes du dirigeant de GSS) :
  · 1 schéma = 1 page, en gros : la composition occupe la hauteur de la toile ;
  · la forme guide la lecture, de haut en bas : sujet → composantes, étape 1 → étape 2 → … → issue ;
  · gros titres + pictogrammes ; une seule taille de texte par schéma (cartes homogènes) ;
  · couleur = rôle GSS (contrôle, action, déclencheur, issue, structure) dans la palette du style ;
  · aucun texte ajouté, retiré ou modifié par rapport au moteur d'origine (contrôle automatique).
"""
import json as _json
import math
import os as _os

from .gss_lib import (_ETAT, Svg, T, Deborde, carte, ajuster_cartes, bandeau, bloc_texte, preparer, dessiner, texte,
                     texte_seul, largeur, couper, insec, rect, surface, ombre, chemin_arrondi, pastille, glyphe,
                     numero, taille_numero, puce, coche, trait, fleche, lien, noeud, chevron_bas, etiquette,
                     etiquette_dim, pt, secteur, arc, disque, zone, clamp, ajuster, nouveau_bloc, _kw, esc)

_zone_cadre = zone        # (le paramètre « zone » de carte_reelle masque ce nom)
MX, MY = 36, 36          # marges de la toile
ICI = _os.path.dirname(_os.path.abspath(__file__))
MOTEUR = _os.path.dirname(ICI)      # python/schemas_gss : polices (Lexend) et contours géographiques partagés


def _it(d, k, defaut=None):
    return d.get(k, defaut) if isinstance(d, dict) else defaut


def _toile():
    s = Svg()
    return s, s.W, s.H


def _poser(s, cs, t, b, n_lt, h, decal_v=None):
    """Dessine des cartes préparées (x, y, w) à la hauteur h ; decal_v centre le contenu des cartes verticales."""
    for c in cs:
        dec = decal_v if (decal_v and c.get("orient", "v") == "v") else 0
        s.add(carte(c["x"], c["y"], c["w"], h, t=t, b=b, n_lt=n_lt, decal=dec, **_kw(c)))


def _besoin_v(cs, t, b, n_lt):
    v = [carte(0, 0, c["w"], c["h"], t=t, b=b, mesure=True, n_lt=n_lt, **_kw(c)) for c in cs
         if c.get("orient", "v") == "v"]
    return max(v) if v else 0


def _hauteur_finale(h, besoin, mini=0.0):
    """Hauteur des cartes : le besoin du contenu + un peu d'air, sans dépasser h."""
    return max(besoin, min(h, max(besoin + max(18, besoin * 0.10), h * mini)))


def _ecart(n_rangs, h_rang, ecart, place, maxi=1.7):
    """Écart entre rangées : l'air restant de la page est réparti entre les rangées (au plus maxi × l'écart)."""
    if n_rangs <= 1:
        return ecart
    libre = place - n_rangs * h_rang
    return clamp(libre / (n_rangs - 1), ecart, ecart * maxi)


def _remplir(n, besoin, h_max, ecart, place, cible=0.86, k_h=1.28, k_e=2.4):
    """Hauteur de rangée et écart pour que la composition occupe la page (« 1 schéma = 1 page, en gros ») :
    d'abord le contenu + un peu d'air ; si l'ensemble n'occupe pas `cible` de la place, les cartes grandissent
    (jusqu'à k_h × le besoin), puis les écarts (jusqu'à k_e × l'écart). Dernier recours d'en_grand (_ETAT["etirer"]) :
    cartes et écarts grandissent jusqu'à remplir la place."""
    if _ETAT["etirer"]:
        cible, k_h, k_e = max(cible, 0.97), max(k_h, 2.5), max(k_e, 4.0)
    h2 = min(h_max, max(besoin, besoin + max(18, besoin * 0.10)))
    h2 = max(h2, besoin)
    tot = n * h2 + (n - 1) * ecart
    if tot < cible * place:
        h_lim = max(h2, min(h_max, besoin * k_h))
        h2 = max(h2, min(h_lim, (cible * place - (n - 1) * ecart) / n))
        tot = n * h2 + (n - 1) * ecart
    if tot < cible * place and n > 1:
        ecart = max(ecart, min(ecart * k_e, (cible * place - n * h2) / (n - 1)))
    return h2, ecart


def _y_optique(place, tot, y0=MY):
    """Position verticale : centrage optique (légèrement au-dessus du centre géométrique)."""
    return y0 + max(0, place - tot) * 0.46


# ── Grille de cartes ─────────────────────────────────────────────────────────
def grille(items, cols=None, role="creme", hauteur_max=250, t_max=22):
    """Cartes à pictogramme et gros titre (modèle de la page 27). 1 à 4 cartes : une colonne de cartes
    larges ; 5 à 8 : deux colonnes (la carte seule de la dernière rangée prend toute la largeur) ; 9 et plus :
    trois colonnes."""
    s, W, H = _toile()
    n = len(items)
    ncol = 1 if n <= 4 else (2 if n <= 8 else 3)
    gx = {1: 0, 2: 28, 3: 22}[ncol]
    gy = {1: 30, 2: 28, 3: 24}[ncol]
    wc = W - 2 * MX
    cw = (wc - (ncol - 1) * gx) / ncol
    rows = math.ceil(n / ncol)
    place = H - 2 * MY
    h = min({1: 320, 2: 360, 3: 330}[ncol], (place - (rows - 1) * gy) / rows)

    def specs(hh):
        out = []
        for i, it in enumerate(items):
            r, c = divmod(i, ncol)
            dans = min(ncol, n - r * ncol)
            if ncol == 2 and dans == 1:
                x, w_, o = MX, wc, "h"
            else:
                x0 = MX + (wc - (dans * cw + (dans - 1) * gx)) / 2
                x, w_, o = x0 + c * (cw + gx), cw, ("h" if ncol == 1 else "v")
            out.append({"x": x, "r": r, "w": w_, "h": hh, "role": _it(it, "role", role), "titre": _it(it, "titre"),
                        "corps": _it(it, "texte", ()), "icone": _it(it, "icone"), "num": _it(it, "num"),
                        "puces": _it(it, "puces", False), "orient": o})
        return out

    cs = specs(h)
    t, b, n_lt, besoin = ajuster_cartes(cs, t_max={1: 46, 2: 40, 3: 36}[ncol], t_min=18, quoi="grille")
    h2, gy2 = _remplir(rows, besoin, h, gy, place)
    bv = _besoin_v(cs, t, b, n_lt)
    tot = rows * h2 + (rows - 1) * gy2
    y0 = _y_optique(place, tot)
    cs = specs(h2)
    for c in cs:
        c["y"] = y0 + c["r"] * (h2 + gy2)
    _poser(s, cs, t, b, n_lt, h2, (h2 - bv) / 2 if bv else 0)
    return s


# ── Étoile → « sujet puis composantes » ──────────────────────────────────────
def _hub(s, x, y, w, role, titre, sous, t_max=48, h_max=230, icone=None):
    """Bandeau du sujet : la plus grande taille qui tient ; renvoie (svg, hauteur)."""
    corps = [sous] if sous else ()

    def essai(t, b):
        try:
            return bandeau(0, 0, w, 999, role, titre, corps, icone, t, b, mesure=True) <= h_max
        except Deborde:
            return False
    t, b = ajuster(essai, t_max, 24, 0.56, 20, quoi="bandeau")
    hh = max(126, bandeau(0, 0, w, 999, role, titre, corps, icone, t, b, mesure=True))
    return (lambda yy: bandeau(x, yy, w, hh, role, titre, corps, icone, t, b)), hh


def etoile(centre, branches, role_centre="sombre", r=118, larg=350):
    """Le sujet (centre de l'étoile d'origine) en bandeau de tête, puis ses composantes reliées par un fil
    central, lues de haut en bas et de gauche à droite (au lieu d'une étoile sans point d'entrée)."""
    s, W, H = _toile()
    titre, sous = centre if isinstance(centre, (tuple, list)) else (centre, None)
    n = len(branches)
    wc = W - 2 * MX
    hub, hh = _hub(s, MX, 0, wc, role_centre, titre, sous)
    g_hub = 64
    if n <= 3:
        ncol, gx = n, 26
    else:
        ncol, gx = 2, 104
    cw = (wc - (ncol - 1) * gx) / ncol
    rows = math.ceil(n / ncol)
    gy = 30
    zone_h = H - 2 * MY - hh - g_hub
    h = min(560 if n <= 3 else 340, (zone_h - (rows - 1) * gy) / rows)

    def specs(hh_):
        out = []
        for i, br in enumerate(branches):
            r_, c = divmod(i, ncol)
            dans = min(ncol, n - r_ * ncol)
            x = MX + c * (cw + gx) if dans == ncol else (W - cw) / 2
            out.append({"x": x, "r": r_, "w": cw, "h": hh_, "role": _it(br, "role", "creme"),
                        "titre": _it(br, "titre"), "corps": _it(br, "texte", ()), "icone": _it(br, "icone"),
                        "orient": "v", "seule": dans == 1 and ncol == 2})
        return out

    cs = specs(h)
    t, b, n_lt, besoin = ajuster_cartes(cs, t_max=40, t_min=18, quoi="étoile")
    h2, gy = _remplir(rows, besoin, h, gy, zone_h, k_e=1.8)
    bv = _besoin_v(cs, t, b, n_lt)
    g_hub = clamp(zone_h + g_hub - rows * h2 - (rows - 1) * gy, 64, 92)
    tot = hh + g_hub + rows * h2 + (rows - 1) * gy
    ytop = _y_optique(H - 2 * MY, tot)
    yc0 = ytop + hh + g_hub
    cs = specs(h2)
    for c in cs:
        c["y"] = yc0 + c["r"] * (h2 + gy)
    th = T()
    lc = th.liens["couleur"]
    cxm = W / 2
    # fils de lecture
    if n <= 3:
        yb = ytop + hh + g_hub * 0.45
        s.add(lien([(cxm, ytop + hh), (cxm, yb)]))
        xs = [c["x"] + cw / 2 for c in cs]
        if len(xs) > 1:
            s.add(lien([(xs[0], yb), (xs[-1], yb)]))
        for x in xs:
            s.add(fleche(x, yb, x, yc0 - 3, couleur=th.fleches["couleur"]))
        s.add(noeud(cxm, yb))
    else:
        derniere = cs[-1]
        if derniere["seule"]:
            s.add(lien([(cxm, ytop + hh), (cxm, derniere["y"] - 16)]))
            s.add(fleche(cxm, derniere["y"] - 20, cxm, derniere["y"] - 3, couleur=lc, ep=th.liens["epaisseur"]))
        else:
            s.add(lien([(cxm, ytop + hh), (cxm, derniere["y"] + h2 / 2)]))
        for c in cs:
            if c["seule"]:
                continue
            yy = c["y"] + h2 / 2
            if c["x"] < cxm:
                s.add(lien([(c["x"] + cw, yy), (cxm, yy)]))
            else:
                s.add(lien([(cxm, yy), (c["x"], yy)]))
            s.add(noeud(cxm, yy))
    s.add(hub(ytop))
    _poser(s, cs, t, b, n_lt, h2, (h2 - bv) / 2 if bv else 0)
    return s


# ── Procédure en flux → étapes empilées sur un rail numéroté ─────────────────
def flux(etapes, labels=None, sorties=None, h=None, numeroter=True, cy=None, gap=None):
    """Étapes de haut en bas sur un rail numéroté ; labels {i: texte} posés entre l'étape i et i+1 ;
    sorties {i: dict} : issue alternative de l'étape i, à droite, reliée par un coude étiqueté."""
    labels, sorties = labels or {}, sorties or {}
    s, W, H = _toile()
    th = T()
    n = len(etapes)
    tnum = 26
    sn = taille_numero(tnum)
    x_rail = MX + sn / 2 + 2
    x_m = MX + sn + 34
    a_so = bool(sorties)
    w_m = (W - MX - x_m) if not a_so else 470
    x_s = x_m + w_m + 48
    w_s = W - MX - x_s
    rows = n + (1 if any(i >= n - 1 for i in sorties) else 0)
    gaps = []
    for r in range(rows - 1):
        g = 64
        if r in labels or r in sorties:
            g = 118
        gaps.append(g)
    place = H - 2 * MY
    h_lib = (place - sum(gaps)) / rows
    hh = min(300, h_lib)
    main = [{"w": w_m, "h": hh, "role": _it(e, "role", "creme"), "titre": _it(e, "titre"), "corps": _it(e, "texte", ()),
             "icone": _it(e, "icone"), "orient": "h"} for e in etapes]
    so = [{"w": w_s, "h": hh, "role": _it(v, "role", "vert"), "titre": _it(v, "titre"), "corps": _it(v, "texte", ()),
           "orient": "v", "i": i} for i, v in sorted(sorties.items())]
    t, b, n_lt, besoin = ajuster_cartes(main + so, t_max={2: 44, 3: 44, 4: 40}.get(n, 36), t_min=18, aligner=False,
                                        quoi="flux")
    h2 = max(besoin, min(hh, besoin + max(18, besoin * 0.1)))
    tot = rows * h2 + sum(gaps)
    if tot < 0.86 * place:
        h2 = max(h2, min(hh, besoin * 1.25, (0.86 * place - sum(gaps)) / rows))
        tot = rows * h2 + sum(gaps)
    libre = 0.86 * place - tot
    if rows > 1 and libre > 0:
        gaps = [g + min(g * 1.0, libre / (rows - 1)) for g in gaps]
    tot = rows * h2 + sum(gaps)
    y0 = _y_optique(place, tot)
    ys = []
    yy = y0
    for r in range(rows):
        ys.append(yy)
        yy += h2 + (gaps[r] if r < rows - 1 else 0)
    # rail
    if numeroter:
        for i in range(n - 1):
            a, b_ = ys[i] + h2 / 2 + sn / 2 + 6, ys[i + 1] + h2 / 2 - sn / 2 - 6
            s.add(lien([(x_rail, a), (x_rail, b_ - 10)], ep=th.liens["epaisseur"] + 0.5))
            s.add(chevron_bas(x_rail, b_ - 6, 16))
    else:
        for i in range(n - 1):
            s.add(fleche(x_m + w_m / 2, ys[i] + h2 + 6, x_m + w_m / 2, ys[i + 1] - 6))
    # sorties
    for c in so:
        i = c["i"]
        r = min(i + 1, rows - 1)
        ya = ys[i] + h2 / 2
        xc = x_s + w_s / 2
        s.add(trait([(x_m + w_m, ya), (xc, ya), (xc, ys[r] - 4)]))
        lab = _it(sorties[i], "label")
        if lab:
            lt, lr = lab if isinstance(lab, tuple) else (lab, "rouge")
            s.add(etiquette(xc, ys[i] + h2 + gaps[i] / 2 if i < rows - 1 else ya + 40, lt, lr, 18, w_s + 30))
    for i, (e, c) in enumerate(zip(etapes, main)):
        s.add(carte(x_m, ys[i], w_m, h2, t=t, b=b, **_kw(c)))
        if numeroter:
            s.add(numero(x_rail, ys[i] + h2 / 2, f"{i + 1:02d}", c["role"], tnum))
    for i, lab in labels.items():
        lt, lr = lab if isinstance(lab, tuple) else (lab, "rouge")
        _, lw, lh = etiquette_dim(lt, 18, 300)
        s.add(etiquette(x_m + 18 + lw / 2, ys[i] + h2 + gaps[i] / 2, lt, lr, 18, 300))
    for c in so:
        r = min(c["i"] + 1, rows - 1)
        s.add(carte(x_s, ys[r], w_s, h2, t=t, b=b, **_kw(c)))
    return s


# ── Étapes en chevrons → bandes descendantes ─────────────────────────────────
def chevrons(etapes, h_chevron=120, h_corps=210):
    """Chaque étape : un chevron plein qui pointe vers l'étape suivante (numéro + titre), et son texte
    dans un panneau à droite. Lecture de haut en bas."""
    s, W, H = _toile()
    th = T()
    n = len(etapes)
    wc = W - 2 * MX
    w_ch = 340
    g_x = 26
    w_b = wc - w_ch - g_x
    p = 34                       # profondeur de la pointe
    gap = 14
    hh = min(300, (H - 2 * MY - (n - 1) * gap) / n)
    tnum = 24

    def essai(t, b):
        for e in etapes:
            P = preparer(_it(e, "titre"), (), w_ch - 70, t, b)
            if P is None or P["total"] + tnum * 1.6 + 26 > hh - p - 10:
                return False
            corps = _it(e, "texte", ())
            if corps:
                try:
                    if carte(0, 0, w_b, hh, _it(e, "role", "sable"), None, corps, puces=_it(e, "puces", False), t=t,
                             b=b, mesure=True) > hh - 8:
                        return False
                except Deborde:
                    return False
        return True
    t, b = ajuster(essai, 40, 18, 0.74, 17, quoi="chevrons")
    besoin = 0
    for e in etapes:
        P = preparer(_it(e, "titre"), (), w_ch - 70, t, b)
        besoin = max(besoin, P["total"] + tnum * 1.6 + 26 + p + 10)
        if _it(e, "texte", ()):
            besoin = max(besoin, carte(0, 0, w_b, hh, _it(e, "role", "sable"), None, _it(e, "texte", ()),
                                       puces=_it(e, "puces", False), t=t, b=b, mesure=True) + 8)
    h2 = _hauteur_finale(hh, besoin, 0.82)
    tot = n * h2 + (n - 1) * gap
    y0 = (H - tot) / 2
    for i, e in enumerate(etapes):
        role = _it(e, "role", "sable")
        R = th.role(role)
        y = y0 + i * (h2 + gap)
        x = MX
        haut = 0 if i == 0 else p
        pts = [(x, y - (gap if i else 0)), (x + w_ch / 2, y - (gap if i else 0) + haut), (x + w_ch, y - (gap if i else 0)),
               (x + w_ch, y + h2 - p), (x + w_ch / 2, y + h2), (x, y + h2 - p)]
        if i == 0:
            pts = [(x, y), (x + w_ch, y), (x + w_ch, y + h2 - p), (x + w_ch / 2, y + h2), (x, y + h2 - p)]
        rx = th.carte["rayon"]
        d = "M" + " L".join(f"{a:.1f},{c:.1f}" for a, c in pts) + " Z"
        if th.carte.get("ombre"):
            s.add(f'<path d="{d}" fill="{th.carte["ombre"]["couleur"]}" opacity="0.10" transform="translate(0,4)"/>')
        if th.sombre:
            s.add(f'<path d="{d}" fill="{R.clair}" stroke="{R.vif}" stroke-width="2" stroke-linejoin="round"/>')
            ct = th.c["encre"]
            cnum = R.vif
            fond = R.clair
        else:
            s.add(f'<path d="{d}" fill="{R.fonce}" stroke="{th.c["fond_schema"]}" stroke-width="3" '
                  f'stroke-linejoin="{"round" if rx else "miter"}"/>')
            ct = R.sur_fonce
            cnum = R.sur_fonce
            fond = R.fonce
        zone(x, y, w_ch, h2 - p)
        P = preparer(_it(e, "titre"), (), w_ch - 70, t, b)
        top = y + haut + 14
        bas = y + h2 - p - 6
        bloc_h = tnum * 1.6 + P["total"]
        yy = top + (bas - top - bloc_h) / 2
        s.add(texte_seul(x + 34, yy + tnum * 0.95, f"{i + 1:02d}", tnum, 700, cnum, "start", "chiffres",
                         ' opacity="0.9"', fond=fond))
        s.add(dessiner(x + 34, yy + tnum * 1.6, w_ch - 70, P["total"], P, "start", couleur_titre=ct, fond=fond))
        corps = _it(e, "texte", ())
        if corps:
            s.add(carte(x + w_ch + g_x, y + 4, w_b, h2 - p + 10 if h2 - p + 10 > besoin - 8 else besoin - 8, role, None,
                        corps, puces=_it(e, "puces", False), t=t, b=b, v_align="middle"))
    return s


# ── Comparatif ───────────────────────────────────────────────────────────────
def _tete_colonne(x, y, w, h, role, titre, sous, icone, t, b, mesure=False):
    """En-tête de colonne : pictogramme centré, titre et sous-titre centrés, dans l'aplat du style."""
    th = T()
    R = th.role(role)
    mode = th.bandeau["mode"]
    rx = th.bandeau.get("rayon", 0)
    pad = clamp(0.75 * t, 20, 34)
    S = clamp(2.2 * t, 52, 100) if icone else 0
    P = preparer(titre, [sous] if sous else (), w - 2 * pad, t, b)
    if P is None:
        raise Deborde(f"en-tête : {titre!r}")
    ep_bas = 8 if mode == "plein_filet" else 0
    besoin = pad + (S + pad * 0.55 if icone else 0) + P["total"] + pad + ep_bas
    if mesure:
        return besoin
    zone(x, y, w, h)
    o = []
    if mode in ("plein", "plein_filet"):
        fond, ct, cb = R.fonce, R.sur_fonce, R.sur_fonce
        o.append(ombre(x, y, w, h, rx, 0.8) + rect(x, y, w, h, fond, rx))
        if mode == "plein_filet":
            o.append(rect(x, y + h - ep_bas, w, ep_bas, th.c["accent"] if role in ("or", "sable", "sombre", "creme") else R.vif,
                          0, extra='' if role in ("or", "sable", "sombre", "creme") else ' opacity="0.55"'))
    elif mode == "teinte_barre":
        fond, ct, cb = R.clair, R.fonce, th.c["encre_2"]
        o.append(rect(x, y, w, h, fond, rx))
        o.append(f'<path d="{chemin_arrondi(x, y, w, 7, rx, rx, 0, 0)}" fill="{R.vif}"/>')
    else:
        fond, ct, cb = th.c["surface"], th.c["encre"], th.c["encre_2"]
        o.append(rect(x - 3, y - 3, w + 6, h + 6, R.vif, rx + 3, extra=' opacity="0.10"'))
        o.append(rect(x, y, w, h, fond, rx, R.vif, 1.8))
    yy = y + (h - ep_bas - (besoin - ep_bas)) / 2 + pad
    if icone:
        if mode in ("plein", "plein_filet"):
            o.append(glyphe(icone, x + w / 2, yy + S / 2, S, R.sur_fonce))
        else:
            o.append(pastille(x + w / 2, yy + S / 2, icone, role, S, sur=fond))
        yy += S + pad * 0.55
    o.append(dessiner(x + pad, yy, w - 2 * pad, P["total"], P, "middle", cb, ct, fond=fond))
    return "\n".join(o)


def comparatif(colonnes, vs=False, h_tete=104):
    """Colonnes côte à côte : en-tête plein (pictogramme + titre), puis les points à puces. vs : « OU » entre
    les deux colonnes."""
    s, W, H = _toile()
    th = T()
    n = len(colonnes)
    wc = W - 2 * MX
    gx = 86 if (vs and n == 2) else 26
    cw = (wc - (n - 1) * gx) / n
    g_tb = 22
    h_max_corps = 720

    def essai_tete(t, b):
        try:
            for c in colonnes:
                P = preparer(_it(c, "titre"), (), cw - 2 * clamp(0.75 * t, 20, 34), t, b)
                if P is None or len(P["tl"]) > (2 if n == 2 else 3):
                    return False
            return max(_tete_colonne(0, 0, cw, 999, _it(c, "role", "sable"), _it(c, "titre"), _it(c, "sous"),
                                     _it(c, "icone"), t, b, mesure=True) for c in colonnes) <= 340
        except Deborde:
            return False
    t, b = ajuster(essai_tete, 44, 18, 0.6, 17, quoi="comparatif (en-têtes)", b_max=25)
    ht = max(_tete_colonne(0, 0, cw, 999, _it(c, "role", "sable"), _it(c, "titre"), _it(c, "sous"), _it(c, "icone"),
                           t, b, mesure=True) for c in colonnes)
    place = H - 2 * MY - ht - g_tb - 64
    peu = max(len(_it(c, "points", ())) for c in colonnes) <= 3
    bp = 32 if peu else 28
    while bp >= 17:
        Ps = [preparer(None, _it(c, "points", ()), cw - 60, bp, bp, puces=True) for c in colonnes]
        if all(P is not None for P in Ps) and max(P["total"] for P in Ps) <= place:
            break
        bp -= 0.5
    else:
        raise Deborde("comparatif : points trop longs")
    hc = max(P["total"] for P in Ps) + 64
    hc = max(hc, min(place + 64, hc * (1.35 if peu else 1.12)))     # un peu d'air dans les colonnes courtes
    if _ETAT["etirer"]:     # dernier recours d'en_grand (colonnes étroites, le zoom n'agrandit pas) : corps allongés
        hc = max(hc, min(place + 64, _ETAT["etirer"] * H - ht - g_tb))
    tot = ht + g_tb + hc
    y0 = _y_optique(H - 2 * MY, tot)
    fond_c = th.c[th.carte.get("remplissage", "carte_fond")]
    for i, (c, P) in enumerate(zip(colonnes, Ps)):
        x = MX + i * (cw + gx)
        role = _it(c, "role", "sable")
        s.add(_tete_colonne(x, y0, cw, ht, role, _it(c, "titre"), _it(c, "sous"), _it(c, "icone"), t, b))
        yb = y0 + ht + g_tb
        zone(x, yb, cw, hc)
        s.add(surface(x, yb, cw, hc, th.carte["rayon"], 0.8, fond_c))
        dec = (hc - 64 - max(P_["total"] for P_ in Ps)) / 2          # même marge haute pour toutes les colonnes
        s.add(dessiner(x + 30, yb + 32 + dec, cw - 60, hc - 64 - dec, P, "start", th.c["encre"], v_align="top",
                       puce_couleur=th.role(role).vif, fond=fond_c))
    if vs and n == 2:
        cx = MX + cw + gx / 2
        cy = y0 + ht + g_tb + hc / 2
        st = th.role("sombre")
        s.add(disque(cx, cy, 44, st.fonce, th.c["fond_schema"], 6))
        s.add(texte_seul(cx, cy + 10, "OU", 28, 700, st.sur_fonce, "middle", "chiffres", fond=st.fonce))
    return s


# ── Chiffres clés ────────────────────────────────────────────────────────────
def _tuile(x, y, w, h, t, role, valeur, label, icone, tv, tl, orient, mesure=False):
    th = T()
    R = th.role(role)
    ca = th.carte
    pad = 30
    S = 78 if orient == "h" else 64
    fond = th.c[ca.get("remplissage", "carte_fond")]
    ent = ca["entete"]
    if orient == "h":
        wv = largeur(valeur, tv, th.typo["chiffres_graisse"], "chiffres")
        xl = pad + (S + 28 if icone else 0) + wv + 30
        if ent == "bande_titre":
            xl = (S + 2 * pad) + pad + wv + 30
        P = preparer(None, [label], w - xl - pad, tl, tl)
        if P is None:
            raise Deborde(label)
        besoin = max(S + 2 * pad, tv * 1.05 + 2 * pad, P["total"] + 2 * pad)
        if mesure:
            return besoin
        o = []
        if ent == "bande_titre":
            zone(x, y, w, h)
            o.append(surface(x, y, w, h, ca["rayon"], 1.0, fond))
            ws = S + 2 * pad
            o.append(f'<path d="{chemin_arrondi(x, y, ws, h, ca["rayon"], 0, 0, ca["rayon"])}" fill="{R.fonce}"/>')
            if icone:
                o.append(pastille(x + ws / 2, y + h / 2, icone, role, S * 0.9, "dans_bande"))
            xv = x + ws + pad
        else:
            zone(x, y, w, h)
            o.append(surface(x, y, w, h, ca["rayon"], 1.0, fond))
            if ent == "filet_haut":
                o.append(f'<path d="{chemin_arrondi(x, y, w, ca["epaisseur_filet"], ca["rayon"], ca["rayon"], 0, 0)}" fill="{R.vif}"/>')
            elif ent == "barre_gauche":
                o.append(f'<path d="{chemin_arrondi(x, y, ca["epaisseur_barre"], h, ca["rayon"], 0, 0, ca["rayon"])}" fill="{R.vif}"/>')
            xv = x + pad
            if icone:
                o.append(pastille(xv + S / 2, y + h / 2, icone, role, S, sur=fond))
                xv += S + 28
        cv = R.fonce if not th.sombre else R.vif
        o.append(texte_seul(xv, y + h / 2 + tv * 0.36, valeur, tv, th.typo["chiffres_graisse"], cv, "start", "chiffres", fond=fond))
        xl = xv + wv + 30
        o.append(dessiner(xl, y, x + w - pad - xl, h, P, "start", th.c["encre_2"], v_align="middle", fond=fond))
        return "\n".join(o)
    # verticale
    wv = largeur(valeur, tv, th.typo["chiffres_graisse"], "chiffres")
    if wv > w - 2 * pad:
        raise Deborde(valeur)
    P = preparer(None, [label], w - 2 * pad, tl, tl)
    if P is None:
        raise Deborde(label)
    besoin = pad + (S + 18 if icone else 0) + tv * 1.05 + 14 + P["total"] + pad
    if mesure:
        return besoin
    zone(x, y, w, h)
    o = [surface(x, y, w, h, ca["rayon"], 1.0, fond)]
    if ent == "filet_haut":
        o.append(f'<path d="{chemin_arrondi(x, y, w, ca["epaisseur_filet"], ca["rayon"], ca["rayon"], 0, 0)}" fill="{R.vif}"/>')
    elif ent == "barre_gauche":
        o.append(f'<path d="{chemin_arrondi(x, y, ca["epaisseur_barre"], h, ca["rayon"], 0, 0, ca["rayon"])}" fill="{R.vif}"/>')
    elif ent == "bande_titre":
        o.append(f'<path d="{chemin_arrondi(x, y, w, 12, ca["rayon"], ca["rayon"], 0, 0)}" fill="{R.fonce}"/>')
    yy = y + (h - besoin) / 2 + pad
    if icone:
        o.append(pastille(x + w / 2, yy + S / 2, icone, role, S, "carre" if ent == "bande_titre" else None, sur=fond))
        yy += S + 18
    cv = R.fonce if not th.sombre else R.vif
    o.append(texte_seul(x + w / 2, yy + tv * 0.86, valeur, tv, th.typo["chiffres_graisse"], cv, "middle", "chiffres", fond=fond))
    yy += tv * 1.05 + 14
    o.append(dessiner(x + pad, yy, w - 2 * pad, P["total"], P, "middle", th.c["encre_2"], fond=fond))
    return "\n".join(o)


def chiffres(tuiles, note=None, cols=None):
    """Chiffres clés : de 1 à 3 chiffres, des bandeaux larges empilés ; au-delà, une grille de deux colonnes.
    Le chiffre est le plus gros élément de la page."""
    s, W, H = _toile()
    th = T()
    n = len(tuiles)
    wc = W - 2 * MX
    h_note = 0
    Pn = None
    if note:
        Pn = preparer(None, [note], wc - 40, 21, 21)
        h_note = Pn["total"] + 44
    if n <= 3:
        ncol, orient = 1, "h"
    else:
        ncol, orient = 2, "v"
    gx, gy = 28, 30
    cw = (wc - (ncol - 1) * gx) / ncol
    rows = math.ceil(n / ncol)
    place = H - 2 * MY - h_note
    h = min(320 if ncol == 1 else 360, (place - (rows - 1) * gy) / rows)
    tv_max = 140 if ncol == 1 else 120

    def essai(tv, tl):
        try:
            for tu in tuiles:
                if _tuile(0, 0, cw, h, 20, _it(tu, "role", "creme"), str(tu["valeur"]), tu["label"], _it(tu, "icone"),
                          tv, tl, orient, mesure=True) > h:
                    return False
                if orient == "h":
                    wv = largeur(str(tu["valeur"]), tv, th.typo["chiffres_graisse"], "chiffres")
                    if wv > cw * 0.5:
                        return False
        except Deborde:
            return False
        return True
    tv = tv_max
    while tv >= 40:
        tl = clamp(tv * 0.24, 20, 30)
        if essai(tv, tl):
            break
        tv -= 4
    else:
        raise Deborde("chiffres")
    besoin = max(_tuile(0, 0, cw, h, 20, _it(tu, "role", "creme"), str(tu["valeur"]), tu["label"], _it(tu, "icone"),
                        tv, tl, orient, mesure=True) for tu in tuiles)
    h2, gy = _remplir(rows, besoin, h, gy, place, k_e=2.0)
    tot = rows * h2 + (rows - 1) * gy + h_note
    y0 = _y_optique(H - 2 * MY, tot)
    for i, tu in enumerate(tuiles):
        r, c = divmod(i, ncol)
        dans = min(ncol, n - r * ncol)
        x = MX + c * (cw + gx) if dans == ncol else (W - cw) / 2
        s.add(_tuile(x, y0 + r * (h2 + gy), cw, h2, 20, _it(tu, "role", "creme"), str(tu["valeur"]), tu["label"],
                     _it(tu, "icone"), tv, tl, orient))
    if note:
        yn = y0 + rows * h2 + (rows - 1) * gy + 26
        s.add(rect(MX + wc / 2 - 40, yn - 8, 80, 3, th.c["accent"], 1.5))
        s.add(dessiner(MX + 20, yn + 6, wc - 40, Pn["total"], Pn, "middle", th.c["encre_3"]))
    return s


# ── Liste de contrôle ────────────────────────────────────────────────────────
def checklist(groupes, h_tete=96):
    """Un bandeau d'en-tête par groupe, puis les points cochés, un par ligne, séparés par des filets."""
    s, W, H = _toile()
    th = T()
    n = len(groupes)
    wc = W - 2 * MX
    g_g = 40
    g_t = 14
    pad = 30
    sc = 36

    def mesures(t, b):
        out = []
        for g in groupes:
            try:
                ht = bandeau(0, 0, wc, 999, _it(g, "role", "bleu"), _it(g, "titre"), [_it(g, "sous")] if _it(g, "sous") else (),
                             _it(g, "icone"), t, b * 0.95, mesure=True) if _it(g, "titre") else 0
            except Deborde:
                return None
            lignes = []
            for it in g["items"]:
                r = couper(insec(it), b, th.typo["texte_graisse"], wc - 2 * pad - sc - 24)
                if r is None:
                    return None
                lignes.append(r)
            out.append((ht, lignes))
        return out

    def hauteur(t, b, m, gap_l):
        lh = b * th.typo["interligne_texte"]
        tot = 0
        for ht, lignes in m:
            tot += ht + (g_t if ht else 0) + sum(max(len(l) * lh, sc) + gap_l for l in lignes) + gap_l
        return tot + (n - 1) * g_g

    def essai(t, b):
        m = mesures(t, b)
        return m is not None and hauteur(t, b, m, b * 1.25) <= H - 2 * MY
    t, b = ajuster(essai, 40, 18, 0.80, 18, quoi="liste")
    m = mesures(t, b)
    lh = b * th.typo["interligne_texte"]
    gap_l = b * 1.25
    # on répartit l'air restant entre les lignes (liste aérée, toujours lisible)
    reste = H - 2 * MY - hauteur(t, b, m, gap_l)
    nl = sum(len(l) + 1 for _, l in m)
    gap_l = min(b * (4.0 if _ETAT["etirer"] else 2.1), gap_l + max(0, reste * (0.9 if _ETAT["etirer"] else 0.7)) / max(nl, 1))
    tot = hauteur(t, b, m, gap_l)
    y = (H - tot) / 2
    fond_c = th.c[th.carte.get("remplissage", "carte_fond")]
    for g, (ht, lignes) in zip(groupes, m):
        role = _it(g, "role", "bleu")
        if ht:
            s.add(bandeau(MX, y, wc, ht, role, _it(g, "titre"), [_it(g, "sous")] if _it(g, "sous") else (),
                          _it(g, "icone"), t, b * 0.95, align="start"))
            y += ht + g_t
        hl = sum(max(len(l) * lh, sc) + gap_l for l in lignes) + gap_l
        zone(MX, y, wc, hl)
        s.add(surface(MX, y, wc, hl, th.carte["rayon"], 0.8, fond_c))
        yy = y + gap_l
        for k, l in enumerate(lignes):
            bh = max(len(l) * lh, sc)
            s.add(coche(MX + pad + sc / 2, yy + bh / 2, sc, "vert"))
            bb = nouveau_bloc()
            for j, li in enumerate(l):
                base = yy + (bh - len(l) * lh) / 2 + (lh - b) / 2 + b * 0.8 + j * lh
                s.add(texte(MX + pad + sc + 24, base, li, b, None, th.c["encre"], "start", bloc=bb, fond=fond_c))
            yy += bh + gap_l
            if k < len(lignes) - 1:
                s.add(rect(MX + pad + sc + 24, yy - gap_l / 2 - 0.6, wc - 2 * pad - sc - 24, 1.2, th.c["filet"], 0))
        y += hl + g_g
    return s


# ── Cycle ────────────────────────────────────────────────────────────────────
_LEXEND = {}


def _largeur_lexend(t, taille, poids):
    """Mesure du moteur d'origine (Lexend) : sert seulement à reproduire ses choix d'affichage de texte."""
    from PIL import ImageFont
    k = (taille, poids)
    if k not in _LEXEND:
        fixe = min((400, 500, 600, 700, 800), key=lambda w: abs(w - poids))
        _LEXEND[k] = ImageFont.truetype(_os.path.join(MOTEUR, "polices", f"Lexend-{fixe}.ttf"), max(1, round(taille * 4)))
    return _LEXEND[k].getlength(t) / 4


def _couper_lexend(t, taille, poids, maxw):
    lignes, cour = [], ""
    for mot in t.split(" "):
        if not mot:
            continue
        essai = f"{cour} {mot}".strip()
        if _largeur_lexend(essai, taille, poids) <= maxw:
            cour = essai
        else:
            if not cour or _largeur_lexend(mot, taille, poids) > maxw:
                return None
            lignes.append(cour)
            cour = mot
    if cour:
        lignes.append(cour)
    return lignes


def _libelles_cycle(secteurs, ro=232, ri=122):
    """Le moteur d'origine écrit les libellés courts dans l'anneau seulement s'ils tiennent (sinon, des
    numéros) : même décision ici, pour garder exactement les mêmes textes."""
    n = len(secteurs)
    pas = 360 / n
    corde = 2 * ((ri + ro) / 2) * math.sin(math.radians(pas / 2)) * 0.62
    for t_lib in (16, 14.5, 13):
        libs = [_couper_lexend(_it(se, "court", _it(se, "titre")).upper(), t_lib, 800, min(corde, 132)) for se in secteurs]
        if all(l and len(l) <= 2 for l in libs):
            return True
    return False


def cycle(secteurs, centre, cx=330, ro=232, ri=122, cartes=True):
    """Anneau en haut de page (sens de rotation marqué), puis les étapes détaillées en cartes numérotées."""
    s, W, H = _toile()
    th = T()
    n = len(secteurs)
    tous = _libelles_cycle(secteurs, ro, ri)
    R_o, R_i = 300, 138
    pas = 360 / n
    g = 1.4
    ncol = 2 if n == 4 else 1
    gx, gy = 28, 24
    wc = W - 2 * MX
    cw = (wc - (ncol - 1) * gx) / ncol
    rows = math.ceil(n / ncol)
    place = H - 2 * MY
    zone_c = place - (2 * R_o + 20) - 44
    hcar = min(280, (zone_c - (rows - 1) * gy) / rows)
    cs = [{"w": cw, "h": hcar, "role": _it(se, "role", "sable"), "titre": _it(se, "titre"), "corps": _it(se, "texte", ()),
           "num": i + 1, "orient": "v" if ncol == 2 else "h"} for i, se in enumerate(secteurs)] if cartes else []
    if cs:
        t, b, n_lt, besoin = ajuster_cartes(cs, 34, 18, quoi="cycle")
        h2, gy = _remplir(rows, besoin, hcar, gy, zone_c, cible=0.9, k_e=1.6)
    else:
        h2 = 0
    tot = 2 * R_o + 20 + ((44 + rows * h2 + (rows - 1) * gy) if cs else 0)
    ytop = _y_optique(place, tot)
    cx, cy = W / 2, ytop + R_o + 10
    fond = th.c["fond_schema"]
    for i, se in enumerate(secteurs):
        R = th.role(_it(se, "role", "sable"))
        if th.sombre:
            s.add(secteur(cx, cy, R_i, R_o, i * pas + g, (i + 1) * pas - g, R.clair, R.vif, 2))
        else:
            s.add(secteur(cx, cy, R_i, R_o, i * pas + g, (i + 1) * pas - g, R.fonce))
    # flèches de rotation entre secteurs
    for i in range(n):
        a = (i + 1) * pas
        px, py = pt(cx, cy, (R_i + R_o) / 2, a)
        s.add(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="22" fill="{fond}"/>')
        ang = math.radians(a)
        dx, dy = math.cos(ang), math.sin(ang)
        s.add(trait([(px - dx * 9, py - dy * 9), (px + dx * 11, py + dy * 11)], 3, True, th.fleches["couleur"], taille=13))
    # libellés (même décision que le moteur d'origine) : une taille commune ; chaque libellé doit tenir
    # entièrement dans son secteur (les quatre coins de son cadre sont contrôlés)
    courts = [_it(se, "court", _it(se, "titre")).upper() for se in secteurs]

    def dans_secteur(i, x0, y0, x1, y1, marge=8):
        for (px, py) in ((x0, y0), (x1, y0), (x0, y1), (x1, y1)):
            rr = math.hypot(px - cx, py - cy)
            if rr < R_i + marge or rr > R_o - marge:
                return False
            a = math.degrees(math.atan2(px - cx, -(py - cy))) % 360
            a0, a1 = i * pas + g + 2, (i + 1) * pas - g - 2
            if not (a0 <= a <= a1):
                return False
        return True

    def placer_un(i, t_l):
        c = courts[i]
        l = couper(c, t_l, 600, (R_o - R_i) * 1.7)
        if not l or len(l) > 2:
            return None
        wl = max(largeur(x, t_l, 600) for x in l)
        hl = len(l) * t_l * 1.18
        a = (i + 0.5) * pas
        rm = (R_i + R_o) / 2
        for rr in (rm, rm - 10, rm + 10, rm - 20, rm + 20, rm - 30):
            tx, ty = pt(cx, cy, rr, a)
            if dans_secteur(i, tx - wl / 2, ty - hl / 2, tx + wl / 2, ty + hl / 2, 7):
                return (l, tx, ty, hl, t_l)
        return None

    # taille maximale de chaque libellé ; taille commune = la plus petite, sans descendre sous 18 px à cause
    # d'un seul mot très long (qui garde alors sa propre taille)
    maxi_l = []
    for i in range(n):
        m = None
        for tl_ in (28, 26, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14):
            m = placer_un(i, tl_)
            if m:
                break
        maxi_l.append(m)
    pl = None
    if all(maxi_l):
        tailles = [m[4] for m in maxi_l]
        grands = [x for x in tailles if x >= 18]
        commune = min(grands) if grands else min(tailles)
        pl = [placer_un(i, min(commune, tailles[i])) for i in range(n)]
        if not all(pl):
            pl = maxi_l
    for i, se in enumerate(secteurs):
        role = _it(se, "role", "sable")
        R = th.role(role)
        a = (i + 0.5) * pas
        coul = R.sur_fonce if not th.sombre else R.vif
        f_ = R.fonce if not th.sombre else R.clair
        if tous and pl:
            l, tx, ty, hl, t_lib = pl[i]
            bb = nouveau_bloc()
            for j, ligne in enumerate(l):
                s.add(texte(tx, ty - hl / 2 + t_lib * 0.86 + j * t_lib * 1.18, ligne, t_lib, 600, coul, "middle", "texte",
                            ' letter-spacing="0.8"', bloc=bb, fond=f_))
        else:
            tx, ty = pt(cx, cy, (R_i + R_o) / 2, a)
            s.add(texte_seul(tx, ty + 18, str(i + 1), 52, 700, coul, "middle", "chiffres", fond=f_))
        if tous and pl:
            nx, ny = pt(cx, cy, R_o + 2, a)
            s.add(disque(nx, ny, 25, th.c["fond_schema"]))
            s.add(numero(nx, ny, str(i + 1), role, 20))
    # centre
    tc, sous = centre if isinstance(centre, (tuple, list)) else (centre, None)
    rc = R_i - 18
    fc = th.c["surface_2"] if not th.sombre else th.c["surface"]
    s.add(disque(cx, cy, rc, fc, th.c["filet"] if th.sombre else None, 1.5))
    s.add(bloc_texte(cx - rc * 0.8, cy - rc * 0.62, rc * 1.6, rc * 1.24, tc, [sous] if sous else (), align="middle",
                     t_max=36, t_min=18, b_ratio=0.62, b_min=17, fond=fc))
    zone(cx - R_o - 28, cy - R_o - 28, 2 * R_o + 56, 2 * R_o + 56)   # anneau et numéros posés sur son bord
    if cs:
        y0 = ytop + 2 * R_o + 20 + 44
        for i, c in enumerate(cs):
            r, k = divmod(i, ncol)
            c["x"], c["y"] = MX + k * (cw + gx), y0 + r * (h2 + gy)
        bv = _besoin_v(cs, t, b, n_lt)
        _poser(s, cs, t, b, n_lt, h2, (h2 - bv) / 2 if bv else 0)
    return s


# ── Pyramide ─────────────────────────────────────────────────────────────────
def pyramide(niveaux, largeur_base=540, avec_cartes=True):
    """Niveaux du sommet à la base ; à droite, la définition de chaque niveau, reliée par un trait."""
    s, W, H = _toile()
    th = T()
    n = len(niveaux)
    a_cartes = avec_cartes and any(_it(nv, "texte") for nv in niveaux)
    base = 440 if a_cartes else 760
    sommet = 150 if a_cartes else 220
    cx = MX + base / 2 + 6 if a_cartes else W / 2
    gap = 12
    y0, y1 = MY + 10, H - MY - 10
    hh = (y1 - y0 - (n - 1) * gap) / n
    xc = MX + base + 70
    wcar = W - MX - xc
    cs = [{"w": wcar, "h": min(hh, 300), "role": _it(nv, "role", "sable"), "titre": _it(nv, "titre"),
           "corps": _it(nv, "texte", ()), "orient": "h"} for nv in niveaux if _it(nv, "texte")]
    if cs:
        t, b, _, besoin = ajuster_cartes(cs, 34, 18, aligner=False, quoi="pyramide")
    geo = []
    for i in range(n):
        ya, yb = y0 + i * (hh + gap), y0 + i * (hh + gap) + hh
        la = sommet + (base - sommet) * (ya - y0) / (y1 - y0)
        lb = sommet + (base - sommet) * (yb - y0) / (y1 - y0)
        geo.append((ya, yb, la, lb))
    # une seule taille de libellé pour tous les niveaux, sur une ligne si possible
    t_lib = 16

    def tient(tl_, nl_max):
        for nv, (ya, yb, la, lb) in zip(niveaux, geo):
            court = insec(_it(nv, "court", _it(nv, "titre")))
            wa = la + (lb - la) * 0.3 - 40
            l = couper(court, tl_ * T().typo.get("echelle_titre", 1), T().typo["titre_graisse"], wa, "titre")
            if not l or len(l) > nl_max or len(l) * tl_ * 1.2 > hh - 20:
                return False
        return True
    for nl_max, mini in ((1, 24), (2, 16)):
        trouve = False
        for tl_ in range(48, mini - 1, -2):
            if tient(tl_, nl_max):
                t_lib, trouve = tl_, True
                break
        if trouve:
            break
    for i, nv in enumerate(niveaux):
        ya, yb, la, lb = geo[i]
        role = _it(nv, "role", "sable")
        R = th.role(role)
        d = (f"M{cx - la / 2:.1f},{ya:.1f} L{cx + la / 2:.1f},{ya:.1f} L{cx + lb / 2:.1f},{yb:.1f} "
             f"L{cx - lb / 2:.1f},{yb:.1f} Z")
        if th.sombre:
            s.add(f'<path d="{d}" fill="{R.clair}" stroke="{R.vif}" stroke-width="2" stroke-linejoin="round"/>')
            ct, f_ = R.vif, R.clair
        else:
            s.add(f'<path d="{d}" fill="{R.fonce}"/>')
            ct, f_ = R.sur_fonce, R.fonce
        zone(cx - la / 2, ya, la, hh)
        court = _it(nv, "court", _it(nv, "titre"))
        wa = la + (lb - la) * 0.3 - 40
        s.add(bloc_texte(cx - wa / 2, ya + 8, wa, hh - 16, court, (), couleur_titre=ct, t=t_lib, b=17, fond=f_))
        if a_cartes and _it(nv, "texte"):
            ym = (ya + yb) / 2
            hc = min(hh, besoin * 1.18)
            s.add(lien([(cx + (la + lb) / 4 + 14, ym), (xc - 12, ym)], tirets=True))
            s.add(noeud(cx + (la + lb) / 4 + 14, ym, 5))
            s.add(carte(xc, ym - hc / 2, wcar, hc, t=t, b=b, **_kw({"role": role, "titre": _it(nv, "titre"),
                                                                     "corps": _it(nv, "texte", ()), "orient": "h"})))
    return s


# ── Organigramme / arborescence ──────────────────────────────────────────────
def arbre(racine, enfants, h_racine=96, h_enfant=100, rx=8):
    """La racine en bandeau de tête. Branches sans éléments : une branche par ligne, accrochée à un fil
    vertical (lecture de haut en bas). Branches avec éléments : colonnes reliées par un bus, et sous chaque
    branche ses éléments empilés."""
    s, W, H = _toile()
    th = T()
    n = len(enfants)
    wc = W - 2 * MX
    hub, hr = _hub(s, MX, 0, wc, _it(racine, "role", "or"), _it(racine, "titre"),
                   _it(racine, "texte"), t_max=44, icone=_it(racine, "icone"))
    a_items = any(_it(en, "items") for en in enfants)
    if not a_items:
        g_r = 56
        x_fil = MX + 44
        xc = MX + 104
        wcar = W - MX - xc
        gy = 30
        zone_h = H - 2 * MY - hr - g_r
        h = min(300, (zone_h - (n - 1) * gy) / n)
        cs = [{"w": wcar, "h": h, "role": _it(en, "role", "sable"), "titre": _it(en, "titre"),
               "corps": _it(en, "texte", ()), "icone": _it(en, "icone"), "orient": "h"} for en in enfants]
        t, b, _, besoin = ajuster_cartes(cs, 44, 18, aligner=False, quoi="arbre")
        h2 = _hauteur_finale(h, besoin)
        if _ETAT["etirer"]:     # dernier recours d'en_grand : cartes à leur hauteur maximale
            h2 = max(h2, min(h, besoin * 2.5))
        gy = _ecart(n, h2, gy, zone_h, 4.0 if _ETAT["etirer"] else 1.8)
        tot = hr + g_r + n * h2 + (n - 1) * gy
        ytop = (H - tot) / 2
        ye = ytop + hr + g_r
        ys = [ye + i * (h2 + gy) for i in range(n)]
        s.add(lien([(x_fil, ytop + hr), (x_fil, ys[-1] + h2 / 2)], ep=th.liens["epaisseur"] + 0.6))
        for yy in ys:
            s.add(fleche(x_fil, yy + h2 / 2, xc - 4, yy + h2 / 2))
            s.add(noeud(x_fil, yy + h2 / 2))
        s.add(hub(ytop))
        for yy, c in zip(ys, cs):
            s.add(carte(xc, yy, wcar, h2, t=t, b=b, **_kw(c)))
        return s
    # branches avec éléments : en-têtes de branche, puis éléments empilés
    g_r = 70
    gx = 24 if n <= 3 else 18
    cw = (wc - (n - 1) * gx) / n
    tetes = [{"w": cw, "h": 200, "role": _it(en, "role", "sable"), "titre": _it(en, "titre"), "corps": _it(en, "texte", ()),
              "icone": _it(en, "icone"), "orient": "v"} for en in enfants]
    max_items = max(len(_it(en, "items", ())) for en in enfants)
    g_i = 14
    ind = 26
    wi = cw - ind - 28          # largeur du texte d'un élément

    def items_P(t, bi):
        out = []
        for en in enfants:
            for it in _it(en, "items", ()):
                tit, corps = (it, ()) if isinstance(it, str) else (_it(it, "titre"), _it(it, "texte", ()))
                out.append(preparer(None, [tit] + list(corps), wi, t, bi))
        return out

    def essai(t, b):
        try:
            hts = [carte(0, 0, c["w"], 999, t=t, b=b, mesure=True, **_kw(c)) for c in tetes]
            if max(hts) > 220:
                return False
            bi = max(17, b * 0.96)
            Ps = items_P(t, bi)
            if any(P is None for P in Ps):
                return False
            hi_max = max(P["total"] for P in Ps) + 26
            tot = hr + g_r + max(hts) + 26 + max_items * hi_max + (max_items - 1) * g_i
            return tot <= H - 2 * MY
        except Deborde:
            return False
    t, b = ajuster(essai, 36, 17, 0.8, 17, quoi="arbre")
    ht = max(carte(0, 0, c["w"], 999, t=t, b=b, mesure=True, **_kw(c)) for c in tetes)
    bi = max(17, b * 0.96)
    hi = max(P["total"] for P in items_P(t, bi)) + 26
    reste = H - 2 * MY - (hr + g_r + ht + 26 + max_items * hi + (max_items - 1) * g_i)
    hi = min(hi * (3.0 if _ETAT["etirer"] else 1.45), hi + max(0, reste) / max(max_items, 1) * (0.95 if _ETAT["etirer"] else 0.8))
    tot = hr + g_r + ht + 26 + max_items * hi + (max_items - 1) * g_i
    ytop = (H - tot) / 2
    ye = ytop + hr + g_r
    xs = [MX + i * (cw + gx) for i in range(n)]
    yb = ytop + hr + g_r * 0.45
    s.add(lien([(W / 2, ytop + hr), (W / 2, yb)]))
    if n > 1:
        s.add(lien([(xs[0] + cw / 2, yb), (xs[-1] + cw / 2, yb)]))
    for x in xs:
        s.add(fleche(x + cw / 2, yb, x + cw / 2, ye - 3))
    s.add(noeud(W / 2, yb))
    s.add(hub(ytop))
    fond_c = th.c["surface_2"] if not th.sombre else th.c["surface"]
    for x, c, en in zip(xs, tetes, enfants):
        s.add(carte(x, ye, cw, ht, t=t, b=b, **_kw(c)))
        items = _it(en, "items", ())
        if not items:
            continue
        yi = ye + ht + 26
        xl = x + 16
        s.add(lien([(xl, ye + ht), (xl, yi + (len(items) - 1) * (hi + g_i) + hi / 2)]))
        R = th.role(_it(en, "role", "sable"))
        for j, it in enumerate(items):
            yj = yi + j * (hi + g_i)
            s.add(lien([(xl, yj + hi / 2), (x + ind, yj + hi / 2)]))
            s.add(noeud(xl, yj + hi / 2, 4.5))
            tit, corps = (it, ()) if isinstance(it, str) else (_it(it, "titre"), _it(it, "texte", ()))
            zone(x + ind, yj, cw - ind, hi)
            s.add(rect(x + ind, yj, cw - ind, hi, fond_c, min(th.carte["rayon"], 10),
                       th.c["filet"] if th.carte.get("bordure") else None, 1.2))
            if th.carte["entete"] in ("barre_gauche", "bande_titre", "filet_haut"):
                s.add(rect(x + ind, yj, 5, hi, R.vif, 0))
            P = preparer(None, [tit] + list(corps), wi, t, bi)
            s.add(dessiner(x + ind + 15, yj, wi, hi, P, "start", th.c["encre"], v_align="middle", fond=fond_c))
    return s


# ── Frise (verticale) ────────────────────────────────────────────────────────
def frise(jalons, w_carte=None, alterne=True, couleur_bande="#B8CCB1"):
    """Axe du temps vertical (de haut en bas), dates sur l'axe, cartes de part et d'autre."""
    s, W, H = _toile()
    th = T()
    n = len(jalons)
    xa = W / 2
    wc = W - 2 * MX
    tv = 22
    lws = [largeur(_it(j, "date") or "", tv, 700, "chiffres") + 36 for j in jalons]
    demi = max(max(lws) / 2, 16) + 26
    cw = (wc - 2 * demi) / 2 if alterne else wc - demi - 40
    place = H - 2 * MY - 90
    gy = 40
    h = min(340, (place - (n - 1) * gy) / max(1, (n * 0.62 if alterne else n)))
    cs = [{"w": cw, "h": h, "role": _it(j, "role", "sable"), "titre": _it(j, "titre"), "corps": _it(j, "texte", ()),
           "puces": _it(j, "puces", False), "orient": "v"} for j in jalons]
    t, b, n_lt, besoin = ajuster_cartes(cs, 38, 18, quoi="frise")
    h2 = min(h, max(besoin + 18, besoin * 1.15))
    pas_min = h2 * (0.62 if alterne else 1.0) + gy
    pas = clamp((0.86 * place - h2) / max(n - 1, 1), pas_min, h2 + 2.2 * gy) if n > 1 else 0
    tot = (n - 1) * pas + h2
    y0 = _y_optique(H - 2 * MY, tot + 90) + 40
    Rv = th.role("vert")
    s.add(rect(xa - 9, y0 - 40, 18, tot + 46, Rv.clair, 9))
    s.add(fleche(xa, y0 + tot - 4, xa, y0 + tot + 40, 6, Rv.vif, taille=22))
    for i, (j, c) in enumerate(zip(jalons, cs)):
        y = y0 + i * pas
        gauche = alterne and i % 2 == 0
        x = (xa - demi - cw) if gauche else (xa + demi)
        yc = y + h2 / 2
        s.add(lien([(x + cw if gauche else x, yc), (xa, yc)]))
        d = _it(j, "date")
        s.add(carte(x, y, cw, h2, t=t, b=b, n_lt=n_lt, **_kw(c)))
        if d:
            lw = lws[i]
            fp = th.c["accent_texte"] if not th.sombre else th.c["fond_schema"]
            s.add(rect(xa - lw / 2, yc - 21, lw, 42, fp, 21, th.c["accent"] if th.sombre else None, 2))
            zone(xa - lw / 2, yc - 21, lw, 42)
            s.add(texte_seul(xa, yc + tv * 0.36, d, tv, 700, "#FFFFFF" if not th.sombre else th.c["accent"], "middle",
                             "chiffres", fond=fp))
        else:
            s.add(noeud(xa, yc, 8, th.c["accent"]))
    return s


# ── Échelle de temps / jauge (verticale) ─────────────────────────────────────
def jauge(maxi, unite, marqueurs, pas_grad=None, debut=0, x0=90, x1=1110, y=330, legende_debut=None, note=None):
    """Échelle verticale (le temps s'écoule vers le bas) ; chaque marqueur est détaillé dans une carte."""
    s, W, H = _toile()
    th = T()
    pas_grad = pas_grad or maxi / 6
    wc = W - 2 * MX
    Pn = None
    h_note = 0
    if note:
        Pn = preparer(None, [note], wc - 40, 21, 21)
        h_note = Pn["total"] + 50
    xb = MX + 170
    ytop, ybot = MY + 40, H - MY - 40 - h_note
    Y = lambda v: ytop + (v - debut) / (maxi - debut) * (ybot - ytop)  # noqa: E731
    Rb = th.role("sable")
    s.add(rect(xb - 14, ytop - 14, 28, ybot - ytop + 28, Rb.clair if not th.sombre else th.c["surface"], 14,
               th.c["filet"], 1.2))
    v = debut
    while v <= maxi + 1e-9:
        yv = Y(v)
        s.add(rect(xb - 26, yv - 1.5, 52, 3, th.c["encre_3"], 1))
        lab = f"{v:g} {unite}" if unite else f"{v:g}"
        if legende_debut and abs(v - debut) < 1e-9:
            lab = legende_debut
        if not any(abs(m["val"] - v) < 1e-9 for m in marqueurs):
            s.add(texte_seul(xb - 42, yv + 8, lab, 22, 600, th.c["encre_2"], "end"))
        v += pas_grad
    xcard = xb + 90
    wcard = W - MX - xcard
    ms = sorted(marqueurs, key=lambda m: m["val"])
    cs = [{"w": wcard, "h": 240, "role": _it(m, "role", "bleu"), "titre": _it(m, "titre"), "corps": _it(m, "texte", ()),
           "orient": "h"} for m in ms]
    t, b, _, besoin = ajuster_cartes(cs, 36, 18, aligner=False, quoi="jauge")
    hc = min(240, besoin * 1.12)
    esp = 20
    lim_bas = H - MY - h_note - 6
    ys = [Y(m["val"]) - hc / 2 for m in ms]
    ys[0] = max(ys[0], MY)
    for k in range(1, len(ys)):
        ys[k] = max(ys[k], ys[k - 1] + hc + esp)
    dep = ys[-1] + hc - lim_bas
    if dep > 0:
        ys[-1] -= dep
        for k in range(len(ys) - 2, -1, -1):
            ys[k] = min(ys[k], ys[k + 1] - hc - esp)
    for m, c, yc in zip(ms, cs, ys):
        role = _it(m, "role", "bleu")
        R = th.role(role)
        yv = Y(m["val"])
        s.add(lien([(xb, yv), (xb + 50, yv), (xb + 50, yc + hc / 2), (xcard, yc + hc / 2)]))
        s.add(disque(xb, yv, 17, R.fonce if not th.sombre else R.vif, th.c["fond_schema"], 4))
        s.add(carte(xcard, yc, wcard, hc, t=t, b=b, **_kw(c)))
    if note:
        yn = H - MY - h_note + 22
        s.add(rect(MX + wc / 2 - 40, yn, 80, 3, th.c["accent"], 1.5))
        s.add(dessiner(MX + 20, yn + 16, wc - 40, Pn["total"], Pn, "middle", th.c["encre_3"]))
    return s


# ── Fiche référence ──────────────────────────────────────────────────────────
def fiche(nom, lieu, icone_secteur, stats, missions, titre_missions="Nos missions", secteur_txt=None):
    """Fiche d'une référence : bandeau (secteur, nom, lieu), chiffres, puis les missions confiées à GSS."""
    s, W, H = _toile()
    th = T()
    wc = W - 2 * MX
    R = th.role("or")
    # bandeau d'en-tête
    lignes = []
    if secteur_txt:
        lignes.append(secteur_txt.upper())
    pad = 34
    S = 96
    P_nom = None
    for tn in (52, 48, 44, 40, 36, 32, 28):
        P_nom = preparer(nom, [lieu] if lieu else (), wc - 2 * pad - S - 30, tn, 26)
        if P_nom is not None and len(P_nom["tl"]) <= 2:
            break
    h_sect = 30 if secteur_txt else 0
    hb = max(S, h_sect + P_nom["total"]) + 2 * pad
    mode = th.bandeau["mode"]
    if mode in ("plein", "plein_filet"):
        fond, ct, cb = R.fonce, R.sur_fonce, R.sur_fonce
    elif mode == "teinte_barre":
        fond, ct, cb = R.clair, R.fonce, th.c["encre_2"]
    else:
        fond, ct, cb = th.c["surface"], th.c["encre"], th.c["encre_2"]
    # missions
    cols = 2 if len(missions) > 7 else 1
    gxm = 36
    wcol = (wc - 2 * pad - (cols - 1) * gxm) / cols
    par_col = math.ceil(len(missions) / cols)
    h_stats = 170 if stats else 0
    g = 26
    zone_m = H - 2 * MY - hb - g - h_stats - (g if stats else 0) - 70 - pad
    tb = 27
    while tb >= 17:
        cols_l = [missions[c * par_col:(c + 1) * par_col] for c in range(cols)]
        Ps = [preparer(None, col, wcol, tb, tb, puces=True) for col in cols_l]
        if all(P is not None for P in Ps) and max(P["total"] for P in Ps) * 1.0 <= zone_m:
            break
        tb -= 0.5
    else:
        raise Deborde(f"missions trop longues : {nom}")
    hm = max(P["total"] for P in Ps) + 70 + pad * 1.6
    tot = hb + g + (h_stats + g if stats else 0) + hm
    y = (H - tot) / 2
    zone(MX, y, wc, hb)
    if mode in ("plein", "plein_filet"):
        s.add(ombre(MX, y, wc, hb, th.bandeau.get("rayon", 0)) + rect(MX, y, wc, hb, fond, th.bandeau.get("rayon", 0)))
        if mode == "plein_filet":
            s.add(rect(MX, y + hb - 10, wc, 10, th.c["accent"], 0))
    elif mode == "teinte_barre":
        s.add(rect(MX, y, wc, hb, fond, th.bandeau.get("rayon", 0)))
        s.add(f'<path d="{chemin_arrondi(MX, y, 10, hb, th.bandeau.get("rayon", 0), 0, 0, th.bandeau.get("rayon", 0))}" fill="{R.vif}"/>')
    else:
        s.add(rect(MX - 4, y - 4, wc + 8, hb + 8, R.vif, th.bandeau.get("rayon", 0) + 4, extra=' opacity="0.10"'))
        s.add(rect(MX, y, wc, hb, fond, th.bandeau.get("rayon", 0), R.vif, 1.8))
    if mode in ("plein", "plein_filet"):
        s.add(glyphe(icone_secteur, MX + pad + S / 2, y + hb / 2, S, R.sur_fonce))
    else:
        s.add(pastille(MX + pad + S / 2, y + hb / 2, icone_secteur, "or", S, sur=fond))
    xt = MX + pad + S + 30
    yt = y + (hb - h_sect - P_nom["total"]) / 2
    if secteur_txt:
        cs_ = {"teinte_barre": R.fonce, "verre": th.c["accent"]}.get(mode, cb)
        s.add(texte_seul(xt, yt + 19, secteur_txt.upper(), 19, 700, cs_, "start", "texte", ' letter-spacing="2.5"', fond=fond))
        yt += h_sect
    s.add(dessiner(xt, yt, wc - 2 * pad - S - 30, P_nom["total"], P_nom, "start", cb, ct, fond=fond))
    y += hb + g
    # chiffres
    if stats:
        k = len(stats)
        gs = 26
        ws = (wc - (k - 1) * gs) / k
        fond_c = th.c[th.carte.get("remplissage", "carte_fond")]
        for i, (val, lab) in enumerate(stats):
            x = MX + i * (ws + gs)
            zone(x, y, ws, h_stats)
            s.add(surface(x, y, ws, h_stats, th.carte["rayon"], 0.8, fond_c))
            Rs = th.role("orange")
            s.add(rect(x, y, 8, h_stats, Rs.vif, 0) if th.carte["entete"] != "aucun" else "")
            tv = 92
            while largeur(val, tv, th.typo["chiffres_graisse"], "chiffres") > ws * 0.42:
                tv -= 4
            s.add(texte_seul(x + 40, y + h_stats / 2 + tv * 0.36, val, tv, th.typo["chiffres_graisse"],
                             Rs.fonce if not th.sombre else Rs.vif, "start", "chiffres", fond=fond_c))
            xl = x + 40 + largeur(val, tv, th.typo["chiffres_graisse"], "chiffres") + 24
            s.add(bloc_texte(xl, y + 14, x + ws - 24 - xl, h_stats - 28, None, [lab], align="start", t_max=30, t_min=17,
                             b_ratio=1, b_min=17, couleur=th.c["encre_2"], fond=fond_c))
        y += h_stats + g
    # missions
    fond_c = th.c["surface_2"] if not th.sombre else th.c["surface"]
    zone(MX, y, wc, hm)
    s.add(surface(MX, y, wc, hm, th.carte["rayon"], 0.6, fond_c))
    s.add(texte_seul(MX + pad, y + pad + 22, titre_missions.upper(), 26, 700, th.c["encre"], "start", "titre",
                     ' letter-spacing="2"', fond=fond_c))
    s.add(rect(MX + pad, y + pad + 38, 64, 5, th.c["accent"], 2.5))
    ym = y + pad + 70
    for c, P in enumerate(Ps):
        xc = MX + pad + c * (wcol + gxm)
        s.add(dessiner(xc, ym, wcol, P["total"], P, "start", th.c["encre"], v_align="top",
                       puce_couleur=th.role("vert").vif, fond=fond_c))
    return s


# ── Silhouette annotée ───────────────────────────────────────────────────────
ANCRES = {"tete": (600, 118), "col": (600, 192), "torse": (600, 262), "poitrine": (572, 232), "bras": (520, 300),
          "taille": (600, 352), "jambes": (578, 452), "pieds": (568, 578), "dos": (600, 262), "epaules": (648, 214),
          "main": (512, 390), "numero": (629, 220), "insigne": (629, 245)}


def silhouette(annotations, tenue="intervention", dos=False, marquage=False):
    """Silhouette de l'agent en grand, au centre ; annotations de part et d'autre, chacune à la hauteur de
    son repère sur la tenue (traits courts, sans croisement)."""
    s, W, H = _toile()
    th = T()
    k_ = 2.05
    ox = W / 2 - 600 * k_
    oy = (H - (588 - 82) * k_) / 2 - 82 * k_
    P_ = lambda x, y: (ox + x * k_, oy + y * k_)  # noqa: E731
    unif = th.c["structure"] if not th.sombre else "#24365A"
    if th.id == "premium":
        unif = "#2E2A29"
    if th.id == "conseil":
        unif = "#1F2933"
    haut_c = {"costume": "#24282E", "intervention": unif, "ssiap": "#B42318" if not th.sombre else "#C2303C"}[tenue]
    bas_c = {"costume": "#24282E", "intervention": unif, "ssiap": "#24292F"}[tenue]
    peau = "#E8C6A2"
    trait_c = "#14181D" if not th.sombre else "#0A1020"
    g = [f'<g transform="translate({ox:.1f},{oy:.1f}) scale({k_})">']
    k = f'stroke="{trait_c}" stroke-width="1.2" stroke-linejoin="round"'
    g.append(f'<ellipse cx="600" cy="590" rx="92" ry="9" fill="{th.c["encre"]}" opacity="0.10"/>')
    g.append(f'<path d="M548,560 L556,372 L644,372 L652,560 L612,560 L600,420 L588,560 z" fill="{bas_c}" {k}/>')
    g.append(f'<path d="M540,588 L540,566 L590,566 L596,588 z M604,588 L610,566 L660,566 L660,588 z" fill="#111418" {k}/>')
    g.append(f'<path d="M560,190 L640,190 L676,210 L700,370 L676,380 L660,272 L652,380 L548,380 L540,272 L524,380 L500,370 L524,210 z" fill="{haut_c}" {k}/>')
    g.append(f'<circle cx="600" cy="130" r="44" fill="{peau}" {k}/>')
    g.append(f'<path d="M556,128 C554,78 646,78 644,128 C632,110 568,110 556,128 z" fill="#2B2724" stroke="{trait_c}" stroke-width="1.2"/>')
    g.append(f'<path d="M586,172 L614,172 L612,194 L588,194 z" fill="{peau}" {k}/>')
    if tenue == "costume" and not dos:
        g.append('<path d="M580,192 L600,236 L620,192 z" fill="#FFFFFF" stroke="#14181D" stroke-width="1.5"/>'
                 '<path d="M596,200 L604,200 L608,262 L600,274 L592,262 z" fill="#0B0D10" stroke="#14181D" stroke-width="1.2"/>')
    g.append("</g>")
    s.add("".join(g))
    if marquage and not dos:
        x, y = P_(608, 214)
        s.add(rect(x, y, 42 * k_, 13 * k_, "#FFFFFF", 2, "#111111", 1.5))
        s.add(texte_seul(x + 21 * k_, y + 10 * k_, "N° CNAPS", 7.5 * k_, 700, "#111111", fond="#FFFFFF"))
        x, y = P_(617, 233)
        s.add(rect(x, y, 24 * k_, 24 * k_, "#FFFFFF", 3, "#111111", 1.5))
        s.add(texte_seul(x + 12 * k_, y + 16 * k_, "GSS", 8 * k_, 700, "#C4121A", fond="#FFFFFF"))
    if dos:
        x, y = P_(548, 236)
        s.add(rect(x, y, 104 * k_, 28 * k_, "#0B0D10", 4))
        s.add(texte_seul(x + 52 * k_, y + 19 * k_, "SÉCURITÉ PRIVÉE", 10.5 * k_, 700, "#FFFFFF", fond="#0B0D10"))
    gauche = sorted([a for a in annotations if _it(a, "cote", "g") == "g"], key=lambda a: ANCRES[a["ancre"]][1])
    droite = sorted([a for a in annotations if _it(a, "cote", "g") == "d"], key=lambda a: ANCRES[a["ancre"]][1])
    x_fig_g = P_(500, 0)[0]
    wv = x_fig_g - MX - 40
    cs_all = []
    for cote, liste in (("g", gauche), ("d", droite)):
        for a in liste:
            cs_all.append({"w": wv, "h": 240, "role": _it(a, "role", "creme"), "titre": _it(a, "titre"),
                           "corps": _it(a, "texte", ()), "orient": "v", "cote": cote, "a": a})
    kmax = max(len(gauche), len(droite))
    h = min(250, (H - 2 * MY - (kmax - 1) * 26) / max(kmax, 1))
    for c in cs_all:
        c["h"] = h
    t, b, n_lt, besoin = ajuster_cartes(cs_all, 30, 17, aligner=False, quoi="silhouette")
    h2 = min(h, besoin * 1.1)

    def repere(a, cote):
        ax, ay = ANCRES[a["ancre"]]
        if cote == "d":
            ax = 1200 - ax if a["ancre"] in ("bras", "main", "jambes", "pieds", "poitrine") else ax
        if marquage and a["ancre"] == "numero":
            ax = 606 if cote == "g" else 652
        if marquage and a["ancre"] == "insigne":
            ax = 615 if cote == "g" else 643
        if dos and a["ancre"] == "dos":
            ay = 266
        return P_(ax, ay)

    esp = 26
    for cote in ("g", "d"):
        cartes_c = [c for c in cs_all if c["cote"] == cote]
        if not cartes_c:
            continue
        ys = [repere(c["a"], cote)[1] - h2 / 2 for c in cartes_c]
        ys[0] = max(ys[0], MY)
        for k2 in range(1, len(ys)):
            ys[k2] = max(ys[k2], ys[k2 - 1] + h2 + esp)
        dep = ys[-1] + h2 - (H - MY)
        if dep > 0:
            ys[-1] -= dep
            for k2 in range(len(ys) - 2, -1, -1):
                ys[k2] = min(ys[k2], ys[k2 + 1] - h2 - esp)
        for c, y in zip(cartes_c, ys):
            x = MX if cote == "g" else W - MX - wv
            px, py = repere(c["a"], cote)
            bx = x + wv if cote == "g" else x
            mx = bx + (26 if cote == "g" else -26)
            s.add(lien([(bx, y + h2 / 2), (mx, y + h2 / 2), (px, py)], couleur=th.c["encre_3"], ep=2))
            s.add(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="8" fill="{th.c["accent"]}" stroke="{th.c["fond_schema"]}" stroke-width="3"/>')
            s.add(carte(x, y, wv, h2, t=t, b=b, **_kw(c)))
    return s


# ── Barres ───────────────────────────────────────────────────────────────────
def barres(series, unite="", maxi=None, largeur_label=300, legende=None, note=None, detail=False):
    """Barres horizontales pleine largeur : le libellé au-dessus, la valeur au bout de la barre."""
    s, W, H = _toile()
    th = T()
    n = len(series)
    wc = W - 2 * MX
    vals = [sum(v for v, _ in (se.get("valeurs") or [(se["valeur"], se.get("role", "bleu"))])) for se in series]
    maxi = maxi or max(vals)
    # décision d'origine : valeur écrite dans un segment seulement s'il mesurait plus de 44 px
    x0_o = 40 + largeur_label + 20
    x1_o = 1200 - 40 - (200 if detail else 110)
    h_leg = 70 if legende else 0
    h_note = 50 if note else 0
    tl = 26
    hb = 60
    bloc = tl * 1.5 + 12 + hb
    gap = min(200 if _ETAT["etirer"] else 70, (H - 2 * MY - h_leg - h_note - n * bloc) / max(n - 1, 1))
    tot = n * bloc + (n - 1) * gap + h_leg + h_note
    y = (H - tot) / 2
    xb0 = MX
    libs = []
    for i, se in enumerate(series):
        segs = se.get("valeurs") or [(se["valeur"], se.get("role", "bleu"))]
        lib = " + ".join(f"{v:g}" for v, _ in segs) if (detail and len(segs) > 1) else f"{vals[i]:g}"
        libs.append(lib.replace(".", ",") + (f" {unite}" if unite else ""))
    w_val = max(largeur(l, 34, 700, "chiffres") for l in libs) + 28
    xb1 = W - MX - w_val
    for i, se in enumerate(series):
        segs = se.get("valeurs") or [(se["valeur"], se.get("role", "bleu"))]
        s.add(texte_seul(xb0, y + tl * 1.05, se["label"], tl, 600, th.c["encre"], "start"))
        yb = y + tl * 1.5 + 12
        s.add(rect(xb0, yb, xb1 - xb0, hb, th.c["surface_2"] if not th.sombre else th.c["surface"], min(8, th.carte["rayon"])))
        xx = xb0
        for v, role in segs:
            R = th.role(role)
            wv = max((xb1 - xb0) * v / maxi, 12 if len(segs) == 1 else 0)
            wv_o = max((x1_o - x0_o) * v / maxi, 12 if len(segs) == 1 else 0)
            if wv > 0.5:
                f_ = R.fonce if not th.sombre else R.vif
                s.add(rect(xx, yb, wv, hb, f_, min(8, th.carte["rayon"])))
                zone(xx, yb, wv, hb)
                if wv_o > 44 and len(segs) > 1:
                    s.add(texte_seul(xx + wv / 2, yb + hb / 2 + 9, f"{v:g}".replace(".", ","), 25, 700,
                                     R.sur_fonce, "middle", "chiffres", fond=f_))
            xx += wv
        s.add(texte_seul(xx + 18, yb + hb / 2 + 12, libs[i], 34, 700, th.c["encre"], "start", "chiffres"))
        y += bloc + gap
    y += -gap + 30
    if note:
        s.add(texte_seul(W - MX, y + 26, note, 20, 500, th.c["encre_3"], "end"))
        y += h_note
    if legende:
        xl = MX
        for lab, role in legende:
            R = th.role(role)
            s.add(rect(xl, y + 6, 30, 30, R.fonce if not th.sombre else R.vif, 4))
            s.add(texte_seul(xl + 44, y + 29, lab, 22, 600, th.c["encre"], "start"))
            xl += 44 + largeur(lab, 22, 600) + 48
    return s


# ── Carte réelle (contours des régions) ──────────────────────────────────────
_GEO = {}


def _geo(nom):
    if nom not in _GEO:
        _GEO[nom] = _json.load(open(_os.path.join(MOTEUR, "geo", nom + ".geojson"), encoding="utf-8"))
    return _GEO[nom]


def carte_reelle(points, bbox, fond="regions", en_avant=(), noms_zones=None, zone=(40, 30, 1160, 630), hub=None,
                 liens=False):
    """Carte des sites à l'échelle, sur toute la page : la largeur du cadre d'origine est conservée, la
    hauteur s'étend à la page portrait (plus de contexte au nord et au sud)."""
    s, W, H = _toile()
    th = T()
    lo0, la0, lo1, la1 = bbox
    k = math.cos(math.radians((la0 + la1) / 2))
    x0, y0, x1, y1 = MX, MY, W - MX, H - MY
    sc = (x1 - x0) / ((lo1 - lo0) * k)
    lat_c = (la0 + la1) / 2
    cxo = (x0 + x1) / 2 - ((lo0 + lo1) / 2) * k * sc
    cyo = (y0 + y1) / 2 + lat_c * sc
    proj = lambda lon, lat: (cxo + lon * k * sc, cyo - lat * sc)  # noqa: E731

    def chemin(geom):
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        d = ""
        for poly in polys:
            for anneau in poly:
                d += "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in (proj(lon, lat) for lon, lat in anneau)) + " Z "
        return d
    cid = s.ident("cadre")
    rxc = th.carte["rayon"] * 2
    eau = "#DCE7F0" if not th.sombre else "#0C1A30"
    terre = "#FFFFFF" if not th.sombre else "#14213A"
    if th.id == "premium":
        eau, terre = "#E6EDEC", "#FFFDF9"
    bord = th.c["filet"]
    s.defs["cadre"] = f'<clipPath id="{cid}"><rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" rx="{rxc}"/></clipPath>'
    s.add(rect(x0, y0, x1 - x0, y1 - y0, eau, rxc))
    g = [f'<g clip-path="url(#{cid})">']
    feats = _geo(fond)["features"]
    Rz = th.role("sable")
    for f in feats:
        if f["properties"]["nom"] in en_avant:
            continue
        g.append(f'<path d="{chemin(f["geometry"])}" fill="{terre}" stroke="{bord}" stroke-width="1.6" stroke-linejoin="round"/>')
    for f in feats:
        if f["properties"]["nom"] in en_avant:
            g.append(f'<path d="{chemin(f["geometry"])}" fill="{Rz.clair}" stroke="{Rz.vif}" stroke-width="2.2" '
                     f'stroke-linejoin="round"/>')
    for nom, (lon, lat) in (noms_zones or {}).items():
        x, y = proj(lon, lat)
        g.append(texte_seul(x, y, nom.upper(), 22, 700, th.c["encre_3"], "middle", "texte", ' letter-spacing="4"',
                            fond=terre))
    if hub and liens:
        hp = next(p for p in points if p["nom"] == hub)
        hx, hy = proj(hp["lon"], hp["lat"])
        for p in points:
            if p["nom"] != hub:
                g.append(lien([(hx, hy), proj(p["lon"], p["lat"])], th.fleches["couleur"], tirets=True, ep=2.4))
    g.append("</g>")
    s.add("\n".join(g))
    fond_c = th.c["surface"]
    # étiquettes : position demandée (côté, décalage), puis écartement des étiquettes qui se chevauchent
    eti = []
    for p in points:
        x, y = proj(p["lon"], p["lat"])
        est_hub = p["nom"] == hub
        r = 22 if est_hub else 11
        lab, det = p.get("label", p["nom"]), p.get("detail")
        tl, td = 23, 19
        wl = max(largeur(lab, tl, 700), largeur(det, td, 400) if det else 0) + 34
        hl = 74 if det else 46
        cote = p.get("cote", "d")
        lx, ly = {"d": (x + r + 14, y - hl / 2), "g": (x - r - 14 - wl, y - hl / 2),
                  "h": (x - wl / 2, y - r - 14 - hl), "b": (x - wl / 2, y + r + 14)}[cote]
        lx += p.get("dx", 0)
        ly += p.get("dy", 0)
        eti.append({"p": p, "x": x, "y": y, "r": r, "hub": est_hub, "lab": lab, "det": det, "tl": tl, "td": td,
                    "lx": lx, "ly": ly, "wl": wl, "hl": hl, "ly0": ly})
    for _ in range(60):
        bouge = False
        for i in range(len(eti)):
            for j in range(i + 1, len(eti)):
                a_, b_ = eti[i], eti[j]
                ox = min(a_["lx"] + a_["wl"], b_["lx"] + b_["wl"]) - max(a_["lx"], b_["lx"])
                oy = min(a_["ly"] + a_["hl"], b_["ly"] + b_["hl"]) - max(a_["ly"], b_["ly"])
                if ox > -6 and oy > -6:
                    m = (oy + 8) / 2
                    if a_["ly"] <= b_["ly"]:
                        a_["ly"] -= m
                        b_["ly"] += m
                    else:
                        a_["ly"] += m
                        b_["ly"] -= m
                    bouge = True
        for e in eti:
            e["ly"] = clamp(e["ly"], y0 + 10, y1 - e["hl"] - 10)
            e["lx"] = clamp(e["lx"], x0 + 10, x1 - e["wl"] - 10)
        if not bouge:
            break
    for e in eti:
        if abs(e["ly"] - e["ly0"]) > 4 or e["p"].get("dx") or e["p"].get("dy"):
            ax = clamp(e["x"], e["lx"], e["lx"] + e["wl"])
            ay = clamp(e["y"], e["ly"], e["ly"] + e["hl"])
            s.add(lien([(e["x"], e["y"]), (ax, ay)], th.c["encre_3"], ep=1.8))
    for e in eti:
        p, x, y, r = e["p"], e["x"], e["y"], e["r"]
        lx, ly, wl, hl = e["lx"], e["ly"], e["wl"], e["hl"]
        est_hub = e["hub"]
        role = "or" if est_hub else p.get("role", "creme")
        R = th.role(role)
        f_ = R.fonce if est_hub and not th.sombre else fond_c
        ct = R.sur_fonce if est_hub and not th.sombre else th.c["encre"]
        cd = R.sur_fonce if est_hub and not th.sombre else th.c["encre_2"]
        _zone_cadre(lx, ly, wl, hl)
        s.add(ombre(lx, ly, wl, hl, 8, 0.6) + rect(lx, ly, wl, hl, f_, min(10, th.carte["rayon"] + 4), th.c["filet"], 1.2))
        bb = nouveau_bloc()
        s.add(texte(lx + 17, ly + 31, e["lab"], e["tl"], 700, ct, "start", bloc=bb, fond=f_))
        if e["det"]:
            s.add(texte_seul(lx + 17, ly + 59, e["det"], e["td"], 400, cd, "start", fond=f_))
    for e in eti:
        p, x, y, r = e["p"], e["x"], e["y"], e["r"]
        if e["hub"]:
            R = th.role("or")
            s.add(disque(x, y, r + 6, th.c["fond_schema"]))
            s.add(disque(x, y, r, R.fonce if not th.sombre else R.vif))
            s.add(glyphe("batiment", x, y, r * 1.3, R.sur_fonce))
        else:
            rp = th.role(p.get("role_point", "bleu"))
            s.add(disque(x, y, r + 4, th.c["fond_schema"]))
            s.add(disque(x, y, r, rp.fonce if not th.sombre else rp.vif))
    return s


def anneaux_delais(centre, sites, paliers, unite="min"):
    """Sites placés selon leur direction réelle depuis le centre, sur l'anneau de leur délai."""
    s, W, H = _toile()
    th = T()
    hub_h = 150
    cx, cy = W / 2, MY + hub_h + 40 + (H - 2 * MY - hub_h - 40) / 2
    rmax = min(W / 2 - MX - 10, (H - 2 * MY - hub_h - 40) / 2 - 10)
    rs = {v: rmax * (i + 1) / len(paliers) for i, v in enumerate(sorted(paliers))}
    Rb = th.role("bleu")
    teintes = [Rb.clair, th.c["surface_2"] if not th.sombre else th.c["surface"], th.c["fond_schema"]]
    for i, v in enumerate(sorted(paliers, reverse=True)):
        s.add(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{rs[v]:.1f}" fill="{teintes[i % 3]}" stroke="{Rb.vif}" '
              f'stroke-width="2" stroke-dasharray="9 8"/>')
    for v in sorted(paliers, reverse=True):
        s.add(etiquette(cx, cy - rs[v], f"{v:g} {unite}", "bleu", 19, 200))
    lat0, lon0 = centre["lat"], centre["lon"]
    k = math.cos(math.radians(lat0))
    places = []
    for st in sites:
        ang = math.degrees(math.atan2((st["lon"] - lon0) * k, st["lat"] - lat0))
        places.append([st, ang])
    for v in paliers:
        grp = [pl for pl in places if pl[0]["delai"] == v]
        for pl in grp:
            pl[1] %= 360
        for _ in range(200):
            grp.sort(key=lambda pl: pl[1])
            m = len(grp)
            for i in range(m if m > 2 else m - 1):
                a_, b_ = grp[i], grp[(i + 1) % m]
                d = (b_[1] - a_[1]) % 360
                if d < 52:
                    a_[1] -= (52 - d) / 2
                    b_[1] += (52 - d) / 2
    for st, ang in places:
        r = rs[st["delai"]]
        px, py = pt(cx, cy, r, ang)
        s.add(lien([(cx, cy), (px, py)], th.liens["couleur"], ep=2.4))
    fond_c = th.c["surface"]
    for st, ang in places:
        r = rs[st["delai"]]
        px, py = pt(cx, cy, r, ang)
        s.add(disque(px, py, 16, th.c["fond_schema"]))
        s.add(disque(px, py, 12, Rb.fonce if not th.sombre else Rb.vif))
        tl = 24
        wl = max(largeur(st["nom"], tl, 700), largeur(st.get("detail", ""), 19, 400)) + 34
        hl = 74 if st.get("detail") else 50
        lx = px + 24 if math.sin(math.radians(ang)) >= 0 else px - 24 - wl
        lx = clamp(lx, MX, W - MX - wl)
        ly = py - hl / 2 + st.get("dy", 0)
        zone(lx, ly, wl, hl)
        s.add(ombre(lx, ly, wl, hl, 8, 0.6) + rect(lx, ly, wl, hl, fond_c, 10, th.c["filet"], 1.2))
        s.add(texte_seul(lx + 17, ly + 33, st["nom"], tl, 700, th.c["encre"], "start", fond=fond_c))
        if st.get("detail"):
            s.add(texte_seul(lx + 17, ly + 60, st["detail"], 19, 400, th.c["encre_2"], "start", fond=fond_c))
    Ro = th.role("or")
    s.add(disque(cx, cy, 40, th.c["fond_schema"]))
    s.add(disque(cx, cy, 34, Ro.fonce if not th.sombre else Ro.vif))
    s.add(glyphe("batiment", cx, cy, 42, Ro.sur_fonce))
    hub, hh = _hub(s, MX, MY, W - 2 * MX, "or", centre["nom"], centre.get("detail"), t_max=36, icone="batiment")
    s.add(hub(MY))
    return s


# ── Plan de ronde ────────────────────────────────────────────────────────────
def plan_ronde(legende):
    """Plan du site en grand (bâtiments, circuit, pointeaux numérotés), légende en cartes au-dessous."""
    s, W, H = _toile()
    th = T()
    k_ = (W - 2 * MX) / 720
    ox, oy = MX - 40 * k_, MY - 30 * k_
    P_ = lambda x, y: (ox + x * k_, oy + y * k_)  # noqa: E731
    x, y = P_(50, 40)
    s.add(rect(x, y, 700 * k_, 580 * k_, th.c["surface_2"] if not th.sombre else th.c["surface"], 26, th.c["encre_3"], 2.5,
               ' stroke-dasharray="12 8"'))
    bat = [(80, 70, 300, 170, "BÂTIMENT A"), (460, 70, 250, 130, "BÂTIMENT B"), (80, 340, 220, 190, "PARKING"),
           (390, 300, 320, 230, "BÂTIMENT C")]
    Rs = th.role("sable")
    for bx, by, bw, bh, nom in bat:
        x, y = P_(bx, by)
        s.add(rect(x, y, bw * k_, bh * k_, Rs.clair, 10, Rs.vif if th.sombre else th.c["filet"], 1.5))
        s.add(texte_seul(x + bw * k_ / 2, y + bh * k_ / 2 + 8, nom, 22, 700, Rs.fonce if not th.sombre else Rs.vif,
                         "middle", "texte", ' letter-spacing="2"', fond=Rs.clair))
    route = [(735, 600), (735, 262), (400, 262), (400, 55), (65, 55), (65, 290), (330, 290), (330, 600), (735, 600)]
    s.add(trait([P_(*p) for p in route], 4.5, False, th.fleches["couleur"], tirets=True))
    pts = [(735, 430), (570, 262), (400, 150), (230, 55), (65, 180), (200, 290), (330, 450), (530, 600)]
    Rb = th.role("bleu")
    for i, (px, py) in enumerate(pts):
        x, y = P_(px, py)
        s.add(disque(x, y, 26, th.c["fond_schema"]))
        s.add(disque(x, y, 22, Rb.fonce if not th.sombre else Rb.vif))
        s.add(texte_seul(x, y + 8, str(i + 1), 22, 700, Rb.sur_fonce, "middle", "chiffres", fond=Rb.fonce))
    x, y = P_(735, 600)
    Rso = th.role("sombre")
    s.add(disque(x, y, 30, th.c["fond_schema"]))
    s.add(disque(x, y, 26, Rso.fonce if not th.sombre else Rso.vif))
    s.add(glyphe("personne", x, y, 32, Rso.sur_fonce))
    y_plan = P_(0, 620)[1]
    k = len(legende)
    ncol = 2
    gx, gy = 26, 24
    cw = (W - 2 * MX - gx) / 2
    rows = math.ceil(k / ncol)
    zone_h = H - MY - (y_plan + 34)
    h = (zone_h - (rows - 1) * gy) / rows
    cs = [{"w": cw, "h": h, "role": _it(it, "role", "creme"), "titre": it["titre"], "corps": _it(it, "texte", ()),
           "icone": _it(it, "icone"), "orient": "h"} for it in legende]
    t, b, _, besoin = ajuster_cartes(cs, 28, 17, aligner=False, quoi="plan de ronde")
    h2 = min(h, besoin * 1.1)
    yl = y_plan + 34 + (zone_h - (rows * h2 + (rows - 1) * gy)) / 2
    for i, c in enumerate(cs):
        r, cc = divmod(i, ncol)
        s.add(carte(MX + cc * (cw + gx), yl + r * (h2 + gy), cw, h2, t=t, b=b, **_kw(c)))
    return s


# ── Schéma composé : continuité de service 24/7 (II-ABS-01) ──────────────────
def continuite_24_7():
    """Version page du schéma composé II-ABS-01 : l'anneau jour / nuit sans poste vide, puis la procédure
    de prise de service en trois temps, de haut en bas. Mêmes textes que l'original."""
    s, W, H = _toile()
    th = T()
    Rs, Rso, Ro = th.role("sable"), th.role("sombre"), th.role("orange")
    cx, cy, ro, ri = W / 2, MY + 300, 280, 178
    jour = Rs.clair if not th.sombre else "#1B2A47"
    nuit = th.c["structure"] if not th.sombre else "#05080F"
    if th.id == "conseil":
        nuit = "#1F2933"
    s.add(secteur(cx, cy, ri, ro, 272, 448, jour, th.c["filet"] if not th.sombre else None, 1.5))
    s.add(secteur(cx, cy, ri, ro, 92, 268, nuit))
    cj = th.c["encre"]
    cn = "#FFFFFF"
    b1 = nouveau_bloc()
    s.add(texte(cx, cy - ro + 46, "VACATION", 25, 700, cj, "middle", "texte", ' letter-spacing="2"', bloc=b1, fond=jour),
          texte(cx, cy - ro + 76, "DE JOUR", 25, 700, cj, "middle", "texte", ' letter-spacing="2"', bloc=b1, fond=jour))
    b2 = nouveau_bloc()
    s.add(texte(cx, cy + ro - 62, "VACATION", 25, 700, cn, "middle", "texte", ' letter-spacing="2"', bloc=b2, fond=nuit),
          texte(cx, cy + ro - 32, "DE NUIT", 25, 700, cn, "middle", "texte", ' letter-spacing="2"', bloc=b2, fond=nuit))
    for a in (40, 140, 220, 320):
        px, py = pt(cx, cy, (ri + ro) / 2, a)
        ang = math.radians(a)
        dx, dy = math.cos(ang), math.sin(ang)
        coul = th.fleches["couleur"]
        s.add(trait([(px - dx * 10, py - dy * 10), (px + dx * 12, py + dy * 12)], 3.4, True, coul, taille=15))
    for a, cote in ((90, 1), (270, -1)):
        px, py = pt(cx, cy, ro + 4, a)
        s.add(disque(px, py, 20, Ro.fonce if not th.sombre else Ro.vif, th.c["fond_schema"], 4))
        bb = nouveau_bloc()
        s.add(texte(px + cote * 34, py - 6, "PRISE DE", 21, 700, th.c["encre"], "start" if cote > 0 else "end", "texte",
                    ' letter-spacing="1.5"', bloc=bb),
              texte(px + cote * 34, py + 20, "SERVICE", 21, 700, th.c["encre"], "start" if cote > 0 else "end", "texte",
                    ' letter-spacing="1.5"', bloc=bb))
    rc = ri - 22
    s.add(disque(cx, cy, rc, th.c["surface"], th.c["filet"], 1.5))
    s.add(texte_seul(cx, cy + 22, "24/7", 92, 700, th.c["encre"], "middle", "chiffres", fond=th.c["surface"]))
    s.add(texte_seul(cx, cy + 66, "sans poste vide", 25, 500, th.c["encre_2"], "middle", fond=th.c["surface"]))
    zone(cx - ro, cy - ro, 2 * ro, 2 * ro)
    etapes = [("sable", "Prise de service", "15 minutes avant la vacation, auprès du responsable de site", "horloge"),
              ("rouge", "Pas de prise de service", "10 minutes avant : l'agent d'astreinte est mobilisé", "alerte"),
              ("orange", "Agent d'astreinte", "Sur site en 60 minutes maximum", "voiture")]
    y0 = cy + ro + 54
    gap = 46
    hh = (H - MY - y0 - 2 * gap) / 3
    wc = W - 2 * MX
    cs = [{"w": wc, "h": hh, "role": r, "titre": tt, "corps": [cc], "icone": ic, "orient": "h"} for r, tt, cc, ic in etapes]
    t, b, _, besoin = ajuster_cartes(cs, 34, 18, aligner=False, quoi="24/7")
    h2 = min(hh, besoin * 1.12)
    yy = y0 + (H - MY - y0 - (3 * h2 + 2 * gap)) / 2
    for i, c in enumerate(cs):
        s.add(carte(MX, yy, wc, h2, t=t, b=b, **_kw(c)))
        if i < 2:
            s.add(chevron_bas(W / 2, yy + h2 + gap / 2, 22))
        yy += h2 + gap
    return s


COMPOSES = {"II-ABS-01": continuite_24_7}


# ── Gabarits des schémas construits par l'IA (absents de la bibliothèque) ───
# Portés au format page avec EXACTEMENT les mêmes textes que le moteur d'origine (valeurs « 12,5 »,
# pourcentages « 40 % », graduations, libellés, notes) : seule la mise en page change (portrait, en gros).
def _axe_valeurs(maxi):
    """Graduation « ronde » couvrant maxi (4 à 5 intervalles) : même calcul que le moteur d'origine."""
    brut = maxi / 4
    mag = 10 ** math.floor(math.log10(brut)) if brut > 0 else 1
    pas = next(m * mag for m in (1, 2, 2.5, 5, 10) if m * mag >= brut)
    return pas, pas * math.ceil(maxi / pas)


def _num(v):
    return f"{v:g}".replace(".", ",")


def _note_bas(s, note, y, wc, th):
    """Note centrée sous le graphique (même texte que l'original)."""
    Pn = preparer(None, [note], wc - 40, 21, 21)
    if Pn is None:
        raise Deborde(f"note : {note!r}")
    s.add(rect(MX + wc / 2 - 40, y, 80, 3, th.c["accent"], 1.5))
    s.add(dessiner(MX + 20, y + 16, wc - 40, Pn["total"], Pn, "middle", th.c["encre_3"]))
    return Pn["total"] + 16


def _hauteur_note(note, wc):
    if not note:
        return 0
    Pn = preparer(None, [note], wc - 40, 21, 21)
    if Pn is None:
        raise Deborde(f"note : {note!r}")
    return Pn["total"] + 16 + 34


def _legende_series(s, items, y, th, wc):
    """Légende centrée : pastille de couleur + libellé, sur une ligne."""
    tl = 22
    larg = [largeur(lab, tl, 600) for lab, _ in items]
    tot = sum(30 + 14 + w for w in larg) + 40 * (len(items) - 1)
    if tot > wc:
        raise Deborde("légende trop longue")
    x = MX + (wc - tot) / 2
    for (lab, role), w in zip(items, larg):
        R = th.role(role)
        s.add(rect(x, y + 4, 30, 14, R.fonce if not th.sombre else R.vif, 7))
        s.add(texte_seul(x + 44, y + 18, lab, tl, 600, th.c["encre"], "start"))
        x += 30 + 14 + w + 40


def _axe(s, th, x0, x1, y_haut, y_bas, top, pas, unite, x_lab):
    """Graduations horizontales (mêmes valeurs que l'original) et unité."""
    Y = lambda v: y_bas - (y_bas - y_haut) * v / top  # noqa: E731
    v = 0
    while v <= top + 1e-9:
        y = Y(v)
        dash = "" if v == 0 else ' stroke-dasharray="5 7"'
        s.add(f'<line x1="{x0:.1f}" y1="{y:.1f}" x2="{x1:.1f}" y2="{y:.1f}" stroke="{th.c["encre_3"] if v == 0 else th.c["filet"]}" '
              f'stroke-width="{2.4 if v == 0 else 1.6}"{dash}/>')
        s.add(texte_seul(x_lab, y + 8, _num(v), 22, 500, th.c["encre_3"], "end"))
        v += pas
    if unite:
        s.add(texte_seul(x_lab, y_haut - 30, unite, 22, 600, th.c["encre_2"], "end"))
    return Y


def matrice(lignes, colonnes, cellules, role_col="sable", role_lig="creme"):
    """Tableau à double entrée : en-têtes de colonnes en aplat, libellés de lignes à gauche, cases (texte ou ✓)."""
    s, W, H = _toile()
    th = T()
    nl, nc = len(lignes), len(colonnes)
    wc = W - 2 * MX
    g = 14
    wl = 300 if nc <= 3 else 250
    wcol = (wc - wl - nc * g) / nc
    tetes = [{"w": wcol, "h": 220, "role": _it(c, "role", role_col),
              "titre": _it(c, "titre", c if isinstance(c, str) else None), "corps": _it(c, "texte", ()), "orient": "v"}
             for c in colonnes]
    libs = [{"w": wl, "h": 220, "role": _it(l, "role", role_lig),
             "titre": _it(l, "titre", l if isinstance(l, str) else None), "corps": _it(l, "texte", ()), "orient": "h"}
            for l in lignes]
    t, b, _, _ = ajuster_cartes(tetes + libs, t_max=30, t_min=17, aligner=False, quoi="matrice")
    ht = max(carte(0, 0, c["w"], c["h"], t=t, b=b, mesure=True, **_kw(c)) for c in tetes)
    place = H - 2 * MY - ht - g
    hl_max = min(260, (place - (nl - 1) * g) / nl)
    cases = [str(v) for r in cellules for v in r if v and v != "✓"]
    bc = max(b, 26)
    while bc >= 17:
        Ps = [preparer(None, [v], wcol - 28, bc, bc) for v in cases]
        if all(P is not None and P["total"] <= hl_max - 24 for P in Ps):
            break
        bc -= 0.5
    else:
        raise Deborde("matrice : texte de case trop long")
    besoin = max([carte(0, 0, c["w"], hl_max, t=t, b=b, mesure=True, **_kw(c)) for c in libs]
                 + [P["total"] + 28 for P in Ps] + [64])
    hl, g_r = _remplir(nl, besoin, hl_max, g, place, cible=0.86, k_h=2.2, k_e=1.6)
    tot = ht + g + nl * hl + (nl - 1) * g_r
    y0 = _y_optique(H - 2 * MY, tot)
    for j, c in enumerate(tetes):
        s.add(carte(MX + wl + g + j * (wcol + g), y0, wcol, ht, t=t, b=b, **_kw(c)))
    fond_c = th.c["surface_2"] if not th.sombre else th.c["surface"]
    for i, c in enumerate(libs):
        y = y0 + ht + g + i * (hl + g_r)
        s.add(carte(MX, y, wl, hl, t=t, b=b, **_kw(c)))
        for j in range(nc):
            x = MX + wl + g + j * (wcol + g)
            v = cellules[i][j]
            zone(x, y, wcol, hl)
            s.add(rect(x, y, wcol, hl, fond_c, min(th.carte["rayon"], 10), th.c["filet"], 1.5))
            if v == "✓":
                s.add(coche(x + wcol / 2, y + hl / 2, 40, "vert"))
            elif v:
                P = preparer(None, [str(v)], wcol - 28, bc, bc)
                s.add(dessiner(x + 14, y, wcol - 28, hl, P, "middle", th.c["encre"], v_align="middle", fond=fond_c))
    return s


def camembert(parts, centre=None, anneau=True, cx=340, r=230, decimales=0, total_affiche=None):
    """Anneau de répartition en haut de page (parts en pourcentage), puis une ligne par part : valeur et libellé."""
    s, W, H = _toile()
    th = T()
    wc = W - 2 * MX
    k = len(parts)
    tot = sum(p["valeur"] for p in parts)
    g = 18
    vals = [_num(p["valeur"]) for p in parts]
    tv = 46
    w_val = max(largeur(v, tv, th.typo["chiffres_graisse"], "chiffres") for v in vals) + 30
    xt = 40 + w_val
    corps = [[p["detail"]] if p.get("detail") else [] for p in parts]

    def essai(t, b):
        for p, c in zip(parts, corps):
            P = preparer(p["label"], c, wc - xt - 30, t, b)
            if P is None or P["total"] > 150:
                return False
        return True
    t, b = ajuster(essai, 30, 18, 0.8, 17, quoi="camembert (légende)")
    hs = [max(84, preparer(p["label"], c, wc - xt - 30, t, b)["total"] + 30) for p, c in zip(parts, corps)]
    hv = max(hs)
    h_leg = k * hv + (k - 1) * g
    Ro = min(300, (H - 2 * MY - 70 - h_leg) / 2)
    if Ro < 170:
        raise Deborde("camembert : trop de parts pour la page")
    Ri = Ro * 0.52 if anneau else 0
    tot_h = 2 * Ro + 70 + h_leg
    ytop = _y_optique(H - 2 * MY, tot_h)
    cxp, cyp = W / 2, ytop + Ro
    a = 0
    arcs = []
    for p in parts:
        da = 360 * p["valeur"] / tot
        arcs.append((a, a + da, p))
        a += da
    for a0, a1, p in arcs:
        R = th.role(p.get("role", "sable"))
        f_ = R.fonce if not th.sombre else R.vif
        s.add(secteur(cxp, cyp, Ri, Ro, a0, a1 - 0.001 if a1 - a0 >= 359.99 else a1, f_, th.c["fond_schema"], 5))
    for a0, a1, p in arcs:
        if a1 - a0 > 20:
            R = th.role(p.get("role", "sable"))
            f_ = R.fonce if not th.sombre else R.vif
            pct = 100 * p["valeur"] / tot
            tx, ty = pt(cxp, cyp, (Ri + Ro) / 2 if anneau else Ro * 0.62, (a0 + a1) / 2)
            s.add(texte_seul(tx, ty + 11, f"{pct:.{decimales}f} %".replace(".", ","), 30, 700,
                             R.sur_fonce if not th.sombre else th.c["fond_schema"], "middle", "chiffres", fond=f_))
    zone(cxp - Ro, cyp - Ro, 2 * Ro, 2 * Ro)
    if anneau and centre:
        tc, sous = centre if isinstance(centre, (tuple, list)) else (centre, None)
        fc = th.c["surface_2"] if not th.sombre else th.c["surface"]
        s.add(disque(cxp, cyp, Ri - 12, fc))
        s.add(bloc_texte(cxp - (Ri - 12) * 0.8, cyp - (Ri - 12) * 0.6, (Ri - 12) * 1.6, (Ri - 12) * 1.2, tc,
                         [sous] if sous else (), align="middle", t_max=48, t_min=20, b_ratio=0.5, b_min=17, fond=fc))
    y = ytop + 2 * Ro + 70
    fond_c = th.c[th.carte.get("remplissage", "carte_fond")]
    for p, c, v in zip(parts, corps, vals):
        R = th.role(p.get("role", "sable"))
        zone(MX, y, wc, hv)
        s.add(surface(MX, y, wc, hv, th.carte["rayon"], 0.8, fond_c))
        s.add(f'<path d="{chemin_arrondi(MX, y, 12, hv, th.carte["rayon"], 0, 0, th.carte["rayon"])}" '
              f'fill="{R.fonce if not th.sombre else R.vif}"/>')
        s.add(texte_seul(MX + 34, y + hv / 2 + tv * 0.36, v, tv, th.typo["chiffres_graisse"],
                         R.fonce if not th.sombre else R.vif, "start", "chiffres", fond=fond_c))
        P = preparer(p["label"], c, wc - xt - 30, t, b)
        s.add(dessiner(MX + xt, y, wc - xt - 30, hv, P, "start", th.c["encre_2"], th.c["encre"], v_align="middle",
                       fond=fond_c))
        y += hv + g
    return s


def colonnes(series, unite="", note=None, legende=None):
    """Histogramme en grand : colonnes verticales, valeur au-dessus de chaque colonne, libellés dessous."""
    s, W, H = _toile()
    th = T()
    n = len(series)
    wc = W - 2 * MX
    groupes = [se.get("valeurs") or [(se["valeur"], se.get("role", "bleu"))] for se in series]
    maxi = max(v for gr in groupes for v, _ in gr)
    pas, top = _axe_valeurs(maxi)
    x0, x1 = MX + 96, W - MX - 6
    larg_grp = (x1 - x0) / n
    tl = 28
    while tl >= 17:
        Ps = [preparer(None, [se["label"]], larg_grp - 12, tl, tl) for se in series]
        if all(P is not None and len(P["cl"][0]) <= 3 for P in Ps):
            break
        tl -= 1
    else:
        raise Deborde("colonnes : libellé trop long")
    h_lab = max(P["total"] for P in Ps) + 22
    h_note = _hauteur_note(note, wc)
    h_leg = 60 if legende else 0
    y_haut = MY + 80
    y_bas = H - MY - h_note - h_leg - h_lab - 10
    Y = _axe(s, th, x0, x1, y_haut, y_bas, top, pas, unite, x0 - 16)
    for i, (se, gr) in enumerate(zip(series, groupes)):
        kk = len(gr)
        wcl = min(150 if kk == 1 else 90, larg_grp * 0.62 / kk)
        gx = x0 + i * larg_grp + (larg_grp - kk * wcl - (kk - 1) * 12) / 2
        for j, (val, role) in enumerate(gr):
            R = th.role(role)
            x = gx + j * (wcl + 12)
            h = max(y_bas - Y(val), 6)
            f_ = R.fonce if not th.sombre else R.vif
            s.add(f'<path d="{chemin_arrondi(x, y_bas - h, wcl, h, min(8, th.carte["rayon"] + 2), min(8, th.carte["rayon"] + 2), 0, 0)}" fill="{f_}"/>')
            zone(x, y_bas - h, wcl, h)
            s.add(texte_seul(x + wcl / 2, y_bas - h - 14, _num(val), 30 if kk == 1 else 24, 700, th.c["encre"], "middle",
                             "chiffres"))
        s.add(dessiner(x0 + i * larg_grp + 6, y_bas + 18, larg_grp - 12, h_lab - 18, Ps[i], "middle", th.c["encre"],
                       v_align="top"))
    y = y_bas + h_lab + 10
    if legende:
        _legende_series(s, legende, y + 14, th, wc)
        y += h_leg
    if note:
        _note_bas(s, note, y + 30, wc, th)
    return s


def courbe(etiquettes, series, unite="", note=None):
    """Évolution dans le temps : courbe(s) en grand, valeur au-dessus de chaque point, périodes dessous."""
    s, W, H = _toile()
    th = T()
    n = len(etiquettes)
    wc = W - 2 * MX
    maxi = max(v for se in series for v in se["valeurs"])
    pas, top = _axe_valeurs(maxi)
    x0, x1 = MX + 110, W - MX - 56
    X = lambda i: x0 + (x1 - x0) * i / (n - 1)  # noqa: E731
    w_lab = min(200, (x1 - x0) / (n - 1) - 10)
    tl = 26
    while tl >= 17:
        Ps = [preparer(None, [e], w_lab, tl, tl) for e in etiquettes]
        if all(P is not None and len(P["cl"][0]) <= 3 for P in Ps):
            break
        tl -= 1
    else:
        raise Deborde("courbe : libellé de période trop long")
    h_lab = max(P["total"] for P in Ps) + 22
    h_note = _hauteur_note(note, wc)
    h_leg = 60 if len(series) > 1 else 0
    y_haut = MY + 90
    y_bas = H - MY - h_note - h_leg - h_lab - 10
    Y = _axe(s, th, x0 - 26, x1 + 26, y_haut, y_bas, top, pas, unite, x0 - 40)
    for i in range(n):
        s.add(dessiner(X(i) - w_lab / 2, y_bas + 18, w_lab, h_lab - 18, Ps[i], "middle", th.c["encre"], v_align="top"))
    poses = []
    for k_, se in enumerate(series):
        R = th.role(se.get("role", "bleu"))
        c_ = R.fonce if not th.sombre else R.vif
        pts = [(X(i), Y(v)) for i, v in enumerate(se["valeurs"])]
        if len(series) == 1:
            aire = f"M{pts[0][0]:.1f},{y_bas:.1f} " + " ".join(f"L{x:.1f},{y:.1f}" for x, y in pts) + f" L{pts[-1][0]:.1f},{y_bas:.1f} Z"
            s.add(f'<path d="{aire}" fill="{R.clair}" opacity="0.9"/>')
        s.add(f'<path d="M' + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)
              + f'" fill="none" stroke="{c_}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>')
        for (x, y), v in zip(pts, se["valeurs"]):
            s.add(disque(x, y, 13, th.c["fond_schema"]))
            s.add(disque(x, y, 9, c_))
            lab = _num(v)
            yl = y - 24
            wlab = largeur(lab, 24, 700, "chiffres")
            if any(abs(x - px) < (wlab + pw) / 2 + 6 and abs(yl - py) < 30 for px, py, pw in poses):
                yl = y + 44
            poses.append((x, yl, wlab))
            s.add(texte_seul(x, yl, lab, 24, 700, th.c["encre"], "middle", "chiffres"))
    y = y_bas + h_lab + 10
    if len(series) > 1:
        _legende_series(s, [(se["libelle"], se.get("role", "bleu")) for se in series], y + 14, th, wc)
        y += h_leg
    if note:
        _note_bas(s, note, y + 30, wc, th)
    return s


def pourcentages(taux, note=None):
    """Taux en anneaux de progression : une carte par taux (anneau, valeur au centre, libellé et texte)."""
    s, W, H = _toile()
    th = T()
    n = len(taux)
    wc = W - 2 * MX
    ncol = 1 if n <= 2 else 2
    gx, gy = 28, 30
    cw = (wc - (ncol - 1) * gx) / ncol
    rows = math.ceil(n / ncol)
    h_note = _hauteur_note(note, wc)
    place = H - 2 * MY - h_note
    h_max = min(420 if ncol == 1 else 520, (place - (rows - 1) * gy) / rows)
    r = 96 if ncol == 1 else 104
    ep = 26
    pad = 34
    w_txt = cw - (2 * r + ep + 3 * pad) if ncol == 1 else cw - 2 * pad
    fond_c = th.c[th.carte.get("remplissage", "carte_fond")]

    def essai(t, b):
        for x in taux:
            P = preparer(x["libelle"], [x["texte"]] if x.get("texte") else (), w_txt, t, b)
            if P is None:
                return False
            besoin = (max(2 * r + ep, P["total"]) + 2 * pad) if ncol == 1 else (2 * r + ep + 30 + P["total"] + 2 * pad)
            if besoin > h_max:
                return False
        return True
    t, b = ajuster(essai, 38, 18, 0.72, 17, quoi="pourcentages")
    Ps = [preparer(x["libelle"], [x["texte"]] if x.get("texte") else (), w_txt, t, b) for x in taux]
    besoin = max(((max(2 * r + ep, P["total"]) + 2 * pad) if ncol == 1 else (2 * r + ep + 30 + P["total"] + 2 * pad))
                 for P in Ps)
    h2, gy = _remplir(rows, besoin, h_max, gy, place, cible=0.75, k_h=1.2, k_e=1.8)
    tot = rows * h2 + (rows - 1) * gy
    y0 = _y_optique(H - 2 * MY, tot + h_note)
    for i, (x_, P) in enumerate(zip(taux, Ps)):
        rr, cc = divmod(i, ncol)
        dans = min(ncol, n - rr * ncol)
        x = MX + cc * (cw + gx) if dans == ncol else (W - cw) / 2
        y = y0 + rr * (h2 + gy)
        R = th.role(x_.get("role", "vert"))
        c_ = R.fonce if not th.sombre else R.vif
        zone(x, y, cw, h2)
        s.add(surface(x, y, cw, h2, th.carte["rayon"], 1.0, fond_c))
        if ncol == 1:
            cx, cy = x + pad + r + ep / 2, y + h2 / 2
        else:
            cx, cy = x + cw / 2, y + pad + r + ep / 2 + (h2 - besoin) / 2
        fond_anneau = th.c["surface_2"] if fond_c.upper() != th.c["surface_2"].upper() else th.c["filet"]
        s.add(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="none" stroke="{fond_anneau}" stroke-width="{ep}"/>')
        v = max(0.0, min(100.0, x_["valeur"]))
        if v >= 99.999:
            s.add(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="none" stroke="{c_}" stroke-width="{ep}"/>')
        elif v > 0:
            ax, ay = pt(cx, cy, r, 360 * v / 100)
            s.add(f'<path d="M{cx:.1f},{cy - r:.1f} A{r:.1f},{r:.1f} 0 {1 if v > 50 else 0} 1 {ax:.1f},{ay:.1f}" fill="none" '
                  f'stroke="{c_}" stroke-width="{ep}" stroke-linecap="round"/>')
        val = f"{x_['valeur']:g}".replace(".", ",") + " %"
        tv = 54
        while largeur(val, tv, 700, "chiffres") > (r - ep / 2) * 1.6 and tv > 20:
            tv -= 2
        s.add(texte_seul(cx, cy + tv * 0.36, val, tv, 700, R.fonce if not th.sombre else R.vif, "middle", "chiffres",
                         fond=fond_c))
        if ncol == 1:
            xt = x + 2 * pad + 2 * r + ep
            s.add(dessiner(xt, y, w_txt, h2, P, "start", th.c["encre_2"], th.c["encre"], v_align="middle", fond=fond_c))
        else:
            yt = cy + r + ep / 2 + 30
            s.add(dessiner(x + pad, yt, w_txt, P["total"], P, "middle", th.c["encre_2"], th.c["encre"], fond=fond_c))
    if note:
        _note_bas(s, note, y0 + tot + 34, wc, th)
    return s


# ── En grand : la composition occupe la hauteur de la page (D4 : au moins 70 % de la hauteur utile) ──────────
# Gabarits dont les cartes et les textes délimitent tout le dessin (mesure fiable par le registre de la toile).
ZOOMABLES = {"grille", "etoile", "comparatif", "chiffres", "barres", "fiche", "flux", "checklist", "chevrons", "arbre",
             "matrice"}
ZOOMS = (1.08, 1.16, 1.25, 1.35, 1.45, 1.6)
CIBLE_HAUTEUR = 0.84     # part de la hauteur de la toile (la toile fait 0,93 de la hauteur utile de la page : ≥ 0,77)


def part_hauteur(s):
    """Part de la hauteur de la toile occupée par le dessin : cadres des cartes et textes (registre de la toile)."""
    ys = [(z[1], z[3]) for z in s.zones] + [(t["y0"], t["y1"]) for t in s.textes]
    if not ys:
        return 1.0
    return (max(b for _, b in ys) - min(a for a, _ in ys)) / s.H


def en_grand(dessin, gabarit, cible=CIBLE_HAUTEUR):
    """Dessine (dessin() → Svg) ; si la composition reste basse (bandeau au milieu de la page), la redessine sur une
    toile réduite de même proportion, affichée à la même taille : tout le dessin (cartes, textes, pictogrammes) est
    agrandi, sans rien ajouter ni retirer. Premier zoom qui atteint la cible, sinon le plus haut qui tient."""
    s = dessin()
    if gabarit not in ZOOMABLES:
        return s
    f = part_hauteur(s)
    if f >= cible:
        return s
    meilleur, f_meilleur, z_meilleur = s, f, 1.0
    for z in ZOOMS:
        _ETAT["zoom"] = z
        try:
            s2 = dessin()
        except Exception:  # noqa: BLE001  (un texte ne tient plus à ce zoom : on garde le meilleur précédent)
            break
        finally:
            _ETAT["zoom"] = 1.0
        f2 = part_hauteur(s2)
        if f2 > f_meilleur:
            meilleur, f_meilleur, z_meilleur = s2, f2, z
        if f2 >= cible:
            return meilleur
    # Aucun zoom n'atteint la cible (colonnes étroites, textes déjà à leur taille) : les gabarits qui le permettent
    # (comparatif, et ceux qui répartissent leurs rangées par _remplir) allongent leurs cadres, au meilleur zoom.
    _ETAT["zoom"], _ETAT["etirer"] = z_meilleur, cible
    try:
        s3 = dessin()
        if part_hauteur(s3) > f_meilleur:
            meilleur = s3
    except Exception:  # noqa: BLE001
        pass
    finally:
        _ETAT["zoom"], _ETAT["etirer"] = 1.0, 0.0
    return meilleur

