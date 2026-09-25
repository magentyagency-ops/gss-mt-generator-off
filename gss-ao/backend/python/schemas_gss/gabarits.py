"""Gabarits de schémas GSS : chaque fonction reçoit du contenu et rend un Svg.

Tous respectent la même règle de couleur par rôle et l'habillage GSS (gss_lib).
"""
import math
from gss_lib import (Svg, W, H, ROLES, CONTOUR, TEXTE, NOIR, CLAIR, DATE, SURF, FONCE, GRIS, LIEN, surface, carte, forme, texte, bloc_texte,
                     numero, fleche, trait, etiquette, secteur, chevron_rot, disque, pastille_icone, icone,
                     couper, largeur, couleur_texte, pt, esc, Deborde)

MX, MY = 40, 34          # marges
GAP = 30


def _it(d, k, defaut=None):
    return d.get(k, defaut) if isinstance(d, dict) else defaut


def _bande_carte(x, y, w, h, hb, role):
    from gss_lib import _bande
    c = SURF if role == "creme" else ROLES[role][0]
    if role == "creme":
        c = "#ECE9E2"
    return _bande(x, y, w, h, 22, x, y, w, hb, c)


# ── Grille de cartes ─────────────────────────────────────────────────────────
def grille(items, cols=None, role="creme", hauteur_max=250, t_max=22):
    n = len(items)
    cols = cols or {1: 1, 2: 2, 3: 3, 4: 4, 5: 3, 6: 3, 7: 4, 8: 4, 9: 3, 10: 5, 11: 4, 12: 4}[n]
    rows = math.ceil(n / cols)
    gx, gy = 32, 34
    w = (W - 2 * MX - (cols - 1) * gx - 8) / cols
    h = min(hauteur_max, (H - 2 * MY - (rows - 1) * gy - 8) / rows)
    total_h = rows * h + (rows - 1) * gy
    y0 = (H - total_h) / 2 - 4
    s = Svg()
    for i, it in enumerate(items):
        r, c = divmod(i, cols)
        dans_ligne = min(cols, n - r * cols)
        x0 = (W - (dans_ligne * w + (dans_ligne - 1) * gx)) / 2 - 4
        x, y = x0 + c * (w + gx), y0 + r * (h + gy)
        haut = h >= 175 and _it(it, "icone")
        s.add(carte(x, y, w, h, _it(it, "role", role), _it(it, "titre"), _it(it, "texte", ()),
                    _it(it, "icone"), icone_haut=bool(haut), num=_it(it, "num"), t_max=t_max,
                    puces=_it(it, "puces", False)))
    return s


# ── Étoile ───────────────────────────────────────────────────────────────────
def etoile(centre, branches, role_centre="sombre", r=118, larg=350):
    """centre : (titre, sous-titre) ; branches : liste de dicts titre/texte/icone/role."""
    s = Svg()
    n = len(branches)
    cx, cy = W / 2, H / 2
    haut = n % 2 == 1 and n >= 3
    reste = branches[1:] if haut else branches
    gauche, droite = reste[: math.ceil(len(reste) / 2)], reste[math.ceil(len(reste) / 2):]
    if haut:
        cy = H / 2 + 56
    positions = []
    if haut:
        bw, bh = 420, 104
        positions.append((cx - bw / 2, MY - 6, bw, bh, "haut"))
    for cote, liste in (("g", gauche), ("d", droite)):
        k = len(liste)
        zone_y0 = (MY + 124) if haut else MY
        dispo = H - MY - zone_y0
        bh = min(150 if k <= 2 else 132, (dispo - (k - 1) * 22) / max(k, 1))
        gv = min(70, (dispo - k * bh) / (k - 1)) if k > 1 else 0
        tot = k * bh + (k - 1) * gv
        y0 = zone_y0 + (dispo - tot) / 2
        for j in range(k):
            x = MX if cote == "g" else W - MX - larg - 8
            positions.append((x, y0 + j * (bh + gv), larg, bh, cote))
    # liaisons
    for (x, y, w, h, cote) in positions:
        if cote == "haut":
            a, b = (cx, cy - r - 4), (cx, y + h + 14)
        else:
            tx = x + w + 14 if cote == "g" else x - 10
            ty = y + h / 2
            ang = math.atan2(ty - cy, tx - cx)
            a = (cx + (r + 4) * math.cos(ang), cy + (r + 4) * math.sin(ang))
            b = (tx, ty)
        s.add(trait([a, b], 2.6, True))
    s.add(disque(cx, cy, r, role_centre))
    titre, sous = centre if isinstance(centre, (tuple, list)) else (centre, None)
    s.add(bloc_texte(cx - r * 0.78, cy - r * 0.62, r * 1.56, r * 1.24, titre, [sous] if sous else (),
                     couleur=couleur_texte(role_centre), t_max=22))
    for (x, y, w, h, _), br in zip(positions, branches):
        s.add(carte(x, y, w, h, _it(br, "role", "creme"), _it(br, "titre"), _it(br, "texte", ()),
                    _it(br, "icone"), t_max=21))
    return s


# ── Procédure en flux ─────────────────────────────────────────────────────────
def flux(etapes, labels=None, sorties=None, h=None, numeroter=True, cy=None, gap=None):
    """Étapes de gauche à droite. labels {i: texte} posés sur la flèche i→i+1.
    sorties {i: dict} : issue sous l'étape i (flèche vers le bas)."""
    labels, sorties = labels or {}, sorties or {}
    s = Svg()
    n = len(etapes)
    if h is None:
        h = {1: 300, 2: 300, 3: 290, 4: 250}.get(n, 210) if not sorties else (190 if n <= 4 else 170)
    if gap is None:
        gap = 90 if n <= 3 else (64 if n == 4 else 50)
    w = (W - 2 * MX - (n - 1) * gap - 8) / n
    h_so = 140
    g_so = 118 if any(_it(so, "label") for so in sorties.values()) else 74
    if cy is None:
        if sorties:
            haut_tot = h + g_so + h_so + (70 if labels else 0)
            cy = (H - haut_tot) / 2 + (70 if labels else 0) + h / 2
        else:
            cy = H / 2 + (25 if labels else 0)
    y = cy - h / 2
    xs = [MX + i * (w + gap) for i in range(n)]
    for i in range(n - 1):
        s.add(fleche(xs[i] + w + 5, cy, xs[i + 1] - 7, cy))
    for i, (x, et) in enumerate(zip(xs, etapes)):
        s.add(carte(x, y, w, h, _it(et, "role", "creme"), _it(et, "titre"), _it(et, "texte", ()),
                    _it(et, "icone"), icone_haut=bool(_it(et, "icone")) and h >= 190,
                    num=(i + 1) if numeroter else None, t_max=25))
    for i, t in labels.items():
        mx = (xs[i] + w + xs[i + 1]) / 2
        role = "rouge"
        if isinstance(t, tuple):
            t, role = t
        s.add(trait([(mx, y - 44), (mx, cy - 6)], 3, False))
        s.add(etiquette(mx, y - 66, t, role, 15, 190))
    for i, so in sorties.items():
        x = xs[i]
        s.add(fleche(x + w / 2, y + h + 14, x + w / 2, y + h + g_so - 8))
        if _it(so, "label"):
            lab = so["label"]
            role_l = "rouge"
            if isinstance(lab, tuple):
                lab, role_l = lab
            s.add(etiquette(x + w / 2 + 16 + min(largeur(lab.upper(), 15, 800), 190) / 2 + 14, y + h + g_so / 2, lab, role_l, 15, 190))
        s.add(carte(x, y + h + g_so, w, _it(so, "h", h_so), _it(so, "role", "vert"), _it(so, "titre"), _it(so, "texte", ()),
                    t_max=22))
    return s


