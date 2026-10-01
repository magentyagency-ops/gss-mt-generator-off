"""Correction 2, bug D : dessine au format page (thème actif) les 180 schémas de la bibliothèque et les 30 schémas
« spec » du mémoire type (variables remplacées par une valeur fictive, conditions ignorées) dans un dossier, pour
mesurer la hauteur réelle du dessin. Usage : python3 dessiner_tout.py <dossier>"""
import json, os, re, sys
ICI = os.path.dirname(os.path.abspath(__file__))
MOTEUR = os.path.join(ICI, "..", "..", "python", "schemas_gss")
sys.path.insert(0, MOTEUR)
import rendu_schemas as R  # noqa: E402

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
infos = {}
for ident, sp in R._specs().items():
    try:
        svg = R._dessiner_page(sp)
        open(os.path.join(out, f"{ident}.svg"), "w", encoding="utf-8").write(svg)
        infos[ident] = {"gabarit": sp["gabarit"], "titre": sp.get("titre")}
    except Exception as e:  # noqa: BLE001
        print(ident, "ÉCHEC", type(e).__name__, str(e)[:120], file=sys.stderr)
mt = json.load(open(os.path.join(ICI, "..", "..", "src", "generation", "memoire_type", "memoire_type.json"), encoding="utf-8"))


def specs(o):
    if isinstance(o, dict):
        if o.get("gabarit") and o.get("source") == "spec":
            yield o
        for v in o.values():
            yield from specs(v)
    elif isinstance(o, list):
        for v in o:
            yield from specs(v)


def sans_var(v):
    if isinstance(v, str):
        return re.sub(r"\{\{[^}]+\}\}", "12", v)
    if isinstance(v, list):
        return [sans_var(x) for x in v]
    if isinstance(v, dict):
        return {k: sans_var(x) for k, x in v.items() if k != "si"}
    return v


for i, o in enumerate(specs(mt)):
    ident = f"MT-{i:02d}"
    try:
        GP = R._moteur_page()
        prm = R._jalons(sans_var(o["params"]))
        svg = GP.en_grand(lambda: R.construire(o["gabarit"], prm, GP), o["gabarit"]).rendu()
        open(os.path.join(out, f"{ident}.svg"), "w", encoding="utf-8").write(svg)
        infos[ident] = {"gabarit": o["gabarit"], "titre": o["titre"]}
    except Exception as e:  # noqa: BLE001
        print(ident, "ÉCHEC", type(e).__name__, str(e)[:160], file=sys.stderr)
json.dump(infos, open(os.path.join(out, "infos.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(infos), "schémas dessinés")
