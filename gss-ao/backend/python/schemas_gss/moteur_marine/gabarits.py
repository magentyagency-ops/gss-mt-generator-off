"""Gabarits des schémas GSS au format PAGE (A4 portrait, toile 1000 × 1270) — style « Marine & signal », v3.

Copie propre au style marine (styles/marine/moteur) : mêmes noms, mêmes signatures et mêmes paramètres que le
moteur du dépôt ; chaque spécification de la bibliothèque (specs.json) se redessine telle quelle. Les paramètres
qui ne portaient que la mise en page paysage sont acceptés et ignorés.

Version 3 (critique indépendante du 1er octobre 2026) :
  · une forme qui porte une RELATION : étoile → sujet au centre de ses composantes (hub à centre fort, filets
    neutres) ; P26 → convergence (contraintes → démarche → actions) ; flux à décision → fourche symétrique, chaque
    étiquette posée sur sa branche ; organigramme en colonnes ; process du bloc 1 en miroir « vous → nous →
    résultat » ; schéma 24/7 à anneau réduit et chiffres clés ;
  · ÉCHELLE COMMUNE : tailles du palier typographique (standard, sinon dense) ; la mise en page s'adapte
    (hauteur des cartes ajustée à leur texte, place gagnée → pictogramme plus grand, air réparti) ;
  · le FIL marine numéroté est réservé aux séquences ; les ensembles sont rattachés par un filet gris neutre ;
  · le point d'arrivée d'un process (rôle « issue ») est un panneau plein ;
  · aucun texte ajouté, retiré ou modifié par rapport au moteur d'origine (contrôle automatique).
"""
import json as _json
import math
import os as _os

from .pictos import choisir as _choisir_picto

from .gss_lib import (Svg, T, P, Deborde, carte, besoin, bandeau, bloc_texte, preparer, dessiner, texte, texte_seul,
                     largeur, couper, couper_equilibre, insec, rect, chemin_arrondi, plaque, glyphe, numero, puce, coche,
                     trait, fleche, fil, lien, noeud, chevron_bas, etiquette, etiquette_dim, pt, secteur, arc, disque,
                     zone, point, decor, inscrire_trait, clamp, nouveau_bloc, _kw, esc, t_min_, n_lt_de, disque_sujet,
                     chiffre_cle, preparer_cle, dessiner_cle, typo)

_zone_cadre = zone        # (le paramètre « zone » de carte_reelle masque ce nom)
MX, MY = 2, 4            # marges de la toile : le schéma est aligné sur la colonne de texte de la page
ICI = _os.path.dirname(_os.path.abspath(__file__))
MOTEUR = _os.path.dirname(ICI)           # python/schemas_gss : polices et fonds de carte du dépôt
REMPLI = 0.92            # part de la hauteur de toile visée au plus par la composition

# Chiffres clés composés dans le fil du texte d'une carte (libellé de la carte → partie du texte)
CLES = {"Flotte électrique": "100 %"}


def _it(d, k, defaut=None):
    return d.get(k, defaut) if isinstance(d, dict) else defaut


def _toile():
    s = Svg()
    return s, s.W, s.H


def _place(H):
    return H - 2 * MY


def _y0(place, tot, y0=MY):
    """Centrage optique (légèrement au-dessus du centre géométrique)."""
    return y0 + max(0, place - tot) * 0.46


def _et():
    """Page remplie (décision D7, dessin.py) : composition étirée en cours (cartes, air, pictogrammes ; jamais la
    taille du texte). Faux pour le rendu de la planche validée."""
    return bool(T().etirer)


def _rempli():
    """Part de la place visée par la composition : celle de la planche, ou davantage quand elle est étirée."""
    return max(REMPLI, T().etirer + 0.05) if _et() else REMPLI


def _repartir(hs, gap, place, gap_max=None, cible=REMPLI, k_max=1.10):
    """Air : les écarts grandissent (jusqu'à gap_max), puis les rangées (jusqu'à k_max) ; renvoie (hs, gap).
    Composition étirée (page remplie) : les rangées grandissent jusqu'à la part visée."""
    if _et():
        cible, k_max = max(cible, _rempli()), 99.0
    n = len(hs)
    tot = sum(hs) + (n - 1) * gap
    gap_max = gap_max or gap * 2.4
    if n > 1 and tot < cible * place:
        gap = min(gap_max, (cible * place - sum(hs)) / (n - 1))
    tot = sum(hs) + (n - 1) * gap
    if tot < cible * place:
        k = min(k_max, (cible * place - (n - 1) * gap) / sum(hs))
        hs = [h * k for h in hs]
    return hs, gap


def _carte_dict(it, w, orient, role_def="creme", **extra):
    d = {"w": w, "role": _it(it, "role", role_def), "titre": _it(it, "titre"), "corps": _it(it, "texte", ()),
         "icone": _it(it, "icone"), "num": _it(it, "num"), "puces": _it(it, "puces", False), "orient": orient}
    cle = CLES.get(_it(it, "titre") or "")
    if cle and cle in (_it(it, "texte") or ""):
        d["cle"] = cle
    if not d["icone"] and d["titre"]:
        ic = _choisir_picto(None, d["titre"])          # pictogramme ajouté d'après le libellé (aucun mot ajouté)
        if ic:
            d["icone"] = ic
    d.update(extra)
    return d


def _role_eff(role):
    """Rôle effectivement dessiné (correspondance du schéma en cours)."""
    return T().corresp.get(role, role)


# ── Grille de cartes ─────────────────────────────────────────────────────────
def grille(items, cols=None, role="creme", hauteur_max=250, t_max=22):
    """Cartes à pictogramme et gros titre (le modèle de la page 27). 1 à 3 cartes : une colonne de cartes larges
    (colonne du pictogramme à gauche) ; 4 à 8 : deux colonnes ; 9 et plus : trois. Cartes sans texte : tuiles
    (plaque et titre centrés), deux colonnes jusqu'à 4, trois au-delà. Même recette pour toutes les cartes ; la
    dernière carte seule d'une rangée est centrée à la même largeur. Hauteur ajustée au texte ; la place gagnée
    agrandit les pictogrammes."""
    s, W, H = _toile()
    pal = P()
    n = len(items)
    seuls = all(not _it(it, "texte") for it in items)
    if seuls:
        ncol = 2 if n <= 4 else 3
    else:
        ncol = 1 if n <= 3 else (2 if n <= 8 else 3)
    orient = "h" if (ncol == 1 and not seuls) else "v"
    gx = 28
    gy0 = 28
    wc = W - 2 * MX
    cw = (wc - (ncol - 1) * gx) / ncol
    rows = math.ceil(n / ncol)
    place = _place(H)

    def specs(k):
        out = []
        for i, it in enumerate(items):
            r, c = divmod(i, ncol)
            dans = min(ncol, n - r * ncol)
            x0 = MX + (wc - (dans * cw + (dans - 1) * gx)) / 2
            d = _carte_dict(it, cw, orient, role, x=x0 + c * (cw + gx), r=r, centre=seuls)
            if orient == "v":
                d["s_plaque"] = pal["plaque"] * k
            else:
                d["s_col"] = pal["plaque"] * 1.45 * k
            out.append(d)
        return out

    choix = None
    for k in (1.0, 1.15, 1.3, 1.45, 1.6, 1.8, 2.0, 2.2):
        cs = specs(k)
        h_r = [max(besoin(c) for c in cs if c["r"] == r) for r in range(rows)]
        tot = sum(h_r) + (rows - 1) * gy0 * 1.6
        if k == 1.0 and sum(h_r) + (rows - 1) * gy0 > place:
            raise Deborde(f"grille : {tot:.0f} > {place:.0f}")
        if tot > place * (0.86 if not _et() else 0.90) and choix is not None:
            break
        choix = (cs, h_r)
    cs, h_r = choix
    h_nat = list(h_r)
    h_r, gy = _repartir(h_r, gy0, place, gap_max=gy0 * 3, k_max=1.12)
    tot = sum(h_r) + (rows - 1) * gy
    y = _y0(place, tot)
    for r in range(rows):
        for c in cs:
            if c["r"] == r:
                s.add(carte(c["x"], y, c["w"], h_r[r], decal=(h_r[r] - h_nat[r]) / 2 if _et() else 0, **_kw(c)))
        y += h_r[r] + gy
    return s


# ── Étoile → hub : le sujet au centre, ses composantes autour ────────────────
def _disposition_hub(n):
    return {1: (1, 0, 0), 2: (1, 0, 1), 3: (1, 0, 2), 4: (2, 0, 2), 5: (2, 0, 3), 6: (2, 2, 2), 7: (2, 2, 3),
            8: (3, 2, 3)}.get(n, (3, 2, n - 5))


