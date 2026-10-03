"""Organigramme GSS au format page (A4 portrait), style « Marine & signal » v3.

Mêmes données et mêmes libellés que l'organigramme d'origine (organigramme_gss.py) et que moteur_page/organigramme.py :
la direction en panneau marine de tête, les responsables (niveau 2) en colonnes, les responsables de pôle rattachés aux
responsables d'exploitation (niveau 3) et leur équipe (niveau 4, « Équipe »). Vocabulaire v3 de l'organigramme en
colonnes (gabarit « arbre ») : peigne marine sans flèche, cartes claires à titre marine, échelle typographique du
palier (standard, sinon dense), page remplie (dessin.py). Au-delà de 4 responsables, deux rangées (les responsables
d'exploitation, dont dépend le niveau 3, dans la seconde) reliées par une colonne à gauche.
"""
import math

from . import theme
from .gss_lib import T, P, Deborde, carte, bandeau, lien, besoin, _kw
from .gabarits import _toile, _place, _y0, _et, _rempli, MX
from .dessin import dessiner


def _rangs(n2):
    if len(n2) <= 4:
        return [n2]
    exp = [p for p in n2 if p.get("exploitation")]
    autres = [p for p in n2 if not p.get("exploitation")]
    if exp and len(exp) <= 4 and len(autres) <= 4:
        return [autres, exp] if autres else [exp]
    ordre = autres + exp
    k = math.ceil(len(ordre) / 2)
    return [ordre[:len(ordre) - k], ordre[len(ordre) - k:]]


