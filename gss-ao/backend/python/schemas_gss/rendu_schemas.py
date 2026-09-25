"""Rendu et contrôle des schémas GSS du mémoire technique (1 schéma par page).

Le dessin utilise EXACTEMENT le moteur de la planche validée par GSS (gss_lib.py +
gabarits.py, police Lexend, règle de couleur par rôle). Ce script :
  1. valide chaque spécification produite par l'IA (gabarit autorisé, structure,
     rôles de couleur, pictogrammes, et surtout FIDÉLITÉ AU TEXTE : chaque chiffre doit
     figurer dans le texte de la page, chaque mot dans la page ou dans le vocabulaire
     validé de la planche) ;
  2. dessine le schéma (tout débordement de texte est refusé par le moteur) ;
  3. en secours, choisit un schéma validé de la bibliothèque GSS pour la même section.

Entrée (stdin, JSON) :
  {"mode": "rendre", "schemas": [{"id", "gabarit", "params", "source", "titre_section"}]}
  {"mode": "bibliotheque", "demandes": [{"id", "section", "texte", "exclure": [...]}]}
Sortie (stdout, JSON) :
  {"resultats": [{"id", "ok", "svg" | "erreurs", "bibliotheque_id"?}]}
"""
import json
import os
import re
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)

import gss_lib  # noqa: E402
import gabarits as G  # noqa: E402

ROLES = {"bleu", "orange", "rouge", "vert", "sable", "creme", "or"}
ICONES = set(gss_lib.ICONES)
MOTS = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿŒœ]+")
NOMBRES = re.compile(r"\d+(?:[.,]\d+)?")
VOCAB = set()
for _m in json.load(open(os.path.join(ICI, "vocabulaire_valide.json"), encoding="utf-8")):
    VOCAB.update(w.lower() for w in MOTS.findall(_m))
# Clés numériques de mise en page (jamais affichées comme donnée)
CLES_MISE_EN_PAGE = {"maxi", "pas_grad", "cols", "apres_etape", "sous_etape"}


class Invalide(Exception):
    pass


# ── Normalisation ────────────────────────────────────────────────────────────
def _norm_nombres(t):
    t = re.sub(r"(?<=\d)[\s  ](?=\d{3}\b)", "", t)
    return {n.replace(",", ".").lstrip("0") or "0" for n in NOMBRES.findall(t)}


def _mots(t):
    return {w.lower() for w in MOTS.findall(t)}


# ── Contrôles de fond ────────────────────────────────────────────────────────
def _chaines(p, cle=None):
    """Toutes les valeurs affichées (chaînes et nombres) d'une spécification."""
    if isinstance(p, str):
        yield cle, p
    elif isinstance(p, bool) or p is None:
        return
    elif isinstance(p, (int, float)):
        if cle not in CLES_MISE_EN_PAGE:
            yield cle, f"{p:g}"
    elif isinstance(p, dict):
        for k, v in p.items():
            if k in ("role", "icone", "zone", "tenue", "role_centre", "alternative"):
                continue
            yield from _chaines(v, k)
    elif isinstance(p, (list, tuple)):
        for v in p:
            yield from _chaines(v, cle)