def etoile(centre, branches, role_centre="sombre", r=118, larg=350):
    """Le sujet dans un disque marine au centre de la page ; ses composantes en cartes tout autour (rangée du
    haut, côtés, rangée du bas), rattachées au disque par un filet gris neutre : un ensemble, sans ordre imposé."""
    s, W, H = _toile()
    pal = P()
    th = T()
    titre, sous = centre if isinstance(centre, (tuple, list)) else (centre, None)
    n = len(branches)
    a, cotes, b = _disposition_hub(n)
    wc = W - 2 * MX
    place = _place(H)
    gx = 26
    rc = disque_sujet(0, 0, titre, [sous] if sous else (), "or", mesure=True)
    gs = 40                                   # air entre le disque et une carte de côté
    if cotes:
        wside = (wc - 2 * rc - 2 * gs) / 2
        if wside < 250:
            rc2 = (wc - 2 * gs - 2 * 250) / 2
            if rc2 >= 150 and disque_sujet(0, 0, titre, [sous] if sous else (), "or", r_max=rc2, mesure=True) <= rc2:
                rc = disque_sujet(0, 0, titre, [sous] if sous else (), "or", r_max=rc2, mesure=True)
                wside = (wc - 2 * rc - 2 * gs) / 2
            else:                              # pas assez de place sur les côtés : rangées du haut et du bas
                a, cotes, b = (math.ceil(n / 2), 0, n // 2)
                wside = 0
    seuls = all(not _it(br, "texte") for br in branches)

    def rangee(k_, items, y_tag):
        if not k_:
            return []
        w_ = (wc - (k_ - 1) * gx) / k_
        w_ = min(w_, 620)
        x0 = MX + (wc - (k_ * w_ + (k_ - 1) * gx)) / 2
        return [_carte_dict(it, w_, "v", "creme", x=x0 + i * (w_ + gx), pos=y_tag, centre=seuls)
                for i, it in enumerate(items)]
    cs = rangee(a, branches[:a], "T")
    if cotes:
        cs += [_carte_dict(branches[a], wside, "v", "creme", x=MX, pos="S", centre=seuls),
               _carte_dict(branches[a + 1], wside, "v", "creme", x=W - MX - wside, pos="S", centre=seuls)]
    cs += rangee(b, branches[a + cotes:], "B")

    def mesures(k):
        for c in cs:
            c["s_plaque"] = pal["plaque"] * k
        hT = max([besoin(c) for c in cs if c["pos"] == "T"] or [0])
        hS = max([besoin(c) for c in cs if c["pos"] == "S"] or [0])
        hB = max([besoin(c) for c in cs if c["pos"] == "B"] or [0])
        return hT, hS, hB
    gv0 = 54
    choix = None
    for k in ((1.0, 1.15, 1.3) if not _et() else (1.0, 1.15, 1.3, 1.45, 1.6)):
        hT, hS, hB = mesures(k)
        hM = max(2 * rc, hS)
        tot = hT + hM + hB + gv0 * ((1 if hT else 0) + (1 if hB else 0))
        if k == 1.0 and tot > place:
            raise Deborde(f"étoile : {tot:.0f} > {place:.0f}")
        if tot > (0.84 if not _et() else 0.88) * place and choix is not None:
            break
        choix = (k, hT, hS, hB, hM)
    k, hT, hS, hB, hM = choix
    mesures(k)
    if not cotes:
        libre = _rempli() * place - (hT + hM + hB + gv0 * 2.2 * ((1 if hT else 0) + (1 if hB else 0)))
        if libre > 0:
            rc = min(235, rc + libre / 2)
            hM = max(2 * rc, hS)
    nrang = (1 if hT else 0) + (1 if hB else 0)
    tot0 = hT + hM + hB
    gv = gv0
    if nrang and tot0 + nrang * gv < _rempli() * place:
        gv = min(gv0 * (2.4 if not _et() else 3.4), (_rempli() * place - tot0) / nrang)
    hT0, hB0 = hT, hB
    if _et() and nrang and tot0 + nrang * gv < _rempli() * place:
        # page remplie : les rangées du haut et du bas grandissent (contenu centré)
        extra = (_rempli() * place - tot0 - nrang * gv) / nrang
        hT, hB = (hT + extra if hT else 0), (hB + extra if hB else 0)
        tot0 = hT + hM + hB
    tot = tot0 + nrang * gv
    y = _y0(place, tot)
    yT = y
    yM = y + (hT + gv if hT else 0)
    cx, cy = W / 2, yM + hM / 2
    yB = yM + hM + gv
    for c in cs:
        c["y"] = {"T": yT, "S": cy - hS / 2, "B": yB}[c["pos"]]
        c["h"] = {"T": hT, "S": hS, "B": hB}[c["pos"]]
    # filets de rattachement (neutres) : du bord du disque au bord de chaque carte
    for c in cs:
        if c["pos"] == "S":
            ax = c["x"] + c["w"] if c["x"] < cx else c["x"]
            ay = cy
        else:
            ax = c["x"] + c["w"] / 2
            ay = c["y"] + c["h"] if c["pos"] == "T" else c["y"]
        ang = math.atan2(ay - cy, ax - cx)
        x0_, y0_ = cx + (rc + 4) * math.cos(ang), cy + (rc + 4) * math.sin(ang)
        d = math.hypot(ax - x0_, ay - y0_)
        if d > 8:
            s.add(lien([(x0_, y0_), (ax - 6 * math.cos(ang), ay - 6 * math.sin(ang))], ep=4))
    s.add(disque_sujet(cx, cy, titre, [sous] if sous else (), "or", r_min=rc, r_max=rc + 1))
    for c in cs:
        nat = {"T": hT0, "S": hS, "B": hB0}[c["pos"]]
        s.add(carte(c["x"], c["y"], c["w"], c["h"], decal=(c["h"] - nat) / 2 if _et() else 0, **_kw(c)))
    return s


# ── P26 : convergence (contraintes → démarche → actions) ─────────────────────
def convergence(centre, branches, role_centre="or", arrivee=0, **_ignore):
    """Les contraintes opérationnelles en cartes neutres, en haut ; elles convergent (entonnoir) vers le panneau
    marine de la démarche ; une flèche conduit au point d'arrivée, panneau plein vert. Lecture : ces réalités,
    puis notre démarche, pour arriver à des actions au quotidien. Mêmes textes que l'étoile d'origine."""
    s, W, H = _toile()
    th = T()
    pal = P()
    titre, sous = centre if isinstance(centre, (tuple, list)) else (centre, None)
    arr = branches[arrivee]
    src = [br for i, br in enumerate(branches) if i != arrivee]
    wc = W - 2 * MX
    place = _place(H)
    n = len(src)
    n1 = math.ceil(n / 2) if n > 3 else n
    n2 = n - n1
    gx = 34
    cw = (wc - (n1 - 1) * gx) / n1
    cs = []
    for i, br in enumerate(src[:n1]):
        cs.append(_carte_dict(br, cw, "v", "sable", x=MX + i * (cw + gx), r=0, neutre=True))
    if n2:
        # deuxième rangée en quinconce : chaque carte entre deux cartes du dessus
        for j, br in enumerate(src[n1:]):
            xm = MX + (j + 0.5) * (cw + gx) + cw / 2 + gx / 2 - cw / 2
            cs.append(_carte_dict(br, cw, "v", "sable", x=xm, r=1, neutre=True))
    h0 = max(besoin(c) for c in cs if c["r"] == 0)
    h1 = max([besoin(c) for c in cs if c["r"] == 1] or [0])
    w_p = min(wc, 760)
    hp = bandeau(0, 0, w_p, 999, "or", titre, [sous] if sous else (), None, mesure=True)
    ca = _carte_dict(arr, w_p, "h", "vert", plein=True)
    ca["role"] = "vert"          # le point d'arrivée est l'issue de la démarche
    ha = besoin(ca)
    g_r = 34                 # entre les deux rangées
    h_ent = 150              # entonnoir
    g_f = 64                 # flèche vers l'arrivée
    tot = h0 + (g_r + h1 if h1 else 0) + h_ent + hp + g_f + ha
    if tot > place:
        raise Deborde("convergence")
    k = min(1.25, (_rempli() * place - tot) / (h0 + h1 + ha) + 1) if tot < _rempli() * place else 1
    h0, h1 = h0 * min(k, 1.12), h1 * min(k, 1.12)
    reste = _rempli() * place - (h0 + (g_r + h1 if h1 else 0) + h_ent + hp + g_f + ha)
    if reste > 0:
        h_ent += min(reste * 0.5, 110)
        g_f += min(reste * 0.25, 50)
        g_r += min(reste * 0.25, 40)
    tot = h0 + (g_r + h1 if h1 else 0) + h_ent + hp + g_f + ha
    y = _y0(place, tot)
    y_r1 = y + h0 + g_r
    y_ent = y_r1 + (h1 if h1 else 0) if h1 else y + h0
    y_p = y_ent + h_ent
    xp = (W - w_p) / 2
    # entonnoir : du bas des cartes vers l'entrée du panneau
    ent_g, ent_d = MX + cw * 0.25, W - MX - cw * 0.25
    bouche = 150
    d = (f"M{ent_g:.1f},{y_ent:.1f} L{ent_d:.1f},{y_ent:.1f} L{W / 2 + bouche / 2:.1f},{y_p:.1f} "
         f"L{W / 2 - bouche / 2:.1f},{y_p:.1f} Z")
    s.add(f'<path d="{d}" fill="{th.role("or").clair}"/>')
    decor(ent_g, y_ent, ent_d, y_p, "entonnoir")
    # chaque carte descend dans l'entonnoir, puis converge vers l'entrée du panneau
    entree = (W / 2, y_p - 4)
    noeuds = []
    for c in cs:
        yb = (y if c["r"] == 0 else y_r1) + (h0 if c["r"] == 0 else h1)
        xm = c["x"] + c["w"] / 2
        s.add(fil([(xm, yb + 9), (xm, y_ent + 18), entree], pointe=False, ep=5))
        noeuds.append((xm, yb + 9))
    s.add(fleche(W / 2, y_p - 30, W / 2, y_p + 2, ep=6, couleur=th.c["structure"], taille=22))
    for c in cs:
        s.add(carte(c["x"], y if c["r"] == 0 else y_r1, c["w"], h0 if c["r"] == 0 else h1, **_kw(c)))
    for xm, yn in noeuds:
        s.add(disque(xm, yn, 7, th.c["structure"], type_="noeud"))
    s.add(bandeau(xp, y_p, w_p, hp, "or", titre, [sous] if sous else (), None))
    ya = y_p + hp + g_f
    s.add(fleche(W / 2, y_p + hp + 4, W / 2, ya - 4, ep=7, couleur=th.c["structure"], taille=26))
    s.add(carte(xp, ya, w_p, ha, **_kw(ca)))
    return s


# ── Procédure en flux : étapes numérotées sur le fil marine ──────────────────
def flux(etapes, labels=None, sorties=None, h=None, numeroter=True, cy=None, gap=None, issue=False):
    """Étapes de haut en bas, numérotées sur le fil marine (« puis, puis, pour arriver à ») ; le point d'arrivée
    (rôle issue, ou issue=True) est un panneau plein. labels {i: texte} : décision posée SUR le fil entre l'étape
    i et i+1 ; sorties {i: dict} : issue alternative de l'étape i, sur une branche à droite, étiquette posée sur la
    branche. Deux étapes et une sortie à la première : fourche symétrique."""
    labels, sorties = labels or {}, sorties or {}
    if len(etapes) == 2 and set(sorties) == {0} and set(labels) <= {0}:
        return _fourche(etapes, labels, sorties)
    s, W, H = _toile()
    th = T()
    pal = P()
    n = len(etapes)
    tn = pal["numero"]
    rn = tn * 1.05
    x_rail = MX + rn + 2
    x_m = x_rail + rn + 30
    a_so = bool(sorties)
    w_s = 330 if a_so else 0
    g_s = 70 if a_so else 0
    w_m = W - MX - x_m - w_s - g_s
    x_s = x_m + w_m + g_s
    place = _place(H)
    der = _role_eff(_it(etapes[-1], "role", "creme"))
    plein_fin = issue or der == "vert"

    def specs(k):
        out = []
        for i, e in enumerate(etapes):
            d = _carte_dict(e, w_m, "h", "creme", s_col=pal["plaque"] * 1.45 * k)
            if plein_fin and i == n - 1:
                d["plein"] = True
            out.append(d)
        return out
    gaps = []
    for i in range(n - 1):
        g = 50
        if i in labels:
            g = max(g, etiquette_dim(labels[i][0] if isinstance(labels[i], tuple) else labels[i])[2] + 40)
        if i in sorties:
            g = max(g, 110)
        gaps.append(g)
    so = []
    for i, v in sorted(sorties.items()):
        so.append(_carte_dict(v, w_s, "v", "vert", i=i))
    choix = None
    for k in (1.0, 1.15, 1.3, 1.5, 1.7, 1.9, 2.1):
        cs = specs(k)
        hs = [besoin(c) for c in cs]
        h_so = max([besoin(c) for c in so] or [0])
        hh = max(hs + [h_so])
        tot = n * hh + sum(gaps) * 1.8 + (h_so if any(i >= n - 1 for i in sorties) else 0)
        if k == 1.0 and n * hh + sum(gaps) > place:
            raise Deborde("flux")
        if tot > 0.88 * place and choix is not None:
            break
        choix = (cs, hh)
    cs, hh = choix
    hs = [hh] * n
    if n > 1:
        tot = n * hh + sum(gaps)
        if tot < _rempli() * place:
            extra = min((_rempli() * place - tot) / (n - 1), 130 if not _et() else 200)
            gaps = [g + extra for g in gaps]
        tot = n * hh + sum(gaps)
        if tot < _rempli() * place:
            hh = min(hh * 1.2 if not _et() else 9e9, (_rempli() * place - sum(gaps)) / n)
    tot = n * hh + sum(gaps)
    y0 = _y0(place, tot)
    ys = []
    yy = y0
    for i in range(n):
        ys.append(yy)
        yy += hh + (gaps[i] if i < n - 1 else 0)
    ep = th.fil["epaisseur"]
    if numeroter and n > 1:
        s.add(fil([(x_rail, ys[0] + hh / 2), (x_rail, ys[-1] + hh / 2)]))
        for i in range(n - 1):
            if i not in labels:
                s.add(chevron_bas(x_rail, ys[i + 1] + hh / 2 - rn - 16, 20))
    for i, c in enumerate(cs):
        s.add(carte(x_m, ys[i], w_m, hh, **_kw(c)))
        if numeroter:
            s.add(fil([(x_rail + rn - 2, ys[i] + hh / 2), (x_m, ys[i] + hh / 2)], ep=ep * 0.7))
            s.add(disque(x_rail, ys[i] + hh / 2, rn + 5, th.c["fond_schema"]))
            s.add(numero(x_rail, ys[i] + hh / 2, f"{i + 1:02d}"))
    for i, lab in labels.items():
        lt, lr = lab if isinstance(lab, tuple) else (lab, "rouge")
        _, lw, lh = etiquette_dim(lt)
        yl = ys[i] + hh + gaps[i] / 2
        s.add(etiquette(x_rail - 14 + lw / 2, yl, lt, lr, branche=[(x_rail, ys[i] + hh / 2), (x_rail, ys[i + 1] + hh / 2)]))
    for c in so:
        i = c["i"]
        r = min(i + 1, n - 1)
        ya = ys[i] + hh / 2
        xc = x_s + w_s / 2
        hso = besoin(c)
        y_so = ys[r] + (hh - hso) / 2 if r != i else ys[i] + hh + 60
        br = [(x_m + w_m, ya), (xc, ya), (xc, y_so - 2)]
        s.add(fil(br, pointe=True, ep=ep * 0.8, taille=20))
        lab = _it(sorties[i], "label")
        if lab:
            lt, lr = lab if isinstance(lab, tuple) else (lab, "rouge")
            _, lw, lh = etiquette_dim(lt, maxw=w_s + 20)
            yl = (ya + y_so) / 2
            s.add(etiquette(clamp(xc, x_s + lw / 2 - 30, W - MX - lw / 2), yl, lt, lr, maxw=w_s + 20, branche=br))
        s.add(carte(x_s, y_so, w_s, hso, **_kw(c)))
    return s


def _fourche(etapes, labels, sorties):
    """Deux scénarios symétriques : l'étape 01 en haut, au centre ; le fil descend jusqu'au point de décision 02,
    puis se divise en deux branches égales vers deux cartes de même largeur ; chaque étiquette est posée sur sa
    branche (« maintien souhaité » à gauche, « non souhaité » à droite)."""
    s, W, H = _toile()
    th = T()
    pal = P()
    wc = W - 2 * MX
    place = _place(H)
    e0, e1 = etapes
    so = sorties[0]
    w0 = min(wc, 640)
    gx = 40
    wb = (wc - gx) / 2
    c0 = _carte_dict(e0, w0, "h", "creme")
    cg = _carte_dict(e1, wb, "v", "vert")
    cd = _carte_dict(so, wb, "v", "creme")
    lg = labels.get(0)
    lg = lg if isinstance(lg, tuple) else (lg, "vert")
    ld = _it(so, "label")
    ld = ld if isinstance(ld, tuple) else (ld, "rouge")
    k_ok = 1.0
    for k in (1.0, 1.2, 1.4):
        c0["s_col"] = pal["plaque"] * 1.45 * k
        cg["s_plaque"] = cd["s_plaque"] = pal["plaque"] * k
        h0 = besoin(c0)
        hb = max(besoin(cg), besoin(cd))
        if h0 + hb + 420 > 0.86 * place and k > 1.0:
            break
        k_ok = k
    c0["s_col"] = pal["plaque"] * 1.45 * k_ok
    cg["s_plaque"] = cd["s_plaque"] = pal["plaque"] * k_ok
    h0 = besoin(c0)
    hb = max(besoin(cg), besoin(cd))
    rn = pal["numero"] * 1.05
    # branche sans condition (spécification sans libellé) : pas d'étiquette sur cette branche
    _, lwg, lhg = etiquette_dim(lg[0]) if lg[0] else (None, 0, 0)
    _, lwd, lhd = etiquette_dim(ld[0]) if ld[0] else (None, 0, 0)
    g1 = 80                      # du bas de l'étape 01 au point de décision 02
    g2 = max(lhg, lhd) + 120     # du point de décision aux cartes (les étiquettes sont sur cette partie)
    tot = rn * 2 + 16 + h0 + g1 + g2 + hb
    if tot > place:
        raise Deborde("fourche")
    reste = _rempli() * place - tot
    if reste > 0 and _et():
        # page remplie : les deux temps du fil s'allongent (plafonnés), puis les deux scénarios grandissent
        g1 += min(reste * 0.3, 160)
        g2 += min(reste * 0.3, 200)
        hb += max(0.0, _rempli() * place - (rn * 2 + 16 + h0 + g1 + g2 + hb))
    elif reste > 0:
        g1 += min(reste * 0.35, 90)
        g2 += min(reste * 0.35, 110)
        hb = hb * min(1.12, 1 + reste * 0.3 / hb)
    tot = rn * 2 + 16 + h0 + g1 + g2 + hb
    y = _y0(place, tot)
    cx = W / 2
    s.add(numero(cx, y + rn, "01"))
    y0c = y + 2 * rn + 16
    x0 = cx - w0 / 2
    yd = y0c + h0 + g1                      # point de décision
    xg, xd = MX + wb / 2, W - MX - wb / 2
    yb = yd + g2
    s.add(fil([(cx, y + 2 * rn), (cx, y0c)]))
    s.add(fil([(cx, y0c + h0), (cx, yd - rn - 4)], pointe=True, taille=20))
    br_g = [(cx - rn, yd), (xg, yd), (xg, yb - 2)]
    br_d = [(cx + rn, yd), (xd, yd), (xd, yb - 2)]
    s.add(fil(br_g, pointe=True, taille=20))
    s.add(fil(br_d, pointe=True, taille=20))
    s.add(disque(cx, yd, rn + 6, th.c["fond_schema"]))
    s.add(numero(cx, yd, "02"))
    ylab = yd + (yb - yd) / 2
    if lg[0]:
        s.add(etiquette(xg, ylab, lg[0], lg[1], branche=br_g))
    if ld[0]:
        s.add(etiquette(xd, ylab, ld[0], ld[1], branche=br_d))
    s.add(carte(x0, y0c, w0, h0, **_kw(c0)))
    hn = max(besoin(cg), besoin(cd))
    s.add(carte(MX, yb, wb, hb, decal=(hb - hn) / 2 if _et() else 0, **_kw(cg)))
    s.add(carte(W - MX - wb, yb, wb, hb, decal=(hb - hn) / 2 if _et() else 0, **_kw(cd)))
    return s


# ── Étapes en chevrons ───────────────────────────────────────────────────────
def chevrons(etapes, h_chevron=120, h_corps=210):
    """Chaque étape : un chevron plein qui pointe vers l'étape suivante (numéro + titre en blanc), et son texte dans
    un panneau clair à droite, filet de la couleur du chevron. Lecture de haut en bas. Chevrons marine ; le
    déclencheur en rouge, l'issue en vert."""
    s, W, H = _toile()
    th = T()
    pal = P()
    n = len(etapes)
    wc = W - 2 * MX
    tp = pal["panneau"]
    tn = pal["numero"]
    mot_max = max(largeur(m, tp, 700, "titre") for e in etapes for m in insec(_it(e, "titre") or "").split(" ") if m)
    w_ch = clamp(mot_max + 90, 360, 440)
    g_x = 26
    w_b = wc - w_ch - g_x
    pp = 40                       # profondeur de la pointe
    gap = 12
    place = _place(H)
    pad_b = pal["pad"]

    def h_chev(e):
        P_ = preparer(_it(e, "titre"), (), w_ch - 80, tp, pal["texte"])
        if P_ is None:
            raise Deborde(f"chevron : {_it(e, 'titre')!r}")
        return P_["total"] + tn * 1.6 + 40 + pp, P_

    def h_txt(e):
        corps = _it(e, "texte", ())
        if not corps:
            return 0, None
        P_ = preparer(None, corps, w_b - 2 * pad_b - 10, pal["carte"], pal["texte"], puces=_it(e, "puces", False))
        if P_ is None:
            raise Deborde("chevron : texte")
        return P_["total"] + 2 * pad_b, P_
    mes = [(h_chev(e), h_txt(e)) for e in etapes]
    hh = max(max(a[0], b[0] + pp) for a, b in mes)
    tot = n * hh + (n - 1) * gap
    if tot > place:
        raise Deborde("chevrons")
    if tot < _rempli() * place:
        hh = min(hh * 1.9 if not _et() else 9e9, (_rempli() * place - (n - 1) * gap) / n)
    tot = n * hh + (n - 1) * gap
    y0 = _y0(place, tot)
    for i, (e, ((_, Pt), (_, Pc))) in enumerate(zip(etapes, mes)):
        R = th.role(_it(e, "role", "sable"))
        y = y0 + i * (hh + gap)
        x = MX
        haut = 0 if i == 0 else pp
        yt = y - (gap if i else 0)
        if i == 0:
            pts = [(x, y), (x + w_ch, y), (x + w_ch, y + hh - pp), (x + w_ch / 2, y + hh), (x, y + hh - pp)]
        else:
            pts = [(x, yt), (x + w_ch / 2, yt + haut), (x + w_ch, yt), (x + w_ch, y + hh - pp), (x + w_ch / 2, y + hh),
                   (x, y + hh - pp)]
        d = "M" + " L".join(f"{a:.1f},{c:.1f}" for a, c in pts) + " Z"
        s.add(f'<path d="{d}" fill="{R.fonce}"/>')
        zone(x, y + (haut if i else 0), w_ch, hh - pp - (haut if i else 0), True, "panneau")
        top = y + haut + 6
        bas = y + hh - pp - 4
        bloc_h = tn * 1.6 + Pt["total"]
        yy = top + (bas - top - bloc_h) / 2
        s.add(texte_seul(x + 40, yy + tn * 0.95, f"{i + 1:02d}", tn, 600, R.sur_fonce, "start", "numero", fond=R.fonce))
        s.add(dessiner(x + 40, yy + tn * 1.6, w_ch - 80, Pt["total"], Pt, "start", couleur_titre=R.sur_fonce,
                       fond=R.fonce))
        if Pc:
            hb_ = hh - pp - (haut if i else 0) - 8
            yb_ = y + (haut if i else 0) + 4
            xb = x + w_ch + g_x
            zone(xb, yb_, w_b, hb_, True, "carte")
            s.add(rect(xb, yb_, w_b, hb_, th.c["carte_fond"], th.carte["rayon"]))
            s.add(rect(xb, yb_, 8, hb_, R.fonce, 0))
            s.add(dessiner(xb + pad_b + 10, yb_, w_b - 2 * pad_b - 10, hb_, Pc, "start", th.c["encre"], v_align="middle",
                           puce_couleur=R.fonce, fond=th.c["carte_fond"]))
    return s


# ── Comparatif ───────────────────────────────────────────────────────────────
def _tete_colonne(x, y, w, h, role, titre, sous, icone, mesure=False, k_ic=1.0):
    """En-tête de colonne : panneau marine, pictogramme et titre blancs, sous-titre clair ; un filet de la couleur
    du rôle en pied quand le rôle est porteur de sens."""
    th = T()
    pal = P()
    R = th.role(role)
    Rs = th.role("or")
    rx = th.bandeau.get("rayon", 0)
    pad = pal["pad"]
    S = pal["plaque"] * 0.9 * k_ic if icone else 0
    P_ = preparer(titre, [sous] if sous else (), w - 2 * pad, pal["panneau"], pal["texte"], lignes_max_titre=3)
    if P_ is None:
        P_ = preparer(titre, [sous] if sous else (), w - 2 * pad, pal["carte"], pal["texte"], lignes_max_titre=3)
    if P_ is None:
        raise Deborde(f"en-tête : {titre!r}")
    marque = R.fonce not in (th.c["structure"], th.c["structure_2"], th.role("creme").fonce)
    besoin_ = pad + (S + pad * 0.45 if icone else 0) + P_["total"] + pad + (10 if marque else 0)
    if mesure:
        return besoin_
    zone(x, y, w, h, True, "panneau")
    o = [f'<path d="{chemin_arrondi(x, y, w, h, rx, rx, 0, 0)}" fill="{Rs.fonce}"/>']
    if marque:
        o.append(rect(x, y + h - 10, w, 10, R.fonce, 0))
    hc = h - (10 if marque else 0)
    yy = y + (hc - (besoin_ - (10 if marque else 0))) / 2 + pad
    if icone:
        o.append(glyphe(icone, x + w / 2, yy + S / 2, S, Rs.sur_fonce, libelle=titre))
        yy += S + pad * 0.45
    o.append(dessiner(x + pad, yy, w - 2 * pad, P_["total"], P_, "middle", th.c["clair_sur_structure"], Rs.sur_fonce,
                      fond=Rs.fonce))
    return "\n".join(o)


def comparatif(colonnes, vs=False, h_tete=104):
    """Colonnes face à face : en-tête marine (pictogramme et titre blancs), puis les points ; « OU » au point de
    bascule (disque marine)."""
    s, W, H = _toile()
    th = T()
    pal = P()
    n = len(colonnes)
    wc = W - 2 * MX
    gx = 96 if (vs and n == 2) else 26
    cw = (wc - (n - 1) * gx) / n
    place = _place(H)
    pad_c = pal["pad"]
    Ps = [preparer(None, _it(c, "points", ()), cw - 2 * pad_c, pal["carte"], pal["texte"], puces=True) for c in colonnes]
    if any(P_ is None for P_ in Ps):
        raise Deborde("comparatif : points trop longs")
    cont = max(P_["total"] for P_ in Ps) + 2 * pad_c
    k_ic = 1.0
    for k_ in (1.0, 1.3, 1.6, 1.9):
        ht_ = max(_tete_colonne(0, 0, cw, 999, _it(c, "role", "sable"), _it(c, "titre"), _it(c, "sous"),
                                _it(c, "icone"), mesure=True, k_ic=k_) for c in colonnes)
        if ht_ + cont * 1.4 > place * _rempli() and k_ > 1.0:
            break
        k_ic, ht = k_, ht_
    if ht + cont > place:
        raise Deborde("comparatif")
    # air : les points s'espacent, l'en-tête respire
    hc = max(cont, min(place * _rempli() - ht * 1.15, cont * 2.2 if not _et() else 9e9))
    ht = min(ht * 1.15, place * _rempli() - hc) if ht + hc < place * _rempli() else ht
    tot = ht + hc
    y0 = _y0(place, tot)
    fond_c = th.c["carte_fond"]
    for i, (c, P_) in enumerate(zip(colonnes, Ps)):
        x = MX + i * (cw + gx)
        role = _it(c, "role", "sable")
        R = th.role(role)
        s.add(_tete_colonne(x, y0, cw, ht, role, _it(c, "titre"), _it(c, "sous"), _it(c, "icone"), k_ic=k_ic))
        yb = y0 + ht
        zone(x, yb, cw, hc, True, "carte")
        s.add(f'<path d="{chemin_arrondi(x, yb, cw, hc, 0, 0, th.carte["rayon"], th.carte["rayon"])}" fill="{fond_c}"/>')
        # les points s'étalent dans la colonne : écart entre points augmenté
        k = len(P_["cl"])
        if k > 1:
            libre = hc - 2 * pad_c - P_["total"]
            P_ = dict(P_, gp=P_["gp"] + min(libre * 0.6 / (k - 1), pal["texte"] * (1.6 if not _et() else 4.0)))
            P_["total"] = sum(len(r) for r in P_["cl"]) * P_["hb"] + (k - 1) * P_["gp"]
        s.add(dessiner(x + pad_c, yb + pad_c, cw - 2 * pad_c, hc - 2 * pad_c, P_, "start", th.c["encre"],
                       v_align="top", puce_couleur=R.fonce if R.fonce != th.role("creme").fonce else th.c["structure"],
                       fond=fond_c))
    if vs and n == 2:
        cx = MX + cw + gx / 2
        cy = y0 + ht / 2
        r = 40
        s.add(disque(cx, cy, r + 6, th.c["fond_schema"]))
        b = nouveau_bloc()
        point(cx, cy, r, "ou", porteur=b)
        s.add(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r}" fill="{th.c["structure"]}"/>')
        s.add(texte(cx, cy + pal["carte"] * 0.36, "OU", pal["carte"], 700, "#FFFFFF", "middle", "chiffres", bloc=b,
                    fond=th.c["structure"]))
    return s


# ── Chiffres clés ────────────────────────────────────────────────────────────
def chiffres(tuiles, note=None, cols=None):
    """Chiffres clés : de 1 à 4, des bandeaux larges empilés (plaque, chiffre en orange « signal », libellé dans
    une colonne alignée) ; au-delà, une grille de deux colonnes. Quand le premier chiffre est le tout et les
    suivants ses parties (somme inférieure ou égale), les parties sont présentées en retrait sous le tout."""
    s, W, H = _toile()
    th = T()
    pal = P()
    n = len(tuiles)
    wc = W - 2 * MX
    place = _place(H)
    vals = [str(tu["valeur"]) for tu in tuiles]
    Pn = None
    h_note = 0
    if note:
        Pn = preparer(None, [note], wc - 40, pal["carte"], pal["texte"])
        if Pn is None:
            raise Deborde("note")
        h_note = Pn["total"] + 50

    def nombre(v):
        try:
            return float(v.replace(" ", "").replace(" ", "").replace(",", "."))
        except ValueError:
            return None
    nums = [nombre(v) for v in vals]
    parties = (n >= 3 and all(x is not None for x in nums) and nums[0] >= sum(nums[1:])
               and len({(tu["label"].split(" ")[0]) for tu in tuiles}) == 1)
    if n <= 4:
        ncol = 1
    else:
        ncol = 2
    gx, gy = 26, 26
    cw = (wc - (ncol - 1) * gx) / ncol
    S = pal["plaque"]
    pad = pal["pad"]
    retrait = 90 if parties else 0
    if ncol == 1:
        # taille commune : « chiffre » si tous les chiffres tiennent, sinon « chiffre moyen »
        for tv in (pal["chiffre"], pal["chiffre_moyen"]):
            wv = max(largeur(v, tv, 700, "chiffres") for v in vals)
            wl = cw - retrait - (S + 2 * pad) - wv - 40 - pad
            if wl >= 260:
                break
        else:
            raise Deborde("chiffres")
        Pl = [preparer(None, [tu["label"]], wl, pal["carte"], pal["texte"]) for tu in tuiles]
        if any(p is None for p in Pl):
            raise Deborde("chiffres : libellé")
        hs = [max(S + 2 * pad, tv * 0.98 + 2 * pad, p["total"] + 2 * pad) for p in Pl]
        h1 = max(hs)
        tot = n * h1 + (n - 1) * gy + h_note
        if tot > place:
            raise Deborde("chiffres")
        hl, g = _repartir([h1] * n, gy, place - h_note, gap_max=80, k_max=(2.3 if n <= 2 else 1.7))
        h1 = hl[0]
        tot = n * h1 + (n - 1) * g + h_note
        y = _y0(place, tot)
        fond = th.c["carte_fond"]
        xv = None
        for i, (tu, Pli) in enumerate(zip(tuiles, Pl)):
            x = MX + (retrait if (parties and i > 0) else 0)
            w = cw - (retrait if (parties and i > 0) else 0)
            role = _it(tu, "role", "creme")
            zone(x, y, w, h1, True, "carte")
            s.add(rect(x, y, w, h1, fond, th.carte["rayon"]))
            ws = S + 2 * pad
            R = th.role(role)
            ic = _it(tu, "icone")
            doublon = parties and i > 0 and sum(1 for t2 in tuiles[1:] if _it(t2, "icone") == ic) > 1
            if ic and not doublon:
                s.add(f'<path d="{chemin_arrondi(x, y, ws, h1, th.carte["rayon"], 0, 0, th.carte["rayon"])}" fill="{R.fonce}"/>')
                s.add(glyphe(ic, x + ws / 2, y + h1 / 2, min(ws * 0.62, h1 * 0.42), R.sur_fonce, libelle=tu["label"]))
            else:
                s.add(f'<path d="{chemin_arrondi(x, y, 10, h1, th.carte["rayon"], 0, 0, th.carte["rayon"])}" fill="{R.fonce}"/>')
            xv0 = MX + retrait + ws + pad            # colonne des chiffres alignée sur toutes les tuiles
            s.add(chiffre_cle(xv0 + wv, y + h1 / 2 + tv * 0.35, vals[i], tv, "end", fond=fond))
            xl = xv0 + wv + 40
            s.add(dessiner(xl, y, wl, h1, Pli, "start", th.c["encre_2"], v_align="middle", fond=fond))
            if parties and i > 0:
                yc = y + h1 / 2
                s.add(lien([(MX + retrait / 2, y - g - 2), (MX + retrait / 2, yc), (x - 4, yc)], ep=4,
                           couleur=th.c["filet_fort"]))
            y += h1 + g
        if note:
            s.add(dessiner(MX, y - g + 40, wc - 40, Pn["total"], Pn, "start", th.c["encre_3"]))
        return s
    # deux colonnes de tuiles verticales
    rows = math.ceil(n / ncol)
    tv = pal["chiffre"]
    if max(largeur(v, tv, 700, "chiffres") for v in vals) > cw - 2 * pad:
        tv = pal["chiffre_moyen"]
    Pl = [preparer(None, [tu["label"]], cw - 2 * pad, pal["carte"], pal["texte"]) for tu in tuiles]
    if any(p is None for p in Pl):
        raise Deborde("chiffres : libellé")
    h1 = max(pad + S + 20 + tv * 0.98 + 14 + p["total"] + pad for p in Pl)
    tot = rows * h1 + (rows - 1) * gy + h_note
    if tot > place:
        raise Deborde("chiffres")
    hl, g = _repartir([h1] * rows, gy, place - h_note, gap_max=60, k_max=1.2)
    h1 = hl[0]
    tot = rows * h1 + (rows - 1) * g + h_note
    y0 = _y0(place, tot)
    fond = th.c["carte_fond"]
    for i, (tu, Pli) in enumerate(zip(tuiles, Pl)):
        r, c = divmod(i, ncol)
        dans = min(ncol, n - r * ncol)
        x = MX + c * (cw + gx) if dans == ncol else (W - cw) / 2
        y = y0 + r * (h1 + g)
        zone(x, y, cw, h1, True, "carte")
        s.add(rect(x, y, cw, h1, fond, th.carte["rayon"]))
        yy = y + pad
        if _it(tu, "icone"):
            s.add(plaque(x + pad, yy, S, tu["icone"], _it(tu, "role", "creme"), libelle=tu["label"]))
        yy += S + 20
        s.add(chiffre_cle(x + pad, yy + tv * 0.80, vals[i], tv, "start", fond=fond))
        yy += tv * 0.98 + 14
        s.add(dessiner(x + pad, yy, cw - 2 * pad, Pli["total"], Pli, "start", th.c["encre_2"], fond=fond))
    if note:
        s.add(dessiner(MX, y0 + rows * h1 + (rows - 1) * g + 40, wc - 40, Pn["total"], Pn, "start", th.c["encre_3"]))
    return s


# ── Liste de contrôle ────────────────────────────────────────────────────────
def checklist(groupes, h_tete=96):
    """Un panneau marine d'en-tête par groupe (pictogramme et titre blancs), puis les points cochés, un par
    ligne, séparés par des filets."""
    s, W, H = _toile()
    th = T()
    pal = P()
    n = len(groupes)
    wc = W - 2 * MX
    place = _place(H)
    pad = pal["pad"]
    b = pal["texte"]
    lh = b * th.typo["interligne_texte"]
    n_items = sum(len(g["items"]) for g in groupes)
    k_g = 1.0 if n_items > 6 else (1.25 if n_items > 4 else (1.5 if n_items > 2 else 1.8))
    sc = pal["texte"] * 1.45 * k_g
    s_ic = 60 * k_g

    def mesures():
        out = []
        for g in groupes:
            ht = bandeau(0, 0, wc, 999, "or", _it(g, "titre"), [_it(g, "sous")] if _it(g, "sous") else (),
                         _it(g, "icone"), mesure=True, s_icone=s_ic) if _it(g, "titre") else 0
            lignes = []
            for it in g["items"]:
                r = couper(insec(it), b, th.typo["texte_graisse"], wc - 2 * pad - sc - 26)
                if r is None:
                    raise Deborde("liste")
                lignes.append(r)
            out.append((ht, lignes))
        return out
    m = mesures()

    def hauteur(gap_l, g_g):
        tot = 0
        for ht, lignes in m:
            tot += ht + sum(max(len(l) * lh, sc) + gap_l for l in lignes) + gap_l
        return tot + (n - 1) * g_g
    gap_l, g_g = b * 0.9, 40
    if hauteur(gap_l, g_g) > place:
        raise Deborde("liste")
    nl = sum(len(l) + 1 for _, l in m)
    reste = place * _rempli() - hauteur(gap_l, g_g)
    if reste > 0:
        gap_l = min(b * 3.0 if not _et() else 9e9, gap_l + reste * (0.7 if not _et() or n > 1 else 1.0) / max(nl, 1))
    reste = place * _rempli() - hauteur(gap_l, g_g)
    if reste > 0 and n > 1:
        g_g = min(g_g * 2.2 if not _et() else 9e9, g_g + reste / (n - 1))
    tot = hauteur(gap_l, g_g)
    y = _y0(place, tot)
    fond_c = th.c["carte_fond"]
    for g, (ht, lignes) in zip(groupes, m):
        if ht:
            s.add(bandeau(MX, y, wc, ht, "or", _it(g, "titre"), [_it(g, "sous")] if _it(g, "sous") else (),
                          _it(g, "icone"), align="start", s_icone=s_ic))
            y += ht
        hl = sum(max(len(l) * lh, sc) + gap_l for l in lignes) + gap_l
        zone(MX, y, wc, hl, True, "carte")
        s.add(f'<path d="{chemin_arrondi(MX, y, wc, hl, 0, 0, th.carte["rayon"], th.carte["rayon"])}" fill="{fond_c}"/>')
        yy = y + gap_l
        for k, l in enumerate(lignes):
            bh = max(len(l) * lh, sc)
            s.add(coche(MX + pad + sc / 2, yy + bh / 2, sc, "vert"))
            bb = nouveau_bloc()
            for j, li in enumerate(l):
                base = yy + (bh - len(l) * lh) / 2 + (lh - b) / 2 + b * 0.8 + j * lh
                s.add(texte(MX + pad + sc + 26, base, li, b, None, th.c["encre"], "start", bloc=bb, fond=fond_c))
            yy += bh + gap_l
            if k < len(lignes) - 1:
                s.add(rect(MX + pad + sc + 26, yy - gap_l / 2 - 0.6, wc - 2 * pad - sc - 26, 1.2, th.c["filet"], 0))
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
        simple = ImageFont.Layout.BASIC if hasattr(ImageFont, "Layout") else ImageFont.LAYOUT_BASIC
        _LEXEND[k] = ImageFont.truetype(_os.path.join(MOTEUR, "polices", f"Lexend-{fixe}.ttf"), max(1, round(taille * 4)),
                                        layout_engine=simple)
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
    """L'anneau au centre de la page, entouré d'un arc fléché continu ; chaque étape détaillée dans une carte
    posée contre SON quartier (coins de la page), avec la même pastille de numéro que l'anneau."""
    s, W, H = _toile()
    th = T()
    pal = P()
    n = len(secteurs)
    tous = _libelles_cycle(secteurs, ro, ri)
    place = _place(H)
    wc = W - 2 * MX
    pas = 360 / n
    g = 1.2
    # cartes : une par étape, aux coins (4), ou autour (3, 5, 6)
    gx = 30
    cw = (wc - gx) / 2
    cs = [_carte_dict(se, cw, "v", "sable", num=i + 1) for i, se in enumerate(secteurs)] if cartes else []
    for c in cs:
        c["icone"] = None
    hc = max([besoin(c) for c in cs] or [0])
    # anneau : le plus grand qui laisse la place aux cartes au-dessus et au-dessous
    n_haut = math.ceil(n / 2) if n != 3 else 1
    rangs = 2 if cs else 0
    R_dispo = (place - rangs * (hc + 40)) / 2 - 30
    R_o = clamp(R_dispo, 200, 300)
    R_i = R_o * 0.52
    R_f = R_o + 26
    if rangs and 2 * (R_f + 30) + rangs * (hc + 40) > place:
        raise Deborde("cycle")
    tot = 2 * (R_f + 30) + rangs * (hc + 40)
    y0 = _y0(place, tot)
    cy = y0 + (hc + 40 if cs else 0) + R_f + 30
    cx = W / 2
    fond = th.c["fond_schema"]
    for i, se in enumerate(secteurs):
        R = th.role(_it(se, "role", "sable"))
        s.add(secteur(cx, cy, R_i, R_o, i * pas + g, (i + 1) * pas - g, R.fonce))
    decor(cx - R_f, cy - R_f, cx + R_f, cy + R_f, "anneau")
    # arc fléché continu (marine), une pointe par quartier
    for i in range(n):
        a0 = i * pas + 8
        a1 = (i + 1) * pas - 8
        pts = [pt(cx, cy, R_f, a0 + (a1 - a0) * k / 24) for k in range(25)]
        s.add(trait(pts, 4, True, th.c["structure"], taille=16, type_="fil"))
    courts = [_it(se, "court", _it(se, "titre")).upper() for se in secteurs]
    tl_ = pal["etiquette"] + 4 if pal["etiquette"] + 4 in (pal["texte"],) else pal["texte"]
    for i, se in enumerate(secteurs):
        R = th.role(_it(se, "role", "sable"))
        a = (i + 0.5) * pas
        rm = (R_i + R_o) / 2
        tx, ty = pt(cx, cy, rm, a)
        if tous:
            l = couper(courts[i], tl_, 700, (R_o - R_i) * 1.6, "titre") or [courts[i]]
            bb = nouveau_bloc()
            hl = len(l) * tl_ * 1.16
            for j, ligne in enumerate(l):
                s.add(texte(tx, ty - hl / 2 + tl_ * 0.84 + j * tl_ * 1.16, ligne, tl_, 700, R.sur_fonce, "middle",
                            "titre", bloc=bb, fond=R.fonce, espacement=1.2))
        # pastille du numéro de l'anneau : sur le bord extérieur du quartier
        nx, ny = pt(cx, cy, R_o, (i + 0.5) * pas - pas * 0.32)
        s.add(disque(nx, ny, pal["numero"] * 1.05 + 5, fond))
        s.add(numero(nx, ny, str(i + 1)))
    tc, sous = centre if isinstance(centre, (tuple, list)) else (centre, None)
    rc = R_i - 18
    s.add(disque(cx, cy, rc, fond))
    # « Amélioration » et « continue » au même corps et à la même graisse
    P1 = preparer(tc, (), rc * 1.6, pal["carte"], pal["texte"])
    P2 = preparer(sous, (), rc * 1.6, pal["carte"], pal["texte"]) if sous else None
    if P1 is None or (sous and P2 is None):
        raise Deborde("cycle : centre")
    hcen = P1["total"] + (P2["total"] if P2 else 0)
    s.add(dessiner(cx - rc * 0.8, cy - hcen / 2, rc * 1.6, P1["total"], P1, "middle", fond=fond))
    if P2:
        s.add(dessiner(cx - rc * 0.8, cy - hcen / 2 + P1["total"], rc * 1.6, P2["total"], P2, "middle", fond=fond))
    if cs:
        # chaque carte contre son quartier : rangée du haut ou du bas selon l'angle, de gauche à droite
        haut, bas = [], []
        for i, c in enumerate(cs):
            a = (i + 0.5) * pas % 360
            (haut if (a < 90 or a > 270) else bas).append((math.sin(math.radians(a)), c))
        for rang, ycar in ((haut, y0), (bas, cy + R_f + 30 + 40)):
            rang.sort(key=lambda t: t[0])
            k_ = len(rang)
            if not k_:
                continue
            w_ = (wc - (k_ - 1) * gx) / k_ if k_ > 1 else cw
            x0_ = MX + (wc - (k_ * w_ + (k_ - 1) * gx)) / 2
            for j, (_, c) in enumerate(rang):
                c["x"], c["y"], c["w"] = x0_ + j * (w_ + gx), ycar, w_
        hc = max(besoin(c) for c in cs)
        for c in cs:
            s.add(carte(c["x"], c["y"], c["w"], hc, **_kw(c)))
    return s


# ── Pyramide ─────────────────────────────────────────────────────────────────
def _degrade(n):
    """Du marine (sommet) au bleu acier (base), sans gris."""
    a, b = (0x0B, 0x25, 0x45), (0x3B, 0x62, 0x86)
    out = []
    for i in range(n):
        k = i / max(n - 1, 1)
        out.append("#%02X%02X%02X" % tuple(round(a[j] + (b[j] - a[j]) * k) for j in range(3)))
    return out


def pyramide(niveaux, largeur_base=540, avec_cartes=True):
    """Une vraie pyramide, sommet en pointe : les niveaux du sommet à la base, du marine au bleu acier ; à droite,
    la définition de chaque niveau, reliée par un filet."""
    s, W, H = _toile()
    th = T()
    pal = P()
    n = len(niveaux)
    a_cartes = avec_cartes and any(_it(nv, "texte") for nv in niveaux)
    base = 540 if a_cartes else 820
    place = _place(H)
    xc = MX + base + 50
    wcar = W - MX - xc
    cs = [(i, _carte_dict({"titre": _it(nv, "titre"), "texte": _it(nv, "texte"), "role": "sable"}, wcar, "v", "sable"))
          for i, nv in enumerate(niveaux) if _it(nv, "texte")]
    hcar = max([besoin(c) for _, c in cs] or [0])
    gap = 8
    hh = max((place * _rempli() - (n - 1) * gap) / n, 0)
    poids = [1.45] + [1.0] * (n - 1)
    haut_p = min(place * _rempli(), base * 1.8) if a_cartes else min(place * _rempli(), base * 1.35)
    if _et():
        haut_p = place * _rempli()          # page remplie : la pyramide prend toute la hauteur visée
    hh_u = (haut_p - (n - 1) * gap) / sum(poids)
    hs_ = [hh_u * p_ for p_ in poids]
    if a_cartes and min(hs_) + gap < hcar:
        if sum(max(h_, hcar) for h_ in hs_) + (n - 1) * gap > place:
            raise Deborde("pyramide")
    tot = sum(hs_) + (n - 1) * gap
    if tot > place:
        raise Deborde("pyramide")
    y0 = _y0(place, tot)
    y1 = y0 + tot
    cx = MX + base / 2 if a_cartes else W / 2
    couleurs = _degrade(n)
    yas = [y0 + sum(hs_[:i]) + i * gap for i in range(n)]
    for i, nv in enumerate(niveaux):
        ya, yb = yas[i], yas[i] + hs_[i]
        hh = hs_[i]
        la = base * (ya - y0) / tot
        lb = base * (yb - y0) / tot
        if i == 0:
            d = f"M{cx:.1f},{ya:.1f} L{cx + lb / 2:.1f},{yb:.1f} L{cx - lb / 2:.1f},{yb:.1f} Z"
        else:
            d = (f"M{cx - la / 2:.1f},{ya:.1f} L{cx + la / 2:.1f},{ya:.1f} L{cx + lb / 2:.1f},{yb:.1f} "
                 f"L{cx - lb / 2:.1f},{yb:.1f} Z")
        s.add(f'<path d="{d}" fill="{couleurs[i]}"/>')
        decor(cx - lb / 2, ya, cx + lb / 2, yb, "niveau")
        court = _it(nv, "court", _it(nv, "titre"))
        # libellé dans la partie basse du niveau : largeur mesurée à la hauteur du HAUT du texte
        P_ = None
        for taille in (pal["carte"],):
            for frac in (0.80, 0.86, 0.92):
                ybas = ya + (yb - ya) * frac
                essai = preparer(court, (), lb, taille, pal["texte"])
                if essai is None:
                    continue
                yhaut = ybas - essai["total"]
                if yhaut < ya + 6:
                    continue
                l_haut = base * (yhaut - y0) / tot - 28
                if l_haut <= 0:
                    continue
                essai = preparer(court, (), l_haut, taille, pal["texte"])
                if essai is not None and ybas - essai["total"] >= ya + 6:
                    P_, yl, wa = essai, ybas - essai["total"], l_haut
                    break
            if P_:
                break
        if P_ is None:
            raise Deborde(f"pyramide : {court!r}")
        s.add(dessiner(cx - wa / 2, yl, wa, P_["total"], P_, "middle", couleur_titre="#FFFFFF", fond=couleurs[i]))
        if a_cartes and _it(nv, "texte"):
            c = dict(cs)[i]
            ym = yb - hh * 0.30
            hc = hcar
            yc = clamp(ym - hc / 2, ya - gap / 2, yb + gap / 2 - hc) if hc <= hh + gap else ym - hc / 2
            yc = clamp(yc, MY, H - MY - hc)         # la carte reste sur la toile (pyramide étirée sur toute la page)
            xa = cx + (la + (lb - la) * 0.70) / 2 + 10
            s.add(lien([(xa, ym), (xc - 4, ym)], ep=3, couleur=th.c["filet_fort"]))
            s.add(disque(xa, ym, 6, couleurs[i], type_="noeud"))
            s.add(carte(xc, yc, wcar, hc, **_kw(c)))
    return s


# ── Organigramme / arborescence ──────────────────────────────────────────────
def arbre(racine, enfants, h_racine=96, h_enfant=100, rx=8):
    """La racine en panneau marine en tête ; les branches en colonnes côte à côte (organigramme), reliées par un
    peigne neutre ; sous chaque branche, ses éléments empilés."""
    s, W, H = _toile()
    th = T()
    pal = P()
    n = len(enfants)
    wc = W - 2 * MX
    place = _place(H)
    hr = bandeau(0, 0, wc, 999, "or", _it(racine, "titre"), [_it(racine, "texte")] if _it(racine, "texte") else (),
                 _it(racine, "icone"), mesure=True)
    a_items = any(_it(en, "items") for en in enfants)
    gx = 26
    g_r = 90
    if not a_items and n == 4:
        return _arbre_arete(s, racine, enfants, hr)
    if not a_items:
        cw = (wc - (n - 1) * gx) / n
        tetes = [_carte_dict(en, cw, "v", "sable") for en in enfants]
        hh = 0
        for k in (1.0, 1.15, 1.3, 1.45, 1.6, 1.8, 2.0):
            for c in tetes:
                c["s_plaque"] = pal["plaque"] * k
            h1 = max(besoin(c) for c in tetes)
            if k == 1.0 and hr + g_r + h1 > place:
                raise Deborde("arbre")
            if hr + g_r * 1.8 + h1 > (0.86 if not _et() else 0.92) * place and hh:
                for c in tetes:
                    c["s_plaque"] = pal["plaque"] * k_ok
                break
            hh, k_ok = h1, k
        h1 = max(besoin(c) for c in tetes)
        h_nat = h1
        reste = place * _rempli() - (hr + g_r + h1)
        if reste > 0 and _et():
            # page remplie : le peigne s'allonge, puis les cartes grandissent (contenu centré)
            g_r += reste * 0.6
            h1 = h1 + max(0.0, place * _rempli() - (hr + g_r + h1))
        elif reste > 0:
            g_r += min(reste * 0.45, 150)
            h1 = h1 + min(reste * 0.3, h1 * 0.12)
        tot = hr + g_r + h1
        y = _y0(place, tot)
        s.add(bandeau(MX, y, wc, hr, "or", _it(racine, "titre"), [_it(racine, "texte")] if _it(racine, "texte") else (),
                      _it(racine, "icone")))
        ye = y + hr + g_r
        yb = y + hr + g_r * 0.5
        xs = [MX + i * (cw + gx) for i in range(n)]
        s.add(lien([(W / 2, y + hr), (W / 2, yb)], ep=4, couleur=th.c["structure"]))
        if n > 1:
            s.add(lien([(xs[0] + cw / 2, yb), (xs[-1] + cw / 2, yb)], ep=4, couleur=th.c["structure"]))
        for x in xs:
            s.add(lien([(x + cw / 2, yb), (x + cw / 2, ye - 2)], ep=4, couleur=th.c["structure"]))
        for x, c in zip(xs, tetes):
            s.add(carte(x, ye, cw, h1, decal=(h1 - h_nat) / 2 if _et() else 0, **_kw(c)))
        return s
    if n >= 4:
        return _arbre_rangees(s, racine, enfants, hr)
    # branches avec éléments : en-têtes de branche, puis éléments empilés
    cw = (wc - (n - 1) * gx) / n
    tetes = [_carte_dict(en, cw, "v", "sable") for en in enfants]
    ht = max(besoin(c) for c in tetes)
    max_items = max(len(_it(en, "items", ())) for en in enfants)
    g_i = 12
    ind = 24
    wi = cw - ind - 2 * 18
    Pis = []
    for en in enfants:
        lst = []
        for it in _it(en, "items", ()):
            tit, corps = (it, ()) if isinstance(it, str) else (_it(it, "titre"), _it(it, "texte", ()))
            P_ = preparer(None, [tit] + list(corps), wi, pal["carte"], pal["texte"])
            if P_ is None:
                raise Deborde("arbre : élément")
            lst.append(P_)
        Pis.append(lst)
    hi = max(P_["total"] for lst in Pis for P_ in lst) + 2 * 16
    tot = hr + g_r + ht + 24 + max_items * hi + (max_items - 1) * g_i
    if tot > place:
        raise Deborde("arbre")
    reste = place * _rempli() - tot
    if reste > 0:
        hi = min(hi * 1.45 if not _et() else 9e9, hi + reste * 0.8 / max_items)
        g_r += min(reste * 0.1, 30) if not _et() else reste * 0.2
    tot = hr + g_r + ht + 24 + max_items * hi + (max_items - 1) * g_i
    y = _y0(place, tot)
    s.add(bandeau(MX, y, wc, hr, "or", _it(racine, "titre"), [_it(racine, "texte")] if _it(racine, "texte") else (),
                  _it(racine, "icone")))
    ye = y + hr + g_r
    yb = y + hr + g_r * 0.5
    xs = [MX + i * (cw + gx) for i in range(n)]
    s.add(lien([(W / 2, y + hr), (W / 2, yb)], ep=4, couleur=th.c["structure"]))
    if n > 1:
        s.add(lien([(xs[0] + cw / 2, yb), (xs[-1] + cw / 2, yb)], ep=4, couleur=th.c["structure"]))
    for x in xs:
        s.add(lien([(x + cw / 2, yb), (x + cw / 2, ye - 2)], ep=4, couleur=th.c["structure"]))
    fond_c = th.c["carte_fond"]
    for x, c, en, lst in zip(xs, tetes, enfants, Pis):
        s.add(carte(x, ye, cw, ht, **_kw(c)))
        yi = ye + ht + 24
        xl = x + 12
        R = th.role(_it(en, "role", "sable"))
        if lst:
            s.add(lien([(xl, ye + ht), (xl, yi + (len(lst) - 1) * (hi + g_i) + hi / 2)], couleur=th.c["filet_fort"], ep=3))
        for j, P_ in enumerate(lst):
            yj = yi + j * (hi + g_i)
            s.add(lien([(xl, yj + hi / 2), (x + ind, yj + hi / 2)], couleur=th.c["filet_fort"], ep=3))
            zone(x + ind, yj, cw - ind, hi, True, "carte")
            s.add(rect(x + ind, yj, cw - ind, hi, fond_c, th.carte["rayon"]))
            s.add(rect(x + ind, yj, 6, hi, R.fonce, 0))
            s.add(dessiner(x + ind + 18, yj, wi, hi, P_, "start", th.c["encre"], th.c["structure"], v_align="middle",
                           fond=fond_c))
    return s


def _arbre_arete(s, racine, enfants, hr):
    """Quatre branches : la racine en tête, une colonne centrale qui descend, et deux branches de chaque côté,
    reliées à la colonne par un trait horizontal (lecture de gauche à droite, de haut en bas)."""
    th = T()
    pal = P()
    W, H = s.W, s.H
    wc = W - 2 * MX
    place = _place(H)
    g_c = 70
    cw = (wc - g_c) / 2
    cs = [_carte_dict(en, cw, "v", "sable") for en in enfants]
    k_ok = 1.0
    for k in (1.0, 1.2, 1.4, 1.6, 1.8):
        for c in cs:
            c["s_plaque"] = pal["plaque"] * k
        h1 = max(besoin(cs[0]), besoin(cs[1]))
        h2 = max(besoin(cs[2]), besoin(cs[3]))
        if k == 1.0 and hr + 70 + h1 + 40 + h2 > place:
            raise Deborde("arbre (arête)")
        if hr + 70 + h1 + 40 + h2 > 0.84 * place and k > 1.0:
            break
        k_ok = k
    for c in cs:
        c["s_plaque"] = pal["plaque"] * k_ok
    h1 = max(besoin(cs[0]), besoin(cs[1]))
    h2 = max(besoin(cs[2]), besoin(cs[3]))
    g_r, g_l = 70, 40
    reste = _rempli() * place - (hr + g_r + h1 + g_l + h2)
    h1n, h2n = h1, h2
    if reste > 0 and _et():
        # page remplie : air (plafonné), puis les cartes grandissent (contenu centré)
        g_r += min(reste * 0.3, 160)
        g_l += min(reste * 0.3, 160)
        reste = _rempli() * place - (hr + g_r + h1 + g_l + h2)
        h1 += max(0.0, reste) / 2
        h2 += max(0.0, reste) / 2
    elif reste > 0:
        g_r += min(reste * 0.4, 110)
        g_l += min(reste * 0.4, 110)
    tot = hr + g_r + h1 + g_l + h2
    y = _y0(place, tot)
    s.add(bandeau(MX, y, wc, hr, "or", _it(racine, "titre"), [_it(racine, "texte")] if _it(racine, "texte") else (),
                  _it(racine, "icone")))
    y1 = y + hr + g_r
    y2 = y1 + h1 + g_l
    xm = W / 2
    s.add(lien([(xm, y + hr), (xm, y2 + h2 / 2)], ep=4, couleur=th.c["structure"]))
    for yy, hh in ((y1, h1), (y2, h2)):
        s.add(lien([(MX + cw + 2, yy + hh / 2), (W - MX - cw - 2, yy + hh / 2)], ep=4, couleur=th.c["structure"]))
    for i, c in enumerate(cs):
        x = MX if i % 2 == 0 else W - MX - cw
        yy, hh = (y1, h1) if i < 2 else (y2, h2)
        hn = h1n if i < 2 else h2n
        s.add(carte(x, yy, cw, hh, decal=(hh - hn) / 2 if _et() else 0, **_kw(c)))
    return s


def _arbre_rangees(s, racine, enfants, hr):
    """Organigramme à 4 branches ou plus : la racine en tête, puis une rangée par branche (en-tête à gauche,
    éléments en pastilles à droite), rattachées à la racine par une colonne neutre."""
    th = T()
    pal = P()
    W, H = s.W, s.H
    wc = W - 2 * MX
    place = _place(H)
    xg = MX + 30
    w_t = 300
    x_i = xg + 20 + w_t + 30
    w_i = W - MX - x_i
    gi = 14
    rangs = []
    for en in enfants:
        c = _carte_dict(en, w_t, "v", "sable")
        items = _it(en, "items", ())
        wcol = (w_i - gi) / 2
        Ps = []
        for it in items:
            tit = it if isinstance(it, str) else _it(it, "titre")
            P_ = preparer(None, [tit], wcol - 2 * 18, pal["carte"], pal["texte"])
            if P_ is None:
                raise Deborde("arbre : élément")
            Ps.append(P_)
        hi = max([P_["total"] for P_ in Ps] or [0]) + 2 * 14
        n_l = math.ceil(len(Ps) / 2)
        h_items = n_l * hi + (n_l - 1) * gi
        rangs.append((c, Ps, hi, n_l, max(besoin(c), h_items)))
    g_r = 70
    gy = 26
    tot = hr + g_r + sum(r[4] for r in rangs) + gy * (len(rangs) - 1)
    if tot > place:
        raise Deborde("arbre (rangées)")
    reste = _rempli() * place - tot
    if reste > 0 and _et():
        # page remplie : air entre les rangées (plafonné), puis rangées plus hautes (en-têtes et éléments centrés)
        gy += min(reste / max(1, len(rangs)), 80)
        reste = _rempli() * place - (hr + g_r + sum(r[4] for r in rangs) + gy * (len(rangs) - 1))
        if reste > 0:
            rangs = [(c, Ps, hi, n_l, hrang + reste / len(rangs)) for c, Ps, hi, n_l, hrang in rangs]
    elif reste > 0:
        gy += min(reste / max(1, len(rangs)), 50)
    tot = hr + g_r + sum(r[4] for r in rangs) + gy * (len(rangs) - 1)
    y = _y0(place, tot)
    s.add(bandeau(MX, y, wc, hr, "or", _it(racine, "titre"), [_it(racine, "texte")] if _it(racine, "texte") else (),
                  _it(racine, "icone")))
    yy = y + hr + g_r
    ys = []
    for c, Ps, hi, n_l, hrang in rangs:
        ys.append(yy)
        yy += hrang + gy
    s.add(lien([(xg, y + hr), (xg, ys[-1] + rangs[-1][4] / 2)], ep=4, couleur=th.c["structure"]))
    fond_c = th.c["carte_fond"]
    for (c, Ps, hi, n_l, hrang), yr in zip(rangs, ys):
        s.add(lien([(xg, yr + hrang / 2), (xg + 20, yr + hrang / 2)], ep=4, couleur=th.c["structure"]))
        s.add(carte(xg + 20, yr, w_t, hrang, decal=(hrang - besoin(c)) / 2 if _et() else 0, **_kw(c)))
        R = th.role(c["role"])
        wcol = (w_i - gi) / 2
        y_it = yr + (hrang - (n_l * hi + (n_l - 1) * gi)) / 2
        for j, P_ in enumerate(Ps):
            r_, k_ = divmod(j, 2)
            xj, yj = x_i + k_ * (wcol + gi), y_it + r_ * (hi + gi)
            zone(xj, yj, wcol, hi, True, "carte")
            s.add(rect(xj, yj, wcol, hi, fond_c, th.carte["rayon"]))
            s.add(rect(xj, yj, 6, hi, R.fonce, 0))
            s.add(dessiner(xj + 18, yj, wcol - 36, hi, P_, "start", th.c["encre"], v_align="middle", fond=fond_c))
    return s


# ── Frise (verticale) ────────────────────────────────────────────────────────
def frise(jalons, w_carte=None, alterne=True, couleur_bande="#B8CCB1"):
    """Axe du temps vertical (fil marine fléché, de haut en bas), dates en pastilles marine sur l'axe, cartes de
    part et d'autre, reliées à leur date."""
    s, W, H = _toile()
    th = T()
    pal = P()
    n = len(jalons)
    xa = W / 2
    wc = W - 2 * MX
    tv = pal["carte"]
    lws = [largeur(_it(j, "date") or "", tv, 700, "chiffres") + 44 for j in jalons]
    demi = max(max(lws) / 2, 16) + 24
    cw = (wc - 2 * demi) / 2 if alterne else wc - demi - 40
    place = _place(H) - 70
    cs = [_carte_dict(j, cw, "v", "sable") for j in jalons]
    hc = max(besoin(c) for c in cs)
    pas_min = hc * (0.55 if alterne else 1.0) + 40
    if (n - 1) * pas_min + hc > place:
        raise Deborde("frise")
    pas = clamp((_rempli() * place - hc) / max(n - 1, 1), pas_min, hc + 160) if n > 1 else 0
    tot = (n - 1) * pas + hc
    y0 = _y0(_place(H), tot + 70) + 34
    ep = th.fil["epaisseur"]
    s.add(fil([(xa, y0 - 34), (xa, y0 + tot + 46)], pointe=True, ep=ep, taille=26))
    for i, (j, c) in enumerate(zip(jalons, cs)):
        y = y0 + i * pas
        gauche = alterne and i % 2 == 0
        x = (xa - demi - cw) if gauche else (xa + demi)
        yc = y + 50
        s.add(lien([(x + cw if gauche else x, yc), (xa, yc)], ep=3, couleur=th.c["structure"]))
        s.add(carte(x, y, cw, hc, **_kw(c)))
        d = _it(j, "date")
        if d:
            lw = lws[i]
            fp = th.c["structure"]
            s.add(rect(xa - lw / 2 - 4, yc - 29, lw + 8, 58, th.c["fond_schema"], 29))
            s.add(rect(xa - lw / 2, yc - 25, lw, 50, fp, 25))
            zone(xa - lw / 2, yc - 25, lw, 50, True, "etiquette")
            s.add(texte_seul(xa, yc + tv * 0.36, d, tv, 700, "#FFFFFF", "middle", "chiffres", fond=fp))
        else:
            s.add(disque(xa, yc, 12, th.c["structure"], th.c["fond_schema"], 4, type_="noeud"))
    return s


# ── Échelle de temps / jauge (horizontale) ───────────────────────────────────
def jauge(maxi, unite, marqueurs, pas_grad=None, debut=0, x0=90, x1=1110, y=330, legende_debut=None, note=None):
    """Échelle du temps horizontale, de gauche à droite (fil marine fléché) ; chaque délai est un jalon sur
    l'échelle, relié par un trait droit vertical à sa carte ; les cartes descendent en escalier, dans l'ordre des
    délais, d'une seule couleur."""
    s, W, H = _toile()
    th = T()
    pal = P()
    pas_grad = pas_grad or maxi / 6
    wc = W - 2 * MX
    place = _place(H)
    Pn = None
    h_note = 0
    if note:
        Pn = preparer(None, [note], wc - 40, pal["carte"], pal["texte"])
        h_note = Pn["total"] + 50
    ms = sorted(marqueurs, key=lambda m: m["val"])
    xa0, xa1 = MX + 34, W - MX - 34
    X = lambda v: xa0 + (v - debut) / (maxi - debut) * (xa1 - xa0)  # noqa: E731
    w_c = min(440, wc * 0.46)
    gx_g = 26
    # Délais égaux (même jalon) : une seule marche de l'escalier, les cartes côte à côte du côté qui laisse libres
    # les liaisons des délais suivants ; la liaison du jalon descend dans la carte la plus proche, une branche
    # horizontale rejoint les autres (aucun trait ne traverse une carte).
    groupes = []
    for m in ms:
        if groupes and abs(groupes[-1][0]["val"] - m["val"]) < 1e-9:
            groupes[-1].append(m)
        else:
            groupes.append([m])
    cs = []
    rangs = []
    for ig, gr in enumerate(groupes):
        xm = X(gr[0]["val"])
        if len(gr) == 1:
            c = _carte_dict(gr[0], w_c, "h", "sable", role="sable")
            c["icone"] = None
            c["x"] = (xm - w_c + 26) if xm - w_c + 26 >= MX else (xm - 26)
            c["x"] = clamp(c["x"], MX, W - MX - w_c)
            c["xm"] = xm
            c["w_"] = w_c
            if xm - w_c + 26 < MX and ig + 1 < len(groupes):
                # carte qui déborde à droite de son jalon : calée sur la marge, jamais sous la liaison du délai suivant
                lim = X(groupes[ig + 1][0]["val"]) - 30
                if c["x"] + w_c > lim:
                    c["x"] = MX
                    c["w_"] = max(min(w_c, lim - MX), 200)
                    c["w"] = c["w_"]
            cs.append(c)
            rangs.append([c])
            continue
        k_ = len(gr)
        # bord droit des cartes : jusqu'avant la liaison du délai suivant (qui descend plus bas), sinon la marge
        bord_d = min(W - MX, X(groupes[ig + 1][0]["val"]) - 30) if ig + 1 < len(groupes) else W - MX
        bord_d = max(bord_d, xm + 26)
        gauche = bord_d - MX
        droite = W - MX - (xm - 26)
        cote = "g" if (gauche - (k_ - 1) * gx_g) / k_ >= 300 else ("d" if (droite - (k_ - 1) * gx_g) / k_ >= 300 else None)
        if cote is None:
            raise Deborde("jauge : délais égaux")
        dispo = gauche if cote == "g" else droite
        w_k = min(w_c, (dispo - (k_ - 1) * gx_g) / k_)
        rang = []
        for j, m in enumerate(gr):
            c = _carte_dict(m, w_k, "h", "sable", role="sable")
            c["icone"] = None
            c["w_"] = w_k
            c["x"] = (bord_d - w_k - j * (w_k + gx_g)) if cote == "g" else (xm - 26 + j * (w_k + gx_g))
            c["xm"] = xm
            cs.append(c)
            rang.append(c)
        rangs.append(rang)
    hs = [max(besoin(c, c["w_"]) for c in rang) for rang in rangs]
    g = 40
    h_axe = 120
    tot = h_axe + sum(hs) + g * len(hs) + h_note
    if tot > place:
        raise Deborde("jauge")
    reste = _rempli() * place - tot
    if reste > 0:
        if _et():
            g += reste * 0.6 / len(hs)
            hs = [h + reste * 0.4 / len(hs) for h in hs]
        else:
            g += min(reste / (len(hs) + 1), 110)
            hs = [h * min(1.25, 1 + reste * 0.3 / sum(hs)) for h in hs]
    tot = h_axe + sum(hs) + g * len(hs) + h_note
    y0 = _y0(place, tot)
    ya = y0 + 60
    Rb = th.role("or")
    s.add(rect(xa0 - 14, ya - 14, xa1 - xa0 + 28, 28, Rb.clair, 14))
    decor(xa0 - 14, ya - 14, xa1 + 14, ya + 14, "jauge")
    s.add(fil([(xa0, ya), (xa1 + 30, ya)], pointe=True, taille=24))
    v = debut
    while v <= maxi + 1e-9:
        xv = X(v)
        if not any(abs(m["val"] - v) < 1e-9 for m in marqueurs):
            s.add(rect(xv - 2, ya - 24, 4, 48, th.c["structure"], 1))
            lab = f"{v:g} {unite}" if unite else f"{v:g}"
            if legende_debut and abs(v - debut) < 1e-9:
                lab = legende_debut
            s.add(texte_seul(xv, ya - 34, lab, pal["texte"], 600, th.c["encre_2"], "middle"))
        v += pas_grad
    y = ya + 60
    for rang, h in zip(rangs, hs):
        y += g * 0.5
        c = rang[0]
        xm = c["xm"]
        xl = clamp(xm, c["x"] + 26, c["x"] + c["w_"] - 26)
        s.add(trait([(xl, ya + 18), (xl, y - 4)], 3, True, th.c["structure"], taille=16, type_="liaison"))
        for c2 in rang[1:]:
            yb_ = y - g * 0.25
            xc2 = c2["x"] + c2["w_"] / 2
            s.add(trait([(xl, yb_), (xc2, yb_), (xc2, y - 4)], 3, True, th.c["structure"], taille=16, type_="liaison"))
        for c2 in rang:
            s.add(carte(c2["x"], y, c2["w_"], h, **_kw(c2)))
        y += h + g * 0.5
    for c in cs:
        s.add(disque(c["xm"], ya, 18, th.c["structure"], th.c["fond_schema"], 5, type_="jalon"))
    if note:
        s.add(dessiner(MX, y + 30, wc - 40, Pn["total"], Pn, "start", th.c["encre_3"]))
    return s


# ── Fiche référence ──────────────────────────────────────────────────────────
def _nom_insecable(nom):
    """Pas de coupure à l'intérieur d'une enseigne : seuls les séparateurs « · » autorisent une coupure."""
    morceaux = nom.split(" · ")
    if len(morceaux) == 1:
        return nom
    return " · ".join(m.replace(" ", " ") for m in morceaux).replace(" · ", " · ")


def fiche(nom, lieu, icone_secteur, stats, missions, titre_missions="Nos missions", secteur_txt=None):
    """Fiche d'une référence : panneau marine (secteur, nom, lieu), chiffres clés en orange « signal », puis les
    missions confiées à GSS."""
    s, W, H = _toile()
    th = T()
    pal = P()
    wc = W - 2 * MX
    place = _place(H)
    R = th.role("or")
    pad = 36
    S = pal["plaque"] * 1.1
    nom_aff = _nom_insecable(nom)
    P_nom = preparer(nom_aff, [lieu] if lieu else (), wc - 2 * pad - S - 30, pal["panneau"], pal["texte"],
                     lignes_max_titre=3)
    if P_nom is None:
        raise Deborde("fiche : nom")
    te = pal["etiquette"]
    h_sect = te * 1.8 if secteur_txt else 0
    hb = max(S, h_sect + P_nom["total"]) + 2 * pad
    cols = 2 if len(missions) > 6 else 1
    gxm = 40
    wcol = (wc - 2 * pad - (cols - 1) * gxm) / cols
    par_col = math.ceil(len(missions) / cols)
    cols_l = [missions[c * par_col:(c + 1) * par_col] for c in range(cols)]
    Ps = [preparer(None, col, wcol, pal["carte"], pal["texte"], puces=True) for col in cols_l]
    if any(P_ is None for P_ in Ps):
        raise Deborde("fiche : missions")
    k = len(stats or ())
    gs = 24
    ws = (wc - (k - 1) * gs) / k if k else 0
    tvs = []
    for val, lab in (stats or ()):
        for tv in (pal["chiffre"], pal["chiffre_moyen"]):
            if largeur(val, tv, 700, "chiffres") <= ws * 0.55:
                break
        tvs.append(tv)
    tv_c = min(tvs) if tvs else 0
    h_stats = max(tv_c * 1.0 + 2 * 30, 150) if stats else 0
    empiler = any(ws - 26 - (34 + largeur(v_, tv_c, 700, "chiffres") + 26) <= 160 for v_, _ in (stats or ()))
    for val, lab in (stats or ()):
        if empiler:
            Pl = preparer(None, [lab], ws - 68, pal["carte"], pal["texte"])
            if Pl is not None:
                h_stats = max(h_stats, tv_c * 0.95 + 10 + Pl["total"] + 2 * 28)
    g = 24
    cont = max(P_["total"] for P_ in Ps)
    hm = cont + te * 2 + 40 + pad * 1.6
    tot = hb + g + (h_stats + g if stats else 0) + hm
    if tot > place:
        raise Deborde("fiche")
    reste = place * _rempli() - tot
    if reste > 0:
        et = _et()
        # page remplie : le cadre des missions et les chiffres grandissent, les missions s'espacent
        hm += min(reste * 0.5, cont * 0.35) if not et else reste - min(reste * 0.15, 140) * bool(stats)
        h_stats += (min(reste * 0.2, 60) if not et else min(reste * 0.15, 140)) if stats else 0
        Ps = [dict(P_, gp=P_["gp"] + min(reste * (0.3 if not et else 0.5) / max(1, len(P_["cl"]) - 1),
                                         pal["texte"] * (0.8 if not et else 3.0))) for P_ in Ps]
        for P_ in Ps:
            P_["total"] = sum(len(r) for r in P_["cl"]) * P_["hb"] + (len(P_["cl"]) - 1) * P_["gp"]
        cont = max(P_["total"] for P_ in Ps)
        hm = max(hm, cont + te * 2 + 40 + pad * 1.6)
    tot = hb + g + (h_stats + g if stats else 0) + hm
    y = _y0(place, tot)
    zone(MX, y, wc, hb, True, "panneau")
    rx = th.bandeau.get("rayon", 0)
    s.add(f'<path d="{chemin_arrondi(MX, y, wc, hb, rx, rx, rx, rx)}" fill="{R.fonce}"/>')
    s.add(glyphe(icone_secteur, MX + pad + S / 2, y + hb / 2, S * 0.9, R.sur_fonce))
    xt = MX + pad + S + 30
    yt = y + (hb - h_sect - P_nom["total"]) / 2
    if secteur_txt:
        s.add(texte_seul(xt, yt + te * 0.9, secteur_txt.upper(), te, 700, th.c["clair_sur_structure"], "start", "texte",
                         fond=R.fonce, espacement=2.5))
        yt += h_sect
    s.add(dessiner(xt, yt, wc - 2 * pad - S - 30, P_nom["total"], P_nom, "start", th.c["clair_sur_structure"],
                   R.sur_fonce, fond=R.fonce))
    y += hb + g
    if stats:
        fond_c = th.c["carte_fond"]
        for i, (val, lab) in enumerate(stats):
            x = MX + i * (ws + gs)
            zone(x, y, ws, h_stats, True, "carte")
            s.add(rect(x, y, ws, h_stats, fond_c, th.carte["rayon"]))
            lv = largeur(val, tv_c, 700, "chiffres")
            xl = x + 34 + lv + 26
            Pl = (preparer(None, [lab], x + ws - 26 - xl, pal["carte"], pal["texte"])
                  if (x + ws - 26 - xl > 160 and not empiler) else None)
            if Pl is not None:
                s.add(chiffre_cle(x + 34, y + h_stats / 2 + tv_c * 0.35, val, tv_c, "start", fond=fond_c))
                s.add(dessiner(xl, y, x + ws - 26 - xl, h_stats, Pl, "start", th.c["encre_2"], v_align="middle",
                               fond=fond_c))
            else:                        # libellé sous le chiffre
                Pl = preparer(None, [lab], ws - 68, pal["carte"], pal["texte"])
                if Pl is None:
                    raise Deborde("fiche : statistique")
                hb_ = tv_c * 0.95 + 10 + Pl["total"]
                yy = y + (h_stats - hb_) / 2
                s.add(chiffre_cle(x + 34, yy + tv_c * 0.80, val, tv_c, "start", fond=fond_c))
                s.add(dessiner(x + 34, yy + tv_c * 0.95 + 10, ws - 68, Pl["total"], Pl, "start", th.c["encre_2"],
                               fond=fond_c))
        y += h_stats + g
    fond_c = th.c["surface_2"]
    zone(MX, y, wc, hm, True, "carte")
    s.add(rect(MX, y, wc, hm, fond_c, th.carte["rayon"]))
    s.add(texte_seul(MX + pad, y + pad + te * 0.9, titre_missions.upper(), te, 700, th.c["structure"], "start", "texte",
                     fond=fond_c, espacement=2.5))
    ym = y + pad + te * 2 + 24
    for c, P_ in enumerate(Ps):
        xc = MX + pad + c * (wcol + gxm)
        s.add(dessiner(xc, ym, wcol, P_["total"], P_, "start", th.c["encre"], v_align="top",
                       puce_couleur=th.c["structure"], fond=fond_c))
    return s


# ── Tenues : dessin technique (style fiche technique de vêtement) ─────────────
# Gabarits à plat, vus de face, sur une grille locale 600 × 560 (haut, pantalon) et 600 × 170 (chaussures) :
# trait marine, aplats légers. Proportions d'une veste taille L (largeur de poitrine ≈ 56 cm).
_HAUT = ("M236,36 C256,58 344,58 364,36 L452,64 L534,214 L566,470 L506,486 L456,262 L452,530 L148,530 L144,262 "
         "L94,486 L34,470 L66,214 L148,64 Z")
_DOS = ("M236,36 C256,46 344,46 364,36 L452,64 L534,214 L566,470 L506,486 L456,262 L452,530 L148,530 L144,262 "
        "L94,486 L34,470 L66,214 L148,64 Z")
_PANTALON = "M176,0 H424 L440,40 L458,540 L330,540 L306,196 L294,196 L270,540 L142,540 L160,40 Z"
_DETAILS = {
    "intervention": ["M300,54 V530", "M236,36 L224,74 L270,96 L300,62 L330,96 L376,74 L364,36",
                     "M176,150 H262 V214 H176 Z", "M176,168 H262", "M338,150 H424 V214 H338 Z", "M338,168 H424",
                     "M148,504 H452", "M44,440 L102,452", "M556,440 L498,452"],
    "costume": ["M236,36 L206,92 L262,300 L300,332", "M364,36 L394,92 L338,300 L300,332",
                "M170,402 L250,396", "M350,396 L430,402", "M344,196 L404,192", "M44,440 L102,452",
                "M556,440 L498,452"],
    "ssiap": ["M300,54 V176", "M236,36 L252,96 L300,62 L348,96 L364,36", "M148,504 H452", "M44,440 L102,452",
              "M556,440 L498,452", "M66,214 L144,262", "M534,214 L456,262"],
}
_ANCRES_HAUT = {"col": (300, 70), "torse": (300, 300), "poitrine": (214, 182), "bras": (66, 330), "epaules": (452, 66),
                "numero": (381, 158), "insigne": (381, 222), "tete": (300, 40), "dos": (300, 214), "main": (66, 470)}
_ANCRES_BAS = {"taille": (300, 16), "jambes": (214, 330), "pieds": (204, 96)}


def _vetement(d, ox, oy, k, fond, details=(), trait_c=None, ep=3.2):
    th = T()
    trait_c = trait_c or th.c["structure"]
    o = [f'<g transform="translate({ox:.1f},{oy:.1f}) scale({k:.4f})" stroke-linejoin="round" stroke-linecap="round">',
         f'<path d="{d}" fill="{fond}" stroke="{trait_c}" stroke-width="{ep / k:.2f}"/>']
    for dd in details:
        o.append(f'<path d="{dd}" fill="none" stroke="{trait_c}" stroke-width="{ep * 0.62 / k:.2f}"/>')
    o.append("</g>")
    return "".join(o)


def _chaussures(ox, oy, k, fond, trait_c, ep=3.2):
    une = ("M60,28 H150 L158,86 L226,104 C246,110 248,140 228,146 L52,146 C40,146 38,132 42,120 Z",
           "M44,128 H236", "M98,40 L132,60", "M96,64 L134,82")
    o = [f'<g transform="translate({ox:.1f},{oy:.1f}) scale({k:.4f})" stroke-linejoin="round" stroke-linecap="round">']
    for dx, miroir in ((0, False), (600, True)):
        tr = f'translate({dx},0) scale(-1,1)' if miroir else ""
        o.append(f'<g transform="{tr}"><path d="{une[0]}" fill="{fond}" stroke="{trait_c}" stroke-width="{ep / k:.2f}"/>')
        for dd in une[1:]:
            o.append(f'<path d="{dd}" fill="none" stroke="{trait_c}" stroke-width="{ep * 0.62 / k:.2f}"/>')
        o.append("</g>")
    o.append("</g>")
    return "".join(o)


def _cote(x1, y1, x2, y2, couleur, ep=2):
    """Ligne de cote (sans valeur : les dimensions sont dans les cartes) : flèches aux deux bouts."""
    ang = math.atan2(y2 - y1, x2 - x1)
    o = [f'<path d="M{x1:.1f},{y1:.1f} L{x2:.1f},{y2:.1f}" stroke="{couleur}" stroke-width="{ep}" fill="none"/>']
    for (x, y, a) in ((x1, y1, ang + math.pi), (x2, y2, ang)):
        t = 10
        lx, ly = x - t * math.cos(a) + 5 * math.sin(a), y - t * math.sin(a) - 5 * math.cos(a)
        rx_, ry_ = x - t * math.cos(a) - 5 * math.sin(a), y - t * math.sin(a) + 5 * math.cos(a)
        o.append(f'<path d="M{x:.1f},{y:.1f} L{lx:.1f},{ly:.1f} L{rx_:.1f},{ry_:.1f} Z" fill="{couleur}"/>')
    decor(min(x1, x2) - 6, min(y1, y2) - 6, max(x1, x2) + 6, max(y1, y2) + 6, "cote")
    return "".join(o)


def _annoter(s, cartes_g, cartes_d, cibles, y_min, y_max, wv, gap=26):
    """Cartes d'annotation de part et d'autre, chacune à la hauteur de sa cible, reliée par un trait marine fin
    terminé par un point (repère)."""
    th = T()
    W = s.W
    for cote, lst in (("g", cartes_g), ("d", cartes_d)):
        if not lst:
            continue
        lst = sorted(lst, key=lambda c: cibles[id(c)][1])
        hs = [besoin(c) for c in lst]
        ys = [cibles[id(c)][1] - h / 2 for c, h in zip(lst, hs)]
        ys[0] = max(ys[0], y_min)
        for k in range(1, len(ys)):
            ys[k] = max(ys[k], ys[k - 1] + hs[k - 1] + gap)
        dep = ys[-1] + hs[-1] - y_max
        if dep > 0:
            ys[-1] -= dep
            for k in range(len(ys) - 2, -1, -1):
                ys[k] = min(ys[k], ys[k + 1] - hs[k] - gap)
        if ys[0] < y_min - 0.5:
            raise Deborde("annotations")
        for c, y, h in zip(lst, ys, hs):
            x = MX if cote == "g" else W - MX - wv
            px, py = cibles[id(c)]
            bx = x + wv if cote == "g" else x
            ya = clamp(py, y + 24, y + h - 24)
            s.add(trait([(bx, ya), (bx + (22 if cote == "g" else -22), ya), (px, py)], 2.5, False, th.c["structure"],
                        type_="repere"))
            s.add(disque(px, py, 7, th.c["structure"], "#FFFFFF", 2.5, type_="repere"))
            s.add(carte(x, y, wv, h, **_kw(c)))


def silhouette(annotations, tenue="intervention", dos=False, marquage=False):
    """La tenue en dessin technique (vêtements à plat, vus de face ou de dos), aux proportions réelles ; chaque
    annotation, dans une carte, est reliée à son emplacement. Marquages : détail agrandi, à l'échelle, avec ses
    lignes de cote."""
    s, W, H = _toile()
    th = T()
    pal = P()
    place = _place(H)
    teinte = {"intervention": th.role("or").clair, "costume": "#DADFE6", "ssiap": th.role("rouge").clair}[tenue]
    trait_c = th.role("rouge").fonce if tenue == "ssiap" else th.c["structure"]
    cs = [_carte_dict(a, 300, "v", "sable", ancre=a["ancre"], cote=_it(a, "cote", "g")) for a in annotations]
    for c in cs:
        c["icone"] = None
    if marquage and not dos:
        return _marquage_devant(s, cs, teinte, trait_c)
    if dos:
        return _marquage_dos(s, cs, teinte, trait_c)
    # tenue complète : haut, pantalon, chaussures, empilés au centre
    k = min(0.84, (place - 72) / 1260)
    # au palier dense (dernier recours) : colonne des annotations assez large pour le plus long mot d'un titre (le
    # dessin se réduit d'autant) ; au palier standard, mise en page de la planche
    mot = max((largeur(m, pal["carte"], th.typo["titre_graisse"], "titre") for c in cs
               for m in insec(c.get("titre") or "").split(" ") if m), default=0) if th.palier_nom == "dense" else 0
    wv = max(230, (W - 2 * MX - 600 * k - 2 * 34) / 2, mot + 2 * pal["pad"] + 2)
    k = min(k, (W - 2 * MX - 2 * wv - 2 * 34) / 600)
    h_haut, h_bas, h_ch = 560 * k, 540 * k, 160 * k
    g = 36
    if _et():
        # page remplie : la veste, le pantalon et les chaussures s'espacent (dessin à l'échelle inchangé)
        g = clamp((place * _rempli() - (h_haut + h_bas + h_ch)) / 2, 36, 220)
    tot = h_haut + g + h_bas + g + h_ch
    if tot > place:
        raise Deborde("silhouette")
    y0 = _y0(place, tot)
    ox = W / 2 - 300 * k
    yb = y0 + h_haut + g
    yc = yb + h_bas + g
    s.add(_vetement(_HAUT, ox, y0, k, teinte, _DETAILS[tenue], trait_c))
    if tenue == "costume":
        s.add(f'<g transform="translate({ox:.1f},{y0:.1f}) scale({k:.4f})"><path d="M262,62 L300,180 L338,62 Z" '
              f'fill="#FFFFFF" stroke="{trait_c}" stroke-width="{2 / k:.2f}"/><path d="M292,72 H308 L314,192 L300,212 '
              f'L286,192 Z" fill="{trait_c}"/></g>')
    s.add(_vetement(_PANTALON, ox, yb, k, teinte, ["M168,30 H432", "M300,30 V186",
                                                     "M176,40 C196,92 214,100 232,100", "M424,40 C404,92 386,100 368,100"],
                    trait_c))
    s.add(_chaussures(ox, yc - 20 * k, k, "#DADFE6", th.c["structure"]))
    decor(ox, y0, ox + 600 * k, yc + h_ch, "tenue")

    def cible(c):
        a = c["ancre"]
        droite = c["cote"] == "d"
        if a in _ANCRES_BAS:
            x, y = _ANCRES_BAS[a]
            base = yb if a != "pieds" else yc - 20 * k
        else:
            x, y = _ANCRES_HAUT.get(a, (300, 300))
            base = y0
        if droite and a in ("bras", "poitrine", "jambes", "pieds", "main"):
            x = 600 - x
        if droite and a == "epaules":
            x = 452
        if not droite and a == "epaules":
            x = 148
        return ox + x * k, base + y * k
    cibles = {id(c): cible(c) for c in cs}
    for c in cs:
        c["w"] = wv
    _annoter(s, [c for c in cs if c["cote"] == "g"], [c for c in cs if c["cote"] == "d"], cibles, MY, H - MY, wv)
    return s


def _marquage_devant(s, cs, teinte, trait_c):
    """Veste vue de face (le marquage à sa place, à l'échelle), puis le détail agrandi : bandeau du numéro
    (54 × 15 mm) et insigne (50 × 50 mm) dans leurs proportions réelles, avec lignes de cote ; les cartes
    sont reliées à l'élément qu'elles décrivent."""
    th = T()
    pal = P()
    W, H = s.W, s.H
    place = _place(H)
    k = 0.92
    w_v = 600 * k
    h_v = 560 * k
    ox = W / 2 - w_v / 2
    # proportions réelles : poitrine ≈ 560 mm pour 304 unités locales (148 → 452) ; 1 unité locale ≈ 1,84 mm
    mm = 304 / 560
    lb_w, lb_h = 54 * mm, 15 * mm
    in_w = 50 * mm
    # détail agrandi : la largeur du bandeau permet d'écrire « N° CNAPS » au corps de l'étiquette
    te = pal["etiquette"]
    w_txt = largeur("N° CNAPS", te, 700) + 30
    z = w_txt / lb_w                                  # facteur d'agrandissement du détail
    d_lw, d_lh, d_in = lb_w * z, lb_h * z, in_w * z
    g_d = 46
    h_det = 40 + d_lh + 46 + d_in + 40
    w_det = max(d_lw, d_in) + 150
    wv = (W - 2 * MX - w_det - 2 * 46) / 2
    for c in cs:
        c["w"] = wv
    hcs_g = sum(besoin(c) for c in cs if c["cote"] == "g") + 26 * (sum(1 for c in cs if c["cote"] == "g") - 1)
    hcs_d = sum(besoin(c) for c in cs if c["cote"] == "d") + 26 * (sum(1 for c in cs if c["cote"] == "d") - 1)
    h_bas = max(h_det, hcs_g, hcs_d)
    tot = h_v + g_d + h_bas
    if tot > place:
        raise Deborde("marquage")
    g_d += min(max(0, _rempli() * place - tot) * 0.6, 120 if not _et() else 9e9)
    tot = h_v + g_d + h_bas
    y0 = _y0(place, tot)
    s.add(_vetement(_HAUT, ox, y0, k, teinte, _DETAILS["intervention"], trait_c))
    decor(ox, y0, ox + w_v, y0 + h_v, "veste")
    # marquage sur la veste, à l'échelle (côté gauche du porteur = droite du dessin)
    mx, my = ox + (381 - lb_w / 2) * k, y0 + 150 * k
    s.add(rect(mx, my, lb_w * k, lb_h * k, "#FFFFFF", 1, "#111111", 1.2))
    s.add(rect(mx + (lb_w - in_w) / 2 * k, my + (lb_h + 6) * k, in_w * k, in_w * k, "#FFFFFF", 1.5, "#111111", 1.2))
    zx, zy = mx + lb_w * k / 2, my + (lb_h + 6 + in_w / 2) * k
    rz = 52
    s.add(f'<circle cx="{zx:.1f}" cy="{zy:.1f}" r="{rz}" fill="none" stroke="{th.c["structure"]}" stroke-width="2.5" '
          f'stroke-dasharray="8 6"/>')
    # détail agrandi
    yd = y0 + h_v + g_d + (h_bas - h_det) / 2
    xd = W / 2 - w_det / 2
    decor(xd, yd, xd + w_det, yd + h_det, "detail")
    s.add(rect(xd, yd, w_det, h_det, th.c["carte_fond"], th.carte["rayon"]))
    s.add(trait([(zx, zy + rz), (zx, yd - 6)], 2.5, True, th.c["structure"], taille=14, type_="zoom"))
    lx, ly = W / 2 - d_lw / 2, yd + 40
    s.add(rect(lx, ly, d_lw, d_lh, "#FFFFFF", 2, "#111111", 2))
    zone(lx, ly, d_lw, d_lh, True, "marquage")
    s.add(texte_seul(lx + d_lw / 2, ly + d_lh / 2 + te * 0.36, "N° CNAPS", te, 700, "#111111", fond="#FFFFFF"))
    ix, iy = W / 2 - d_in / 2, ly + d_lh + 46
    s.add(rect(ix, iy, d_in, d_in, "#FFFFFF", 3, "#111111", 2))
    zone(ix, iy, d_in, d_in, True, "marquage")
    s.add(texte_seul(ix + d_in / 2, iy + d_in / 2 + pal["carte"] * 0.36, "GSS", pal["carte"], 700, th.role("rouge").fonce,
                     "middle", "titre", fond="#FFFFFF"))
    # cotes (les valeurs sont écrites dans les cartes)
    cc = th.c["encre_3"]
    s.add(_cote(lx, ly - 16, lx + d_lw, ly - 16, cc))
    s.add(_cote(lx + d_lw + 16, ly, lx + d_lw + 16, ly + d_lh, cc))
    s.add(_cote(ix + d_in + 16, iy, ix + d_in + 16, iy + d_in, cc))
    s.add(_cote(ix, iy + d_in + 16, ix + d_in, iy + d_in + 16, cc))
    cible_lab = (lx - 4, ly + d_lh / 2)
    cible_lab_d = (lx + d_lw + 34, ly + d_lh / 2)
    cible_ins = (ix - 4, iy + d_in / 2)
    cibles = {}
    for c in cs:
        if c["ancre"] == "insigne":
            cibles[id(c)] = cible_ins if c["cote"] == "g" else (ix + d_in + 34, iy + d_in / 2)
        else:
            cibles[id(c)] = cible_lab if c["cote"] == "g" else cible_lab_d
    _annoter_bas(s, cs, cibles, yd + (h_det - h_bas) / 2, yd + (h_det + h_bas) / 2, wv)
    return s


def _annoter_bas(s, cs, cibles, y_min, y_max, wv, gap=26):
    """Cartes à gauche et à droite du détail, dans l'ordre de la spécification, reliées à leur cible."""
    th = T()
    W = s.W
    for cote in ("g", "d"):
        lst = sorted([c for c in cs if c["cote"] == cote], key=lambda c: cibles[id(c)][1])
        if not lst:
            continue
        hs = [besoin(c) for c in lst]
        tot = sum(hs) + gap * (len(lst) - 1)
        y = y_min + (y_max - y_min - tot) / 2
        for c, h in zip(lst, hs):
            x = MX if cote == "g" else W - MX - wv
            px, py = cibles[id(c)]
            bx = x + wv if cote == "g" else x
            ya = clamp(py, y + 24, y + h - 24)
            s.add(trait([(bx, ya), (bx + (22 if cote == "g" else -22), ya), (px, py)], 2.5, False, th.c["structure"],
                        type_="repere"))
            s.add(disque(px, py, 7, th.c["structure"], "#FFFFFF", 2.5, type_="repere"))
            s.add(carte(x, y, wv, h, **_kw(c)))
            y += h + gap


def _marquage_dos(s, cs, teinte, trait_c):
    """Veste vue de dos, en grand, avec le bandeau « SÉCURITÉ PRIVÉE » à sa place ; les cartes au-dessous,
    reliées au bandeau."""
    th = T()
    pal = P()
    W, H = s.W, s.H
    place = _place(H)
    k = 1.15
    w_v, h_v = 600 * k, 560 * k
    gx = 26
    n = len(cs)
    cw = (W - 2 * MX - (n - 1) * gx) / n
    for c in cs:
        c["w"] = cw
    hc = max(besoin(c) for c in cs)
    g = 90
    tot = h_v + g + hc
    if tot > place:
        k = (place - g - hc) / 560
        w_v, h_v = 600 * k, 560 * k
        tot = h_v + g + hc
    g += min(max(0, _rempli() * place - tot) * (0.5 if not _et() else 0.9), 80 if not _et() else 9e9)
    tot = h_v + g + hc
    y0 = _y0(place, tot)
    ox = W / 2 - w_v / 2
    s.add(_vetement(_DOS, ox, y0, k, teinte, ["M150,120 C220,140 380,140 450,120", "M148,504 H452",
                                               "M44,440 L102,452", "M556,440 L498,452"], trait_c))
    decor(ox, y0, ox + w_v, y0 + h_v, "veste")
    te = pal["etiquette"]
    lw = largeur("SÉCURITÉ PRIVÉE", te, 700, espacement=1.2) + 40
    bh = te * 2.2
    bx, by = W / 2 - lw / 2, y0 + 190 * k
    s.add(rect(bx, by, lw, bh, "#0B0D10", 3))
    zone(bx, by, lw, bh, True, "marquage")
    s.add(texte_seul(W / 2, by + bh / 2 + te * 0.36, "SÉCURITÉ PRIVÉE", te, 700, "#FFFFFF", fond="#0B0D10", espacement=1.2))
    s.add(_cote(bx, by - 16, bx + lw, by - 16, th.c["encre_3"]))
    yc = y0 + h_v + g
    yp = yc - g * 0.42                       # peigne au-dessus des cartes
    s.add(trait([(W / 2, by + bh + 8), (W / 2, yp)], 2.5, False, th.c["structure"], type_="repere"))
    s.add(disque(W / 2, by + bh + 8, 7, th.c["structure"], "#FFFFFF", 2.5, type_="repere"))
    xs_ = [MX + i * (cw + gx) + cw / 2 for i in range(n)]
    s.add(trait([(xs_[0], yp), (xs_[-1], yp)], 2.5, False, th.c["structure"], type_="repere"))
    for i, c in enumerate(cs):
        x = MX + i * (cw + gx)
        s.add(trait([(xs_[i], yp), (xs_[i], yc - 4)], 2.5, True, th.c["structure"], taille=14, type_="repere"))
        s.add(carte(x, yc, cw, hc, **_kw(c)))
    return s


# ── Barres ───────────────────────────────────────────────────────────────────
def barres(series, unite="", maxi=None, largeur_label=300, legende=None, note=None, detail=False):
    """Barres horizontales : la légende sous le titre, le libellé au-dessus de chaque barre, les valeurs dans les
    segments (IBM Plex Sans Condensed, chiffres tabulaires), le total toujours à droite de la barre."""
    s, W, H = _toile()
    th = T()
    pal = P()
    n = len(series)
    wc = W - 2 * MX
    place = _place(H)
    vals = [sum(v for v, _ in (se.get("valeurs") or [(se["valeur"], se.get("role", "bleu"))])) for se in series]
    maxi = maxi or max(vals)
    tl = pal["carte"]
    tv = pal["carte"]
    hb = 64 if n >= 5 else (84 if n == 4 else 104)
    libs = []
    for i, se in enumerate(series):
        segs = se.get("valeurs") or [(se["valeur"], se.get("role", "bleu"))]
        lib = " + ".join(f"{v:g}" for v, _ in segs) if (detail and len(segs) > 1) else f"{vals[i]:g}"
        libs.append(lib.replace(".", ",") + (f" {unite}" if unite else ""))
    w_val = max(largeur(l, tv, 700, "chiffres") for l in libs) + 30
    xb0, xb1 = MX, W - MX - w_val
    h_leg = (pal["texte"] * 1.6 + 40) if legende else 0
    h_note = (pal["texte"] * 1.6 + 30) if note else 0
    bloc = tl * 1.25 + 14 + hb
    gap0 = 40
    tot = h_leg + n * bloc + (n - 1) * gap0 + h_note
    if tot > place:
        raise Deborde("barres")
    gap = min(150, (_rempli() * place - h_leg - h_note - n * bloc) / max(n - 1, 1)) if n > 1 else 0
    gap = max(gap, gap0)
    if _et():
        # page remplie : les barres s'épaississent (jusqu'à 2 fois) pour occuper la hauteur visée
        manque = _rempli() * place - (h_leg + n * bloc + (n - 1) * gap + h_note)
        if manque > 0:
            d_hb = min(hb * 2, manque / n)
            hb += d_hb
            bloc += d_hb
    tot = h_leg + n * bloc + (n - 1) * gap + h_note
    y = _y0(place, tot)
    if legende:
        xl = MX
        for lab, role in legende:
            R = th.role(role)
            s.add(rect(xl, y + 4, 30, 30, R.fonce, 3))
            decor(xl, y + 4, xl + 30, y + 34, "legende")
            s.add(texte_seul(xl + 44, y + 28, lab, pal["texte"], 600, th.c["encre"], "start"))
            xl += 44 + largeur(lab, pal["texte"], 600) + 50
        y += h_leg
    for i, se in enumerate(series):
        segs = se.get("valeurs") or [(se["valeur"], se.get("role", "bleu"))]
        s.add(texte_seul(xb0, y + tl * 0.9, se["label"], tl, 600, th.c["encre"], "start", "titre"))
        yb = y + tl * 1.25 + 14
        xx = xb0
        for v, role in segs:
            R = th.role(role)
            wv = max((xb1 - xb0) * v / maxi, 10)
            s.add(rect(xx, yb, wv - (2 if len(segs) > 1 else 0), hb, R.fonce, 2))
            zone(xx, yb, wv - (2 if len(segs) > 1 else 0), hb, True, "barre")
            lv = f"{v:g}".replace(".", ",")
            if len(segs) > 1 and largeur(lv, pal["texte"], 600, "chiffres") + 24 <= wv:
                s.add(texte_seul(xx + wv / 2, yb + hb / 2 + pal["texte"] * 0.36, lv, pal["texte"], 600, R.sur_fonce,
                                 "middle", "chiffres", fond=R.fonce, extra=' style="font-variant-numeric:tabular-nums"'))
            xx += wv
        s.add(texte_seul(xx + 20, yb + hb / 2 + tv * 0.36, libs[i], tv, 700, th.c["structure"], "start", "chiffres",
                         extra=' style="font-variant-numeric:tabular-nums"'))
        y += bloc + gap
    if note:
        s.add(texte_seul(MX, y - gap + 40 + pal["texte"], note, pal["texte"], 400, th.c["encre_3"], "start"))
    return s


# ── Carte réelle (contours des régions) ──────────────────────────────────────
_GEO = {}


def _geo(nom):
    if nom not in _GEO:
        _GEO[nom] = _json.load(open(_os.path.join(MOTEUR, "geo", nom + ".geojson"), encoding="utf-8"))
    return _GEO[nom]


def _boites_chevauchent(a, b, m=0):
    return min(a[2], b[2]) - max(a[0], b[0]) > -m and min(a[3], b[3]) - max(a[1], b[1]) > -m


def _seg_boite(p1, p2, r):
    x0, y0, x1, y1 = r
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    t0, t1 = 0.0, 1.0
    for p, q in ((-dx, p1[0] - x0), (dx, x1 - p1[0]), (-dy, p1[1] - y0), (dy, y1 - p1[1])):
        if abs(p) < 1e-12:
            if q < 0:
                return False
        else:
            t = q / p
            if p < 0:
                t0 = max(t0, t)
            else:
                t1 = min(t1, t)
            if t0 > t1:
                return False
    return True


def carte_reelle(points, bbox, fond="regions", en_avant=(), noms_zones=None, zone=(40, 30, 1160, 630), hub=None,
                 liens=False):
    """Carte des sites, recadrée sur la zone utile : mer en blanc, région mise en avant en marine clair, autres
    régions en gris très clair ; liaisons fines depuis le siège, qui passent sous les étiquettes ; chaque point
    hors du cadre de son étiquette ; les noms de régions sont déplacés pour qu'aucune liaison ne les traverse."""
    s, W, H = _toile()
    th = T()
    pal = P()
    # recadrage : étendue des sites + marge
    lons = [p["lon"] for p in points]
    lats = [p["lat"] for p in points]
    lo0, lo1 = min(lons) - 0.75, max(lons) + 0.75
    la0, la1 = min(lats) - 0.42, max(lats) + 0.42
    k = math.cos(math.radians((la0 + la1) / 2))
    x0, x1 = MX, W - MX
    sc = (x1 - x0) / ((lo1 - lo0) * k)
    hcarte = (la1 - la0) * sc
    place = _place(H)
    if hcarte > place:
        sc = place / (la1 - la0)
        hcarte = place
    if _et() and hcarte < _rempli() * place:
        # page remplie : même échelle, la carte montre davantage de territoire au nord et au sud
        d_la = (_rempli() * place / sc - (la1 - la0)) / 2
        la0, la1 = la0 - d_la, la1 + d_la
        hcarte = (la1 - la0) * sc
    wcarte = (lo1 - lo0) * k * sc
    y0 = _y0(place, hcarte)
    y1 = y0 + hcarte
    x0 = W / 2 - wcarte / 2
    x1 = x0 + wcarte
    proj = lambda lon, lat: (x0 + (lon - lo0) * k * sc, y0 + (la1 - lat) * sc)  # noqa: E731

    def chemin(geom):
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        d = ""
        for poly in polys:
            for anneau in poly:
                d += "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in (proj(lon, lat) for lon, lat in anneau)) + " Z "
        return d
    cid = s.ident("cadre")
    rxc = th.carte["rayon"]
    s.defs["cadre"] = f'<clipPath id="{cid}"><rect x="{x0:.1f}" y="{y0:.1f}" width="{x1 - x0:.1f}" height="{y1 - y0:.1f}" rx="{rxc}"/></clipPath>'
    s.add(rect(x0, y0, x1 - x0, y1 - y0, th.c["fond_schema"], rxc, th.c["filet"], 1.5))
    decor(x0, y0, x1, y1, "carte")
    g = [f'<g clip-path="url(#{cid})">']
    feats = _geo(fond)["features"]
    gris = "#EEF1F5"
    for f in feats:
        if f["properties"]["nom"] in en_avant:
            continue
        g.append(f'<path d="{chemin(f["geometry"])}" fill="{gris}" stroke="#FFFFFF" stroke-width="2.4" stroke-linejoin="round"/>')
    for f in feats:
        if f["properties"]["nom"] in en_avant:
            g.append(f'<path d="{chemin(f["geometry"])}" fill="#DCE4EE" stroke="{th.c["structure"]}" stroke-width="2.4" '
                     f'stroke-linejoin="round"/>')
    g.append("</g>")
    s.add("\n".join(g))
    hp = next((p for p in points if p["nom"] == hub), None) if hub else None
    hx, hy = proj(hp["lon"], hp["lat"]) if hp else (None, None)
    segs = []
    if hp and liens:
        for p in points:
            if p["nom"] != hub:
                q = proj(p["lon"], p["lat"])
                segs.append(((hx, hy), q))
                s.add(trait([(hx, hy), q], 2.6, False, th.c["structure"], type_="liaison"))
    # étiquettes des sites : côté demandé, puis le meilleur côté libre
    tl, td = pal["texte"], pal["etiquette"]
    eti = []
    obstacles_pts = []
    for p in points:
        x, y = proj(p["lon"], p["lat"])
        est_hub = p["nom"] == hub
        r = 22 if est_hub else 11
        obstacles_pts.append((x, y, r))
        lab, det = p.get("label", p["nom"]), p.get("detail")
        wl = max(largeur(lab, tl, 700), largeur(det, td, 400) if det else 0) + 32
        hl = (tl * 1.25 + td * 1.3 + 22) if det else (tl * 1.25 + 22)
        eti.append({"p": p, "x": x, "y": y, "r": r, "hub": est_hub, "lab": lab, "det": det, "wl": wl, "hl": hl,
                    "cote": p.get("cote", "d")})
    pose = []

    def boite(e, cote, dec=0.0):
        x, y, r, wl, hl = e["x"], e["y"], e["r"], e["wl"], e["hl"]
        gap = r + 12
        return {"d": (x + gap, y - hl / 2 + dec), "g": (x - gap - wl, y - hl / 2 + dec),
                "h": (x - wl / 2 + dec, y - gap - hl), "b": (x - wl / 2 + dec, y + gap)}[cote]

    def cout(e, bx, by):
        rb = (bx, by, bx + e["wl"], by + e["hl"])
        c = 0
        if bx < x0 + 6 or by < y0 + 6 or bx + e["wl"] > x1 - 6 or by + e["hl"] > y1 - 6:
            c += 1000
        for q in pose:
            if _boites_chevauchent(rb, q, 10):
                c += 500
        for (px, py, pr) in obstacles_pts:
            cx_, cy_ = clamp(px, rb[0], rb[2]), clamp(py, rb[1], rb[3])
            if math.hypot(px - cx_, py - cy_) < pr + 8:
                c += 400
        for a, b in segs:
            if _seg_boite(a, b, rb):
                c += 3
        return c
    ordre = sorted(eti, key=lambda e: (not e["hub"], e["y"]))
    for e in ordre:
        cand = []
        for cote in [e["cote"]] + [c for c in ("d", "g", "h", "b") if c != e["cote"]]:
            for dec in (0, -30, 30, -60, 60, -90, 90):
                bx, by = boite(e, cote, dec)
                cand.append((cout(e, bx, by) + (0 if cote == e["cote"] else 2) + abs(dec) / 60, bx, by))
        _, bx, by = min(cand)
        e["lx"], e["ly"] = bx, by
        pose.append((bx, by, bx + e["wl"], by + e["hl"]))
    # noms des régions : à la position donnée, sinon à la position libre la plus proche
    if noms_zones:
        for nom, (lon, lat) in noms_zones.items():
            x, y = proj(lon, lat)
            t_ = nom.upper()
            wn = largeur(t_, td, 700, espacement=3) + 8
            hn = td * 1.2
            best = None
            for dx in (0, -60, 60, -120, 120, -180, 180):
                for dy in (0, -36, 36, -72, 72):
                    rb = (x + dx - wn / 2, y + dy - hn / 2, x + dx + wn / 2, y + dy + hn / 2)
                    c = 0
                    if rb[0] < x0 + 8 or rb[2] > x1 - 8 or rb[1] < y0 + 8 or rb[3] > y1 - 8:
                        c += 1000
                    for q in pose:
                        if _boites_chevauchent(rb, q, 8):
                            c += 500
                    for a, b in segs:
                        if _seg_boite(a, b, (rb[0] - 4, rb[1] - 4, rb[2] + 4, rb[3] + 4)):
                            c += 300
                    for (px, py, pr) in obstacles_pts:
                        cx_, cy_ = clamp(px, rb[0], rb[2]), clamp(py, rb[1], rb[3])
                        if math.hypot(px - cx_, py - cy_) < pr + 8:
                            c += 300
                    c += math.hypot(dx, dy) / 40
                    if best is None or c < best[0]:
                        best = (c, x + dx, y + dy)
            _, xn, yn = best
            if best[0] < 1000:
                f_ = "#DCE4EE" if nom in en_avant else gris
                s.add(texte_seul(xn, yn + td * 0.36, t_, td, 700, th.c["structure"] if nom in en_avant else th.c["encre_3"],
                                 "middle", "texte", fond=f_, espacement=3))
            else:
                raise Deborde(f"carte : nom de région {nom!r} sans place libre")
    fond_c = th.c["surface"]
    for e in eti:
        lx, ly, wl, hl = e["lx"], e["ly"], e["wl"], e["hl"]
        R = th.role("or")
        f_ = R.fonce if e["hub"] else fond_c
        ct = R.sur_fonce if e["hub"] else th.c["encre"]
        cd = th.c["clair_sur_structure"] if e["hub"] else th.c["encre_2"]
        _zone_cadre(lx, ly, wl, hl, True, "etiquette")
        s.add(rect(lx, ly, wl, hl, f_, 3, None if e["hub"] else th.c["filet_fort"], 0 if e["hub"] else 1.4))
        bb = nouveau_bloc()
        s.add(texte(lx + 16, ly + 11 + tl * 0.92, e["lab"], tl, 700, ct, "start", bloc=bb, fond=f_))
        if e["det"]:
            s.add(texte_seul(lx + 16, ly + 11 + tl * 1.25 + td * 0.95, e["det"], td, 400, cd, "start", fond=f_))
    for e in eti:
        x, y, r = e["x"], e["y"], e["r"]
        if e["hub"]:
            R = th.role("or")
            point(x, y, r, "site")
            s.add(rect(x - r - 4, y - r - 4, 2 * r + 8, 2 * r + 8, th.c["fond_schema"], 6))
            s.add(rect(x - r, y - r, 2 * r, 2 * r, R.fonce, 4))
            s.add(picto_brut("batiment", x, y, r * 1.35, R.sur_fonce))
        else:
            s.add(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r + 4:.1f}" fill="{th.c["fond_schema"]}"/>')
            s.add(disque(x, y, r, th.c["structure"], type_="site"))
    return s


def picto_brut(nom, cx, cy, taille, couleur):
    from .pictos import picto
    return picto(nom, cx, cy, taille, couleur, "bold")


def anneaux_delais(centre, sites, paliers, unite="min"):
    """Sites placés selon leur direction réelle depuis le centre, sur l'anneau de leur délai ; chaque étiquette
    est posée à l'extérieur de son point (jamais dessus)."""
    s, W, H = _toile()
    th = T()
    pal = P()
    place = _place(H)
    hb = bandeau(0, 0, W - 2 * MX, 999, "or", centre["nom"], [centre.get("detail")] if centre.get("detail") else (),
                 "batiment", mesure=True)
    zone_a = place - hb - 40
    cx, cy = W / 2, MY + hb + 40 + zone_a / 2
    rmax = min(W / 2 - MX - 150, zone_a / 2 - 40)
    rs = {v: rmax * (i + 1) / len(paliers) for i, v in enumerate(sorted(paliers))}
    Rb = th.role("or")
    teintes = [Rb.clair, "#F3F6FA", th.c["fond_schema"]]
    for i, v in enumerate(sorted(paliers, reverse=True)):
        s.add(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{rs[v]:.1f}" fill="{teintes[i % 3]}" stroke="{th.c["structure"]}" '
              f'stroke-width="2" stroke-dasharray="10 8"/>')
    decor(cx - rmax, cy - rmax, cx + rmax, cy + rmax, "anneaux")
    lat0, lon0 = centre["lat"], centre["lon"]
    k = math.cos(math.radians(lat0))
    places = []
    for st in sites:
        ang = math.degrees(math.atan2((st["lon"] - lon0) * k, st["lat"] - lat0)) % 360
        places.append([st, ang])
    for v in paliers:
        grp = [pl for pl in places if pl[0]["delai"] == v]
        for _ in range(300):
            grp.sort(key=lambda pl: pl[1])
            m = len(grp)
            bouge = False
            for i in range(m if m > 2 else m - 1):
                a_, b_ = grp[i], grp[(i + 1) % m]
                d = (b_[1] - a_[1]) % 360
                if d < 60:
                    a_[1] -= (60 - d) / 2
                    b_[1] += (60 - d) / 2
                    bouge = True
            if not bouge:
                break
    for st, ang in places:
        px, py = pt(cx, cy, rs[st["delai"]], ang)
        s.add(trait([(cx, cy), (px, py)], 2.6, False, th.c["structure"], type_="liaison"))
    tl = pal["texte"]
    poses = []
    for v in paliers:
        _, lw_, lh_ = etiquette_dim(f"{v:g} {unite}")
        poses.append((cx - lw_ / 2, cy - rs[v] - lh_ / 2, cx + lw_ / 2, cy - rs[v] + lh_ / 2))
    etis = []
    for st, ang in places:
        px, py = pt(cx, cy, rs[st["delai"]], ang)
        wl = largeur(st["nom"], tl, 700) + 30
        hl = tl * 1.25 + 22
        # à l'extérieur du point, dans la direction de l'anneau
        a = math.radians(ang)
        ux, uy = math.sin(a), -math.cos(a)
        best = None
        for dist in (26, 40, 60, 80):
            for dd in (0, 20, -20, 40, -40):
                bx = px + ux * dist - wl / 2 + ux * wl / 2 + dd * (-uy)
                by = py + uy * dist - hl / 2 + uy * hl / 2 + dd * ux
                rb = (bx, by, bx + wl, by + hl)
                c = 0
                if bx < MX or by < MY + hb + 8 or bx + wl > W - MX or by + hl > H - MY:
                    c += 1000
                cx_, cy_ = clamp(px, rb[0], rb[2]), clamp(py, rb[1], rb[3])
                if math.hypot(px - cx_, py - cy_) < 13 + 8:
                    c += 500
                for q in poses:
                    if _boites_chevauchent(rb, q, 10):
                        c += 400
                c += dist / 40 + abs(dd) / 40
                if best is None or c < best[0]:
                    best = (c, bx, by)
        _, bx, by = best
        poses.append((bx, by, bx + wl, by + hl))
        etis.append((st, px, py, bx, by, wl, hl))
    for v in sorted(paliers, reverse=True):
        s.add(etiquette(cx, cy - rs[v], f"{v:g} {unite}", "or"))
    fond_c = th.c["surface"]
    for st, px, py, bx, by, wl, hl in etis:
        zone(bx, by, wl, hl, True, "etiquette")
        s.add(rect(bx, by, wl, hl, fond_c, 3, th.c["filet_fort"], 1.4))
        s.add(texte_seul(bx + 15, by + 11 + tl * 0.92, st["nom"], tl, 700, th.c["encre"], "start", fond=fond_c))
    for st, px, py, bx, by, wl, hl in etis:
        s.add(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="17" fill="{th.c["fond_schema"]}"/>')
        s.add(disque(px, py, 13, th.c["structure"], type_="site"))
    Ro = th.role("or")
    s.add(rect(cx - 44, cy - 44, 88, 88, th.c["fond_schema"], 6))
    s.add(rect(cx - 38, cy - 38, 76, 76, Ro.fonce, 4))
    point(cx, cy, 38, "site")
    s.add(picto_brut("batiment", cx, cy, 48, Ro.sur_fonce))
    s.add(bandeau(MX, MY, W - 2 * MX, hb, "or", centre["nom"], [centre.get("detail")] if centre.get("detail") else (),
                  "batiment"))
    return s


# ── Plan de ronde ────────────────────────────────────────────────────────────
def plan_ronde(legende):
    """Plan du site en grand (bâtiments, circuit marine fléché, pointeaux numérotés, poste de départ) ; légende
    en cartes au-dessous, avec les MÊMES symboles que le plan."""
    s, W, H = _toile()
    th = T()
    pal = P()
    k_ = (W - 2 * MX) / 720
    ox, oy = MX - 40 * k_, MY - 30 * k_
    P_ = lambda x, y: (ox + x * k_, oy + y * k_)  # noqa: E731
    x, y = P_(50, 40)
    s.add(rect(x, y, 700 * k_, 580 * k_, "#F6F8FB", 6, th.c["filet_fort"], 2.5, ' stroke-dasharray="14 9"'))
    decor(x, y, x + 700 * k_, y + 580 * k_, "plan")
    bat = [(80, 70, 300, 170, "BÂTIMENT A"), (460, 70, 250, 130, "BÂTIMENT B"), (80, 340, 220, 190, "PARKING"),
           (390, 300, 320, 230, "BÂTIMENT C")]
    Rs = th.role("sable")
    for bx, by, bw, bh, nom in bat:
        x, y = P_(bx, by)
        s.add(rect(x, y, bw * k_, bh * k_, Rs.clair, 4, "#B9C7D8", 1.5))
        s.add(texte_seul(x + bw * k_ / 2, y + bh * k_ / 2 + pal["etiquette"] * 0.36, nom, pal["etiquette"], 700,
                         Rs.fonce, "middle", "texte", fond=Rs.clair, espacement=2.5))
    route = [(735, 600), (735, 262), (400, 262), (400, 55), (65, 55), (65, 290), (330, 290), (330, 600), (735, 600)]
    s.add(fil([P_(*p) for p in route], ep=7))
    pts_m = [(735, 430), (570, 262), (400, 150), (230, 55), (65, 180), (200, 290), (330, 450), (530, 600)]
    for (ax, ay), (bx2, by2) in zip(route[:-1], route[1:]):
        (xa, ya), (xb, yb) = P_(ax, ay), P_(bx2, by2)
        lg = math.hypot(xb - xa, yb - ya)
        if lg < 140:
            continue
        pos = None
        for f in (0.28, 0.72, 0.4, 0.6, 0.2, 0.8):
            cx_, cy_ = xa + (xb - xa) * f, ya + (yb - ya) * f
            if all(math.hypot(cx_ - P_(qx, qy)[0], cy_ - P_(qx, qy)[1]) > 60 for qx, qy in pts_m):
                pos = (cx_, cy_)
                break
        if pos is None:
            continue
        mx_, my_ = pos
        ang = math.atan2(yb - ya, xb - xa)
        ca_, sa_ = math.cos(ang), math.sin(ang)
        tq = 15
        pa = (mx_ + ca_ * tq, my_ + sa_ * tq)
        pb = (mx_ - ca_ * tq * 0.7 - sa_ * tq * 0.85, my_ - sa_ * tq * 0.7 + ca_ * tq * 0.85)
        pc = (mx_ - ca_ * tq * 0.7 + sa_ * tq * 0.85, my_ - sa_ * tq * 0.7 - ca_ * tq * 0.85)
        s.add(f'<path d="M{pa[0]:.1f},{pa[1]:.1f} L{pb[0]:.1f},{pb[1]:.1f} L{pc[0]:.1f},{pc[1]:.1f} Z" '
              f'fill="{th.c["structure"]}" stroke="#FFFFFF" stroke-width="2.5" stroke-linejoin="round"/>')
    for i, (px, py) in enumerate(pts_m):
        x, y = P_(px, py)
        s.add(disque(x, y, pal["numero"] * 1.05 + 6, th.c["fond_schema"]))
        s.add(numero(x, y, str(i + 1)))
    x, y = P_(735, 600)
    Rso = th.role("sombre")
    s.add(rect(x - 34, y - 34, 68, 68, th.c["fond_schema"], 6))
    s.add(rect(x - 29, y - 29, 58, 58, Rso.fonce, 4))
    point(x, y, 29, "poste")
    s.add(picto_brut("personne", x, y, 38, Rso.sur_fonce))
    y_plan = P_(0, 620)[1]
    kk = len(legende)
    ncol = 2
    gx, gy = 26, 24
    cw = (W - 2 * MX - gx) / 2
    rows = math.ceil(kk / ncol)
    zone_h = H - MY - (y_plan + 30)
    cs = []
    for it in legende:
        c = _carte_dict(it, cw, "h", "creme")
        c["icone"] = None                        # le symbole du plan remplace le pictogramme
        c["symbole"] = _symbole_plan(it)
        cs.append(c)
    hs = [besoin(dict(c, titre=c["titre"]), cw - 110) for c in cs]
    h2 = max(hs)
    if rows * h2 + (rows - 1) * gy > zone_h:
        raise Deborde("plan de ronde")
    yl = y_plan + 30 + (zone_h - (rows * h2 + (rows - 1) * gy)) / 2
    for i, c in enumerate(cs):
        r, cc = divmod(i, ncol)
        xc, yc = MX + cc * (cw + gx), yl + r * (h2 + gy)
        decor(xc, yc, xc + 110, yc + h2, "symbole")
        s.add(rect(xc, yc, 110, h2, th.c["carte_fond"], th.carte["rayon"]))
        s.add(_dessiner_symbole(c["symbole"], xc + 55, yc + h2 / 2, _it(legende[i], "role", "creme")))
        cc_ = {k: v for k, v in c.items() if k != "symbole"}
        s.add(carte(xc + 112, yc, cw - 112, h2, **_kw(cc_)))
    return s


def _symbole_plan(it):
    ic = _it(it, "icone")
    return {"lieu": "pointeau", "route": "circuit", "personne": "poste"}.get(ic, ic or "aucun")


def _dessiner_symbole(sym, cx, cy, role):
    th = T()
    pal = P()
    if sym == "pointeau":            # même disque que sur le plan (sans chiffre : aucun texte ajouté)
        point(cx, cy, pal["numero"] * 1.05, "symbole")
        return (f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{pal["numero"] * 1.05:.1f}" fill="{th.c["structure"]}"/>'
                f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{pal["numero"] * 0.38:.1f}" fill="#FFFFFF"/>')
    if sym == "circuit":             # même trait fléché que le plan
        return trait([(cx - 36, cy), (cx + 36, cy)], 7, True, th.c["structure"], taille=22, type_="symbole")
    if sym == "poste":               # même carré marine que le poste de départ
        point(cx, cy, 29, "symbole")
        return rect(cx - 29, cy - 29, 58, 58, th.role("sombre").fonce, 4) + picto_brut("personne", cx, cy, 38, "#FFFFFF")
    if sym == "aucun":
        return ""
    return plaque(cx - 34, cy - 34, 68, sym, role)


# ── Schéma composé : continuité de service 24/7 (II-ABS-01) ──────────────────
def continuite_24_7():
    """L'anneau jour / nuit sans poste vide, réduit (40 % de la largeur) et entouré d'un arc fléché continu ;
    puis la procédure en trois temps, de haut en bas sur le fil marine, chaque délai composé en chiffre clé en
    tête d'étape. Mêmes textes que l'original."""
    s, W, H = _toile()
    th = T()
    pal = P()
    place = _place(H)
    Rs = th.role("or")
    etapes = [("sable", "Prise de service", "15 minutes avant la vacation, auprès du responsable de site", "horloge",
               "15 minutes"),
              ("rouge", "Pas de prise de service", "10 minutes avant : l'agent d'astreinte est mobilisé", "alerte",
               "10 minutes"),
              ("orange", "Agent d'astreinte", "Sur site en 60 minutes maximum", "voiture", "60 minutes")]
    ro = 0.37 * (W - 2 * MX) / 2
    ri = ro * 0.62
    rf = ro + 22
    wc = W - 2 * MX
    tl = pal["etiquette"]
    w_lab = largeur("PRISE DE", tl, 700, espacement=1.5) + 20
    x_f = MX + pal["numero"] * 1.05 + 2
    x_c = x_f + pal["numero"] * 1.05 + 30
    wcc = W - MX - x_c
    ws = pal["plaque"] * 1.45
    hs, Ps = [], []
    for role, tt, cc, ic, cle in etapes:
        Pt = preparer(tt, (), wcc - ws - 2 * pal["pad"], pal["carte"], pal["texte"])
        PK = preparer_cle(cc, cle, wcc - ws - 2 * pal["pad"], pal["texte"], pal["chiffre_moyen"])
        if Pt is None or PK is None:
            raise Deborde("24/7")
        Ps.append((Pt, PK))
        hs.append(Pt["total"] + 0.45 * pal["texte"] + PK["total"] + 2 * pal["pad"])
    hc = max(hs)
    g_e = 36
    h_anneau = 2 * rf + 30
    tot = h_anneau + 56 + 3 * hc + 2 * g_e
    if tot > place:
        raise Deborde("24/7")
    reste = _rempli() * place - tot
    hc += min(reste * 0.25, 60) if reste > 0 else 0
    g_e += min(reste * 0.2, 50) if reste > 0 else 0
    tot = h_anneau + 56 + 3 * hc + 2 * g_e
    y0 = _y0(place, tot)
    cx, cy = W / 2, y0 + rf + 15
    jour, nuit = Rs.clair, th.c["structure"]
    # deux demi-anneaux jointifs (aucun coin blanc) : 270° → 90° par le haut (jour), 90° → 270° par le bas (nuit)
    s.add(secteur(cx, cy, ri, ro, 270.0001, 449.9999, jour))
    s.add(secteur(cx, cy, ri, ro, 90, 270, nuit))
    decor(cx - rf, cy - rf, cx + rf, cy + rf, "anneau")
    # arc fléché continu autour de l'anneau (sens des aiguilles d'une montre)
    for a0, a1 in ((276, 444), (96, 264)):
        pts = [pt(cx, cy, rf, a0 + (a1 - a0) * k / 40) for k in range(41)]
        s.add(trait(pts, 4, True, th.c["structure"], taille=18, type_="cycle"))
    b1 = nouveau_bloc()
    tv = pal["etiquette"]
    s.add(texte(cx, cy - (ri + ro) / 2 - tv * 0.15, "VACATION", tv, 700, th.c["structure"], "middle", "texte", bloc=b1,
                fond=jour, espacement=1.5),
          texte(cx, cy - (ri + ro) / 2 + tv * 1.05, "DE JOUR", tv, 700, th.c["structure"], "middle", "texte", bloc=b1,
                fond=jour, espacement=1.5))
    b2 = nouveau_bloc()
    s.add(texte(cx, cy + (ri + ro) / 2 - tv * 0.15, "VACATION", tv, 700, "#FFFFFF", "middle", "texte", bloc=b2, fond=nuit,
                espacement=1.5),
          texte(cx, cy + (ri + ro) / 2 + tv * 1.05, "DE NUIT", tv, 700, "#FFFFFF", "middle", "texte", bloc=b2, fond=nuit,
                espacement=1.5))
    for a, cote in ((90, 1), (270, -1)):
        px, py = pt(cx, cy, rf, a)
        s.add(disque(px, py, 13, th.c["structure"], th.c["fond_schema"], 5, type_="jalon"))
        bb = nouveau_bloc()
        xl = px + cote * 26
        s.add(texte(xl, py - 4, "PRISE DE", tl, 700, th.c["encre"], "start" if cote > 0 else "end", "texte", bloc=bb,
                    espacement=1.5),
              texte(xl, py + tl * 1.05, "SERVICE", tl, 700, th.c["encre"], "start" if cote > 0 else "end", "texte",
                    bloc=bb, espacement=1.5))
    rc = ri - 14
    s.add(disque(cx, cy, rc, th.c["fond_schema"]))
    s.add(chiffre_cle(cx, cy + pal["chiffre_moyen"] * 0.30, "24/7", pal["chiffre_moyen"], "middle",
                      fond=th.c["fond_schema"], couleur=th.c["structure"]))
    s.add(texte_seul(cx, cy + pal["chiffre_moyen"] * 0.30 + pal["texte"] * 1.3, "sans poste vide", pal["texte"], 500,
                     th.c["encre_2"], "middle", fond=th.c["fond_schema"]))
    yy = cy + rf + 15 + 56
    ys = [yy + i * (hc + g_e) for i in range(3)]
    s.add(fil([(x_f, ys[0] + hc / 2), (x_f, ys[-1] + hc / 2)]))
    fond = th.c["carte_fond"]
    for i, ((role, tt, cc, ic, cle), (Pt, PK)) in enumerate(zip(etapes, Ps)):
        R = th.role(role)
        y = ys[i]
        if i:
            s.add(chevron_bas(x_f, y + hc / 2 - pal["numero"] * 1.05 - 16, 20))
        s.add(fil([(x_f + pal["numero"], y + hc / 2), (x_c, y + hc / 2)], ep=th.fil["epaisseur"] * 0.7))
        zone(x_c, y, wcc, hc, True, "carte")
        s.add(rect(x_c, y, wcc, hc, fond, th.carte["rayon"]))
        s.add(f'<path d="{chemin_arrondi(x_c, y, ws, hc, th.carte["rayon"], 0, 0, th.carte["rayon"])}" fill="{R.fonce}"/>')
        s.add(glyphe(ic, x_c + ws / 2, y + hc / 2, ws * 0.52, R.sur_fonce, libelle=tt))
        xt = x_c + ws + pal["pad"]
        hcont = Pt["total"] + 0.30 * pal["texte"] + PK["total"]
        yt = y + (hc - hcont) / 2
        s.add(dessiner(xt, yt, wcc - ws - 2 * pal["pad"], Pt["total"], Pt, "start", fond=fond))
        s.add(dessiner_cle(xt, yt + Pt["total"] + 0.30 * pal["texte"], PK, th.c["encre_2"], fond))
        s.add(disque(x_f, y + hc / 2, pal["numero"] * 1.05 + 5, th.c["fond_schema"]))
        point(x_f, y + hc / 2, pal["numero"] * 1.05, "jalon")
        s.add(f'<circle cx="{x_f:.1f}" cy="{y + hc / 2:.1f}" r="{pal["numero"] * 0.55:.1f}" fill="{th.c["structure"]}"/>')
    return s


# ── Process du bloc 1 : « vous → nous → résultat » ───────────────────────────
def process_besoin(etapes):
    """Le process du bloc 1 en miroir : à gauche ce que vous demandez (votre besoin, vos enjeux), à droite notre
    réponse en regard (notre dispositif, notre pilotage), puis les deux colonnes convergent vers le résultat,
    panneau plein vert. Les étapes sont numérotées dans l'ordre de lecture."""
    s, W, H = _toile()
    th = T()
    pal = P()
    place = _place(H)
    wc = W - 2 * MX
    g_m = 96                              # entre les deux colonnes (flèches « → »)
    cw = (wc - g_m) / 2
    # pictogrammes de la planche validée quand la spécification n'en donne pas (le bâtiment du client, la cible des
    # enjeux, l'équipe, le contrôle, le bouclier du résultat) : forme seulement, aucun texte ajouté
    defaut = ("batiment", "cible", "groupe", "check", "bouclier")
    e = [dict(x, icone=_it(x, "icone") or defaut[i]) if isinstance(x, dict) else x for i, x in enumerate(etapes)]
    cs = []
    for i in range(4):
        c = _carte_dict(e[i], cw, "v", "sable", num=None)
        c["role"] = "creme" if i < 2 else "or"         # vous : ardoise ; nous : marine
        cs.append(c)
    fin = _carte_dict(e[4], wc * 0.78, "h", "vert", plein=True)
    fin["role"] = "vert"
    rn = pal["numero"] * 1.05
    for k in (1.0, 1.15, 1.3):
        for c in cs:
            c["s_plaque"] = pal["plaque"] * k
        h1 = max(besoin(cs[0]), besoin(cs[2]))
        h2 = max(besoin(cs[1]), besoin(cs[3]))
        hf = besoin(fin)
        tot = 2 * rn + 20 + h1 + 90 + h2 + 150 + hf
        if tot > 0.86 * place and k > 1.0:
            for c in cs:
                c["s_plaque"] = pal["plaque"] * k0
            h1 = max(besoin(cs[0]), besoin(cs[2]))
            h2 = max(besoin(cs[1]), besoin(cs[3]))
            break
        k0 = k
    hf = besoin(fin)
    g_r = 90
    g_f = 150
    tot = 2 * rn + 20 + h1 + g_r + h2 + g_f + hf
    if tot > place:
        raise Deborde("process du bloc 1")
    reste = _rempli() * place - tot
    if reste > 0:
        g_r += min(reste * 0.3, 60)
        g_f += min(reste * 0.3, 60)
        h1 += min(reste * 0.15, 40)
        h2 += min(reste * 0.15, 40)
    tot = 2 * rn + 20 + h1 + g_r + h2 + g_f + hf
    y = _y0(place, tot)
    xg, xd = MX, MX + cw + g_m
    yr1 = y + 2 * rn + 20
    yr2 = yr1 + h1 + g_r
    yf = yr2 + h2 + g_f
    xf = W / 2 - fin["w"] / 2
    # convergence des deux colonnes vers le résultat
    yb = yr2 + h2
    ym = yb + g_f * 0.45
    for xc_ in (xg + cw / 2, xd + cw / 2):
        s.add(fil([(xc_, yb + 2), (xc_, ym), (W / 2, ym)], ep=6))
    s.add(fil([(W / 2, ym), (W / 2, yf - 2)], pointe=True, ep=6, taille=24))
    # numéros dans l'ordre de lecture : 01 besoin, 02 enjeux, 03 dispositif, 04 pilotage, 05 résultat
    pos = [(xg, yr1, h1), (xg, yr2, h2), (xd, yr1, h1), (xd, yr2, h2)]
    for i, (c, (x, yy, hh)) in enumerate(zip(cs, pos)):
        s.add(carte(x, yy, cw, hh, **_kw(c)))
        s.add(numero(x + rn, yy - rn - 10, f"{i + 1:02d}"))
    # « → » : chaque élément de votre demande trouve sa réponse en regard
    for yy, hh in ((yr1, h1), (yr2, h2)):
        s.add(fleche(xg + cw + 14, yy + hh / 2, xd - 14, yy + hh / 2, ep=6, couleur=th.c["structure"], taille=22))
    s.add(carte(xf, yf, fin["w"], hf, **_kw(fin)))
    s.add(numero(xf + rn, yf - rn - 10, "05"))
    return s


COMPOSES = {"II-ABS-01": continuite_24_7}


# ── Gabarits des schémas « spec » rédigés pour un appel d'offres (absents de la bibliothèque) ─────────────────
# Matrice, répartition, histogramme, évolution et taux, dans le vocabulaire v3 : en-têtes en panneau marine, rôles
# en touches (au plus 2), chiffres clés en orange « signal », échelle typographique du palier, filets neutres.
# Mêmes noms et mêmes paramètres que moteur_page (rendu_schemas.construire) ; aucun texte ajouté ni modifié.
def _num_v3(v):
    return f"{v:g}".replace(".", ",")


def _axe_v3(maxi):
    brut = maxi / 4
    mag = 10 ** math.floor(math.log10(brut)) if brut > 0 else 1
    pas = next(m * mag for m in (1, 2, 2.5, 5, 10) if m * mag >= brut)
    return pas, pas * math.ceil(maxi / pas)


def _note_v3(note, wc):
    """Note sous le schéma (texte de la spécification, à l'encre secondaire)."""
    if not note:
        return None, 0
    Pn = preparer(None, [note], wc - 40, P()["carte"], P()["texte"])
    if Pn is None:
        raise Deborde(f"note : {note!r}")
    return Pn, Pn["total"] + 44


def _graduations(s, x0, x1, y_haut, y_bas, top, pas, unite):
    """Graduations horizontales (filets neutres) et valeurs à gauche ; renvoie la projection des valeurs."""
    th = T()
    pal = P()
    Y = lambda v: y_bas - (y_bas - y_haut) * v / top  # noqa: E731
    v = 0
    while v <= top + 1e-9:
        y = Y(v)
        s.add(rect(x0, y - (1.2 if v == 0 else 0.7), x1 - x0, 2.4 if v == 0 else 1.4,
                   th.c["structure"] if v == 0 else th.c["filet"], 0))
        decor(x0, y - 1.2, x1, y + 1.2, "axe")
        s.add(texte_seul(x0 - 16, y + pal["etiquette"] * 0.36, _num_v3(v), pal["etiquette"], 500, th.c["encre_3"], "end"))
        v += pas
    if unite:
        s.add(texte_seul(MX, y_haut - pal["etiquette"] * 1.6, unite, pal["etiquette"], 600, th.c["encre_2"], "start"))
    return Y


def matrice(lignes, colonnes, cellules, role_col="sable", role_lig="creme"):
    """Tableau à double entrée : en-têtes de colonnes en panneau marine, libellés de lignes en cartes à colonne de
    rôle, cases claires (texte, ou coche verte pour « ✓ »)."""
    s, W, H = _toile()
    th = T()
    pal = P()
    nl, nc = len(lignes), len(colonnes)
    wc = W - 2 * MX
    g = 14
    wl = 300 if nc <= 3 else 250
    wcol = (wc - wl - nc * g) / nc
    place = _place(H)
    tit = lambda c: _it(c, "titre", c if isinstance(c, str) else None)  # noqa: E731
    ht = max(_tete_colonne(0, 0, wcol, 999, _it(c, "role", role_col), tit(c), _it(c, "texte"), None, mesure=True)
             for c in colonnes)
    libs = [_carte_dict({"titre": tit(l), "texte": _it(l, "texte"), "role": _it(l, "role", role_lig)}, wl, "h", role_lig)
            for l in lignes]
    pad = pal["pad"] * 0.6
    Ps = [[None if (not v or v == "✓") else preparer(None, [str(v)], wcol - 2 * pad, pal["carte"], pal["texte"])
           for v in row] for row in cellules]
    if any(P_ is None and v and v != "✓" for row, prow in zip(cellules, Ps) for v, P_ in zip(row, prow)):
        raise Deborde("matrice : texte de case trop long")
    sc = pal["texte"] * 1.6
    hs = []
    for c, prow in zip(libs, Ps):
        hs.append(max([besoin(c)] + [P_["total"] + 2 * pad for P_ in prow if P_] + [sc + 2 * pad]))
    if ht + g + sum(hs) + (nl - 1) * g > place:
        raise Deborde("matrice")
    hs, g_r = _repartir(hs, g, place - ht - g, gap_max=g * 2.2, k_max=1.35)
    tot = ht + g + sum(hs) + (nl - 1) * g_r
    y0 = _y0(place, tot)
    for j, c in enumerate(colonnes):
        s.add(_tete_colonne(MX + wl + g + j * (wcol + g), y0, wcol, ht, _it(c, "role", role_col), tit(c), _it(c, "texte"),
                            None))
    fond_c = th.c["surface_2"]
    y = y0 + ht + g
    for i, c in enumerate(libs):
        s.add(carte(MX, y, wl, hs[i], **_kw(c)))
        for j in range(nc):
            x = MX + wl + g + j * (wcol + g)
            zone(x, y, wcol, hs[i], True, "carte")
            s.add(rect(x, y, wcol, hs[i], fond_c, th.carte["rayon"]))
            v = cellules[i][j]
            if v == "✓":
                s.add(coche(x + wcol / 2, y + hs[i] / 2, sc, "vert"))
            elif v:
                s.add(dessiner(x + pad, y, wcol - 2 * pad, hs[i], Ps[i][j], "middle", th.c["encre"], v_align="middle",
                               fond=fond_c))
        y += hs[i] + g_r
    return s


def camembert(parts, centre=None, anneau=True, cx=340, r=230, decimales=0, total_affiche=None):
    """Répartition : anneau en haut de page, parts en dégradé du marine au bleu acier (séparées par un filet blanc),
    pourcentage dans chaque part assez large ; puis une ligne par part (chiffre en orange « signal », libellé)."""
    s, W, H = _toile()
    th = T()
    pal = P()
    wc = W - 2 * MX
    k = len(parts)
    tot = sum(p["valeur"] for p in parts)
    place = _place(H)
    couleurs = _degrade(k)
    vals = [_num_v3(p["valeur"]) for p in parts]
    tv = pal["chiffre_moyen"]
    w_val = max(largeur(v, tv, 700, "chiffres") for v in vals) + 30
    pad = pal["pad"]
    xt = 10 + pad + w_val
    Pl = [preparer(p["label"], [p["detail"]] if p.get("detail") else (), wc - xt - pad, pal["carte"], pal["texte"])
          for p in parts]
    if any(P_ is None for P_ in Pl):
        raise Deborde("camembert : libellé")
    hv = max(max(P_["total"] for P_ in Pl), tv) + 2 * pad
    g = 18
    h_leg = k * hv + (k - 1) * g
    Ro = min(300, (place - 70 - h_leg) / 2)
    if Ro < 170:
        raise Deborde("camembert : trop de parts pour la page")
    Ri = Ro * 0.56 if anneau else 0
    reste = _rempli() * place - (2 * Ro + 70 + h_leg)
    g_c = 70 + (max(0.0, reste) * 0.5 if reste > 0 else 0)
    if reste > 0:
        hv += reste * 0.5 / k
    h_leg = k * hv + (k - 1) * g
    tot_h = 2 * Ro + g_c + h_leg
    ytop = _y0(place, tot_h)
    cxp, cyp = W / 2, ytop + Ro
    a = 0.0
    arcs = []
    for p, f_ in zip(parts, couleurs):
        da = 360 * p["valeur"] / tot
        arcs.append((a, a + da, p, f_))
        a += da
    for a0, a1, p, f_ in arcs:
        s.add(secteur(cxp, cyp, Ri, Ro, a0, a1 - 0.001 if a1 - a0 >= 359.99 else a1, f_, th.c["fond_schema"], 5))
    decor(cxp - Ro, cyp - Ro, cxp + Ro, cyp + Ro, "anneau")
    for a0, a1, p, f_ in arcs:
        if a1 - a0 > 24:
            pct = 100 * p["valeur"] / tot
            tx, ty = pt(cxp, cyp, (Ri + Ro) / 2 if anneau else Ro * 0.62, (a0 + a1) / 2)
            s.add(texte_seul(tx, ty + pal["carte"] * 0.36, f"{pct:.{decimales}f} %".replace(".", ","), pal["carte"], 700,
                             "#FFFFFF", "middle", "chiffres", fond=f_))
    if anneau and centre:
        tc, sous = centre if isinstance(centre, (tuple, list)) else (centre, None)
        fc = th.c["surface_2"]
        s.add(disque(cxp, cyp, Ri - 14, fc))
        wi = (Ri - 14) * 1.4
        Pc = preparer(tc, [sous] if sous else (), wi, pal["panneau"], pal["texte"])
        if Pc is None or Pc["total"] > (Ri - 14) * 1.3:
            raise Deborde("camembert : centre")
        s.add(dessiner(cxp - wi / 2, cyp - Pc["total"] / 2, wi, Pc["total"], Pc, "middle", th.c["encre_2"],
                       th.c["structure"], fond=fc))
    y = ytop + 2 * Ro + g_c
    fond_c = th.c["carte_fond"]
    for p, P_, v, f_ in zip(parts, Pl, vals, couleurs):
        zone(MX, y, wc, hv, True, "carte")
        s.add(rect(MX, y, wc, hv, fond_c, th.carte["rayon"]))
        s.add(f'<path d="{chemin_arrondi(MX, y, 10, hv, th.carte["rayon"], 0, 0, th.carte["rayon"])}" fill="{f_}"/>')
        s.add(chiffre_cle(MX + 10 + pad, y + hv / 2 + tv * 0.35, v, tv, "start", fond=fond_c))
        s.add(dessiner(MX + xt, y, wc - xt - pad, hv, P_, "start", th.c["encre_2"], v_align="middle", fond=fond_c))
        y += hv + g
    return s


def colonnes(series, unite="", note=None, legende=None):
    """Histogramme : colonnes verticales de la couleur de leur rôle (au plus 2), valeur au-dessus de chaque
    colonne, libellé dessous ; graduations en filets neutres."""
    s, W, H = _toile()
    th = T()
    pal = P()
    n = len(series)
    wc = W - 2 * MX
    groupes = [se.get("valeurs") or [(se["valeur"], se.get("role", "bleu"))] for se in series]
    maxi = max(v for gr in groupes for v, _ in gr)
    pas, top = _axe_v3(maxi)
    x0, x1 = MX + 96, W - MX - 6
    larg = (x1 - x0) / n
    Ps = [preparer(None, [se["label"]], larg - 12, pal["texte"], pal["texte"], t_poids=600) for se in series]
    if any(P_ is None or len(P_["cl"][0]) > 3 for P_ in Ps):
        raise Deborde("colonnes : libellé trop long")
    h_lab = max(P_["total"] for P_ in Ps) + 22
    Pn, h_note = _note_v3(note, wc)
    h_leg = pal["texte"] * 1.6 + 30 if legende else 0
    y_haut = MY + 90
    y_bas = H - MY - h_note - h_leg - h_lab - 10
    if y_bas - y_haut < 300:
        raise Deborde("colonnes")
    Y = _graduations(s, x0, x1, y_haut, y_bas, top, pas, unite)
    for i, (se, gr) in enumerate(zip(series, groupes)):
        kk = len(gr)
        wcl = min(150 if kk == 1 else 90, larg * 0.62 / kk)
        gx = x0 + i * larg + (larg - kk * wcl - (kk - 1) * 12) / 2
        for j, (val, role) in enumerate(gr):
            R = th.role(role)
            x = gx + j * (wcl + 12)
            h = max(y_bas - Y(val), 6)
            s.add(f'<path d="{chemin_arrondi(x, y_bas - h, wcl, h, 4, 4, 0, 0)}" fill="{R.fonce}"/>')
            zone(x, y_bas - h, wcl, h, True, "barre")
            s.add(texte_seul(x + wcl / 2, y_bas - h - 16, _num_v3(val), pal["carte"], 700, th.c["structure"], "middle",
                             "chiffres"))
        s.add(dessiner(x0 + i * larg + 6, y_bas + 18, larg - 12, h_lab - 18, Ps[i], "middle", th.c["encre"], v_align="top"))
    y = y_bas + h_lab + 10
    if legende:
        xl = MX
        for lab, role in legende:
            R = th.role(role)
            s.add(rect(xl, y + 14, 30, 30, R.fonce, 3))
            decor(xl, y + 14, xl + 30, y + 44, "legende")
            s.add(texte_seul(xl + 44, y + 38, lab, pal["texte"], 600, th.c["encre"], "start"))
            xl += 44 + largeur(lab, pal["texte"], 600) + 50
        y += h_leg
    if Pn:
        s.add(dessiner(MX, y + 24, wc - 40, Pn["total"], Pn, "start", th.c["encre_3"]))
    return s


def courbe(etiquettes, series, unite="", note=None):
    """Évolution dans le temps : courbe(s) de la couleur de leur rôle, valeur au-dessus de chaque point, périodes
    dessous ; graduations en filets neutres ; aire claire sous une courbe seule."""
    s, W, H = _toile()
    th = T()
    pal = P()
    n = len(etiquettes)
    wc = W - 2 * MX
    maxi = max(v for se in series for v in se["valeurs"])
    pas, top = _axe_v3(maxi)
    x0, x1 = MX + 110, W - MX - 56
    X = lambda i: x0 + (x1 - x0) * i / max(n - 1, 1)  # noqa: E731
    w_lab = min(200, (x1 - x0) / max(n - 1, 1) - 10)
    Ps = [preparer(None, [e], w_lab, pal["texte"], pal["texte"]) for e in etiquettes]
    if any(P_ is None or len(P_["cl"][0]) > 3 for P_ in Ps):
        raise Deborde("courbe : libellé de période trop long")
    h_lab = max(P_["total"] for P_ in Ps) + 22
    Pn, h_note = _note_v3(note, wc)
    h_leg = pal["texte"] * 1.6 + 30 if len(series) > 1 else 0
    y_haut = MY + 100
    y_bas = H - MY - h_note - h_leg - h_lab - 10
    if y_bas - y_haut < 300:
        raise Deborde("courbe")
    Y = _graduations(s, x0 - 26, x1 + 26, y_haut, y_bas, top, pas, unite)
    for i in range(n):
        s.add(dessiner(X(i) - w_lab / 2, y_bas + 18, w_lab, h_lab - 18, Ps[i], "middle", th.c["encre"], v_align="top"))
    poses = []
    tv = pal["texte"]
    for se in series:
        R = th.role(se.get("role", "bleu"))
        pts = [(X(i), Y(v)) for i, v in enumerate(se["valeurs"])]
        if len(series) == 1:
            aire = (f"M{pts[0][0]:.1f},{y_bas:.1f} " + " ".join(f"L{x:.1f},{y:.1f}" for x, y in pts)
                    + f" L{pts[-1][0]:.1f},{y_bas:.1f} Z")
            s.add(f'<path d="{aire}" fill="{R.clair}"/>')
        s.add(f'<path d="M' + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)
              + f'" fill="none" stroke="{R.fonce}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>')
        decor(min(x for x, _ in pts), min(y for _, y in pts), max(x for x, _ in pts), y_bas, "courbe")
        for (x, y), v in zip(pts, se["valeurs"]):
            s.add(disque(x, y, 13, th.c["fond_schema"]))
            s.add(disque(x, y, 9, R.fonce))
            lab = _num_v3(v)
            yl = y - 26
            wlab = largeur(lab, tv, 700, "chiffres")
            if any(abs(x - px) < (wlab + pw) / 2 + 6 and abs(yl - py) < tv * 1.3 for px, py, pw in poses):
                yl = y + tv * 1.9
            poses.append((x, yl, wlab))
            s.add(texte_seul(x, yl, lab, tv, 700, th.c["structure"], "middle", "chiffres"))
    y = y_bas + h_lab + 10
    if len(series) > 1:
        xl = MX
        for se in series:
            R = th.role(se.get("role", "bleu"))
            s.add(rect(xl, y + 26, 30, 6, R.fonce, 3))
            decor(xl, y + 26, xl + 30, y + 32, "legende")
            s.add(texte_seul(xl + 44, y + 38, se["libelle"], pal["texte"], 600, th.c["encre"], "start"))
            xl += 44 + largeur(se["libelle"], pal["texte"], 600) + 50
        y += h_leg
    if Pn:
        s.add(dessiner(MX, y + 24, wc - 40, Pn["total"], Pn, "start", th.c["encre_3"]))
    return s


def pourcentages(taux, note=None):
    """Taux : une carte par taux, anneau de progression de la couleur du rôle, taux en orange « signal » au centre,
    libellé (titre marine) et texte."""
    s, W, H = _toile()
    th = T()
    pal = P()
    n = len(taux)
    wc = W - 2 * MX
    ncol = 1 if n <= 2 else 2
    gx, gy = 28, 30
    cw = (wc - (ncol - 1) * gx) / ncol
    rows = math.ceil(n / ncol)
    Pn, h_note = _note_v3(note, wc)
    place = _place(H) - h_note
    r = 100
    ep = 26
    pad = pal["pad"] + 4
    w_txt = cw - (2 * r + ep + 3 * pad) if ncol == 1 else cw - 2 * pad
    Ps = [preparer(x["libelle"], [x["texte"]] if x.get("texte") else (), w_txt, pal["carte"], pal["texte"]) for x in taux]
    if any(P_ is None for P_ in Ps):
        raise Deborde("pourcentages")
    if ncol == 1:
        h1 = max(max(2 * r + ep, P_["total"]) + 2 * pad for P_ in Ps)
    else:
        h1 = max(2 * r + ep + 30 + P_["total"] + 2 * pad for P_ in Ps)
    if rows * h1 + (rows - 1) * gy > place:
        raise Deborde("pourcentages")
    hs, gy = _repartir([h1] * rows, gy, place, gap_max=gy * 2.4, k_max=1.4)
    h2 = hs[0]
    tot = rows * h2 + (rows - 1) * gy
    y0 = _y0(_place(H), tot + h_note)
    fond_c = th.c["carte_fond"]
    for i, (x_, P_) in enumerate(zip(taux, Ps)):
        rr, cc = divmod(i, ncol)
        dans = min(ncol, n - rr * ncol)
        x = MX + cc * (cw + gx) if dans == ncol else (W - cw) / 2
        y = y0 + rr * (h2 + gy)
        R = th.role(x_.get("role", "vert"))
        zone(x, y, cw, h2, True, "carte")
        s.add(rect(x, y, cw, h2, fond_c, th.carte["rayon"]))
        if ncol == 1:
            cx, cy = x + pad + r + ep / 2, y + h2 / 2
        else:
            bloc_h = 2 * r + ep + 30 + P_["total"]
            cx, cy = x + cw / 2, y + (h2 - bloc_h) / 2 + r + ep / 2
        s.add(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="none" stroke="{th.c["filet"]}" stroke-width="{ep}"/>')
        v = max(0.0, min(100.0, x_["valeur"]))
        if v >= 99.999:
            s.add(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="none" stroke="{R.fonce}" stroke-width="{ep}"/>')
        elif v > 0:
            ax, ay = pt(cx, cy, r, 360 * v / 100)
            s.add(f'<path d="M{cx:.1f},{cy - r:.1f} A{r:.1f},{r:.1f} 0 {1 if v > 50 else 0} 1 {ax:.1f},{ay:.1f}" '
                  f'fill="none" stroke="{R.fonce}" stroke-width="{ep}" stroke-linecap="round"/>')
        decor(cx - r - ep / 2, cy - r - ep / 2, cx + r + ep / 2, cy + r + ep / 2, "anneau")
        val = f"{x_['valeur']:g}".replace(".", ",") + " %"
        tv = pal["chiffre_moyen"] if largeur(val, pal["chiffre_moyen"], 700, "chiffres") <= (r - ep / 2) * 1.6 else pal["carte"]
        s.add(chiffre_cle(cx, cy + tv * 0.35, val, tv, "middle", fond=fond_c))
        if ncol == 1:
            xt = x + 2 * pad + 2 * r + ep
            s.add(dessiner(xt, y, w_txt, h2, P_, "start", th.c["encre_2"], v_align="middle", fond=fond_c))
        else:
            s.add(dessiner(x + pad, cy + r + ep / 2 + 30, w_txt, P_["total"], P_, "middle", th.c["encre_2"], fond=fond_c))
    if Pn:
        s.add(dessiner(MX, y0 + tot + 34, wc - 40, Pn["total"], Pn, "start", th.c["encre_3"]))
    return s


# ── Générateur (rendu_schemas.py) : même interface que moteur_page ─────────────────────────────────────────────
def en_grand(dessin, gabarit, params=None, **_ignore):
    """dessin() → Svg : rôles du schéma, palier standard puis dense, page remplie (moteur_marine/dessin.py)."""
    from .dessin import dessiner
    return dessiner(dessin, gabarit, params)


def part_hauteur(s):
    from .dessin import occupation
    return occupation(s)
