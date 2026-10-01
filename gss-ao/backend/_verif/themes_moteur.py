"""PREUVES DU MOTEUR DE SCHÉMAS PAR THÈME (hors ligne, aucun appel OpenAI) :
  1. retour arrière « gss-2026-09 » : sorties identiques OCTET POUR OCTET au moteur du commit de départ (extrait de git)
     pour un corpus de spécifications au format des réponses de l'IA (180 schémas de la bibliothèque convertis + gabarits
     absents de la bibliothèque), formats paysage et page, mode « bibliotheque » et organigramme (défaut + 2 jeux) ;
     les 180 schémas de la bibliothèque redessinés par le moteur d'origine depuis specs.json = fichiers de la bibliothèque ;
  2. format page dans chaque style : corpus, 180 schémas de la bibliothèque et organigramme (4 jeux) — textes identiques
     au moteur d'origine, aucun débordement, aucune superposition, contrastes AA (contrôles de l'agent design).
Usage : python3 _verif/themes_moteur.py [commit de départ, défaut 8c2c7c7] [fichier de bilan JSON]
"""
import json, os, subprocess, sys, tempfile
from collections import Counter

ICI = os.path.dirname(os.path.abspath(__file__))
R = os.path.abspath(os.path.join(ICI, "..", "python", "schemas_gss"))
COMMIT = sys.argv[1] if len(sys.argv) > 1 else "8c2c7c7"
BILAN = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ICI, "sorties_themes_moteur.json")
RACINE_GIT = os.path.abspath(os.path.join(ICI, "..", "..", ".."))
specs = json.load(open(f"{R}/bibliotheque/specs.json", encoding="utf-8"))["schemas"]

def dec(o):
    if isinstance(o, list): return [dec(v) for v in o]
    if isinstance(o, dict):
        if set(o) == {"__tuple__"}: return tuple(dec(v) for v in o["__tuple__"])
        if set(o) == {"__dict__"}: return {dec(k): dec(v) for k, v in o["__dict__"]}
        return {k: dec(v) for k, v in o.items()}
    return o

def txt(d):
    t = d.get("texte")
    if isinstance(t, (list, tuple)): t = " ".join(t) if t else None
    return t

def carte(d, icone=True):
    o = {"titre": d.get("titre"), "role": d.get("role", "creme")}
    t = txt(d)
    if t: o["texte"] = t
    if icone and d.get("icone"): o["icone"] = d["icone"]
    return o