# ── Étapes en chevrons ───────────────────────────────────────────────────────
def chevrons(etapes, h_chevron=120, h_corps=210):
    s = Svg()
    n = len(etapes)
    pointe = 34
    w = (W - 2 * MX - 8 + (n - 1) * (pointe - 8)) / n
    y = (H - h_chevron - 28 - h_corps) / 2 - 4
    for i, et in enumerate(etapes):
        x = MX + i * (w - pointe + 8)
        role = _it(et, "role", "sable")
        fond, teinte = ROLES[role]
        g = 0 if i == 0 else pointe

        def poly(ox):
            p = [(x + ox, y + ox), (x + w - pointe + ox, y + ox), (x + w + ox, y + h_chevron / 2 + ox),
                 (x + w - pointe + ox, y + h_chevron + ox), (x + ox, y + h_chevron + ox)]
            if g:
                p.append((x + g + ox, y + h_chevron / 2 + ox))
            return "M" + " L".join(f"{a:.1f},{b:.1f}" for a, b in p) + " Z"
        s.add(f'<path d="{poly(0)}" fill="{fond}" stroke="{SURF}" stroke-width="3" stroke-linejoin="round" filter="url(#od)"/>')
        tx0 = x + (g + 14 if g else 24)
        s.add(bloc_texte(tx0, y + 10, w - pointe - (g + 14 if g else 24) - 6, h_chevron - 20, _it(et, "titre"),
                         couleur=couleur_texte(role), t_max=23, t_min=10.5))
        s.add(texte(tx0, y + 24, f"{i + 1:02d}", 14, 700, FONCE[role], "start", ' letter-spacing="1"'))
        corps = _it(et, "texte", ())
        if corps:
            cx0 = x + (g * 0.5) + 6
            s.add(carte(cx0, y + h_chevron + 28, w - pointe - 6, h_corps, "creme", None, corps,
                        puces=_it(et, "puces", False), t_max=23, t_min=11, b_ratio=1, pad=20))
    return s


# ── Comparatif ───────────────────────────────────────────────────────────────
def comparatif(colonnes, vs=False, h_tete=104):
    s = Svg()
    n = len(colonnes)
    gx = 70 if (vs and n == 2) else 34
    w = (W - 2 * MX - (n - 1) * gx - 8) / n
    h_max = H - 2 * MY - h_tete - 24 - 8
    # hauteur du corps ajustée au contenu (texte visé : 22 px)
    besoin = 0
    for col in colonnes:
        pts = _it(col, "points", ())
        lignes = 0
        for p_ in pts:
            r = couper(p_, 22, 400, w - 52 - 24)
            lignes += len(r) if r else 3
        besoin = max(besoin, lignes * 22 * 1.36 + max(0, len(pts) - 1) * 8 + 70)
    h_corps = max(200, min(h_max, besoin))
    y0 = (H - (h_tete + 24 + h_corps)) / 2 - 4
    for i, col in enumerate(colonnes):
        x = MX + i * (w + gx)
        s.add(carte(x, y0, w, h_tete, _it(col, "role", "sable"), _it(col, "titre"), _it(col, "sous", ()),
                    _it(col, "icone"), t_max=20))
        pts = _it(col, "points", ())
        if pts:
            s.add(carte(x, y0 + h_tete + 24, w, h_corps, "creme", None, pts, puces=True, pad=26,
                        t_max=24, b_ratio=1, t_min=11))
    if vs and n == 2:
        cx = MX + w + gx / 2
        s.add(disque(cx, y0 + h_tete + 24 + h_corps / 2, 30, "sombre", 5),
              texte(cx, y0 + h_tete + 24 + h_corps / 2 + 7, "OU", 17, 800, CLAIR))
    return s


# ── Chiffres clés ────────────────────────────────────────────────────────────
def chiffres(tuiles, note=None, cols=None):
    s = Svg()
    n = len(tuiles)
    cols = cols or (n if n <= 4 else math.ceil(n / 2))
    rows = math.ceil(n / cols)
    gx, gy = 34, 34
    w = (W - 2 * MX - (cols - 1) * gx - 8) / cols
    h_note = 50 if note else 0
    h = min(260, (H - 2 * MY - h_note - (rows - 1) * gy - 8) / rows)
    tot = rows * h + (rows - 1) * gy
    y0 = (H - tot - h_note) / 2
    for i, t in enumerate(tuiles):
        r, c = divmod(i, cols)
        k = min(cols, n - r * cols)
        x0 = (W - (k * w + (k - 1) * gx)) / 2 - 4
        x, y = x0 + c * (w + gx), y0 + r * (h + gy)
        role = _it(t, "role", "creme")
        s.add(surface(x, y, w, h, 22))
        hb = 58 if _it(t, "icone") else 12
        s.add(_bande_carte(x, y, w, h, hb, role))
        yy = y + hb + 14
        if _it(t, "icone"):
            s.add(pastille_icone(x + w / 2, y + hb, t["icone"], role, 24))
            yy = y + hb + 34
        val = str(t["valeur"])
        tv = 64
        while largeur(val, tv, 800) > w - 30:
            tv -= 2
        s.add(texte(x + w / 2, yy + tv * 0.86, val, tv, 800, TEXTE))
        s.add(bloc_texte(x + 18, yy + tv + 8, w - 36, y + h - (yy + tv + 8) - 14, None, [t["label"]],
                         couleur=TEXTE, t_max=19, b_ratio=0.9, b_min=12))
    if note:
        s.add(bloc_texte(MX, H - MY - 40, W - 2 * MX, 36, None, [note], t_max=15, b_ratio=0.95, b_min=12))
    return s


