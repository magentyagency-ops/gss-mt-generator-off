"""Rendu et contrôle des schémas GSS du mémoire technique (1 schéma par page).

Le dessin utilise EXACTEMENT le moteur de la planche validée par GSS (gss_lib.py +
gabarits.py, police Lexend, règle de couleur par rôle). Ce script :
  1. valide chaque spécification produite par l'IA (gabarit autorisé, structure,
     rôles de couleur, pictogrammes, et surtout FIDÉLITÉ AU TEXTE : chaque chiffre doit
     figurer dans le texte de la page, chaque mot dans la page ou dans le vocabulaire
     validé de la planche) ;
  2. dessine le schéma (tout débordement de texte est refusé par le moteur) ;
  3. en secours, choisit un schéma validé de la bibliothèque GSS pour la même section.

THÈME (forme seulement : textes, contrôles et choix du gabarit inchangés) : variable d'environnement GSS_THEME,
sinon le style par défaut de themes/themes.json (« marine », style recommandé par l'agent design) ; voir
themes_gss.py. « gss-2026-09 » (retour arrière) redonne exactement les SVG d'avant les thèmes.
FORMAT (champ « format » de la requête) :
  · « paysage » (par défaut) : schéma placé dans le texte, toile 1200 × 660 du moteur d'origine, aux couleurs et
    à la police du thème ;
  · « page » : 1 schéma = 1 page A4 portrait (toile 1000 × 1270, 77 % de la hauteur de la page), moteur_page.

Entrée (stdin, JSON) :
  {"mode": "rendre", "format"?, "schemas": [{"id", "gabarit", "params", "source", "titre_section"}]}
  {"mode": "bibliotheque", "demandes": [{"id", "section", "texte", "exclure": [...]}]}
  {"mode": "redessiner", "format"?, "ids"?: [...], "forcer"?: false}
      schémas de la bibliothèque (180) redessinés dans le thème actif, depuis bibliotheque/specs.json (format page)
      ou aux couleurs du thème (format paysage) ; cache par thème (bibliotheque/themes/<thème>/<format>) ; les
      textes de chaque schéma redessiné sont contrôlés : identiques à l'original, sinon schéma d'origine aux
      couleurs du thème.
Sortie (stdout, JSON) :
  {"resultats": [{"id", "ok", "svg" | "erreurs", "bibliotheque_id"?, "source"?}]}
En ligne de commande : python3 rendu_schemas.py --redessiner [--theme T] [--format page|paysage] [--ids A,B]
  [--forcer] [--rapport fichier.json] — remplit le cache et affiche le bilan.
"""
import gzip
import html
import json
import os
import re
import sys
import unicodedata
from functools import lru_cache

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)

import gss_lib  # noqa: E402
import gabarits as G  # noqa: E402
import themes_gss  # noqa: E402

THEME = themes_gss.theme_actif()

ROLES = {"bleu", "orange", "rouge", "vert", "sable", "creme", "or"}
ICONES = set(gss_lib.ICONES)
MOTS = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿŒœ]+")
NOMBRES = re.compile(r"\d+(?:[.,]\d+)?")
VOCAB = set()
for _m in json.load(open(os.path.join(ICI, "vocabulaire_valide.json"), encoding="utf-8")):
    VOCAB.update(w.lower() for w in MOTS.findall(_m))
# Dictionnaire français (orthographe) : liste Gutenberg, formes NFC en minuscules.
with gzip.open(os.path.join(ICI, "dictionnaire_fr.txt.gz"), "rt", encoding="utf-8") as _f:
    DICO = set(_f.read().split("\n"))
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
            if k in ("role", "icone", "zone", "tenue", "role_centre", "alternative", "forme"):
                continue
            yield from _chaines(v, k)
    elif isinstance(p, (list, tuple)):
        for v in p:
            yield from _chaines(v, cle)


def _derive_de_la_page(lw, mots_source):
    """Mot correctement orthographié (dictionnaire) ET de la même famille qu'un mot de la page
    (même racine de 5 lettres) : « Sélection » ← « sélectionnons », « Contrôle » ← « contrôler ».
    Un mot sans lien avec la page (« garanti », « délai ») reste refusé : aucune invention."""
    if lw not in DICO:
        return False
    racine = lw[:5] if len(lw) >= 6 else lw[:4]
    return any(m.startswith(racine) for m in mots_source)


