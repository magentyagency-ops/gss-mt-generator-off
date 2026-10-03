"""Organigramme GSS de la section « Encadrement », dans le design validé.
Par défaut : contenu repris à l'identique de l'image organigramme.png utilisée jusqu'ici. Avec un
fichier JSON en second argument, l'organigramme est dessiné d'après l'organigramme GSS de référence
(annuaire « Personnes » + registre des mémoires) : {"tete": {"nom", "fonctions"}, "n2": [{"nom",
"fonctions", "exploitation"}], "n3": [{"nom", "fonction", "equipe"}]}.

Thème (variable GSS_THEME, voir themes_gss.py) et format (option --format page|paysage, paysage par défaut) :
  · paysage : ce dessin, aux couleurs et à la police du thème (identique à l'origine pour « gss-2026-09 ») ;
  · page : 1 schéma = 1 page A4 portrait, dessiné dans le thème (moteur_page/organigramme.py), mêmes libellés.
Usage : python3 organigramme_gss.py sortie.svg [donnees.json] [--format page|paysage]"""
import json
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gss_lib import Svg, carte, trait, fleche  # noqa: E402
import themes_gss  # noqa: E402

DEFAUT = {
    "tete": {"nom": "MARCHANI Adil", "fonctions": ["Directeur d'agence", "Responsable de marché"]},
    "n2": [{"nom": "KANTE Rokia", "fonctions": ["Responsable RH"]},
           {"nom": "PORCHAIRE Laurent", "fonctions": ["Responsable d'exploitation"], "exploitation": True},
           {"nom": "DA SILVA Luis", "fonctions": ["Responsable d'exploitation"], "exploitation": True},
           {"nom": "VATTIER Marie", "fonctions": ["Responsable Qualité"]}],
    "n3": [{"nom": "ALAMAT Ramzi", "fonction": "Responsable Unité mobile", "equipe": "Agents contrôleurs, rondiers"},
           {"nom": "PODKOLZIN Sergeï", "fonction": "Responsable Cynophile", "equipe": "Agents AMC, ADS"},
           {"nom": "ATTOU NESRINE", "fonction": "Responsable Incendie", "equipe": "Agents SSIAP"}],
}


def organigramme(d=None):
    d = d or DEFAUT
    s = Svg()
    W_ = 1200
    # Niveau 1
    s.add(carte(W_ / 2 - 180, 24, 360, 96, "or", d["tete"]["nom"], d["tete"]["fonctions"],
                icone="personne", rx=8, t_max=20))
    # Niveau 2
    n2 = d["n2"]
    k2 = len(n2)
    g2 = 26 if k2 <= 4 else 14
    w2 = min(255, (1164 - (k2 - 1) * g2) / k2)
    y2 = 176
    h2 = 84 if all(len(p["fonctions"]) == 1 for p in n2) and k2 <= 4 else 124
    x2 = [(W_ - (k2 * w2 + (k2 - 1) * g2)) / 2 + i * (w2 + g2) for i in range(k2)]
    s.add(trait([(W_ / 2, 128), (W_ / 2, 150)], 2.6, False), trait([(x2[0] + w2 / 2, 150), (x2[-1] + w2 / 2, 150)], 2.6, False))
    for x in x2:
        s.add(fleche(x + w2 / 2, 150, x + w2 / 2, y2 - 6, tirets=False))
    for x, p in zip(x2, n2):
        if k2 <= 4:
            s.add(carte(x, y2, w2, h2, "sable", p["nom"], p["fonctions"], rx=8, t_max=18))
        else:
            s.add(carte(x, y2, w2, h2, "sable", p["nom"], p["fonctions"], rx=8, pad=10, t_max=16, t_min=10))
    # Niveau 3 : sous les responsables d'exploitation
    n3 = d["n3"]
    k3 = max(1, len(n3))
    g3 = 40
    w3 = min(300, (1164 - (k3 - 1) * g3) / k3)
    y3, h3 = y2 + h2 + 74, 84
    x3 = [(W_ - (k3 * w3 + (k3 - 1) * g3)) / 2 + i * (w3 + g3) for i in range(k3)]
    ya, yb = y2 + h2 + 8, y2 + h2 + 46
    exp = [x for x, p in zip(x2, n2) if p.get("exploitation")] or x2
    for x in exp:
        s.add(trait([(x + w2 / 2, ya), (x + w2 / 2, yb)], 2.6, False))
    gauche = min([x + w2 / 2 for x in exp] + [x3[0] + w3 / 2])
    droite = max([x + w2 / 2 for x in exp] + [x3[-1] + w3 / 2])
    s.add(trait([(gauche, yb), (droite, yb)], 2.6, False))
    for x in x3[:len(n3)]:
        s.add(fleche(x + w3 / 2, yb, x + w3 / 2, y3 - 6))
    for x, p in zip(x3, n3):
        s.add(carte(x, y3, w3, h3, "sable", p["nom"], [p["fonction"]], rx=8, t_max=18))
    # Niveau 4 : équipes
    y4, h4 = y3 + h3 + 56, 150
    for x, p in zip(x3, n3):
        s.add(fleche(x + w3 / 2, y3 + h3 + 8, x + w3 / 2, y4 - 6))
        s.add(carte(x + 20, y4, w3 - 40, h4, "creme", "Équipe", [p["equipe"]], icone="groupe", icone_haut=True, rx=8, t_max=18))
    svg = s.rendu()
    # Hauteur ajustée au contenu (le canevas d'origine fait 660).
    hauteur = int(y4 + h4 + 36)
    if hauteur != 660:
        svg = svg.replace('viewBox="0 0 1200 660" width="1200" height="660"', f'viewBox="0 0 1200 {hauteur}" width="1200" height="{hauteur}"', 1)
        svg = svg.replace('<rect width="1200" height="660"', f'<rect width="1200" height="{hauteur}"', 1)
    return svg


def organigramme_theme(d=None, fmt="paysage", theme=None):
    """Organigramme dans le thème : format page (portrait, moteur_page) ou paysage (ce dessin aux couleurs du thème)."""
    theme = theme or themes_gss.theme_actif()
    if themes_gss.format_effectif(theme, fmt) == "page" and (themes_gss.styles().get(theme) or {}).get("moteur") == "moteur_marine":
        # style « marine » : version 3 validée par le patron de GSS (moteur_marine)
        from moteur_marine import theme as th_v3
        from moteur_marine.organigramme import organigramme as organigramme_v3
        th_v3.utiliser(theme, "page")
        return organigramme_v3(d or DEFAUT).rendu()
    if themes_gss.format_effectif(theme, fmt) == "page":
        from moteur_page import theme as th_page
        from moteur_page.organigramme import organigramme as organigramme_page
        th_page.utiliser(theme, "page")
        return organigramme_page(d or DEFAUT).rendu()
    return themes_gss.recolorer(organigramme(d), theme)


if __name__ == "__main__":
    args = sys.argv[1:]
    fmt = "paysage"
    if "--format" in args:
        i = args.index("--format")
        fmt = args[i + 1] if i + 1 < len(args) else fmt
        del args[i:i + 2]
    out = args[0] if args else "organigramme_gss.svg"
    donnees = json.load(open(args[1], encoding="utf-8")) if len(args) > 1 else None
    svg = organigramme_theme(donnees, fmt)  # calculé avant d'ouvrir le fichier : jamais de fichier vide en cas d'erreur
    open(out, "w", encoding="utf-8").write(svg)
    print(out)