# ── Liste de contrôle ────────────────────────────────────────────────────────
def coche(x, y, t=22):
    return (f'<rect x="{x}" y="{y}" width="{t}" height="{t}" rx="{t / 2}" fill="{FONCE["vert"]}"/>'
            f'<path d="M{x + 5.5},{y + t / 2} L{x + t / 2 - 1},{y + t - 6} L{x + t - 5},{y + 6}" fill="none" '
            f'stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>')


def checklist(groupes, h_tete=96):
    s = Svg()
    n = len(groupes)
    gx = 34
    w = (W - 2 * MX - (n - 1) * gx - 8) / n
    avec_tete = any(_it(g, "titre") for g in groupes)
    h_max = H - 2 * MY - 8 - ((h_tete + 22) if avec_tete else 0)
    # taille commune à tous les groupes
    for tb in [v / 2 for v in range(48, 21, -1)]:
        ok, mesures = True, []
        for g in groupes:
            lignes = [couper(it, tb, 400, w - 100) for it in g["items"]]
            if any(l is None for l in lignes):
                ok = False
                break
            pas = tb * 1.36
            tot = sum(max(len(l) * pas, 28) for l in lignes) + (len(lignes) - 1) * tb * 0.95
            mesures.append((lignes, tot))
        if ok and max(t for _, t in mesures) <= h_max - 70:
            break
    else:
        raise Deborde("liste trop longue")
    hc = min(h_max, max(t for _, t in mesures) + 80)
    bloc_h = hc + ((h_tete + 22) if avec_tete else 0)
    y0 = (H - bloc_h) / 2 - 4
    for i, (g, (lignes, tot)) in enumerate(zip(groupes, mesures)):
        x = MX + i * (w + gx)
        yc = y0
        if avec_tete:
            s.add(carte(x, y0, w, h_tete, _it(g, "role", "bleu"), _it(g, "titre"), _it(g, "sous", ()),
                        _it(g, "icone"), t_max=22))
            yc = y0 + h_tete + 22
        s.add(forme(x, yc, w, hc, "creme"))
        yy = yc + (hc - tot) / 2
        for l in lignes:
            bh = max(len(l) * pas, 28)
            s.add(coche(x + 28, yy + bh / 2 - 13, 26))
            for j, ligne in enumerate(l):
                s.add(texte(x + 72, yy + (bh - len(l) * pas) / 2 + tb * 1.02 + j * pas, ligne, tb, 400, TEXTE, "start"))
            yy += bh + tb * 0.95
    return s


# ── Cycle ────────────────────────────────────────────────────────────────────
def cycle(secteurs, centre, cx=330, ro=232, ri=122, cartes=True):
    s = Svg()
    n = len(secteurs)
    cy = H / 2
    if not cartes:
        cx = W / 2
    pas = 360 / n
    g = 2.5
    for partie in ("ombre", "fond"):
        for i, se in enumerate(secteurs):
            fond, ombre = ROLES[_it(se, "role", "sable")]
            s.add(secteur(cx, cy, ri, ro, i * pas + g, (i + 1) * pas - g, fond, ombre, partie=partie))
    corde = 2 * ((ri + ro) / 2) * math.sin(math.radians(pas / 2)) * 0.62
    t_lib = 16
    for t_lib in (16, 14.5, 13):
        libs = [couper(_it(se, "court", _it(se, "titre")).upper(), t_lib, 800, min(corde, 132)) for se in secteurs]
        tous = all(l and len(l) <= 2 for l in libs)
        if tous:
            break
    for i, se in enumerate(secteurs):
        a = (i + 0.5) * pas
        tx, ty = pt(cx, cy, (ri + ro) / 2, a)
        role = _it(se, "role", "sable")
        if tous:
            l = libs[i]
            for j, ligne in enumerate(l):
                s.add(texte(tx, ty + 6 - (len(l) - 1) * 10 + j * 20, ligne, t_lib, 800, couleur_texte(role)))
            if cartes:
                s.add(numero(*pt(cx, cy, ro + 4, a), i + 1))
        else:
            s.add(texte(tx, ty + 14, str(i + 1), 38, 800, couleur_texte(role)))
        s.add(chevron_rot(cx, cy, (ri + ro) / 2, i * pas))
    t, sous = centre if isinstance(centre, (tuple, list)) else (centre, None)
    s.add(disque(cx, cy, ri - 22, "creme", 6))
    s.add(bloc_texte(cx - (ri - 22) * 0.8, cy - (ri - 22) * 0.6, (ri - 22) * 1.6, (ri - 22) * 1.2, t,
                     [sous] if sous else (), t_max=18))
    if cartes:
        x0 = cx + ro + 70
        wv = W - MX - x0 - 8
        hv = min(126, (H - 2 * MY - (n - 1) * 20) / n)
        tot = n * hv + (n - 1) * 20
        y0 = (H - tot) / 2
        for i, se in enumerate(secteurs):
            s.add(carte(x0, y0 + i * (hv + 20), wv, hv, _it(se, "role", "sable"), _it(se, "titre"),
                        _it(se, "texte", ()), num=i + 1, t_max=21, align="start", pad=26))
    return s


# ── Pyramide ─────────────────────────────────────────────────────────────────
def pyramide(niveaux, largeur_base=540, avec_cartes=True):
    """niveaux du sommet à la base."""
    s = Svg()
    n = len(niveaux)
    cx = 330 if avec_cartes else W / 2
    y0, y1 = MY + 10, H - MY - 14
    hh = (y1 - y0 - (n - 1) * 10) / n
    haut = 170
    for i, nv in enumerate(niveaux):
        ya, yb = y0 + i * (hh + 10), y0 + i * (hh + 10) + hh
        la = haut + (largeur_base - haut) * (ya - y0) / (y1 - y0)
        lb = haut + (largeur_base - haut) * (yb - y0) / (y1 - y0)
        role = _it(nv, "role", "sable")
        fond, teinte = ROLES[role]

        def poly(o):
            return (f"M{cx - la / 2 + o:.1f},{ya + o:.1f} L{cx + la / 2 + o:.1f},{ya + o:.1f} "
                    f"L{cx + lb / 2 + o:.1f},{yb + o:.1f} L{cx - lb / 2 + o:.1f},{yb + o:.1f} Z")
        s.add(f'<path d="{poly(0)}" fill="{fond}" stroke="{SURF}" stroke-width="3" stroke-linejoin="round" filter="url(#od)"/>')
        court = _it(nv, "court", _it(nv, "titre"))
        s.add(bloc_texte(cx - la / 2 + 22, ya + 6, la - 44, hh - 12, court, couleur=couleur_texte(role),
                         t_max=21, t_min=10))
        if avec_cartes and _it(nv, "texte"):
            xc = cx + largeur_base / 2 + 60
            s.add(trait([(cx + (la + lb) / 4 + 12, (ya + yb) / 2), (xc - 10, (ya + yb) / 2)], 3, True, tirets=True))
            s.add(carte(xc, ya + 4, W - MX - xc - 8, hh - 8, "creme", _it(nv, "titre"), _it(nv, "texte", ()),
                        t_max=23, align="start", pad=26))
    return s