def _distance1(a, b):
    """Vrai si a et b diffèrent d'une seule lettre (ajout, suppression ou substitution)."""
    if abs(len(a) - len(b)) > 1 or a == b:
        return False
    if len(a) == len(b):
        return sum(x != y for x, y in zip(a, b)) == 1
    if len(a) > len(b):
        a, b = b, a
    return any(b[:i] + b[i + 1:] == a for i in range(len(b)))


def _orthographe_page(w, mots_minuscules):
    """Mot repris de la page mais absent du dictionnaire et du vocabulaire validé : nom propre
    ou sigle accepté, sauf s'il ressemble à une lettre près à un mot validé GSS (faute probable)."""
    lw = w.lower()
    if lw in DICO or lw in VOCAB:
        return None
    proche = next((v for v in VOCAB if len(v) >= 4 and _distance1(lw, v)), None)
    if proche:
        return f"« {w} » semble mal orthographié : l'orthographe validée GSS est « {proche.upper() if w.isupper() else proche} »."
    if w[0].islower() or lw in mots_minuscules:
        return f"« {w} » n'est pas un mot français reconnu (faute probable dans la page) : utilise un autre mot de la page."
    return None


def controler_fond(params, source, titre_section):
    erreurs = []
    source = unicodedata.normalize("NFC", source)
    titre_section = unicodedata.normalize("NFC", titre_section)
    nombres_source = _norm_nombres(source + " " + titre_section)
    mots_source = _mots(source + " " + titre_section)
    mots_minuscules = {w for w in MOTS.findall(source) if w[0].islower()}
    for cle, t in _chaines(params):
        t = unicodedata.normalize("NFC", t)
        for n in _norm_nombres(t):
            if n not in nombres_source:
                erreurs.append(f"Le nombre « {n} » (dans « {t} ») n'apparaît pas dans le texte de la page : "
                               "n'utilise que des chiffres écrits dans la page.")
        for w in MOTS.findall(t):
            lw = w.lower()
            if len(lw) >= 4 and lw in mots_source:
                probleme = _orthographe_page(w, mots_minuscules)
                if probleme:
                    erreurs.append(probleme)
            if len(lw) >= 4 and lw not in mots_source and lw not in VOCAB and not _derive_de_la_page(lw, mots_source):
                erreurs.append(f"Le mot « {w} » (dans « {t} ») ne figure ni dans la page ni dans le vocabulaire "
                               "GSS validé : reprends les mots exacts du texte de la page.")
            if w[0] in "EAIOUC" and not w.isupper() and ({"E": "é", "A": "à", "I": "î", "O": "ô", "U": "ù", "C": "ç"}[w[0]] + lw[1:]) in (mots_source | VOCAB):
                erreurs.append(f"« {w} » : accent manquant sur la majuscule (écris « {({'E': 'É', 'A': 'À', 'I': 'Î', 'O': 'Ô', 'U': 'Ù', 'C': 'Ç'}[w[0]]) + w[1:]} »).")
        if t.count("(") != t.count(")") or t.count("«") != t.count("»") or t.count("“") != t.count("”"):
            erreurs.append(f"« {t} » : parenthèse ou guillemet non fermé (phrase coupée) ; reprends une phrase complète de la page.")
        premier = t.lstrip(" «“\"'(")[:1]
        if premier.isalpha() and premier.islower() and cle not in ("unite",):
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


