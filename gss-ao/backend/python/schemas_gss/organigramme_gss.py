"""Organigramme GSS de la section « Encadrement », dans le design validé.
Contenu repris à l'identique de l'image organigramme.png utilisée jusqu'ici."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gss_lib import Svg, carte, trait, fleche  # noqa: E402


def organigramme():
    s = Svg()
    W_ = 1200
    # Niveau 1
    s.add(carte(W_ / 2 - 180, 24, 360, 96, "or", "MARCHANI Adil", ["Directeur d'agence", "Responsable de marché"],
                icone="personne", rx=8, t_max=20))
    # Niveau 2
    n2 = [("KANTE Rokia", "Responsable RH"), ("PORCHAIRE Laurent", "Responsable d'exploitation"),
          ("DA SILVA Luis", "Responsable d'exploitation"), ("VATTIER Marie", "Responsable Qualité")]
    w2, g2, y2, h2 = 255, 26, 176, 84
    x2 = [(W_ - (4 * w2 + 3 * g2)) / 2 + i * (w2 + g2) for i in range(4)]
    s.add(trait([(W_ / 2, 128), (W_ / 2, 150)], 2.6, False), trait([(x2[0] + w2 / 2, 150), (x2[3] + w2 / 2, 150)], 2.6, False))
    for x in x2:
        s.add(fleche(x + w2 / 2, 150, x + w2 / 2, y2 - 6, tirets=False))
    for x, (n, f) in zip(x2, n2):
        s.add(carte(x, y2, w2, h2, "sable", n, [f], rx=8, t_max=18))
    # Niveau 3 : sous les deux responsables d'exploitation
    n3 = [("ALAMAT Ramzi", "Responsable Unité mobile", "Agents contrôleurs, rondiers"),
          ("PODKOLZIN Sergeï", "Responsable Cynophile", "Agents AMC, ADS"),
          ("ATTOU NESRINE", "Responsable Incendie", "Agents SSIAP")]
    w3, g3, y3, h3 = 300, 40, 334, 84
    x3 = [(W_ - (3 * w3 + 2 * g3)) / 2 + i * (w3 + g3) for i in range(3)]
    ya = y2 + h2 + 8
    s.add(trait([(x2[1] + w2 / 2, ya), (x2[1] + w2 / 2, 306)], 2.6, False),
          trait([(x2[2] + w2 / 2, ya), (x2[2] + w2 / 2, 306)], 2.6, False),
          trait([(x3[0] + w3 / 2, 306), (x3[2] + w3 / 2, 306)], 2.6, False))
    for x in x3:
        s.add(fleche(x + w3 / 2, 306, x + w3 / 2, y3 - 6))
    for x, (n, f, _) in zip(x3, n3):
        s.add(carte(x, y3, w3, h3, "sable", n, [f], rx=8, t_max=18))
    # Niveau 4 : équipes
    y4, h4 = 474, 150
    for x, (_, _, e) in zip(x3, n3):
        s.add(fleche(x + w3 / 2, y3 + h3 + 8, x + w3 / 2, y4 - 6))
        s.add(carte(x + 20, y4, w3 - 40, h4, "creme", "Équipe", [e], icone="groupe", icone_haut=True, rx=8, t_max=18))
    return s.rendu()


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "organigramme_gss.svg"
    open(out, "w", encoding="utf-8").write(organigramme())
    print(out)