def conv(sp):
    g = sp["gabarit"]; a = dec(sp["params"]["args"]); k = dec(sp["params"]["kwargs"])
    pn = dec(sp["params_nommes"])
    if g == "grille": return {"cartes": [carte(x) for x in pn["items"]]}
    if g == "etoile":
        c = pn["centre"]; c = c if isinstance(c, (tuple, list)) else (c, None)
        cen = {"titre": c[0]}
        if c[1]: cen["sous_titre"] = c[1]
        return {"centre": cen, "branches": [carte(x) for x in pn["branches"]], "role_centre": pn.get("role_centre", "or") if pn.get("role_centre") in ("bleu","orange","rouge","vert","sable","creme","or") else "or"}
    if g == "flux":
        p = {"etapes": [carte(x) for x in pn["etapes"]]}
        lab = pn.get("labels") or {}
        if lab: p["conditions"] = [{"apres_etape": i + 1, "texte": (v[0] if isinstance(v, tuple) else v), "role": (v[1] if isinstance(v, tuple) else "rouge")} for i, v in lab.items()]
        so = pn.get("sorties") or {}
        if so: p["issues"] = [dict(carte(v, False), sous_etape=i + 1) for i, v in so.items()]
        return p
    if g == "chevrons": return {"etapes": [{"titre": x["titre"], "role": x.get("role", "sable"), **({"texte": txt(x)} if txt(x) else {})} for x in pn["etapes"]]}
    if g == "comparatif":
        cols = []
        for x in pn["colonnes"]:
            c = {"titre": x["titre"], "role": x.get("role", "sable"), "points": list(x.get("points") or [])}
            if x.get("icone"): c["icone"] = x["icone"]
            if x.get("sous"): c["sous_titre"] = x["sous"]
            cols.append(c)
        return {"colonnes": cols, "alternative": bool(pn.get("vs"))}
    if g == "chiffres":
        return {"chiffres": [{"valeur": str(x["valeur"]), "libelle": x["label"], "role": x.get("role", "creme"), **({"icone": x["icone"]} if x.get("icone") else {})} for x in pn["tuiles"]], **({"note": pn["note"]} if pn.get("note") else {})}
    if g == "checklist":
        return {"groupes": [{"titre": x["titre"], "role": x.get("role", "bleu"), "points": list(x["items"]), **({"icone": x["icone"]} if x.get("icone") else {}), **({"sous_titre": x["sous"]} if x.get("sous") else {})} for x in pn["groupes"]]}
    if g == "cycle":
        c = pn["centre"]; c = c if isinstance(c, (tuple, list)) else (c, None)
        cen = {"titre": c[0]}
        if c[1]: cen["sous_titre"] = c[1]
        return {"centre": cen, "etapes": [{"titre": x["titre"], **({"titre_court": x["court"]} if x.get("court") and x["court"] != x["titre"] else {}), "role": x.get("role", "sable"), **({"texte": txt(x)} if txt(x) else {})} for x in pn["secteurs"]]}
    if g == "pyramide":
        return {"niveaux": [{"titre": x.get("titre") or x.get("court"), **({"titre_court": x["court"]} if x.get("court") and x["court"] != x.get("titre") else {}), "role": x.get("role", "sable"), **({"texte": txt(x)} if txt(x) else {})} for x in pn["niveaux"]]}
    if g == "arbre":
        br = []
        for x in pn["enfants"]:
            c = carte(x)
            if x.get("items"):
                c.pop("texte", None); c["sous_elements"] = [i if isinstance(i, str) else i.get("titre") for i in x["items"]]
            br.append(c)
        return {"racine": carte(pn["racine"]), "branches": br}
    if g == "frise":
        return {"jalons": [{"date": x.get("date"), "titre": x["titre"], "role": x.get("role", "sable"), **({"texte": txt(x)} if txt(x) else {})} for x in pn["jalons"]]}
    if g == "fiche":
        return {"nom": pn["nom"], "lieu": pn.get("lieu") or "", "icone": pn["icone_secteur"], "secteur": pn.get("secteur_txt"),
                "chiffres": [{"valeur": v, "libelle": l} for v, l in pn.get("stats") or []], "missions": list(pn["missions"]),
                **({"titre_missions": pn["titre_missions"]} if pn.get("titre_missions") else {})}
    if g == "barres":
        return {"barres": [{"libelle": x["label"], "valeur": x["valeur"], "role": x.get("role", "sable")} for x in pn["series"] if "valeur" in x],
                **({"unite": pn["unite"]} if pn.get("unite") else {}), **({"note": pn["note"]} if pn.get("note") else {})}
    if g == "jauge":
        return {"reperes": [{"valeur": m["val"], "titre": m["titre"], "role": m.get("role", "bleu"), **({"texte": txt(m)} if txt(m) else {})} for m in pn["marqueurs"]], "unite": pn["unite"]}
    if g == "silhouette":
        return {"tenue": pn.get("tenue", "intervention"), "reperes": [{"titre": x["titre"], "role": x.get("role", "creme"), "zone": x["ancre"], **({"texte": txt(x)} if txt(x) else {})} for x in pn["annotations"] if x["ancre"] in ("tete","col","torse","poitrine","bras","taille","jambes","pieds","epaules","main")]}
    return None