def construire(gabarit, p, G=G):
    """Valide la structure et appelle le gabarit validé correspondant (G : moteur d'origine, ou moteur_page
    pour le format page ; mêmes noms et mêmes paramètres)."""
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
        # Process du bloc 1 (« forme » : process_besoin, 5 étapes : besoin, enjeu, dispositif, pilotage, résultat) : le moteur
        # qui sait le dessiner en miroir « vous → nous → résultat » (style « marine » v3) le fait ; les autres le dessinent en flux.
        if p.get("forme") == "process_besoin" and len(et) == 5 and not labels and not sorties and hasattr(G, "process_besoin"):
            return G.process_besoin(et)
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
    if gabarit == "colonnes":
        se = []
        for d in _liste(p.get("colonnes"), "colonnes", 2, 7):
            v = d.get("valeur")
            _exiger(isinstance(v, (int, float)) and v >= 0, "« colonnes.valeur » doit être un nombre.")
            se.append({"label": _txt(d.get("libelle"), "colonnes.libelle", 30), "valeur": v, "role": _role(d.get("role"), "sable")})
        return G.colonnes(se, unite=_txt(p.get("unite"), "unite", 14, False) or "", note=_txt(p.get("note"), "note", 100, False))
    if gabarit == "courbe":
        et = [_txt(x, "periodes", 16) for x in _liste(p.get("periodes"), "periodes", 3, 8)]
        se = []
        for d in _liste(p.get("series"), "series", 1, 2):
            vals = _liste(d.get("valeurs"), "series.valeurs", len(et), len(et))
            _exiger(all(isinstance(v, (int, float)) and v >= 0 for v in vals), "« series.valeurs » : un nombre par période.")
            se.append({"libelle": _txt(d.get("libelle"), "series.libelle", 30), "role": _role(d.get("role"), "bleu"), "valeurs": vals})
        return G.courbe(et, se, unite=_txt(p.get("unite"), "unite", 14, False) or "", note=_txt(p.get("note"), "note", 100, False))
    if gabarit == "pourcentages":
        t = []
        for d in _liste(p.get("taux"), "taux", 1, 4):
            v = d.get("valeur")
            _exiger(isinstance(v, (int, float)) and 0 <= v <= 100, "« taux.valeur » doit être un pourcentage entre 0 et 100.")
            c = _carte(d, "taux", 36, 80, icone=False)
            c.update(valeur=v, libelle=c.pop("titre"))
            t.append(c)
        return G.pourcentages(t, note=_txt(p.get("note"), "note", 100, False))
    raise Invalide(f"Gabarit inconnu « {gabarit} ».")


# ── Sortie : SVG sur une ligne, identifiants préfixés (plusieurs SVG par document) ──
def _recadrer(svg, marge=28):
    """Recadre la hauteur du dessin sur son contenu (largeur 1200 inchangée : centrage horizontal
    et marges latérales identiques). Évite qu'un espace vide au-dessus ou au-dessous occupe la page."""
    corps = svg.split("</defs>", 1)[-1]
    # Pictogrammes et chevrons : coordonnées locales (transform), toujours contenus dans leur carte.
    corps = re.sub(r'<g transform="[^"]*"[^>]*>.*?</g>', "", corps, flags=re.S)
    corps = re.sub(r'<[^>]*\stransform="[^"]*"[^>]*/>', "", corps)
    ys = []
    for m in re.finditer(r'<rect [^>]*?y="([\d.-]+)"[^>]*?height="([\d.]+)"', corps):
        if 'width="1200"' in m.group(0) and 'height="660"' in m.group(0):
            continue  # fond
        ys += [float(m.group(1)), float(m.group(1)) + float(m.group(2))]
    for m in re.finditer(r'<circle [^>]*?cy="([\d.-]+)"[^>]*?r="([\d.]+)"', corps):
        ys += [float(m.group(1)) - float(m.group(2)), float(m.group(1)) + float(m.group(2))]
    for m in re.finditer(r'<text [^>]*?y="([\d.-]+)"[^>]*?font-size="([\d.]+)"', corps):
        ys += [float(m.group(1)) - float(m.group(2)), float(m.group(1)) + float(m.group(2)) * 0.3]
    for m in re.finditer(r'<line [^>]*?y1="([\d.-]+)"[^>]*?y2="([\d.-]+)"', corps):
        ys += [float(m.group(1)), float(m.group(2))]
    for m in re.finditer(r' d="([^"]+)"', corps):
        d = m.group(1)
        pts = [float(y) for y in re.findall(r"[-\d.]+,([-\d.]+)", d)]
        ys += pts
        # Arcs (anneaux, camemberts, cycles) : le bombé dépasse les extrémités → marge du rayon.
        for r in re.findall(r"A([\d.]+),[\d.]+", d):
            if pts:
                ys += [min(pts) - float(r), max(pts) + float(r)]
    if not ys:
        return svg
    y0 = max(0.0, min(ys) - marge)
    y1 = min(660.0, max(ys) + marge)
    h = y1 - y0
    if h >= 600:
        return svg
    svg = svg.replace('viewBox="0 0 1200 660" width="1200" height="660"',
                      f'viewBox="0 {y0:.0f} 1200 {h:.0f}" width="1200" height="{h:.0f}"', 1)
    return svg.replace('<rect width="1200" height="660"', f'<rect y="{y0:.0f}" width="1200" height="{h:.0f}"', 1)


