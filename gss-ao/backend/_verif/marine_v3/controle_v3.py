"""Marine v3 intégré : les contrôles de la planche validée (moteur_marine/controle.py) sur les 180 schémas de la
bibliothèque (bibliotheque/specs.json) et les schémas P26 et P27 de la planche, dessinés comme dans le générateur
(rôles, palier, page remplie D7). Écrit les SVG dans <sortie>/svg et le rapport dans <sortie>/rapport.json.
Usage : python3 _verif/marine_v3/controle_v3.py <sortie> [ids]"""
import json, os, sys, time
ICI = os.path.dirname(os.path.abspath(__file__))
MOT = os.path.join(ICI, "..", "..", "python", "schemas_gss")
sys.path.insert(0, MOT)
import rendu_schemas as R  # noqa: E402
from moteur_marine import theme, dessin, controle  # noqa: E402

sortie = sys.argv[1]
ids = set(sys.argv[2].split(",")) if len(sys.argv) > 2 else None
os.makedirs(os.path.join(sortie, "svg"), exist_ok=True)
theme.utiliser("marine", "page")
specs = [dict(sp, ref=os.path.join(MOT, "bibliotheque", sp["id"] + ".svg")) for sp in R._specs().values()]
for sp in json.load(open(os.path.join(ICI, "specs_pages_26_27.json"), encoding="utf-8"))["schemas"]:
    specs.append(dict(sp, ref=os.path.join(ICI, "reference", os.path.basename(sp["reference_svg"]))))
res = {}
for sp in specs:
    if ids and sp["id"] not in ids:
        continue
    s = dessin.dessiner_spec(dict(sp, params=R._decoder(sp.get("params", {}))))
    svg = s.rendu()
    open(os.path.join(sortie, "svg", sp["id"] + ".svg"), "w", encoding="utf-8").write(svg)
    r = controle.controler(s, svg, open(sp["ref"], encoding="utf-8").read())
    r.update(gabarit=sp["gabarit"], remplissage=s.remplissage, occupation=round(dessin.occupation(s), 3))
    res[sp["id"]] = r
occ = sorted(v["occupation"] for v in res.values())
bilan = {"schemas": len(res), "ok": sum(1 for v in res.values() if v["ok"]),
         "textes_differents": sorted(k for k, v in res.items() if not v["textes_identiques"]),
         **{d: sorted(k for k, v in res.items() if v.get(d)) for d in controle.DEFAUTS},
         "palier_dense": sorted(k for k, v in res.items() if v.get("palier") == "dense"),
         "remplissage": {m: sum(1 for v in res.values() if v["remplissage"] == m) for m in sorted({v["remplissage"] for v in res.values()})},
         "occupation_toile": {"min": occ[0], "mediane": occ[len(occ) // 2], "sous_cible": sorted(k for k, v in res.items() if v["occupation"] < dessin.CIBLE_HAUTEUR)},
         "taille_min": min(v["taille_texte_min"] for v in res.values())}
json.dump({"date": time.strftime("%Y-%m-%d %H:%M"), "bilan": bilan, "detail": res},
          open(os.path.join(sortie, "rapport.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps(bilan, ensure_ascii=False, indent=1))
sys.exit(0 if bilan["ok"] == bilan["schemas"] and not bilan["occupation_toile"]["sous_cible"] else 1)
