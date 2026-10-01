"""Organigramme GSS au format page (A4 portrait), dans le thème.

Mêmes données et mêmes libellés que l'organigramme d'origine (organigramme_gss.py) : la direction en bandeau de
tête, les responsables (niveau 2), les responsables de pôle rattachés aux responsables d'exploitation (niveau 3)
et leur équipe (niveau 4, « Équipe »). Lecture de haut en bas ; au-delà de 4 responsables, deux rangées (les
responsables d'exploitation, dont dépend le niveau 3, dans la seconde) reliées par un fil à gauche.
"""
import math

from .gss_lib import (T, Deborde, carte, bandeau, lien, fleche, noeud, ajuster, ajuster_cartes, _kw)
from .gabarits import _toile, MX, MY


def _tete(wc, tete):
    corps = [f for f in (tete.get("fonctions") or ()) if f]

    def essai(t, b):
        try:
            return bandeau(0, 0, wc, 999, "or", tete["nom"], corps, "personne", t, b, mesure=True) <= 210
        except Deborde:
            return False
    t, b = ajuster(essai, 42, 24, 0.56, 20, quoi="organigramme (direction)")
    hh = max(120, bandeau(0, 0, wc, 999, "or", tete["nom"], corps, "personne", t, b, mesure=True))
    return (lambda yy: bandeau(MX, yy, wc, hh, "or", tete["nom"], corps, "personne", t, b)), hh


def _rangs(n2):
    """Rangées du niveau 2 : une seule jusqu'à 4 responsables ; sinon deux, les responsables d'exploitation
    (auxquels le niveau 3 est rattaché) dans la seconde, pour qu'aucun lien ne traverse une carte."""
    if len(n2) <= 4:
        return [n2]
    exp = [p for p in n2 if p.get("exploitation")]
    autres = [p for p in n2 if not p.get("exploitation")]
    if exp and len(exp) <= 4 and len(autres) <= 4:
        return [autres, exp] if autres else [exp]
    ordre = autres + exp
    k = math.ceil(len(ordre) / 2)
    return [ordre[:len(ordre) - k], ordre[len(ordre) - k:]]