# ── Organigramme / arborescence ──────────────────────────────────────────────
def arbre(racine, enfants, h_racine=96, h_enfant=100, rx=8):
    s = Svg()
    n = len(enfants)
    gx = 30
    w = (W - 2 * MX - (n - 1) * gx - 8) / n
    wr = min(460, max(320, w * 1.2))
    sans_items = not any(_it(en, "items") for en in enfants)
    yr = (H - (h_racine + 64 + h_enfant)) / 2 if sans_items else MY
    ye = yr + h_racine + 64
    xs = [MX + i * (w + gx) for i in range(n)]
    s.add(trait([(W / 2, yr + h_racine + 8), (W / 2, yr + h_racine + 32)], 4.5, False))
    if n > 1:
        s.add(trait([(xs[0] + w / 2, yr + h_racine + 32), (xs[-1] + w / 2, yr + h_racine + 32)], 4.5, False))
    for x in xs:
        s.add(fleche(x + w / 2, yr + h_racine + 32, x + w / 2, ye - 7))
    s.add(carte(W / 2 - wr / 2, yr, wr, h_racine, _it(racine, "role", "or"), _it(racine, "titre"),
                _it(racine, "texte", ()), _it(racine, "icone"), rx=rx, t_max=20))
    for x, en in zip(xs, enfants):
        s.add(carte(x, ye, w, h_enfant, _it(en, "role", "sable"), _it(en, "titre"), _it(en, "texte", ()),
                    _it(en, "icone"), rx=rx, t_max=24 if sans_items else 21))
        items = _it(en, "items", ())
        if items:
            yi = ye + h_enfant + 26
            dispo = H - MY - yi - 8
            hi = min(78, (dispo - (len(items) - 1) * 14) / len(items))
            s.add(trait([(x + 22, ye + h_enfant + 8), (x + 22, yi + (len(items) - 1) * (hi + 14) + hi / 2)],
                        3.5, False))
            for j, it in enumerate(items):
                yj = yi + j * (hi + 14)
                s.add(fleche(x + 22, yj + hi / 2, x + 38, yj + hi / 2, 3.5))
                titre, corps = (it, ()) if isinstance(it, str) else (_it(it, "titre"), _it(it, "texte", ()))
                s.add(carte(x + 46, yj, w - 46, hi, _it(it, "role", "creme") if isinstance(it, dict) else "creme",
                            titre, corps, rx=rx, t_max=19, t_min=10, ombre=6, pad=12, maj=False))
    return s


# ── Frise ────────────────────────────────────────────────────────────────────
def frise(jalons, w_carte=None, alterne=True, couleur_bande="#B8CCB1"):
    s = Svg()
    n = len(jalons)
    y0, y1 = 312, 348
    s.add(f'<rect x="30" y="{y0}" width="1100" height="{y1 - y0}" fill="{couleur_bande}"/>'
          f'<path d="M1128,{y0 - 22} L1172,{(y0 + y1) / 2} L1128,{y1 + 22} z" fill="{couleur_bande}"/>')
    w = w_carte or min(300, (W - 2 * MX) / (math.ceil(n / 2) if alterne else n) - 30)
    pas = (1060 - 90) / max(n - 1, 1) if n > 1 else 0
    for i, j in enumerate(jalons):
        cx = 110 + i * pas if n > 1 else W / 2
        haut = (i % 2 == 0) if alterne else True
        x = min(max(cx - w / 2, 22), W - w - 22)
        h = _it(j, "h", 190)
        role = _it(j, "role", "sable")
        if haut:
            y = y0 - 26 - h
            s.add(trait([(cx, y + h + 6), (cx, y0)], 4, False))
        else:
            y = y1 + 26
            s.add(trait([(cx, y1), (cx, y - 2)], 4, False))
        s.add(carte(x, y, w, h, role, _it(j, "titre"), _it(j, "texte", ()), puces=_it(j, "puces", False),
                    t_max=19, t_min=10.5, pad=16))
        d = _it(j, "date")
        if d:
            tv = 19
            while largeur(d, tv, 800) > max(pas - 16, 90):
                tv -= 1
            s.add(texte(cx, (y0 + y1) / 2 + 7, d, tv, 800, DATE))
        else:
            s.add(f'<circle cx="{cx}" cy="{(y0 + y1) / 2}" r="6" fill="{DATE}"/>')
    return s


# ── Échelle de temps / jauge ─────────────────────────────────────────────────
def jauge(maxi, unite, marqueurs, pas_grad=None, debut=0, x0=90, x1=1110, y=330, legende_debut=None, note=None):
    s = Svg()
    pas_grad = pas_grad or maxi / 6
    if note:
        s.add(texte(W - MX - 8, H - MY - 12, note, 14, 500, "#5B5451", "end"))
    X = lambda v: x0 + (v - debut) / (maxi - debut) * (x1 - x0)
    s.add(forme(x0 - 20, y - 18, x1 - x0 + 40, 36, "sable", 18, 6))
    v = debut
    while v <= maxi + 1e-9:
        xv = X(v)
        s.add(f'<line x1="{xv:.1f}" y1="{y - 8}" x2="{xv:.1f}" y2="{y + 8}" stroke="{CONTOUR}" stroke-width="2.5"/>')
        lab = f"{v:g} {unite}" if unite else f"{v:g}"
        if legende_debut and abs(v - debut) < 1e-9:
            lab = legende_debut
        if not any(abs(m["val"] - v) < 1e-9 for m in marqueurs):
            s.add(texte(xv, y + 44, lab, 13, 600, "#5B5451"))
        v += pas_grad
    n = len(marqueurs)
    for i, m in enumerate(sorted(marqueurs, key=lambda m: m["val"])):
        xv = X(m["val"])
        haut = i % 2 == 0
        role = _it(m, "role", "bleu")
        w = _it(m, "w", 230)
        h = _it(m, "h", 118)
        xc = min(max(xv - w / 2, 22), W - w - 22)
        if haut:
            yc = y - 58 - h
            s.add(trait([(xv, yc + h + 6), (xv, y - 22)], 4, False))
        else:
            yc = y + 70
            s.add(trait([(xv, y + 22), (xv, yc - 2)], 4, False))
        s.add(disque(xv, y, 15, role, 4))
        s.add(carte(xc, yc, w, h, role, _it(m, "titre"), _it(m, "texte", ()), t_max=20, pad=14))
    return s