def chaines(p):
    if isinstance(p, str): yield p
    elif isinstance(p, bool) or p is None: return
    elif isinstance(p, (int, float)): yield f"{p:g}"
    elif isinstance(p, dict):
        for k, v in p.items():
            if k in ("role", "icone", "zone", "tenue", "role_centre", "alternative"): continue
            yield from chaines(v)
    elif isinstance(p, (list, tuple)):
        for v in p: yield from chaines(v)

def maj(p, cle=None):
    if isinstance(p, str):
        return p if cle in ("unite", "role", "role_centre", "icone", "zone", "tenue", "date") or not p or not p[0].isalpha() else p[0].upper() + p[1:]
    if isinstance(p, dict): return {k: maj(v, k) for k, v in p.items()}
    if isinstance(p, list): return [maj(v, cle) for v in p]
    return p

out = []
for sp in specs:
    try:
        p = conv(sp)
    except Exception as e:
        print("conv", sp["id"], sp["gabarit"], e, file=sys.stderr); p = None
    if p is None: continue
    p = maj(p)
    src = ". ".join(chaines(p))
    out.append({"id": f"B-{sp['id']}", "gabarit": sp["gabarit"], "params": p, "source": src, "titre_section": sp["titre"]})

ECRITS = [
 {"id": "X-matrice-1", "gabarit": "matrice", "params": {"lignes": ["Contrôle de jour", "Contrôle de nuit", "Audit qualité"], "colonnes": ["Chef de poste", "Responsable de site", "Responsable qualité"], "cellules": [[True, "Chaque semaine", ""], ["", True, "Chaque mois"], ["", "", True]]}},
 {"id": "X-matrice-2", "gabarit": "matrice", "params": {"lignes": ["Rondes", "Main courante", "Consignes", "Formation"], "colonnes": ["Agent", "Chef d'équipe"], "cellules": [[True, True], [True, "Vérifiée"], ["Appliquées", True], ["Suivie", "Organisée"]]}},
 {"id": "X-camembert-1", "gabarit": "camembert", "params": {"parts": [{"libelle": "Agents de sûreté", "valeur": 180, "role": "bleu"}, {"libelle": "Agents SSIAP", "valeur": 90, "role": "rouge"}, {"libelle": "Agents cynophiles", "valeur": 30, "role": "orange"}], "total": 300, "libelle_total": "Salariés"}},
 {"id": "X-camembert-2", "gabarit": "camembert", "params": {"parts": [{"libelle": "Seine-Maritime", "valeur": 215, "role": "sable"}, {"libelle": "Eure", "valeur": 65, "role": "vert"}, {"libelle": "Autres départements", "valeur": 40, "role": "or"}, {"libelle": "Encadrement", "valeur": 12.5, "role": "bleu"}], "total": 332.5, "libelle_total": "Effectif total"}},
 {"id": "X-colonnes-1", "gabarit": "colonnes", "params": {"colonnes": [{"libelle": "SSIAP 1", "valeur": 120, "role": "rouge"}, {"libelle": "SSIAP 2", "valeur": 35, "role": "orange"}, {"libelle": "SSIAP 3", "valeur": 8, "role": "bleu"}, {"libelle": "Agents de sûreté", "valeur": 180, "role": "sable"}], "unite": "agents", "note": "Effectifs déclarés en 2026"}},
 {"id": "X-colonnes-2", "gabarit": "colonnes", "params": {"colonnes": [{"libelle": "Rouen", "valeur": 45, "role": "bleu"}, {"libelle": "Le Havre", "valeur": 30, "role": "bleu"}, {"libelle": "Évreux", "valeur": 18, "role": "bleu"}, {"libelle": "Caen", "valeur": 12, "role": "bleu"}, {"libelle": "Dieppe", "valeur": 7, "role": "bleu"}, {"libelle": "Alençon", "valeur": 4, "role": "bleu"}, {"libelle": "Vernon", "valeur": 3, "role": "bleu"}], "unite": "agents"}},
 {"id": "X-courbe-1", "gabarit": "courbe", "params": {"periodes": ["2022", "2023", "2024", "2025", "2026"], "series": [{"libelle": "Effectif", "role": "bleu", "valeurs": [210, 245, 280, 300, 320]}], "unite": "salariés", "note": "Effectifs au 1er janvier"}},
 {"id": "X-courbe-2", "gabarit": "courbe", "params": {"periodes": ["Janvier", "Février", "Mars", "Avril"], "series": [{"libelle": "Rondes prévues", "role": "bleu", "valeurs": [120, 118, 125, 130]}, {"libelle": "Rondes réalisées", "role": "vert", "valeurs": [119, 118, 124, 130]}], "unite": "rondes"}},
 {"id": "X-pourcentages-1", "gabarit": "pourcentages", "params": {"taux": [{"titre": "Taux de reprise", "texte": "Agents repris lors du dernier changement de prestataire", "valeur": 85, "role": "vert"}, {"titre": "Taux de remplacement", "texte": "Absences remplacées dans l'heure", "valeur": 98.5, "role": "bleu"}], "note": "Chiffres de l'année 2025"}},
 {"id": "X-pourcentages-2", "gabarit": "pourcentages", "params": {"taux": [{"titre": "Contrôles réalisés", "valeur": 100, "role": "vert"}, {"titre": "Satisfaction", "texte": "Clients satisfaits ou très satisfaits", "valeur": 92, "role": "bleu"}, {"titre": "Formation", "texte": "Agents formés au site avant la prise de poste", "valeur": 100, "role": "orange"}, {"titre": "Turnover", "texte": "Départs sur l'année", "valeur": 12, "role": "rouge"}]}},
 {"id": "X-jauge-1", "gabarit": "jauge", "params": {"reperes": [{"valeur": 15, "titre": "Prise de service", "texte": "Avant la vacation, auprès du responsable", "role": "sable"}, {"valeur": 30, "titre": "Agent d'astreinte", "texte": "Mobilisé si l'agent ne s'est pas présenté", "role": "orange"}, {"valeur": 60, "titre": "Sur site", "texte": "Remplaçant en poste", "role": "vert"}], "unite": "min", "note": "Délais maximum"}},
 {"id": "X-silhouette-1", "gabarit": "silhouette", "params": {"tenue": "ssiap", "reperes": [{"titre": "Tenue SSIAP", "texte": "Veste rouge, pantalon noir", "role": "rouge", "zone": "torse"}, {"titre": "Carte professionnelle", "texte": "Visible en permanence", "role": "bleu", "zone": "poitrine"}, {"titre": "Chaussures de sécurité", "role": "sable", "zone": "pieds"}, {"titre": "Talkie-walkie", "texte": "Liaison avec le PC", "role": "orange", "zone": "taille"}]}},
 {"id": "X-flux-1", "gabarit": "flux", "params": {"etapes": [{"titre": "Alarme", "texte": "Déclenchement de l'alarme incendie", "role": "rouge", "icone": "alerte"}, {"titre": "Levée de doute", "texte": "L'agent SSIAP se rend sur place", "role": "bleu", "icone": "loupe"}, {"titre": "Évacuation", "texte": "Mise en sécurité des occupants", "role": "orange", "icone": "porte"}, {"titre": "Accueil des secours", "texte": "Guidage des pompiers", "role": "vert", "icone": "pompier"}], "conditions": [{"apres_etape": 2, "texte": "Feu avéré", "role": "rouge"}]}},
]
for e in ECRITS:
    e["source"] = ". ".join(chaines(e["params"]))
    e["titre_section"] = "Corpus de vérification"
    out.append(e)

