"""Marine v3 intégré : schémas « spec » (réponses de l'IA) de tous les gabarits, dans le style marine. Corpus de
_verif/themes_moteur.py (180 schémas de la bibliothèque convertis au format des réponses de l'IA + matrice,
camembert, colonnes, courbe, pourcentages, jauge, silhouette, process) : rendre() réussit, mêmes mots que le
style « marine-v1 » (moteur_page, textes du moteur d'origine), et les contrôles de la planche v3 passent (débordement, superpositions, points,
traits, étiquettes, contrastes, échelle) ; page remplie (D7). Usage : python3 _verif/marine_v3/spec_v3.py <sortie>"""
import json, os, re, sys
from collections import Counter
ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ICI, "..", "..", "python", "schemas_gss"))
os.environ["GSS_THEME"] = "marine"
import rendu_schemas as R  # noqa: E402
import subprocess
from moteur_marine import controle, dessin  # noqa: E402
src = open(os.path.join(ICI, "..", "themes_moteur.py"), encoding="utf-8").read()
ns = {"__file__": os.path.join(ICI, "..", "themes_moteur.py"), "themes_gss": None}
exec(src[:src.index("corpus = out")], ns)  # noqa: S102
corpus = ns["out"]
# Process du bloc 1 (reponse_libre_v2.specProcessBesoin : 5 étapes, « forme » process_besoin) : miroir « vous → nous → résultat ».
_p = {"etapes": [{"titre": "PC sécurité", "texte": "24 h/24, 7 j/7", "role": "rouge"},
                 {"titre": "Poste d'accueil", "texte": "20 h – 7 h, tous les soirs", "role": "rouge"},
                 {"titre": "Remplacement immédiat en 2 heures", "texte": "Notre dispositif de remplacement d'un agent absent", "role": "orange"},
                 {"titre": "Environ 50 puis 120 pointeaux", "texte": "Nos trois niveaux de contrôle et notre contrôleur de rondes", "role": "bleu"},
                 {"titre": "Votre résultat", "texte": "Continuité de service et traçabilité de chaque intervention", "role": "vert"}],
      "forme": "process_besoin"}
corpus.append({"id": "X-process-besoin", "gabarit": "flux", "params": _p, "source": ". ".join(ns["chaines"](_p)),
               "titre_section": "Notre compréhension de votre besoin"})
sortie = sys.argv[1]
os.makedirs(os.path.join(sortie, "svg"), exist_ok=True)
GP = R._moteur_page()
# Référence des textes : le même corpus rendu dans le style « marine-v1 » (moteur_page, textes identiques au moteur
# d'origine) par un sous-processus.
ref = json.loads(subprocess.run([sys.executable, os.path.join(ICI, "..", "..", "python", "schemas_gss", "rendu_schemas.py")],
                                input=json.dumps({"mode": "rendre", "format": "page", "schemas": corpus}), capture_output=True,
                                text=True, env={**os.environ, "GSS_THEME": "marine-v1"}).stdout)["resultats"]
ref = {r["id"]: r for r in ref}
res, ko = {}, []
for sp in corpus:
    r = R.rendre(dict(sp), "page")
    if not r["ok"]:
        # Spécification refusée : défaut seulement si le style « marine-v1 » l'accepte (sinon refus de la validation,
        # indépendant du style : l'IA reçoit le même message et corrige sa spécification).
        res[sp["id"]] = {"ok": False, "erreurs": r["erreurs"], "refus_v1": not ref[sp["id"]]["ok"]}
        if ref[sp["id"]]["ok"]:
            ko.append(sp["id"])
        continue
    params = R._jalons(sp["params"])
    s = GP.en_grand(lambda: R.construire(sp["gabarit"], params, GP), sp["gabarit"], params=params)
    svg = s.rendu()
    open(os.path.join(sortie, "svg", sp["id"] + ".svg"), "w", encoding="utf-8").write(svg)
    c = controle.controler(s, svg, svg)
    mots_svg = Counter(controle.jetons(controle.textes(svg)))
    attendus = Counter(controle.jetons(controle.textes(ref[sp["id"]]["svg"]))) if ref[sp["id"]]["ok"] else mots_svg
    manquants = sorted((attendus - mots_svg).elements()) + [f"+{m}" for m in sorted((mots_svg - attendus).elements())]
    c.update(gabarit=sp["gabarit"], remplissage=s.remplissage, occupation=round(dessin.occupation(s), 3),
             mots_differents_v1=manquants)
    c["ok"] = c["ok"] and not manquants
    res[sp["id"]] = c
    if not c["ok"]:
        ko.append(sp["id"])
occ = [v["occupation"] for v in res.values() if "occupation" in v]
bilan = {"schemas": len(res), "ok": len(res) - len(ko), "refus_identiques_v1": sorted(k for k, v in res.items() if v.get("refus_v1")), "defauts": {k: {d: v.get(d) for d in ("erreurs", "mots_differents_v1") + controle.DEFAUTS if v.get(d)} for k, v in res.items() if k in ko},
         "remplissage": dict(Counter(v.get("remplissage") for v in res.values())), "occupation_min": min(occ),
         "sous_cible": sorted(k for k, v in res.items() if v.get("occupation", 1) < dessin.CIBLE_HAUTEUR)}
json.dump({"bilan": bilan, "detail": res}, open(os.path.join(sortie, "rapport.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps(bilan, ensure_ascii=False, indent=1)[:6000])
sys.exit(0 if not ko and not bilan["sous_cible"] else 1)