# ── Fiche référence ──────────────────────────────────────────────────────────
def fiche(nom, lieu, icone_secteur, stats, missions, titre_missions="Nos missions", secteur_txt=None):
    s = Svg()
    xg, wg = MX, 360
    s.add(forme(xg, MY, wg, 206, "or", 24))
    s.add(pastille_icone(xg + 52, MY + 56, icone_secteur, "or", 30))
    if secteur_txt:
        s.add(bloc_texte(xg + 96, MY + 28, wg - 118, 56, None, [secteur_txt.upper()], align="start", t_max=14, b_ratio=1, b_min=10))
    s.add(bloc_texte(xg + 24, MY + 96, wg - 48, 96, nom, [lieu] if lieu else (), align="start", t_max=22,
                     maj=False))
    k = len(stats)
    ys = MY + 206 + 30
    hs = (H - MY - ys - 8 - (k - 1) * 22) / max(k, 1)
    hs = min(hs, 116)
    for i, (val, lab) in enumerate(stats):
        y = ys + i * (hs + 22)
        s.add(forme(xg, y, wg, hs, "creme", 20))
        tv = 34
        while largeur(val, tv, 800) > 150:
            tv -= 2
        s.add(texte(xg + 24, y + hs / 2 + tv * 0.35, val, tv, 800, TEXTE, "start"))
        xl = xg + 24 + largeur(val, tv, 800) + 18
        s.add(bloc_texte(xl, y + 8, xg + wg - 20 - xl, hs - 16, None, [lab], align="start", t_max=18, b_ratio=1, b_min=11))
    xd = xg + wg + 40
    wd = W - MX - xd - 8
    s.add(forme(xd, MY, wd, H - 2 * MY - 8, "creme", 24))
    s.add(texte(xd + 30, MY + 50, titre_missions.upper(), 20, 800, TEXTE, "start"))
    s.add(f'<rect x="{xd + 30}" y="{MY + 64}" width="56" height="5" rx="2.5" fill="{ROLES["orange"][1]}"/>')
    cols = 2 if len(missions) > 6 else 1
    wc = (wd - 60 - (cols - 1) * 28) / cols
    par_col = math.ceil(len(missions) / cols)
    zone_y, zone_h = MY + 92, H - 2 * MY - 8 - 92 - 20
    for tb in [x / 2 for x in range(48, 21, -1)]:
        cols_l = [missions[c * par_col:(c + 1) * par_col] for c in range(cols)]
        ok, blocs = True, []
        for col in cols_l:
            lignes = [couper(m, tb, 400, wc - 34) for m in col]
            if any(l is None for l in lignes):
                ok = False
                break
            hcol = sum(len(l) * tb * 1.34 for l in lignes) + (len(col) - 1) * tb * 0.62
            if hcol > zone_h:
                ok = False
                break
            blocs.append(lignes)
        if ok:
            break
    else:
        raise Deborde(f"missions trop longues : {nom}")
    h_blocs = max(sum(len(l) * tb * 1.34 for l in b) + (len(b) - 1) * tb * 0.62 for b in blocs)
    for c, lignes in enumerate(blocs):
        xc = xd + 30 + c * (wc + 28)
        yy = zone_y + (zone_h - h_blocs) / 2
        for l in lignes:
            s.add(f'<circle cx="{xc + 9}" cy="{yy + tb * 0.68:.1f}" r="5" fill="{FONCE["vert"]}"/>')
            for j, li in enumerate(l):
                s.add(texte(xc + 26, yy + tb + j * tb * 1.34, li, tb, 400, TEXTE, "start"))
            yy += len(l) * tb * 1.34 + tb * 0.62
    return s


# ── Silhouette annotée ───────────────────────────────────────────────────────
ANCRES = {"tete": (600, 118), "col": (600, 192), "torse": (600, 262), "poitrine": (572, 232), "bras": (520, 300),
          "taille": (600, 352), "jambes": (578, 452), "pieds": (568, 578), "dos": (600, 262), "epaules": (648, 214),
          "main": (512, 390), "numero": (629, 220), "insigne": (629, 245)}


def silhouette(annotations, tenue="intervention", dos=False, marquage=False):
    """annotations : dicts titre/texte/ancre/cote ('g' ou 'd')."""
    s = Svg()
    haut_c = {"costume": "#3A3736", "intervention": "#4A4746", "ssiap": "#4A4746"}[tenue]
    bas_c = {"costume": "#3A3736", "intervention": "#56524F", "ssiap": "#56524F"}[tenue]
    o = 7
    for ox, oy, ombre in ((0, 0, False),):
        f_h = "#2E2B2B" if ombre else haut_c
        f_b = "#2E2B2B" if ombre else bas_c
        peau = "#2E2B2B" if ombre else "#E5CA97"
        k = f'stroke="#2E2B2B" stroke-width="1.5" stroke-linejoin="round"'
        s.add(f'<g transform="translate({ox},{oy})">'
              f'<path d="M548,560 L556,372 L644,372 L652,560 L612,560 L600,420 L588,560 z" fill="{f_b}" {k}/>'
              f'<path d="M540,588 L540,566 L590,566 L596,588 z M604,588 L610,566 L660,566 L660,588 z" fill="#2E2B2B" {k}/>'
              f'<path d="M560,190 L640,190 L676,210 L700,370 L676,380 L660,272 L652,380 L548,380 L540,272 L524,380 L500,370 L524,210 z" fill="{f_h}" {k}/>'
              f'<circle cx="600" cy="130" r="44" fill="{peau}" {k}/>'
              + ('' if ombre else f'<path d="M556,128 C554,78 646,78 644,128 C632,110 568,110 556,128 z" fill="#3A3736" stroke="{CONTOUR}" stroke-width="3"/>')
              + f'<path d="M586,172 L614,172 L612,194 L588,194 z" fill="{peau}" {k}/>'
              '</g>')
    if tenue == "costume" and not dos:
        s.add(f'<path d="M580,192 L600,236 L620,192 z" fill="#FFFFFF" stroke="{CONTOUR}" stroke-width="2.5"/>'
              f'<path d="M596,200 L604,200 L608,262 L600,274 L592,262 z" fill="#1E1C1C" stroke="{CONTOUR}" stroke-width="2"/>')
    if marquage and not dos:
        s.add(f'<rect x="608" y="214" width="42" height="13" rx="1.5" fill="#FFFFFF" stroke="#111" stroke-width="1.2"/>'
              + texte(629, 224.5, "N° CNAPS", 7.5, 700, "#111")
              + f'<rect x="617" y="233" width="24" height="24" rx="2" fill="{ROLES["sable"][0]}" stroke="#111" stroke-width="1.2"/>'
              + texte(629, 249, "GSS", 8, 800, "#B9423C"))
    if dos:
        s.add(f'<rect x="548" y="236" width="104" height="28" rx="3" fill="#111"/>'
              + texte(600, 256, "SÉCURITÉ PRIVÉE", 10.5, 800, "#FFFFFF"))
    gauche = sorted([a for a in annotations if _it(a, "cote", "g") == "g"], key=lambda a: ANCRES[a["ancre"]][1])
    droite = sorted([a for a in annotations if _it(a, "cote", "g") == "d"], key=lambda a: ANCRES[a["ancre"]][1])
    for cote, liste in (("g", gauche), ("d", droite)):
        k = len(liste)
        if not k:
            continue
        wv, hv = 380, min(128, (H - 2 * MY - (k - 1) * 22) / k)
        tot = k * hv + (k - 1) * 22
        y0 = (H - tot) / 2
        for i, a in enumerate(liste):
            x = MX if cote == "g" else W - MX - wv - 8
            y = y0 + i * (hv + 22)
            ax, ay = ANCRES[a["ancre"]]
            if cote == "d":
                ax = 1200 - ax if a["ancre"] in ("bras", "main", "jambes", "pieds", "poitrine") else ax
            bx = x + wv + 8 if cote == "g" else x - 6
            s.add(trait([(bx, y + hv / 2), ((bx + ax) / 2, y + hv / 2), (ax, ay)], 3, False))
            s.add(f'<circle cx="{ax}" cy="{ay}" r="7" fill="{FONCE["orange"]}" stroke="{SURF}" stroke-width="3"/>')
            s.add(carte(x, y, wv, hv, _it(a, "role", "creme"), _it(a, "titre"), _it(a, "texte", ()), t_max=20,
                        align="start", pad=22))
    return s