def controler_fond(params, source, titre_section):
    erreurs = []
    nombres_source = _norm_nombres(source + " " + titre_section)
    mots_source = _mots(source + " " + titre_section)
    for cle, t in _chaines(params):
        for n in _norm_nombres(t):
            if n not in nombres_source:
                erreurs.append(f"Le nombre « {n} » (dans « {t} ») n'apparaît pas dans le texte de la page : "
                               "n'utilise que des chiffres écrits dans la page.")
        for w in MOTS.findall(t):
            lw = w.lower()
            if len(lw) >= 4 and lw not in mots_source and lw not in VOCAB:
                erreurs.append(f"Le mot « {w} » (dans « {t} ») ne figure ni dans la page ni dans le vocabulaire "
                               "GSS validé : reprends les mots exacts du texte de la page.")
            if w[0] in "EAIOUC" and not w.isupper() and ({"E": "é", "A": "à", "I": "î", "O": "ô", "U": "ù", "C": "ç"}[w[0]] + lw[1:]) in (mots_source | VOCAB):
                erreurs.append(f"« {w} » : accent manquant sur la majuscule (écris « {({'E': 'É', 'A': 'À', 'I': 'Î', 'O': 'Ô', 'U': 'Ù', 'C': 'Ç'}[w[0]]) + w[1:]} »).")
        if t.count("(") != t.count(")") or t.count("«") != t.count("»") or t.count("“") != t.count("”"):
            erreurs.append(f"« {t} » : parenthèse ou guillemet non fermé (phrase coupée) ; reprends une phrase complète de la page.")
        premier = t.lstrip(" «“\"'(")[:1]
        if premier.isalpha() and premier.islower():
            erreurs.append(f"« {t} » doit commencer par une majuscule.")
        mots_maj = [w for w in MOTS.findall(t) if len(w) > 1]
        if len(mots_maj) >= 3 and all(w.isupper() for w in mots_maj):
            erreurs.append(f"« {t} » est écrit en capitales : écris en minuscules (majuscule initiale).")
    vus = {}
    for cle, t in _chaines(params):
        k = t.strip(" .").lower()
        if len(k) > 3 and cle not in ("valeur", "date") and k in vus:
            erreurs.append(f"« {t} » apparaît deux fois dans le schéma : chaque élément doit être différent.")
        vus[k] = True
    return erreurs


# ── Contrôles de structure ───────────────────────────────────────────────────
def _exiger(cond, msg):
    if not cond:
        raise Invalide(msg)


def _liste(v, nom, mini, maxi):
    _exiger(isinstance(v, list), f"« {nom} » doit être une liste.")
    _exiger(mini <= len(v) <= maxi, f"« {nom} » doit contenir entre {mini} et {maxi} éléments (reçu {len(v)}).")
    return v


def _txt(v, nom, maxi=90, requis=True):
    if v in (None, "") and not requis:
        return None
    _exiger(isinstance(v, str) and v.strip(), f"« {nom} » doit être un texte non vide.")
    _exiger(len(v) <= maxi, f"« {nom} » est trop long ({len(v)} caractères, maximum {maxi}) : « {v} ».")
    return v.strip()


def _role(v, defaut):
    v = v or defaut
    _exiger(v in ROLES, f"Rôle de couleur inconnu « {v} » (autorisés : {', '.join(sorted(ROLES))}).")
    return v


def _icone(v, requis=False):
    if not v and not requis:
        return None
    _exiger(v in ICONES, f"Pictogramme inconnu « {v} ».")
    return v


def _carte(d, nom, titre_max=48, texte_max=110, icone=True):
    _exiger(isinstance(d, dict), f"Chaque élément de « {nom} » doit être un objet.")
    o = {"titre": _txt(d.get("titre"), f"{nom}.titre", titre_max),
         "role": _role(d.get("role"), "creme")}
    t = _txt(d.get("texte"), f"{nom}.texte", texte_max, requis=False)
    if t:
        _exiger(t.strip(" .").lower() != o["titre"].strip(" .").lower(),
                f"« {nom} » : le texte répète le titre « {o['titre']} » ; supprime le texte ou apporte une précision de la page.")
    if t:
        o["texte"] = t
    if icone and d.get("icone"):
        o["icone"] = _icone(d.get("icone"))
    return o


def _centre(v):
    if isinstance(v, str):
        return (_txt(v, "centre", 40), None)
    _exiger(isinstance(v, dict), "« centre » doit être un objet {titre, sous_titre}.")
    return (_txt(v.get("titre"), "centre.titre", 40), _txt(v.get("sous_titre"), "centre.sous_titre", 60, False))