def grand(taille, poids):
    return taille >= 35 or (taille >= 27.4 and poids >= 600)

def controles(s):
    W, H = s.W, s.H
    deb, sup, faibles = [], [], []
    for t in s.textes:
        if t["x0"] < -0.5 or t["x1"] > W + 0.5 or t["y0"] < -0.5 or t["y1"] > H + 0.5:
            deb.append(t["t"])
    for (x0, y0, x1, y1) in s.zones:
        if x0 < -0.5 or x1 > W + 0.5 or y0 < -0.5 or y1 > H + 0.5:
            deb.append(f"cadre {x0:.0f},{y0:.0f},{x1:.0f},{y1:.0f}")
    T = s.textes
    for i in range(len(T)):
        for j in range(i + 1, len(T)):
            a, b = T[i], T[j]
            if a["b"] is not None and a["b"] == b["b"]:
                continue
            if min(a["x1"], b["x1"]) - max(a["x0"], b["x0"]) > 1.5 and min(a["y1"], b["y1"]) - max(a["y0"], b["y0"]) > 1.5:
                sup.append(f"{a['t']!r}/{b['t']!r}")
    Z = s.zones
    for i in range(len(Z)):
        for j in range(i + 1, len(Z)):
            a, b = Z[i], Z[j]
            if min(a[2], b[2]) - max(a[0], b[0]) > 1.5 and min(a[3], b[3]) - max(a[1], b[1]) > 1.5:
                sup.append(f"cadres {tuple(round(v) for v in a)}/{tuple(round(v) for v in b)}")
    for t in T:
        for (x0, y0, x1, y1) in Z:
            if min(t["x1"], x1) - max(t["x0"], x0) > 1.5 and min(t["y1"], y1) - max(t["y0"], y0) > 1.5:
                if not (t["x0"] >= x0 - 1 and t["x1"] <= x1 + 1 and t["y0"] >= y0 - 1 and t["y1"] <= y1 + 1):
                    sup.append(f"texte à cheval : {t['t']!r}")
        mini = 3.0 if grand(t["taille"], t["poids"]) else 4.5
        r = themes_gss.contraste(t["couleur"], t["fond"])
        if r < mini:
            faibles.append(f"{t['t']!r} {t['couleur']} sur {t['fond']} = {r:.2f}")
    return deb, sup, faibles, min((t["taille"] for t in T), default=0)