# ── Carte schématique ────────────────────────────────────────────────────────
def carte_sites(points, hub=None, liens=True, labels_liens=None, cadre=(430, 60, 770, 600)):
    """Points placés d'après leurs coordonnées réelles ; étiquettes rangées en deux
    colonnes (ouest à gauche, est à droite) reliées par des lignes de rappel."""
    s = Svg()
    lats = [p["lat"] for p in points]
    lons = [p["lon"] for p in points]
    k = math.cos(math.radians(sum(lats) / len(lats)))
    x0, y0, x1, y1 = cadre
    lx0, lx1, ly0, ly1 = min(lons) * k, max(lons) * k, min(lats), max(lats)
    sc = min((x1 - x0) / max(lx1 - lx0, 1e-6), (y1 - y0) / max(ly1 - ly0, 1e-6))
    ox = (x0 + x1) / 2 - (lx0 + lx1) / 2 * sc
    oy = (y0 + y1) / 2 + (ly0 + ly1) / 2 * sc
    P = {p["nom"]: (ox + p["lon"] * k * sc, oy - p["lat"] * sc) for p in points}
    s.add(f'<ellipse cx="{(x0 + x1) / 2}" cy="{(y0 + y1) / 2}" rx="{(x1 - x0) / 2 + 60}" ry="{(y1 - y0) / 2 + 40}" '
          f'fill="#E3E0DD" stroke="#C9C4C1" stroke-width="2" stroke-dasharray="8 8"/>')
    if hub and liens:
        hx, hy = P[hub]
        for p in points:
            if p["nom"] != hub:
                s.add(trait([(hx, hy), P[p["nom"]]], 3, False, CONTOUR, tirets=True))
    cxm = (x0 + x1) / 2
    gauche = sorted([p for p in points if P[p["nom"]][0] <= cxm], key=lambda p: P[p["nom"]][1])
    droite = sorted([p for p in points if P[p["nom"]][0] > cxm], key=lambda p: P[p["nom"]][1])
    wl = 300
    for cote, liste in (("g", gauche), ("d", droite)):
        n = len(liste)
        if not n:
            continue
        hl = min(96, (H - 2 * MY - (n - 1) * 16 - 8) / n)
        tot = n * hl + (n - 1) * 16
        ys = (H - tot) / 2
        for i, p in enumerate(liste):
            px, py = P[p["nom"]]
            lx = MX if cote == "g" else W - MX - wl - 8
            ly = ys + i * (hl + 16)
            ax = lx + wl + 8 if cote == "g" else lx - 4
            s.add(trait([(ax, ly + hl / 2), (px, py)], 2.5, False, CONTOUR))
            role = p.get("role", "creme")
            s.add(carte(lx, ly, wl, hl, role if p["nom"] != hub else "or", p.get("label", p["nom"]),
                        [p["detail"]] if p.get("detail") else (), t_max=19, align="start", pad=18, ombre=6, maj=False))
    for p in points:
        px, py = P[p["nom"]]
        if p["nom"] == hub:
            s.add(disque(px, py, 22, "or", 4), icone("batiment", px, py, 0.66))
        else:
            s.add(disque(px, py, 11, p.get("role", "sable"), 3))
    return s


def anneaux_delais(centre, sites, paliers, unite="min"):
    """Sites placés selon leur direction réelle depuis le centre, sur l'anneau de leur délai."""
    s = Svg()
    cx, cy = W / 2, H / 2 + 6
    rmax = 272
    rs = {v: rmax * (i + 1) / len(paliers) for i, v in enumerate(sorted(paliers))}
    teintes = ["#E6E3E1", "#EDEAE7", "#F2F0EE"]
    for i, v in enumerate(sorted(paliers, reverse=True)):
        s.add(f'<circle cx="{cx}" cy="{cy}" r="{rs[v]}" fill="{teintes[i % 3]}" stroke="{LIEN}" stroke-width="2" stroke-dasharray="8 8"/>')
        s.add(etiquette(cx, cy - rs[v], f"{v:g} {unite}", "bleu", 14, 140))
    lat0, lon0 = centre["lat"], centre["lon"]
    k = math.cos(math.radians(lat0))
    places = []
    for st in sites:
        ang = math.degrees(math.atan2((st["lon"] - lon0) * k, st["lat"] - lat0))
        places.append([st, ang])
    # écart angulaire minimal entre sites d'un même anneau, en circulaire (lisibilité des étiquettes)
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
        s.add(trait([(cx, cy), (px, py)], 3, False, CONTOUR))
        s.add(disque(px, py, 12, "bleu", 3))
        wl = max(largeur(st["nom"], 16, 800), largeur(st.get("detail", ""), 13, 400)) + 30
        hl = 56 if st.get("detail") else 36
        lx = px + 20 if math.sin(math.radians(ang)) >= 0 else px - 20 - wl
        ly = py - hl / 2 + st.get("dy", 0)
        s.add(forme(lx, ly, wl, hl, "creme", 12, 5, 2.5))
        s.add(texte(lx + 15, ly + 23, st["nom"], 16, 800, TEXTE, "start"))
        if st.get("detail"):
            s.add(texte(lx + 15, ly + 44, st["detail"], 13, 400, TEXTE, "start"))
    s.add(disque(cx, cy, 30, "or", 5), icone("batiment", cx, cy, 0.85))
    s.add(carte(MX, MY, 300, 92, "or", centre["nom"], [centre["detail"]] if centre.get("detail") else (),
                "batiment", t_max=19))
    return s