def finaliser(svg, prefixe):
    svg = _recadrer(svg)
    p = re.sub(r"[^a-zA-Z0-9]", "", prefixe)
    svg = re.sub(r'id="([^"]+)"', lambda m: f'id="{p}-{m.group(1)}"', svg)
    svg = re.sub(r'url\(#([^)]+)\)', lambda m: f'url(#{p}-{m.group(1)})', svg)
    svg = re.sub(r'width="1200" height="\d+"', 'width="100%" preserveAspectRatio="xMidYMid meet"', svg, count=1)
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


# ── Moteur selon le thème et le format ──────────────────────────────────────
def _moteur_v3():
    """Vrai si le thème actif est dessiné par le moteur de la planche validée « Marine & signal » v3."""
    return (themes_gss.styles().get(THEME) or {}).get("moteur") == "moteur_marine"


@lru_cache(maxsize=None)
def _moteur_page():
    """Gabarits du format page (A4 portrait) dans le thème actif : moteur_marine (style « marine », version 3 validée
    par le patron de GSS), sinon moteur_page (autres styles, « marine-v1 », retour arrière)."""
    if _moteur_v3():
        from moteur_marine import theme as th_v3, gabarits as gabarits_v3
        th_v3.utiliser(THEME, "page")
        return gabarits_v3
    from moteur_page import theme as th_page, gabarits as gabarits_page
    th_page.utiliser(THEME, "page")
    return gabarits_page


def _format(fmt):
    return themes_gss.format_effectif(THEME, fmt)


def _deborde(e):
    """Débordement de texte : moteur d'origine ou moteur page (même message à l'IA)."""
    if isinstance(e, gss_lib.Deborde):
        return True
    for mod in ("moteur_page.gss_lib", "moteur_marine.gss_lib"):
        try:
            if isinstance(e, __import__(mod, fromlist=["Deborde"]).Deborde):
                return True
        except Exception:  # noqa: BLE001
            continue
    return False


def finaliser_page(svg, prefixe):
    """Format page : toile pleine page (pas de recadrage), identifiants préfixés, largeur fluide."""
    p = re.sub(r"[^a-zA-Z0-9]", "", prefixe)
    svg = re.sub(r'id="([^"]+)"', lambda m: f'id="{p}-{m.group(1)}"', svg)
    svg = re.sub(r'url\(#([^)]+)\)', lambda m: f'url(#{p}-{m.group(1)})', svg)
    svg = re.sub(r'(<svg\b[^>]*?) width="[\d.]+" height="[\d.]+"', r'\1 width="100%" preserveAspectRatio="xMidYMid meet"',
                 svg, count=1)
    return re.sub(r"\s*\n\s*", " ", svg).strip()


def rendre(sp, fmt="paysage"):
    ident = sp.get("id", "s")
    fmt = _format(fmt)
    try:
        params = _jalons(sp.get("params") or {})
        erreurs = controler_fond(params, sp.get("source", ""), sp.get("titre_section", ""))
        if erreurs:
            return {"id": ident, "ok": False, "erreurs": erreurs[:12]}
        if fmt == "page":
            GP = _moteur_page()
            svg = GP.en_grand(lambda: construire(sp.get("gabarit"), params, GP), sp.get("gabarit"), params=params).rendu()
            return {"id": ident, "ok": True, "svg": finaliser_page(svg, "s" + ident)}
        svg = construire(sp.get("gabarit"), params).rendu()
        return {"id": ident, "ok": True, "svg": finaliser(themes_gss.recolorer(svg, THEME), "s" + ident)}
    except Invalide as e:
        return {"id": ident, "ok": False, "erreurs": [str(e)]}
    except gss_lib.Deborde:
        return {"id": ident, "ok": False, "erreurs": [
            "Un texte ne tient pas dans son cadre : raccourcis les libellés (moins de mots) ou réduis le nombre d'éléments."]}
    except Exception as e:  # noqa: BLE001
        if _deborde(e):
            return {"id": ident, "ok": False, "erreurs": [
                "Un texte ne tient pas dans son cadre : raccourcis les libellés (moins de mots) ou réduis le nombre d'éléments."]}
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
        out.append({"id": d["id"], "ok": True, "bibliotheque_id": x["id"],
                    "svg": finaliser(themes_gss.recolorer(svg, THEME), "b" + d["id"])})
    return out