corpus = out


def moteur_avant():
    """Moteur du commit de départ (gss_lib, gabarits, rendu_schemas, organigramme) + ressources partagées."""
    d = tempfile.mkdtemp(prefix="gss-moteur-avant-")
    for f in ("gss_lib.py", "gabarits.py", "rendu_schemas.py", "organigramme_gss.py"):
        src = subprocess.run(["git", "-C", RACINE_GIT, "show", f"{COMMIT}:gss-ao/backend/python/schemas_gss/{f}"],
                             capture_output=True, check=True).stdout
        open(os.path.join(d, f), "wb").write(src)
    for f in ("polices", "geo", "bibliotheque", "vocabulaire_valide.json", "dictionnaire_fr.txt.gz", "organigramme_gss.svg"):
        os.symlink(os.path.join(R, f), os.path.join(d, f))
    return d


def lancer(dossier, requete, theme):
    env = dict(os.environ)
    env.pop("GSS_THEME", None)
    if theme:
        env["GSS_THEME"] = theme
    r = subprocess.run(["python3", os.path.join(dossier, "rendu_schemas.py")], input=json.dumps(requete, ensure_ascii=False),
                       capture_output=True, text=True, env=env, timeout=900)
    if r.returncode:
        raise SystemExit(r.stderr[-2000:])
    return r.stdout


AVANT = moteur_avant()
bilan = {"commit_reference": COMMIT}
# 1. Retour arrière
req = {"mode": "rendre", "schemas": corpus}
avant = lancer(AVANT, req, None)
for nom, rq in (("rendre", req), ("rendre_format_page", {**req, "format": "page"}), ("rendre_format_paysage", {**req, "format": "paysage"})):
    bilan[f"retour_{nom}"] = {"identique": lancer(R, rq, "gss-2026-09") == avant}