# ── Plan de ronde ────────────────────────────────────────────────────────────
def plan_ronde(legende):
    s = Svg()
    bat = [(80, 70, 300, 170, "BÂTIMENT A"), (460, 70, 250, 130, "BÂTIMENT B"), (80, 340, 220, 190, "PARKING"),
           (390, 300, 320, 230, "BÂTIMENT C")]
    s.add(f'<rect x="50" y="40" width="700" height="580" rx="26" fill="#E6E3E1" stroke="{CONTOUR}" stroke-width="3" stroke-dasharray="12 8"/>')
    for x, y, w, h, n in bat:
        s.add(forme(x, y, w, h, "sable", 12, 6), texte(x + w / 2, y + h / 2 + 6, n, 16, 800))
    route = [(740, 590), (740, 270), (420, 270), (420, 50), (60, 50) if False else (60, 260), (60, 590), (740, 590)]
    route = [(735, 600), (735, 262), (400, 262), (400, 55), (65, 55), (65, 290), (330, 290), (330, 600), (735, 600)]
    s.add(trait(route, 4, False, NOIR, tirets=True))
    pts = [(735, 430), (570, 262), (400, 150), (230, 55), (65, 180), (200, 290), (330, 450), (530, 600)]
    for i, (x, y) in enumerate(pts):
        s.add(disque(x, y, 18, "bleu", 4), texte(x, y + 6, str(i + 1), 16, 800))
    s.add(disque(735, 600, 20, "sombre", 4), icone("personne", 735, 600, 0.62, CLAIR))
    xl = 800
    k = len(legende)
    hv = (H - 2 * MY - (k - 1) * 20 - 8) / k
    for i, it in enumerate(legende):
        s.add(carte(xl, MY + i * (hv + 20), W - MX - xl - 8, hv, _it(it, "role", "creme"), it["titre"],
                    _it(it, "texte", ()), _it(it, "icone"), t_max=17))
    return s


# ── Matrice ──────────────────────────────────────────────────────────────────
def matrice(lignes, colonnes, cellules, role_col="sable", role_lig="creme"):
    """cellules[i][j] : texte court ou '' ; ✓ pour une coche."""
    s = Svg()
    nl, nc = len(lignes), len(colonnes)
    wl = 300
    wc = (W - 2 * MX - wl - 8 - nc * 14) / nc
    ht = 84
    hl = (H - 2 * MY - ht - 14 - 8 - (nl - 1) * 14) / nl
    y0 = MY
    for j, c in enumerate(colonnes):
        x = MX + wl + 14 + j * (wc + 14)
        s.add(carte(x, y0, wc, ht, _it(c, "role", role_col), _it(c, "titre", c if isinstance(c, str) else None),
                    _it(c, "texte", ()), t_max=16, t_min=10, pad=10, ombre=6))
    for i, l in enumerate(lignes):
        y = y0 + ht + 14 + i * (hl + 14)
        s.add(carte(MX, y, wl, hl, _it(l, "role", role_lig), _it(l, "titre", l if isinstance(l, str) else None),
                    _it(l, "texte", ()), t_max=16, align="start", pad=16, ombre=6))
        for j in range(nc):
            x = MX + wl + 14 + j * (wc + 14)
            v = cellules[i][j]
            s.add(f'<rect x="{x}" y="{y}" width="{wc}" height="{hl}" rx="14" fill="#E6E3E1" stroke="#BDB6B2" stroke-width="2"/>')
            if v == "✓":
                s.add(coche(x + wc / 2 - 13, y + hl / 2 - 13, 26))
            elif v:
                s.add(bloc_texte(x + 10, y + 6, wc - 20, hl - 12, None, [v], t_max=15, b_ratio=1, b_min=10.5))
    return s


# ── Camembert / anneau ───────────────────────────────────────────────────────
def camembert(parts, centre=None, anneau=True, cx=340, r=230, decimales=0, total_affiche=None):
    """parts : dicts label, valeur, role, detail."""
    s = Svg()
    cy = H / 2
    tot = sum(p["valeur"] for p in parts)
    ri = r * 0.52 if anneau else 0
    a = 0
    arcs = []
    for p in parts:
        da = 360 * p["valeur"] / tot
        arcs.append((a, a + da, p))
        a += da
    for partie in ("ombre", "fond"):
        for a0, a1, p in arcs:
            fond, ombre = ROLES[p.get("role", "sable")]
            s.add(secteur(cx, cy, ri, r, a0, a1 - 0.001 if a1 - a0 >= 359.99 else a1, fond, ombre, partie=partie))
    for a0, a1, p in arcs:
        pct = 100 * p["valeur"] / tot
        if a1 - a0 > 20:
            tx, ty = pt(cx, cy, (ri + r) / 2 if anneau else r * 0.62, (a0 + a1) / 2)
            s.add(texte(tx, ty + 7, f"{pct:.{decimales}f} %".replace(".", ","), 19, 800, couleur_texte(p.get("role", "sable"))))
    if anneau and centre:
        t, sous = centre if isinstance(centre, (tuple, list)) else (centre, None)
        s.add(bloc_texte(cx - ri * 0.78, cy - ri * 0.6, ri * 1.56, ri * 1.2, t, [sous] if sous else (), t_max=34,
                         b_ratio=0.45, maj=False))
    x0 = cx + r + 80
    k = len(parts)
    hv = min(110, (H - 2 * MY - (k - 1) * 16 - 8) / k)
    y0 = (H - (k * hv + (k - 1) * 16)) / 2
    for i, p in enumerate(parts):
        y = y0 + i * (hv + 16)
        wv = W - MX - x0 - 8
        s.add(forme(x0, y, wv, hv, p.get("role", "sable"), 18, 6))
        val = f"{p['valeur']:g}".replace(".", ",")
        tv = min(34, hv * 0.42)
        s.add(texte(x0 + 22, y + hv / 2 + tv * 0.35, val, tv, 800, couleur_texte(p.get("role", "sable")), "start"))
        wv_val = largeur(val, tv, 800) + 40
        s.add(bloc_texte(x0 + wv_val, y + 8, wv - wv_val - 18, hv - 16, p["label"], [p["detail"]] if p.get("detail") else (),
                         align="start", t_max=17, t_min=10, couleur=couleur_texte(p.get("role", "sable"))))
    return s