# ── Bibliothèque redessinée dans le thème (cache par thème) ──────────────────
def _decoder(o):
    """Encodage de specs.json : {"__tuple__": [...]} et {"__dict__": [[clé, valeur], ...]}."""
    if isinstance(o, list):
        return [_decoder(v) for v in o]
    if isinstance(o, dict):
        if set(o) == {"__tuple__"}:
            return tuple(_decoder(v) for v in o["__tuple__"])
        if set(o) == {"__dict__"}:
            return {_decoder(k): _decoder(v) for k, v in o["__dict__"]}
        return {k: _decoder(v) for k, v in o.items()}
    return o


@lru_cache(maxsize=None)
def _specs():
    d = json.load(open(os.path.join(ICI, "bibliotheque", "specs.json"), encoding="utf-8"))
    return {sp["id"]: sp for sp in d["schemas"]}


def _dessiner_page(sp):
    GP = _moteur_page()
    if sp["gabarit"] == "compose":
        f = getattr(GP, "COMPOSES", {}).get(sp["id"])
        if f is None:
            raise Invalide(f"schéma composé sans version page : {sp['id']}")
        # Style « marine » v3 : rôles du schéma, palier et page remplie aussi pour un schéma composé.
        return (GP.en_grand(f, "compose", params=sp) if _moteur_v3() else f()).rendu()
    params = _decoder(sp["params"])
    return GP.en_grand(lambda: getattr(GP, sp["gabarit"])(*params["args"], **params["kwargs"]),
                       sp["gabarit"], params=params).rendu()


# ── Vocabulaire du cahier des charges dans les textes des schémas ────────────
def _vocabulaire(paires):
    """[[« responsable de site », « chef de poste »], …] → expressions (pluriel du premier mot, casse, espaces)."""
    out = []
    for p in paires or []:
        if not isinstance(p, (list, tuple)) or len(p) != 2 or not str(p[0]).strip():
            continue
        mots = str(p[0]).split()
        rx = re.compile(r"(?<![\w])(" + re.escape(mots[0]) + r")(s?)" + "".join(r"\s+" + re.escape(m) for m in mots[1:])
                        + r"(?![\w])", re.I)
        out.append((rx, str(p[1])))
    return out


def substituer(texte, vrx):
    """Terme du cahier des charges à la place de celui de GSS, au singulier ou au pluriel, casse gardée."""
    for rx, cible in vrx:
        def f(m, cible=cible):
            mb = cible.split()
            res = " ".join([mb[0] + m.group(2)] + mb[1:])
            src = m.group(0)
            if src.isupper():
                return res.upper()
            return res[0].upper() + res[1:] if src[0].isupper() else res
        texte = rx.sub(f, texte)
    return texte


def _substituer_profond(o, vrx):
    if isinstance(o, str):
        return substituer(o, vrx)
    if isinstance(o, list):
        return [_substituer_profond(v, vrx) for v in o]
    if isinstance(o, tuple):
        return tuple(_substituer_profond(v, vrx) for v in o)
    if isinstance(o, dict):
        return {k: _substituer_profond(v, vrx) for k, v in o.items()}
    return o


_TEXTE_SVG = re.compile(r"(<text[^>]*>)([^<]*)(</text>)")


