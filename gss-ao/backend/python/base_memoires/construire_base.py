"""Construit la BASE DE MÉMOIRES GSS : les réponses d'appels d'offres déjà rédigées par GSS,
découpées en passages réutilisables, datés et sourcés.

Chaque passage garde : le document d'origine, le client, la DATE du mémoire, la page, le titre de
rubrique le plus proche. La date sert à arbitrer les informations qui évoluent (effectifs, noms,
véhicules, certifications…) : à information divergente, la source la plus récente prime.

Les passages identiques ou quasi identiques entre mémoires (ex. Région Normandie lots 1, 2 et 3)
sont fusionnés : on garde la version du mémoire le plus récent et la liste des mémoires qui la
contiennent (un contenu repris dans plusieurs réponses est un contenu éprouvé).

Les corrections apportées par GSS aux anciens mémoires (corrections_passages.json : une ligne du texte extrait
d'une page remplacée par sa valeur actuelle, avec sa source) sont réappliquées à chaque reconstruction, aux passages
comme aux textes intégraux qui servent au registre : une reconstruction ne réintroduit jamais un fait corrigé
(Peugeot 3008, 76 rue d'Elbeuf, 02.35.89.09.92, J-15…).

Usage :
  python3 construire_base.py <dossier_des_mémoires> <sortie.json>
  python3 construire_base.py --corriger <base_memoires.json>   (réapplique les corrections à une base existante)
Le dossier contient les réponses GSS (PDF) et un fichier documents.json décrivant chacune :
  [{"fichier": "...pdf", "client": "...", "date": "AAAA-MM", "type": "memoire|cadre"}]
Nécessite pdftotext (poppler).
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import unicodedata

TAILLE = 1400      # caractères par passage (une procédure GSS tient en général dans un passage)
RECOUV = 200


def norm(t):
    t = unicodedata.normalize("NFKD", t.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def est_titre(ligne):
    l = ligne.strip()
    lettres = re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿ]", "", l)
    return 6 <= len(l) <= 90 and len(lettres) >= 5 and lettres.isupper()


def pages_de(pdf):
    brut = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True).stdout
    return brut.split("\f")


def nettoyer(page):
    lignes = [re.sub(r"\s{2,}", " ", l).strip() for l in page.splitlines()]
    return [l for l in lignes if l]


def decouper(texte):
    if len(texte) <= TAILLE:
        return [texte]
    out, i = [], 0
    while i < len(texte):
        fin = min(len(texte), i + TAILLE)
        if fin < len(texte):
            coupe = max(texte.rfind(". ", i + TAILLE // 2, fin), texte.rfind("\n", i + TAILLE // 2, fin))
            if coupe > i:
                fin = coupe + 1
        out.append(texte[i:fin].strip())
        if fin >= len(texte):
            break
        i = max(fin - RECOUV, i + 1)
    return [o for o in out if o]


def shingles(t, k=5):
    m = norm(t).split()
    return {" ".join(m[i:i + k]) for i in range(max(1, len(m) - k + 1))}


CORRECTIONS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "corrections_passages.json")


def charger_corrections():
    try:
        return json.load(open(CORRECTIONS, encoding="utf-8")).get("corrections", [])
    except FileNotFoundError:
        return []


def corriger_texte(texte, document, page, corrections):
    """Remplace, dans le texte d'une page (ou d'un passage) de `document`, chaque ligne égale à une ligne « ancien »."""
    lignes = texte.split("\n")
    for c in corrections:
        if c["document"] == document and int(c["page"]) == int(page):
            lignes = [c["nouveau"] if l == c["ancien"] else l for l in lignes]
    return "\n".join(lignes)


def appliquer_corrections(passages, corrections):
    for p in passages:
        p["texte"] = corriger_texte(p["texte"], p["document"], p["page"], corrections)
    return passages


def main(dossier, sortie):
    docs = json.load(open(os.path.join(dossier, "documents.json"), encoding="utf-8"))
    passages = []
    for d in docs:
        titre_courant = ""
        for num, page in enumerate(pages_de(os.path.join(dossier, d["fichier"])), 1):
            lignes = nettoyer(page)
            if sum(len(l.split()) for l in lignes) < 25:
                continue  # page d'image / de logos
            titres = [l for l in lignes if est_titre(l)]
            if titres:
                titre_courant = " — ".join(dict.fromkeys(titres[:2]))
            texte = "\n".join(lignes)
            for morceau in decouper(texte):
                passages.append({
                    "document": d["fichier"], "client": d["client"], "date": d["date"], "type": d["type"],
                    "page": num, "rubrique": titre_courant[:160], "texte": morceau,
                })
    # Fusion des doublons : on garde la version du mémoire le plus récent.
    passages.sort(key=lambda p: p["date"], reverse=True)
    gardes, sh = [], []
    for p in passages:
        s = shingles(p["texte"])
        dup = None
        for i, s2 in enumerate(sh):
            if s and s2 and len(s & s2) / len(s | s2) >= 0.85:
                dup = i
                break
        if dup is None:
            p["aussi_dans"] = []
            gardes.append(p)
            sh.append(s)
        else:
            g = gardes[dup]
            ref = f'{p["client"]} ({p["date"]})'
            if ref not in g["aussi_dans"] and p["document"] != g["document"]:
                g["aussi_dans"].append(ref)
    for p in gardes:
        p["id"] = hashlib.sha1((p["document"] + str(p["page"]) + p["texte"][:80]).encode()).hexdigest()[:16]
    corrections = charger_corrections()
    appliquer_corrections(gardes, corrections)
    json.dump({"documents": docs, "passages": gardes}, open(sortie, "w", encoding="utf-8"), ensure_ascii=False)
    # Texte intégral par mémoire (page par page) : sert à l'extraction du registre des informations.
    textes = {d["fichier"]: [corriger_texte("\n".join(nettoyer(p)), d["fichier"], n, corrections)
                             for n, p in enumerate(pages_de(os.path.join(dossier, d["fichier"])), 1)] for d in docs}
    json.dump(textes, open(sortie.replace(".json", "_textes.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print(f"{len(passages)} passages extraits → {len(gardes)} après fusion des doublons")


if __name__ == "__main__":
    if sys.argv[1] == "--corriger":
        base = json.load(open(sys.argv[2], encoding="utf-8"))
        appliquer_corrections(base["passages"], charger_corrections())
        json.dump(base, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False)
    else:
        main(sys.argv[1], sys.argv[2])