# ── Barres ───────────────────────────────────────────────────────────────────
def barres(series, unite="", maxi=None, largeur_label=300, legende=None, note=None, detail=False):
    """series : dicts label, valeurs [(v, role)] (empilées) ou valeur + role."""
    s = Svg()
    n = len(series)
    h_leg = 46 if legende else 0
    x0 = MX + largeur_label + 20
    x1 = W - MX - (200 if detail else 110)
    hb = min(84 if n <= 4 else 62, (H - 2 * MY - h_leg - (n - 1) * 24 - 8) / n)
    tot_h = n * hb + (n - 1) * 24
    y0 = (H - tot_h - h_leg) / 2
    vals = [sum(v for v, _ in (se.get("valeurs") or [(se["valeur"], se.get("role", "bleu"))])) for se in series]
    maxi = maxi or max(vals)
    for i, se in enumerate(series):
        y = y0 + i * (hb + 24)
        s.add(bloc_texte(MX, y, largeur_label, hb, None, [se["label"]], align="end", t_max=21, b_ratio=1, b_min=11))
        segs = se.get("valeurs") or [(se["valeur"], se.get("role", "bleu"))]
        xx = x0
        for v, role in segs:
            wv = max((x1 - x0) * v / maxi, 12 if len(segs) == 1 else 0)
            if wv > 0.5:
                s.add(forme(xx, y, wv, hb, role, min(12, hb / 2, wv / 2), 5 if wv > 20 else 3, 2.5))
                if wv > 44 and len(segs) > 1:
                    s.add(texte(xx + wv / 2, y + hb / 2 + 6, f"{v:g}".replace(".", ","), 15, 800, couleur_texte(role)))
            xx += wv
        lib = " + ".join(f"{v:g}" for v, _ in segs) if (detail and len(segs) > 1) else f"{vals[i]:g}"
        s.add(texte(xx + 16, y + hb / 2 + 9, lib.replace(".", ",") + (f" {unite}" if unite else ""), 24, 800,
                    TEXTE, "start"))
    if note:
        s.add(texte(W - MX - 8, H - MY - 12, note, 14, 500, "#5B5451", "end"))
    if legende:
        xl = x0
        for lab, role in legende:
            fond, ombre = ROLES[role]
            s.add(forme(xl, H - MY - 30, 24, 24, role, 6, 3, 2),
                  texte(xl + 34, H - MY - 12, lab, 15, 600, TEXTE, "start"))
            xl += 34 + largeur(lab, 15, 600) + 34
    return s


# ── Carte réelle (contours des régions / départements) ──────────────────────
import json as _json, os as _os
_GEO = {}


def _geo(nom):
    if nom not in _GEO:
        _GEO[nom] = _json.load(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "geo", nom + ".geojson")))
    return _GEO[nom]


def carte_reelle(points, bbox, fond="regions", en_avant=(), noms_zones=None, zone=(40, 30, 1160, 630), hub=None,
                 liens=False):
    """bbox = (lon_min, lat_min, lon_max, lat_max). points : nom, lat, lon, detail, role, cote (d/g/h/b), dx, dy."""
    s = Svg()
    lo0, la0, lo1, la1 = bbox
    k = math.cos(math.radians((la0 + la1) / 2))
    x0, y0, x1, y1 = zone
    sc = min((x1 - x0) / ((lo1 - lo0) * k), (y1 - y0) / (la1 - la0))
    cxo = (x0 + x1) / 2 - ((lo0 + lo1) / 2) * k * sc
    cyo = (y0 + y1) / 2 + ((la0 + la1) / 2) * sc
    proj = lambda lon, lat: (cxo + lon * k * sc, cyo - lat * sc)

    def chemin(geom, dx=0, dy=0):
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        d = ""
        for poly in polys:
            for anneau in poly:
                pts = [proj(lon, lat) for lon, lat in anneau]
                d += "M" + " L".join(f"{x + dx:.1f},{y + dy:.1f}" for x, y in pts) + " Z "
        return d
    s.add(f'<defs><clipPath id="cadre"><rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" rx="26"/></clipPath></defs>')
    s.add(f'<rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" rx="22" fill="#D6E3EA" filter="url(#od)"/>')
    g = ['<g clip-path="url(#cadre)">']
    feats = _geo(fond)["features"]
    for f in feats:
        nom = f["properties"]["nom"]
        if nom in en_avant:
            continue
        g.append(f'<path d="{chemin(f["geometry"])}" fill="#EDEAE6" stroke="#B9B2AE" stroke-width="1.5" stroke-linejoin="round"/>')
    for f in feats:
        if f["properties"]["nom"] in en_avant:
            pass
    for f in feats:
        if f["properties"]["nom"] in en_avant:
            g.append(f'<path d="{chemin(f["geometry"])}" fill="{ROLES["sable"][0]}" stroke="{SURF}" stroke-width="2" stroke-linejoin="round"/>')
    for nom, (lon, lat) in (noms_zones or {}).items():
        x, y = proj(lon, lat)
        g.append(texte(x, y, nom.upper(), 17, 800, "#8A817C", "middle", ' letter-spacing="3"'))
    if hub and liens:
        hp = next(p for p in points if p["nom"] == hub)
        hx, hy = proj(hp["lon"], hp["lat"])
        for p in points:
            if p["nom"] != hub:
                g.append(trait([(hx, hy), proj(p["lon"], p["lat"])], 2.5, False, CONTOUR, tirets=True))
    g.append("</g>")
    s.add("\n".join(g))
    for p in points:
        x, y = proj(p["lon"], p["lat"])
        est_hub = p["nom"] == hub
        r = 18 if est_hub else 10
        lab, det = p.get("label", p["nom"]), p.get("detail")
        wl = max(largeur(lab, 16, 800), largeur(det, 13, 400) if det else 0) + 28
        hl = 56 if det else 36
        cote = p.get("cote", "d")
        lx, ly = {"d": (x + r + 12, y - hl / 2), "g": (x - r - 12 - wl, y - hl / 2),
                  "h": (x - wl / 2, y - r - 12 - hl), "b": (x - wl / 2, y + r + 12)}[cote]
        lx += p.get("dx", 0)
        ly += p.get("dy", 0)
        if p.get("dx") or p.get("dy"):
            ax = min(max(x, lx), lx + wl)
            ay = min(max(y, ly), ly + hl)
            s.add(trait([(x, y), (ax, ay)], 2.5, False, CONTOUR))
        role = "or" if est_hub else p.get("role", "creme")
        s.add(forme(lx, ly, wl, hl, role, 12, 5, 2.5))
        s.add(texte(lx + 14, ly + 23, lab, 16, 800, TEXTE, "start"))
        if det:
            s.add(texte(lx + 14, ly + 44, det, 13, 400, TEXTE, "start"))
        if est_hub:
            s.add(disque(x, y, r, "or", 4), icone("batiment", x, y, 0.56))
        else:
            s.add(disque(x, y, r, p.get("role_point", "bleu"), 3))
    return s