def construire(gabarit, p):
    """Valide la structure et appelle le gabarit validé correspondant."""
    _exiger(isinstance(p, dict), "« params » doit être un objet.")
    if gabarit == "grille":
        items = [_carte(d, "cartes") for d in _liste(p.get("cartes"), "cartes", 3, 9)]
        return G.grille(items)
    if gabarit == "etoile":
        br = [_carte(d, "branches") for d in _liste(p.get("branches"), "branches", 3, 7)]
        return G.etoile(_centre(p.get("centre")), br, role_centre=_role(p.get("role_centre"), "or"))
    if gabarit == "flux":
        et = [_carte(d, "etapes", 36, 90) for d in _liste(p.get("etapes"), "etapes", 2, 5)]
        labels = {}
        for d in p.get("conditions") or []:
            i = d.get("apres_etape")
            _exiger(isinstance(i, int) and 1 <= i < len(et), "« conditions.apres_etape » doit désigner une étape (1 à n-1).")
            labels[i - 1] = (_txt(d.get("texte"), "conditions.texte", 30), _role(d.get("role"), "rouge"))
        sorties = {}
        for d in p.get("issues") or []:
            i = d.get("sous_etape")
            _exiger(isinstance(i, int) and 1 <= i <= len(et), "« issues.sous_etape » doit désigner une étape.")
            s = _carte(d, "issues", 36, 90, icone=False)
            if d.get("condition"):
                _exiger(i < len(et), "Une issue avec condition ne peut pas être placée sous la dernière étape : "
                        "mets-la sous une autre étape ou supprime la condition.")
                s["label"] = (_txt(d.get("condition"), "issues.condition", 30), "rouge")
            sorties[i - 1] = s
        _exiger(len(sorties) <= 2, "Deux issues au maximum sous les étapes.")
        return G.flux(et, labels=labels, sorties=sorties)
    if gabarit == "chevrons":
        et = []
        for d in _liste(p.get("etapes"), "etapes", 3, 4):
            c = _carte(d, "etapes", 26, 110, icone=False)
            et.append({"titre": c["titre"], "role": c["role"], "texte": [c["texte"]] if c.get("texte") else []})
        return G.chevrons(et)
    if gabarit == "comparatif":
        cols = []
        for d in _liste(p.get("colonnes"), "colonnes", 2, 3):
            c = _carte(d, "colonnes", 40, 0, icone=True)
            c.pop("texte", None)
            sous = _txt(d.get("sous_titre"), "colonnes.sous_titre", 60, False)
            if sous:
                c["sous"] = sous
            c["points"] = [_txt(x, "colonnes.points", 80) for x in _liste(d.get("points"), "colonnes.points", 1, 6)]
            cols.append(c)
        return G.comparatif(cols, vs=bool(p.get("alternative")) and len(cols) == 2)
    if gabarit == "chiffres":
        t = []
        for d in _liste(p.get("chiffres"), "chiffres", 2, 6):
            _exiger(isinstance(d, dict), "Chaque chiffre doit être un objet.")
            t.append({"valeur": _txt(str(d.get("valeur", "")), "chiffres.valeur", 14),
                      "label": _txt(d.get("libelle"), "chiffres.libelle", 90),
                      "role": _role(d.get("role"), "creme"), "icone": _icone(d.get("icone"))})
        return G.chiffres(t, note=_txt(p.get("note"), "note", 100, False))
    if gabarit == "checklist":
        gr = []
        for d in _liste(p.get("groupes"), "groupes", 1, 3):
            _exiger(isinstance(d, dict), "Chaque groupe doit être un objet.")
            g = {"titre": _txt(d.get("titre"), "groupes.titre", 40), "role": _role(d.get("role"), "bleu"),
                 "icone": _icone(d.get("icone")),
                 "items": [_txt(x, "groupes.points", 110) for x in _liste(d.get("points"), "groupes.points", 1, 7)]}
            s = _txt(d.get("sous_titre"), "groupes.sous_titre", 80, False)
            if s:
                g["sous"] = s
            gr.append(g)
        return G.checklist(gr)
    if gabarit == "cycle":
        se = []
        for d in _liste(p.get("etapes"), "etapes", 3, 4):
            c = _carte(d, "etapes", 40, 90, icone=False)
            c["court"] = _txt(d.get("titre_court") or c["titre"], "etapes.titre_court", 18)
            se.append(c)
        return G.cycle(se, _centre(p.get("centre")))
    if gabarit == "pyramide":
        nv = []
        for d in _liste(p.get("niveaux"), "niveaux", 3, 5):
            c = _carte(d, "niveaux", 40, 90, icone=False)
            c["court"] = _txt(d.get("titre_court") or c["titre"], "niveaux.titre_court", 22)
            nv.append(c)
        return G.pyramide(nv)
    if gabarit == "arbre":
        r = _carte(p.get("racine") or {}, "racine", 44, 70)
        en = []
        for d in _liste(p.get("branches"), "branches", 2, 4):
            c = _carte(d, "branches", 34, 90)
            if d.get("sous_elements"):
                c["items"] = [_txt(x, "branches.sous_elements", 44) for x in _liste(d.get("sous_elements"), "branches.sous_elements", 1, 6)]
                c.pop("texte", None)
            en.append(c)
        a_items = any(c.get("items") for c in en)
        return G.arbre(r, en, h_racine=100, h_enfant=86 if a_items else 190)
    if gabarit == "frise":
        j = []
        for d in _liste(p.get("jalons"), "jalons", 3, 7):
            c = _carte(d, "jalons", 36, 100, icone=False)
            c["date"] = _txt(d.get("date"), "jalons.date", 18, False)
            c["h"] = 170
            _exiger(not c["date"] or c["date"] not in [x["date"] for x in j],
                    f"La date « {c['date']} » est utilisée pour deux jalons : chaque jalon doit avoir sa propre date.")
            j.append(c)
        return G.frise(j, w_carte=340 if len(j) <= 3 else None)
    if gabarit == "jauge":
        m = []
        for d in _liste(p.get("reperes"), "reperes", 2, 4):
            c = _carte(d, "reperes", 30, 90, icone=False)
            v = d.get("valeur")
            _exiger(isinstance(v, (int, float)) and v > 0, "« reperes.valeur » doit être un nombre positif.")
            c.update(val=v, w=260, h=120)
            m.append(c)
        maxi = max(x["val"] for x in m)
        unite = _txt(p.get("unite"), "unite", 10)
        return G.jauge(maxi, unite, m, pas_grad=maxi / 4, note=_txt(p.get("note"), "note", 100, False))
    if gabarit == "fiche":
        stats = []
        for d in _liste(p.get("chiffres"), "chiffres", 1, 3):
            stats.append((_txt(str(d.get("valeur", "")), "chiffres.valeur", 14), _txt(d.get("libelle"), "chiffres.libelle", 40)))
        return G.fiche(_txt(p.get("nom"), "nom", 50), _txt(p.get("lieu"), "lieu", 60, False) or "",
                       _icone(p.get("icone"), True), stats,
                       [_txt(x, "missions", 70) for x in _liste(p.get("missions"), "missions", 3, 14)],
                       titre_missions=_txt(p.get("titre_missions"), "titre_missions", 30, False) or "Nos missions",
                       secteur_txt=_txt(p.get("secteur"), "secteur", 24, False))
    if gabarit == "silhouette":
        an = []
        for d in _liste(p.get("reperes"), "reperes", 3, 6):
            c = _carte(d, "reperes", 36, 70, icone=False)
            a = d.get("zone")
            _exiger(a in ("tete", "col", "torse", "poitrine", "bras", "taille", "jambes", "pieds", "epaules", "main"),
                    f"Zone de silhouette inconnue « {a} ».")
            c.update(ancre=a, cote="g" if len(an) < (len(p["reperes"]) + 1) // 2 else "d")
            an.append(c)
        tenue = p.get("tenue") or "intervention"
        _exiger(tenue in ("costume", "intervention", "ssiap"), "« tenue » : costume, intervention ou ssiap.")
        return G.silhouette(an, tenue=tenue)
    if gabarit == "matrice":
        lig = [_txt(x, "lignes", 40) for x in _liste(p.get("lignes"), "lignes", 2, 5)]
        col = [_txt(x, "colonnes", 28) for x in _liste(p.get("colonnes"), "colonnes", 2, 4)]
        cel = _liste(p.get("cellules"), "cellules", len(lig), len(lig))
        cel = [[("✓" if v in (True, "✓", "x", "X") else (_txt(v, "cellules", 40, False) or "")) for v in _liste(r, "cellules[ligne]", len(col), len(col))] for r in cel]
        return G.matrice(lig, col, cel)
    if gabarit == "camembert":
        parts = []
        for d in _liste(p.get("parts"), "parts", 2, 5):
            v = d.get("valeur")
            _exiger(isinstance(v, (int, float)) and v > 0, "« parts.valeur » doit être un nombre positif.")
            parts.append({"label": _txt(d.get("libelle"), "parts.libelle", 40), "valeur": v, "role": _role(d.get("role"), "sable")})
        total = p.get("total")
        _exiger(isinstance(total, (int, float)) and abs(sum(x["valeur"] for x in parts) - total) < 1e-6,
                "Camembert : « total » doit être écrit dans la page ET égal à la somme des parts ; sinon choisis un autre gabarit.")
        return G.camembert(parts, centre=(f"{total:g}", _txt(p.get("libelle_total"), "libelle_total", 40)))
    if gabarit == "barres":
        se = []
        for d in _liste(p.get("barres"), "barres", 2, 8):
            v = d.get("valeur")
            _exiger(isinstance(v, (int, float)) and v >= 0, "« barres.valeur » doit être un nombre.")
            se.append({"label": _txt(d.get("libelle"), "barres.libelle", 40), "valeur": v, "role": _role(d.get("role"), "sable")})
        return G.barres(se, unite=_txt(p.get("unite"), "unite", 12, False) or "", note=_txt(p.get("note"), "note", 100, False))
    raise Invalide(f"Gabarit inconnu « {gabarit} ».")


# ── Sortie : SVG sur une ligne, identifiants préfixés (plusieurs SVG par document) ──
def finaliser(svg, prefixe):
    p = re.sub(r"[^a-zA-Z0-9]", "", prefixe)
    svg = re.sub(r'id="([^"]+)"', lambda m: f'id="{p}-{m.group(1)}"', svg)
    svg = re.sub(r'url\(#([^)]+)\)', lambda m: f'url(#{p}-{m.group(1)})', svg)
    svg = svg.replace('width="1200" height="660"', 'width="100%" preserveAspectRatio="xMidYMid meet"', 1)
    return re.sub(r"\s*\n\s*", " ", svg).strip()


def _jalons(v):
    """Notation GSS des jalons : « j+15 » / « j-30 » → « J+15 » / « J-30 »."""
    if isinstance(v, str):
        return re.sub(r"\bj\s*([+-])\s*(\d+)", lambda m: f"J{m.group(1)}{m.group(2)}", v)
    if isinstance(v, list):
        return [_jalons(x) for x in v]
    if isinstance(v, dict):
        return {k: _jalons(x) for k, x in v.items()}
    return v


def rendre(sp):
    ident = sp.get("id", "s")
    try:
        params = _jalons(sp.get("params") or {})
        erreurs = controler_fond(params, sp.get("source", ""), sp.get("titre_section", ""))
        if erreurs:
            return {"id": ident, "ok": False, "erreurs": erreurs[:12]}
        svg = construire(sp.get("gabarit"), params).rendu()
        return {"id": ident, "ok": True, "svg": finaliser(svg, "s" + ident)}
    except Invalide as e:
        return {"id": ident, "ok": False, "erreurs": [str(e)]}
    except gss_lib.Deborde:
        return {"id": ident, "ok": False, "erreurs": [
            "Un texte ne tient pas dans son cadre : raccourcis les libellés (moins de mots) ou réduis le nombre d'éléments."]}
    except Exception as e:  # noqa: BLE001
        return {"id": ident, "ok": False, "erreurs": [f"Spécification incorrecte : {type(e).__name__} {e}"[:300]]}


def bibliotheque(demandes):
    index = json.load(open(os.path.join(ICI, "bibliotheque", "index.json"), encoding="utf-8"))
    dispo = [x for x in index if x["reutilisable"]]
    utilises = set()
    for d in demandes:
        utilises.update(d.get("exclure") or [])
    out = []
    for d in demandes:
        mots = {w for w in _mots(d.get("texte", "")) if len(w) >= 4}

        def score(x):
            return len(mots & {w for w in _mots(x["texte"] + " " + x["titre"]) if len(w) >= 4})
        cands = [x for x in dispo if x["id"] not in utilises and x["section"] == d.get("section")]
        if not cands:
            cands = [x for x in dispo if x["id"] not in utilises]
        if not cands:
            cands = dispo
        x = max(cands, key=score)
        utilises.add(x["id"])
        svg = open(os.path.join(ICI, "bibliotheque", x["id"] + ".svg"), encoding="utf-8").read()
        out.append({"id": d["id"], "ok": True, "bibliotheque_id": x["id"], "svg": finaliser(svg, "b" + d["id"])})
    return out


def main():
    req = json.load(sys.stdin)
    if req.get("mode") == "bibliotheque":
        res = bibliotheque(req.get("demandes") or [])
    else:
        res = [rendre(sp) for sp in req.get("schemas") or []]
    sys.stdout.write(json.dumps({"resultats": res}, ensure_ascii=False))


if __name__ == "__main__":
    main()
