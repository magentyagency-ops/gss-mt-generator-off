"""Marine v3 : part de la hauteur de la toile occupée par chaque schéma de la bibliothèque (moteur intégré, page
remplie D7), et façon d'y arriver (planche, étirement, zoom). Usage : python3 _verif/marine_v3/remplissage.py [ids]"""
import json, os, sys, collections
ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ICI, "..", "..", "python", "schemas_gss"))
import rendu_schemas as R  # noqa: E402
from moteur_marine import theme, dessin  # noqa: E402
theme.utiliser("marine", "page")
ids = set(sys.argv[1].split(",")) if len(sys.argv) > 1 else None
par = collections.defaultdict(list)
res = {}
for i, sp in R._specs().items():
    if ids and i not in ids:
        continue
    s = dessin.dessiner_spec(dict(sp, params=R._decoder(sp["params"])))
    res[i] = (round(dessin.occupation(s), 3), s.remplissage, sp["gabarit"])
    par[s.remplissage].append(i)
for k, v in par.items():
    print(k, len(v))
bas = sorted((v[0], i, v[1], v[2]) for i, v in res.items() if v[0] < dessin.CIBLE_HAUTEUR or v[1].startswith("zoom"))
for o, i, m, g in bas:
    print(f"  {o:.3f} {i} {g} {m}")
json.dump(res, open(os.path.join(ICI, "remplissage.json"), "w"), ensure_ascii=False, indent=0)
