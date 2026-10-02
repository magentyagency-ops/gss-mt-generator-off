"""D7 (seuils de conformité) — part de la hauteur de la toile occupée par chaque schéma de la bibliothèque redessiné au
format page (moteur_page, thème donné), par gabarit. Aucun appel réseau.
Usage : python3 _verif/seuils_hauteur.py [thème=marine] [sortie.json]"""
import json, os, statistics, sys
ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ICI, "..", "python", "schemas_gss"))
import rendu_schemas as R  # noqa: E402

theme = sys.argv[1] if len(sys.argv) > 1 else "marine"
R.THEME = theme
R._moteur_page.cache_clear()
GP = R._moteur_page()
from moteur_page.gss_lib import _ETAT  # noqa: E402
res = []
IDS = set(filter(None, os.environ.get("IDS", "").split(",")))
for ident, sp in R._specs().items():
    if IDS and ident not in IDS:
        continue
    try:
        if sp["gabarit"] == "compose":
            f = getattr(GP, "COMPOSES", {}).get(ident)
            s = f() if f else None
        else:
            s = GP.en_grand(lambda: getattr(GP, sp["gabarit"])(*R._decoder(sp["params"]["args"]), **R._decoder(sp["params"]["kwargs"])), sp["gabarit"])
        if s is None:
            continue
        res.append({"id": ident, "gabarit": sp["gabarit"], "part": round(GP.part_hauteur(s), 3), "W": round(s.W), "H": round(s.H)})
        if IDS:
            print(ident, sp["gabarit"], res[-1]["part"], "W", res[-1]["W"])
    except Exception as e:  # noqa: BLE001
        res.append({"id": ident, "gabarit": sp["gabarit"], "erreur": f"{type(e).__name__} {e}"[:120]})
par = {}
for r in res:
    if "part" in r:
        par.setdefault(r["gabarit"], []).append(r["part"])
print(f"{len(res)} schémas, erreurs {sum('erreur' in r for r in res)}")
for g, v in sorted(par.items(), key=lambda x: min(x[1])):
    print(f"{g:14s} n={len(v):3d} min={min(v):.3f} médiane={statistics.median(v):.3f} sous 0,90={sum(x < 0.9 for x in v)}")
tout = [r["part"] for r in res if "part" in r]
print(f"TOUT n={len(tout)} min={min(tout):.3f} médiane={statistics.median(tout):.3f} sous 0,90={sum(x < 0.9 for x in tout)}")
if len(sys.argv) > 2:
    json.dump(res, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