def substituer_svg(svg, vrx):
    """Textes d'un SVG (toile paysage d'origine, géométrie inchangée) : terme remplacé dans chaque ligne ; un terme
    coupé sur deux lignes consécutives (« … responsable de » / « site ») est écrit sur la première ligne. Le terme du
    cahier des charges est plus court (« chef de poste ») : aucune ligne ne s'allonge au-delà de l'original."""
    morceaux = list(_TEXTE_SVG.finditer(svg))
    lignes = [html.unescape(m.group(2)) for m in morceaux]
    for i in range(len(lignes) - 1):
        # Terme à cheval sur deux lignes : la ligne suivante commence par la fin du terme.
        joint = lignes[i] + "\n" + lignes[i + 1]
        for rx, _cible in vrx:
            m = next((x for x in rx.finditer(joint) if x.start() < len(lignes[i]) < x.end()), None)
            if m:
                # Mots du terme répartis comme l'original : la première ligne ne dépasse pas sa longueur d'origine.
                avant, reste = joint[:m.start()], joint[m.end():]
                mots = substituer(m.group(0).replace("\n", " "), vrx).split(" ")
                n = len(mots)
                while n > 0 and len(avant + " ".join(mots[:n])) > len(lignes[i]):
                    n -= 1
                suite = " ".join(mots[n:])
                if not suite and reste[:1] in ",;.":
                    if len(avant + " ".join(mots) + reste[:1]) <= len(lignes[i]):
                        mots[-1] += reste[:1]
                    else:
                        n -= 1
                        suite = mots[-1]
                    reste = reste[1:] if not suite else reste
                lignes[i] = (avant + " ".join(mots[:n])).rstrip()
                lignes[i + 1] = (suite + reste).strip() if suite else reste.lstrip()
                break
    lignes = [substituer(x, vrx) for x in lignes]
    out, pos = [], 0
    for m, x in zip(morceaux, lignes):
        out.append(svg[pos:m.start()])
        out.append(m.group(1) + html.escape(x, quote=False) + m.group(3))
        pos = m.end()
    out.append(svg[pos:])
    return "".join(out)


def _concerne(ident, vrx):
    """Vrai si les textes du schéma contiennent un terme du vocabulaire."""
    sp = _specs().get(ident)
    texte = json.dumps(sp, ensure_ascii=False) if sp else ""
    try:
        texte += " " + " ".join(themes_gss.textes(open(os.path.join(ICI, "bibliotheque", f"{ident}.svg"), encoding="utf-8").read()))
    except OSError:
        pass
    return any(rx.search(re.sub(r"\s+", " ", texte)) for rx, _ in vrx)


