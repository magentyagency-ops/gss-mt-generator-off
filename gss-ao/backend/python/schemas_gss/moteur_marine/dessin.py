"""Point d'entrée du moteur « Marine & signal » v3 pour le générateur (format page, 1 schéma = 1 page).

Reprend exactement les règles de dessin de la planche validée (outils/rendre.py de l'agent design, version 3) :
  · RÔLES — au plus 2 couleurs de rôle par schéma (jetons « regles_roles ») : dans un process, contrôle et action
    prennent la couleur de structure, seuls le déclencheur (rouge) et l'issue (vert) gardent la leur ; ailleurs,
    les 2 premiers rôles dans l'ordre rouge, vert, bleu, orange ;
  · ÉCHELLE — le schéma est dessiné au palier typographique « standard » ; s'il ne tient pas, au palier « dense » ;
  · PAGE REMPLIE (décision D7, 2 octobre 2026) — le dessin occupe au moins 85 % de la hauteur utile de sa page :
    s'il reste plus bas, la composition est redessinée « étirée » (cartes plus hautes, contenu centré, air réparti,
    pictogrammes plus grands), toujours aux tailles de texte du palier ; seulement si cela ne suffit pas, la toile est
    agrandie (zoom), du plus petit zoom qui atteint la cible.
Aucun texte n'est ajouté, retiré ni modifié.
"""
from . import theme
from . import gss_lib
from . import gabarits

SEMANTIQUES = ("rouge", "vert", "bleu", "orange")
SURCHARGES = {"P26": "convergence"}
# Part de la hauteur de la toile visée : la toile (180 × 228,6 mm, au même endroit sur chaque page de schéma) occupe
# 94 % de la hauteur utile de la page (sous le titre, au-dessus du pied de page) ; 0,905 de la toile ≈ 0,855 de la
# hauteur utile, mesurée dans la page rendue (décision D7 : au moins 85 %).
CIBLE_HAUTEUR = 0.905
# Dessin technique des tenues : le registre inscrit le gabarit du vêtement à plat (boîte de la grille), un peu plus haut
# que le tracé visible ; la cible est relevée d'autant pour que le tracé mesuré dans la page atteigne la même part.
CIBLE_PAR_GABARIT = {"silhouette": CIBLE_HAUTEUR + 0.03}
ZOOMS = (1.04, 1.08, 1.12, 1.16, 1.20, 1.25, 1.30, 1.35, 1.40, 1.45, 1.50)


def roles_utilises(o, acc=None):
    acc = [] if acc is None else acc
    if isinstance(o, dict):
        for k, v in o.items():
            if k in ("role", "role_centre") and isinstance(v, str):
                acc.append(v)
            else:
                roles_utilises(v, acc)
    elif isinstance(o, (list, tuple)):
        if len(o) == 2 and isinstance(o[1], str) and o[1] in SEMANTIQUES + ("sable", "or", "creme", "sombre"):
            acc.append(o[1])
        for v in o:
            roles_utilises(v, acc)
    return acc


def correspondance(gabarit, roles):
    th = theme.courant()
    regles = th.d.get("regles_roles", {})
    prio = regles.get("priorite", list(SEMANTIQUES))
    sem = [r for r in prio if r in set(roles)]
    if gabarit in regles.get("sequences", ()):
        garde = [r for r in sem if r in ("rouge", "vert")]
    else:
        garde = sem[:regles.get("max_par_schema", 2)]
    return {r: "sable" for r in sem if r not in garde}


def occupation(s):
    """Part de la hauteur de la toile occupée par tout ce qui est dessiné (textes, cadres, points, traits, décors)."""
    bx = ([(t["y0"], t["y1"]) for t in s.textes] + [(z["y0"], z["y1"]) for z in s.zones]
          + [(p["cy"] - p["r"], p["cy"] + p["r"]) for p in s.points]
          + [(min(y for _, y in tr["pts"]), max(y for _, y in tr["pts"])) for tr in s.traits]
          + [(d["y0"], d["y1"]) for d in s.decors])
    if not bx:
        return 1.0
    return (max(b for _, b in bx) - min(a for a, _ in bx)) / s.H


def _paliers(dessin, palier=None):
    th = theme.courant()
    err = None
    for pal in ([palier] if palier else ["standard", "dense"]):
        th.regler_palier(pal)
        try:
            return dessin(), pal
        except gss_lib.Deborde as e:
            err = e
    raise err


def dessiner(dessin, gabarit, params=None, palier=None, cible=CIBLE_HAUTEUR):
    """dessin() → Svg, dans le thème courant : rôles du schéma (params : spécification, pour lire ses rôles), palier
    standard puis dense, puis page remplie (étirement, puis zoom en dernier recours)."""
    th = theme.courant()
    if cible == CIBLE_HAUTEUR:
        cible = CIBLE_PAR_GABARIT.get(gabarit, cible)
    th.regler_roles(correspondance(gabarit, roles_utilises(params or {})))
    th.etirer = 0.0
    gss_lib.regler_zoom(1.0)
    s, pal = _paliers(dessin, palier)
    s.remplissage = "planche"
    if cible is None or occupation(s) >= cible:
        return s
    meilleur, f_meilleur = s, occupation(s)
    # 1. Étirement : la mise en page s'adapte (cartes, air, pictogrammes), jamais la taille du texte.
    th.etirer = cible
    try:
        s2, _ = _paliers(dessin, pal)
        f2 = occupation(s2)
        if f2 > f_meilleur:
            s2.remplissage = "etirement"
            meilleur, f_meilleur = s2, f2
    except gss_lib.Deborde:
        pass
    if f_meilleur >= cible:
        th.etirer = 0.0
        return meilleur
    # 2. Dernier recours : toile agrandie (le dessin étiré, affiché plus grand), premier zoom qui atteint la cible.
    for z in ZOOMS:
        gss_lib.regler_zoom(z)
        try:
            s3, _ = _paliers(dessin, pal)
        except gss_lib.Deborde:
            break
        finally:
            gss_lib.regler_zoom(1.0)
        f3 = occupation(s3)
        if f3 > f_meilleur:
            s3.remplissage = f"zoom {z:g}"
            meilleur, f_meilleur = s3, f3
        if f3 >= cible:
            break
    th.etirer = 0.0
    return meilleur


def dessiner_spec(sp, palier=None, cible=CIBLE_HAUTEUR):
    """Spécification de la bibliothèque ({id, gabarit, params:{args, kwargs}} décodés) → Svg."""
    g = sp["gabarit"]
    if g == "compose":
        f = gabarits.COMPOSES[sp["id"]]
        return dessiner(f, g, sp, palier, cible)
    f = getattr(gabarits, SURCHARGES.get(sp["id"], g))
    p = sp.get("params", {})
    return dessiner(lambda: f(*p.get("args", []), **p.get("kwargs", {})), g, p, palier, cible)