res = json.loads(avant)["resultats"]
bilan["corpus"] = {"specifications": len(res), "acceptees": sum(1 for r in res if r["ok"]),
                   "gabarits": sorted(Counter(c["gabarit"] for c, r in zip(corpus, res) if r["ok"]).items())}
dem = [{"id": f"d{i}", "section": s, "texte": t} for i, (s, t) in enumerate([("b_presentation", "catalogue prestations agents"), ("b_rondes", "rondes pointeaux contrôleur"), ("b_engagement_rse", "mobilité vélo covoiturage")])]
bilan["retour_bibliotheque"] = {"identique": lancer(AVANT, {"mode": "bibliotheque", "demandes": dem}, None) == lancer(R, {"mode": "bibliotheque", "demandes": dem}, "gss-2026-09")}
sys.path.insert(0, R)
import organigramme_gss  # noqa: E402
JEUX = [None,
        {"tete": {"nom": "DUPONT Jean", "fonctions": ["Directeur d'agence"]}, "n2": [{"nom": "MARTIN Paul", "fonctions": ["Responsable RH", "Responsable administratif"]}, {"nom": "DURAND Luc", "fonctions": ["Responsable d'exploitation"], "exploitation": True}], "n3": [{"nom": "PETIT Ana", "fonction": "Responsable Incendie", "equipe": "Agents SSIAP"}]},
        {"tete": {"nom": "MARCHANI Adil", "fonctions": ["Directeur d'agence", "Responsable de marché"]}, "n2": [{"nom": f"NOM{i} Prénom", "fonctions": ["Responsable d'exploitation" if i in (2, 4) else "Responsable qualité"], "exploitation": i in (2, 4)} for i in range(6)], "n3": [{"nom": "ALAMAT Ramzi", "fonction": "Responsable Unité mobile", "equipe": "Agents contrôleurs, rondiers"}, {"nom": "PODKOLZIN Sergeï", "fonction": "Responsable Cynophile", "equipe": "Agents AMC, ADS"}]},
        {"tete": {"nom": "MARCHANI Adil", "fonctions": ["Directeur d'agence"]}, "n2": [{"nom": f"NOM{i} Prénom", "fonctions": ["Responsable qualité"]} for i in range(7)], "n3": [{"nom": "ALAMAT Ramzi", "fonction": "Responsable Unité mobile", "equipe": "Agents contrôleurs, rondiers"}]}]
org = []
for d in JEUX[:3]:
    sorties = []
    for dossier, theme in ((AVANT, None), (R, "gss-2026-09")):
        t = tempfile.mkdtemp()
        args = ["python3", os.path.join(dossier, "organigramme_gss.py"), os.path.join(t, "o.svg")]
        if d:
            json.dump(d, open(os.path.join(t, "d.json"), "w", encoding="utf-8"), ensure_ascii=False)
            args.append(os.path.join(t, "d.json"))
        env = dict(os.environ)
        env.pop("GSS_THEME", None)
        if theme:
            env["GSS_THEME"] = theme
        r = subprocess.run(args, capture_output=True, text=True, env=env)
        sorties.append(open(os.path.join(t, "o.svg"), encoding="utf-8").read() if r.returncode == 0 else f"ERREUR {r.stderr[-300:]}")
    org.append(sorties[0] == sorties[1])