def _dessin(d):
    s, W, H = _toile()
    th = T()
    pal = P()
    wc = W - 2 * MX
    place = _place(H)
    marine = th.c["structure"]
    tete, n2, n3 = d["tete"], list(d.get("n2") or []), list(d.get("n3") or [])
    corps_t = [f for f in (tete.get("fonctions") or ()) if f]
    hh = bandeau(0, 0, wc, 999, "or", tete["nom"], corps_t, "personne", mesure=True)
    rangs = _rangs(n2)
    plusieurs = len(rangs) > 1
    x_fil = MX + 14
    x0 = MX + 44 if plusieurs else MX
    wl = W - MX - x0
    g2 = 22
    k3 = max(1, len(n3))
    g3 = 26 if k3 <= 3 else 16
    w3 = (wc - (k3 - 1) * g3) / k3
    retrait = 24 if w3 > 260 else 10
    larg2 = [(wl - (len(r) - 1) * g2) / len(r) for r in rangs]
    c2 = [[{"w": larg2[i], "role": "sable", "titre": p["nom"], "corps": list(p.get("fonctions") or ()), "orient": "v"}
           for p in r] for i, r in enumerate(rangs)]
    c3 = [{"w": w3, "role": "sable", "titre": p["nom"], "corps": [p["fonction"]] if p.get("fonction") else [], "orient": "v"}
          for p in n3]
    c4 = [{"w": w3 - 2 * retrait, "role": "creme", "titre": "Équipe", "corps": [p["equipe"]] if p.get("equipe") else [],
           "icone": "groupe", "orient": "v"} for p in n3]
    h2s = [max(besoin(c) for c in r) for r in c2]
    h3 = max([besoin(c) for c in c3] or [0])
    h4 = max([besoin(c) for c in c4] or [0])
    gt, gr, g23, g34 = 70.0, 60.0, 80.0, 50.0
    nr = len(rangs)

    def total(k):
        return (hh + gt * k + sum(h2s) + (nr - 1) * gr * k + ((g23 * k + h3 + g34 * k + h4) if n3 else 0))
    if total(1.0) > place:
        raise Deborde("organigramme trop haut pour la page")
    # air : le peigne s'allonge (jusqu'à 2,2 fois) ; page remplie : puis les cartes grandissent (contenu centré)
    k = 1.0
    while k < 2.2 and total(k + 0.02) <= _rempli() * place:
        k += 0.02
    extra = 0.0
    if _et():
        niveaux = nr + (2 if n3 else 0)
        extra = max(0.0, _rempli() * place - total(k)) / niveaux
    h2n, h3n, h4n = list(h2s), h3, h4
    h2s = [h + extra for h in h2s]
    h3, h4 = (h3 + extra, h4 + extra) if n3 else (h3, h4)
    gt, gr, g23, g34 = gt * k, gr * k, g23 * k, g34 * k
    tot = total(1.0)
    y = _y0(place, tot)
    liens, cartes = [], []
    y_tete = y
    y += hh + gt
    centres_exp, centres_bas = [], []
    for i, (r, cs) in enumerate(zip(rangs, c2)):
        n = len(r)
        larg = n * larg2[i] + (n - 1) * g2
        xd = x0 + (wl - larg) / 2
        xs = [xd + j * (larg2[i] + g2) for j in range(n)]
        yb = y - (gt if i == 0 else gr) * 0.5
        cx = [x + larg2[i] / 2 for x in xs]
        if plusieurs:
            liens.append(lien([(x_fil, yb), (cx[-1], yb)], ep=4, couleur=marine))
        else:
            liens.append(lien([(W / 2, y_tete + hh), (W / 2, yb)], ep=4, couleur=marine))
            if n > 1:
                liens.append(lien([(cx[0], yb), (cx[-1], yb)], ep=4, couleur=marine))
        for c_x in cx:
            liens.append(lien([(c_x, yb), (c_x, y - 2)], ep=4, couleur=marine))
        for x, c, p in zip(xs, cs, r):
            cartes.append(carte(x, y, larg2[i], h2s[i], decal=(h2s[i] - h2n[i]) / 2, **_kw(c)))
            if i == nr - 1:
                centres_bas.append(x + larg2[i] / 2)
                if p.get("exploitation"):
                    centres_exp.append(x + larg2[i] / 2)
        if plusieurs and i == nr - 1:
            liens.insert(0, lien([(x_fil, y_tete + hh), (x_fil, yb)], ep=4, couleur=marine))
        y += h2s[i] + (gr if i < nr - 1 else 0)
    if n3:
        y_bas2 = y
        y3 = y + g23
        larg = k3 * w3 + (k3 - 1) * g3
        xd = MX + (wc - larg) / 2
        x3 = [xd + j * (w3 + g3) for j in range(len(n3))]
        c3x = [x + w3 / 2 for x in x3]
        yb = y_bas2 + g23 * 0.5
        sources = centres_exp or (centres_bas if not plusieurs else [])
        for c_x in sources:
            liens.append(lien([(c_x, y_bas2 + 2), (c_x, yb)], ep=4, couleur=marine))
        if not sources:
            liens.insert(0, lien([(x_fil, y_tete + hh), (x_fil, yb)], ep=4, couleur=marine))
            sources = [x_fil]
        g_, d_ = min(sources + c3x), max(sources + c3x)
        liens.append(lien([(g_, yb), (d_, yb)], ep=4, couleur=marine))
        for c_x in c3x:
            liens.append(lien([(c_x, yb), (c_x, y3 - 2)], ep=4, couleur=marine))
        for x, c in zip(x3, c3):
            cartes.append(carte(x, y3, w3, h3, decal=(h3 - h3n) / 2, **_kw(c)))
        y4 = y3 + h3 + g34
        for x, c in zip(x3, c4):
            liens.append(lien([(x + w3 / 2, y3 + h3 + 2), (x + w3 / 2, y4 - 2)], ep=4, couleur=th.c["filet_fort"]))
            cartes.append(carte(x + retrait, y4, w3 - 2 * retrait, h4, decal=(h4 - h4n) / 2, **_kw(c)))
    s.add(*liens)
    s.add(bandeau(MX, y_tete, wc, hh, "or", tete["nom"], corps_t, "personne"))
    s.add(*cartes)
    return s


def organigramme(d):
    """Toile de l'organigramme (rôles, palier, page remplie : dessin.py)."""
    theme.courant()
    return dessiner(lambda: _dessin(d), "arbre", None)