def organigramme(d):
    s, W, H = _toile()
    th = T()
    wc = W - 2 * MX
    tete, n2, n3 = d["tete"], list(d.get("n2") or []), list(d.get("n3") or [])
    hub, hh = _tete(wc, tete)
    rangs = _rangs(n2)
    plusieurs = len(rangs) > 1
    x_fil = MX + 10                          # fil de gauche (plusieurs rangées)
    x0 = MX + 40 if plusieurs else MX
    wl = W - MX - x0
    g2 = 22
    k3 = max(1, len(n3))
    g3 = 26 if k3 <= 3 else 16
    w3 = (wc - (k3 - 1) * g3) / k3
    retrait = 24 if w3 > 260 else 10         # équipe un peu en retrait sous son responsable
    larg2 = [(wl - (len(r) - 1) * g2) / len(r) for r in rangs]
    c2 = [[{"w": larg2[i], "h": 420, "role": "sable", "titre": p["nom"], "corps": list(p.get("fonctions") or ()),
            "orient": "v"} for p in r] for i, r in enumerate(rangs)]
    c3 = [{"w": w3, "h": 420, "role": "sable", "titre": p["nom"], "corps": [p["fonction"]] if p.get("fonction") else [],
           "orient": "v"} for p in n3]
    c4 = [{"w": w3 - 2 * retrait, "h": 420, "role": "creme", "titre": "Équipe", "corps": [p["equipe"]] if p.get("equipe") else [],
           "icone": "groupe", "orient": "v"} for p in n3]
    toutes = [c for r in c2 for c in r] + c3 + c4
    place = H - 2 * MY
    gt, gr, g23, g34 = 64.0, 64.0, 84.0, 56.0
    nr = len(rangs)

    def besoin(cs, t, b):
        return max((carte(0, 0, c["w"], c["h"], t=t, b=b, mesure=True, **_kw(c)) for c in cs), default=0)

    def total(k, h2s, h3, h4):
        return (hh + gt * k + sum(h * min(k, 1.22) for h in h2s) + (nr - 1) * gr * k
                + ((g23 * k + h3 * min(k, 1.22) + g34 * k + h4 * min(k, 1.22)) if n3 else 0))
    # Une seule taille de texte pour toutes les cartes : la plus grande avec laquelle l'organigramme tient sur la page.
    for t_max in range(34, 16, -1):
        t, b, _, _ = ajuster_cartes(toutes, t_max=t_max, t_min=17, aligner=False, quoi="organigramme")
        h2s = [besoin(r, t, b) for r in c2]
        h3, h4 = besoin(c3, t, b), besoin(c4, t, b)
        if total(1.0, h2s, h3, h4) <= place:
            break
    else:
        raise Deborde("organigramme trop haut pour la page")
    # Espacement vertical : la composition occupe la page (« 1 schéma = 1 page, en gros »).
    k = 1.0
    while k < 1.9 and total(k + 0.02, h2s, h3, h4) <= 0.9 * place:
        k += 0.02
    tot = total(k, h2s, h3, h4)
    f = min(k, 1.22)
    h2s = [h * f for h in h2s]
    h3, h4 = h3 * f, h4 * f
    gt, gr, g23, g34 = gt * k, gr * k, g23 * k, g34 * k
    y = MY + max(0.0, place - tot) * 0.46
    s_liens, s_cartes = [], []
    y_tete = y
    y += hh + gt
    # niveau 2
    centres_exp, centres_bas = [], []
    for i, (r, cs) in enumerate(zip(rangs, c2)):
        n = len(r)
        larg = n * larg2[i] + (n - 1) * g2
        xd = x0 + (wl - larg) / 2
        xs = [xd + j * (larg2[i] + g2) for j in range(n)]
        yb = y - gt * 0.5 if i == 0 else y - gr * 0.5
        cx = [x + larg2[i] / 2 for x in xs]
        if plusieurs:
            s_liens.append(lien([(x_fil, yb), (cx[-1], yb)]))
            s_liens.append(noeud(x_fil, yb))
        else:
            s_liens.append(lien([(W / 2, y_tete + hh), (W / 2, yb)]))
            if n > 1:
                s_liens.append(lien([(cx[0], yb), (cx[-1], yb)]))
            s_liens.append(noeud(W / 2, yb))
        for c_x in cx:
            s_liens.append(fleche(c_x, yb, c_x, y - 4))
        for x, c, p in zip(xs, cs, r):
            s_cartes.append(carte(x, y, larg2[i], h2s[i], t=t, b=b, **_kw(c)))
            if i == nr - 1:
                centres_bas.append(x + larg2[i] / 2)
                if p.get("exploitation"):
                    centres_exp.append(x + larg2[i] / 2)
        if plusieurs and i == nr - 1:
            s_liens.insert(0, lien([(x_fil, y_tete + hh), (x_fil, yb)], ep=th.liens["epaisseur"] + 0.6))
        y += h2s[i] + (gr if i < nr - 1 else 0)
    # niveaux 3 et 4
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
            s_liens.append(lien([(c_x, y_bas2), (c_x, yb)]))
        if not sources:          # plusieurs rangées sans responsable d'exploitation : rattaché à la direction
            s_liens.insert(0, lien([(x_fil, y_tete + hh), (x_fil, yb)], ep=th.liens["epaisseur"] + 0.6))
            sources = [x_fil]
        g_, d_ = min(sources + c3x), max(sources + c3x)
        s_liens.append(lien([(g_, yb), (d_, yb)]))
        for c_x in c3x:
            s_liens.append(fleche(c_x, yb, c_x, y3 - 4))
        for x, c in zip(x3, c3):
            s_cartes.append(carte(x, y3, w3, h3, t=t, b=b, **_kw(c)))
        y4 = y3 + h3 + g34
        for x, c in zip(x3, c4):
            s_liens.append(fleche(x + w3 / 2, y3 + h3 + 4, x + w3 / 2, y4 - 4))
            s_cartes.append(carte(x + retrait, y4, w3 - 2 * retrait, h4, t=t, b=b, **_kw(c)))
    s.add(*s_liens)
    s.add(hub(y_tete))
    s.add(*s_cartes)
    return s