bilan["retour_organigramme"] = {"identiques": org}
# Bibliothèque redessinée par le moteur d'origine (compteur de clipPath de la production) = fichiers d'origine
r = subprocess.run(["python3", "-c", f"""
import json, sys
sys.path.insert(0, {AVANT!r})
import gss_lib, gabarits
{''.join(__import__('inspect').getsource(dec))}
ok = 0
for sp in json.load(open({R!r} + '/bibliotheque/specs.json', encoding='utf-8'))['schemas']:
    if sp['gabarit'] == 'compose':
        ns = {{}}
        exec(chr(10).join(sp['imports']), ns)
        import re
        exec(re.sub(r'^@schema\\(.*\\)\\n', '', sp['code'], flags=re.M), ns)
        gss_lib._CLIP[0] = sp['clip_depart']
        svg = ns['_']().rendu()
    else:
        gss_lib._CLIP[0] = sp['clip_depart']
        svg = getattr(gabarits, sp['gabarit'])(*dec(sp['params']['args']), **dec(sp['params']['kwargs'])).rendu()
    ok += svg == open({R!r} + '/bibliotheque/' + sp['id'] + '.svg', encoding='utf-8').read()
print(ok)
"""], capture_output=True, text=True)
bilan["retour_bibliotheque_redessinee_octet_pour_octet"] = f"{(r.stdout or r.stderr).strip()} / {len(specs)}"

# 2. Format page dans chaque style
os.environ["GSS_THEME"] = "marine"
import rendu_schemas as RS  # noqa: E402
import themes_gss  # noqa: E402
from moteur_page import theme as TH, gabarits as GP  # noqa: E402
from moteur_page import organigramme as ORGP  # noqa: E402
pages = {}
for st in themes_gss.styles():
    RS.THEME = st
    RS._moteur_page.cache_clear()
    TH.utiliser(st, "page")
    b = {"corpus": Counter(), "bibliotheque": Counter(), "organigramme": Counter(), "defauts": [], "taille_min": 99}

    def noter(quoi, ident, s, svg, origine):
        deb, sup, faibles, tmin = controles(s)
        ctl = themes_gss.comparer_textes(svg, origine)
        b["taille_min"] = min(b["taille_min"], tmin) if tmin else b["taille_min"]
        ok = ctl["ok"] and not deb and not sup and not faibles
        b[quoi]["ok" if ok else "defaut"] += 1
        if not ok:
            b["defauts"].append({"id": ident, "textes": None if ctl["ok"] else {k: v for k, v in ctl.items() if k not in ("ok",)},
                                 "debordements": deb[:3], "superpositions": sup[:3], "contrastes": faibles[:3]})
    for sp in corpus:
        params = RS._jalons(sp["params"])
        if RS.controler_fond(params, sp["source"], sp["titre_section"]):
            continue
        try:
            origine = RS.construire(sp["gabarit"], params).rendu()
        except Exception:
            continue
        try:
            s = RS.construire(sp["gabarit"], params, RS._moteur_page())
        except Exception as e:
            b["corpus"]["refus_page"] += 1
            b["defauts"].append({"id": sp["id"], "refus_page": f"{type(e).__name__} {e}"[:200]})
            continue
        noter("corpus", sp["id"], s, s.rendu(), origine)
    for sp in specs:
        origine = open(f"{R}/bibliotheque/{sp['id']}.svg", encoding="utf-8").read()
        s = GP.COMPOSES[sp["id"]]() if sp["gabarit"] == "compose" else getattr(GP, sp["gabarit"])(*RS._decoder(sp["params"]["args"]), **RS._decoder(sp["params"]["kwargs"]))
        noter("bibliotheque", sp["id"], s, s.rendu(), origine)
    for i, d in enumerate(JEUX):
        d = d or organigramme_gss.DEFAUT
        s = ORGP.organigramme(d)
        noter("organigramme", f"organigramme-{i}", s, s.rendu(), organigramme_gss.organigramme(d))
    b = {k: (dict(v) if isinstance(v, Counter) else v) for k, v in b.items()}
    b["taille_min"] = round(b["taille_min"], 1)
    pages[st] = b
bilan["format_page"] = pages
json.dump(bilan, open(BILAN, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps({k: v for k, v in bilan.items() if k != "format_page"}, ensure_ascii=False, indent=1))
for st, b in pages.items():
    print(st, "corpus", b["corpus"], "bibliothèque", b["bibliotheque"], "organigramme", b["organigramme"], "taille min", b["taille_min"], "défauts", len(b["defauts"]))
