"""Marine v3 : le style « marine-v1 » (première version de la planche, gardée sous ce nom) dessine exactement ce que le style
« marine » dessinait avant l'intégration de la v3 (moteur du commit de départ, extrait de git), et les autres styles et le
retour arrière sont inchangés : 180 schémas de la bibliothèque au format page et au format paysage, organigramme.
Usage : python3 _verif/marine_v3/v1_inchange.py <copie du moteur du commit de départ (python/schemas_gss)>"""
import json, os, re, subprocess, sys
ICI = os.path.dirname(os.path.abspath(__file__))
ACTUEL = os.path.join(ICI, "..", "..", "python", "schemas_gss")
AVANT = sys.argv[1]
ids = [x["id"] for x in json.load(open(os.path.join(ACTUEL, "bibliotheque", "index.json"), encoding="utf-8"))]


def rendus(moteur, theme, fmt):
    r = subprocess.run([sys.executable, os.path.join(moteur, "rendu_schemas.py")], input=json.dumps({"mode": "redessiner", "format": fmt, "ids": ids, "forcer": True}),
                       capture_output=True, text=True, env={**os.environ, "GSS_THEME": theme})
    return {x["id"]: x.get("svg", "") for x in json.loads(r.stdout)["resultats"]}


def orga(moteur, theme, fmt):
    out = os.path.join("/tmp", f"orga-{theme}-{fmt}-{os.getpid()}.svg")
    subprocess.run([sys.executable, os.path.join(moteur, "organigramme_gss.py"), out, "--format", fmt], capture_output=True,
                   env={**os.environ, "GSS_THEME": theme})
    s = open(out, encoding="utf-8").read()
    os.remove(out)
    return s


bilan = {}
for avant, apres in (("marine", "marine-v1"), ("graphite", "graphite"), ("conseil", "conseil"), ("sombre", "sombre"),
                     ("premium", "premium"), ("gss-2026-09", "gss-2026-09")):
    for fmt in ("page", "paysage"):
        a, b = rendus(AVANT, avant, fmt), rendus(ACTUEL, apres, fmt)
        norm = lambda s: s.replace('data-style="marine-v1"', 'data-style="marine"')  # noqa: E731
        diff = [i for i in ids if norm(b.get(i, "")) != a.get(i, "")]
        oa, ob = orga(AVANT, avant, fmt), orga(ACTUEL, apres, fmt)
        bilan[f"{apres} {fmt}"] = {"schemas_identiques": len(ids) - len(diff), "differents": diff[:10], "organigramme_identique": norm(ob) == oa}
print(json.dumps(bilan, ensure_ascii=False, indent=1))
sys.exit(0 if all(not v["differents"] and v["organigramme_identique"] for v in bilan.values()) else 1)