def redessiner(ids=None, fmt="page", forcer=False, vocabulaire=None):
    """Schémas de la bibliothèque dans le thème actif : SVG bruts (comme les fichiers de bibliotheque/), lus dans le
    cache du thème ou redessinés. Format page : redessin depuis specs.json, textes contrôlés (identiques à
    l'original) ; en cas d'écart ou d'échec, le schéma d'origine aux couleurs du thème (source « repli_paysage »).
    Format paysage : schéma d'origine aux couleurs et à la police du thème. Retour arrière au format paysage : schéma d'origine.
    `vocabulaire` : terme du cahier des charges (« chef de poste ») à la place de celui de GSS dans les textes (même
    rôle, mot de l'acheteur) ; un schéma concerné est redessiné hors cache, les autres viennent du cache."""
    fmt = _format(fmt)
    vrx = _vocabulaire(vocabulaire)
    if not ids:
        ids = [x["id"] for x in json.load(open(os.path.join(ICI, "bibliotheque", "index.json"), encoding="utf-8"))]
    # Retour arrière au format paysage : schémas d'origine ; au format page : redessin dans la palette d'origine.
    retour = themes_gss.est_retour(THEME) and fmt == "paysage"
    cache = None if retour else themes_gss.dossier_cache(THEME, fmt)
    out = []
    for ident in ids:
        if not re.fullmatch(r"[A-Za-z0-9-]+", str(ident)):
            out.append({"id": ident, "ok": False, "erreurs": [f"Identifiant de schéma invalide : {ident}"]})
            continue
        try:
            origine = open(os.path.join(ICI, "bibliotheque", f"{ident}.svg"), encoding="utf-8").read()
        except OSError:
            out.append({"id": ident, "ok": False, "erreurs": [f"Schéma absent de la bibliothèque : {ident}"]})
            continue
        voc = vrx if vrx and _concerne(ident, vrx) else None
        if retour:
            out.append({"id": ident, "ok": True, "svg": substituer_svg(origine, voc) if voc else origine, "source": "origine"})
            continue
        f = os.path.join(cache, f"{ident}.svg") if cache and not voc else None
        if f and not forcer and os.path.exists(f):
            out.append({"id": ident, "ok": True, "svg": open(f, encoding="utf-8").read(), "source": "cache"})
            continue
        r = {"id": ident, "ok": True}
        if fmt == "paysage":
            svg, r["source"] = themes_gss.recolorer(origine, THEME), "recoloration"
            if voc:
                svg = substituer_svg(svg, voc)
        else:
            try:
                sp = _specs().get(ident)
                if sp is None:
                    raise Invalide("spécification absente de bibliotheque/specs.json")
                if voc:
                    # Paramètres décodés puis adaptés (_decoder les laisse tels quels au dessin).
                    sp = {**sp, "params": _substituer_profond(_decoder(sp["params"]), voc)}
                svg = _dessiner_page(sp)
                if voc:
                    # Schéma composé (dessiné par une fonction, sans paramètres) : textes adaptés après le dessin.
                    svg = substituer_svg(svg, voc)
                ctl = themes_gss.comparer_textes(svg, origine, (lambda t: substituer(t, voc)) if voc else None)
                if not ctl["ok"]:
                    raise Invalide("textes différents de l'original : "
                                   + json.dumps({k: v for k, v in ctl.items() if k != "ok"}, ensure_ascii=False)[:400])
                r["source"] = "redessin"
            except Exception as e:  # noqa: BLE001
                print(f"[rendu_schemas] {ident} : redessin au format page impossible ({type(e).__name__} {e}) ; "
                      "schéma d'origine aux couleurs du thème.", file=sys.stderr)
                svg, r["source"], r["erreurs"] = themes_gss.recolorer(origine, THEME), "repli_paysage", [str(e)[:400]]
                if voc:
                    svg = substituer_svg(svg, voc)
        if f:
            try:
                themes_gss.ecrire(f, svg)
            except OSError:
                pass
        r["svg"] = svg
        out.append(r)
    return out


def _cli_redessiner(argv):
    global THEME
    opts = {"--theme": None, "--format": "page", "--ids": None, "--rapport": None}
    i = 0
    while i < len(argv):
        if argv[i] in opts and i + 1 < len(argv):
            opts[argv[i]] = argv[i + 1]
            i += 2
        else:
            i += 1
    if opts["--theme"]:
        THEME = themes_gss.theme_actif(opts["--theme"])
        _moteur_page.cache_clear()
    ids = [x for x in (opts["--ids"] or "").split(",") if x] or None
    res = redessiner(ids, opts["--format"], "--forcer" in argv)
    sources = {}
    for r in res:
        sources[r.get("source", "erreur")] = sources.get(r.get("source", "erreur"), 0) + 1
    bilan = {"theme": THEME, "format": _format(opts["--format"]), "schemas": len(res),
             "ok": sum(1 for r in res if r.get("ok")), "sources": sources,
             "dossier_cache": None if themes_gss.est_retour(THEME) and _format(opts["--format"]) == "paysage"
             else themes_gss.dossier_cache(THEME, _format(opts["--format"])),
             "replis_ou_erreurs": [{"id": r["id"], "erreurs": r.get("erreurs")} for r in res
                                   if not r.get("ok") or r.get("source") == "repli_paysage"]}
    if opts["--rapport"]:
        json.dump(bilan, open(opts["--rapport"], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(bilan, ensure_ascii=False, indent=1))


def main():
    if "--redessiner" in sys.argv[1:]:
        return _cli_redessiner(sys.argv[1:])
    req = json.load(sys.stdin)
    if req.get("mode") == "bibliotheque":
        res = bibliotheque(req.get("demandes") or [])
    elif req.get("mode") == "redessiner":
        res = redessiner(req.get("ids") or None, req.get("format") or "page", bool(req.get("forcer")), req.get("vocabulaire"))
    else:
        res = [rendre(sp, req.get("format") or "paysage") for sp in req.get("schemas") or []]
    sys.stdout.write(json.dumps({"resultats": res}, ensure_ascii=False))


if __name__ == "__main__":
    main()
