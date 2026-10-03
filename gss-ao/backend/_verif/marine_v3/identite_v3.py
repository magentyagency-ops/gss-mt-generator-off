"""Marine v3 : le moteur intégré (python/schemas_gss/moteur_marine), SANS la page remplie (cible=None), dessine
exactement les SVG de la planche validée reconstituée (rendus du moteur de l'agent design, version 3), à partir des
mêmes spécifications (bibliotheque/specs.json du 1er octobre 2026, commit afcba23, et pages 26 et 27).
Usage : python3 _verif/marine_v3/identite_v3.py <specs.json d'époque> <specs_pages_26_27.json> <dossier des SVG v3>"""
import json, os, re, sys
ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ICI, "..", "..", "python", "schemas_gss"))
from moteur_marine import theme, dessin  # noqa: E402

specs, pages, ref = sys.argv[1:4]


def dec(o):
    if isinstance(o, list):
        return [dec(v) for v in o]
    if isinstance(o, dict):
        if set(o) == {"__tuple__"}:
            return tuple(dec(v) for v in o["__tuple__"])
        if set(o) == {"__dict__"}:
            return {dec(k): dec(v) for k, v in o["__dict__"]}
        return {k: dec(v) for k, v in o.items()}
    return o


theme.utiliser("marine", "page")
sp = json.load(open(pages, encoding="utf-8"))["schemas"] + json.load(open(specs, encoding="utf-8"))["schemas"]
norm = lambda s: re.sub(r"\bs\d+-", "sX-", s)  # noqa: E731
ok, ko, insec = 0, [], []
for s in sp:
    s = dict(s, params=dec(s.get("params", {})))
    svg = dessin.dessiner_spec(s, cible=None).rendu()
    orig = open(os.path.join(ref, s["id"] + ".svg"), encoding="utf-8").read()
    if norm(svg) == norm(orig):
        ok += 1
    elif norm(svg).replace("\u00a0", " ") == norm(orig).replace("\u00a0", " "):
        # espace insécable ajoutée entre un nombre et son unité de durée (« 48 heures ») : même dessin, mêmes lignes
        insec.append(s["id"])
    else:
        ko.append(s["id"])
print(f"{ok}/{len(sp)} SVG identiques octet pour octet au rendu de la planche v3 ; {len(insec)} identiques à une espace "
      f"insécable près (nombre et unité de durée) : {insec} ; différents : {ko}")
sys.exit(0 if not ko else 1)
