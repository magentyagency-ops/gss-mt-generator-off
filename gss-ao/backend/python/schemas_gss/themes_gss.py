"""Thèmes de style des schémas GSS : choix du thème, retour arrière, format paysage, cache de la bibliothèque.

  · Le thème est choisi par la variable d'environnement GSS_THEME ; à défaut, « style_par_defaut » de
    themes/themes.json (le style recommandé par l'agent design, « marine ») ; à défaut, THEME_PAR_DEFAUT.
    Un thème inconnu donne le thème par défaut, avec un avertissement.
  · « gss-2026-09 » (RETOUR_ARRIERE) : le moteur d'origine (gss_lib.py + gabarits.py), sans aucun changement :
    les SVG paysage sont identiques octet pour octet à ceux d'avant les thèmes.
  · Format « page » (1 schéma = 1 page A4 portrait, toile 1000 × 1270) : moteur_page, dessiné dans le thème ; pour le
    retour arrière, dans la palette et la police d'origine (« style_page » de « retour_arriere » dans themes.json).
  · Format « paysage » (schéma placé dans le texte : format court, cadre imposé, ancienne mise en page) : le moteur
    d'origine (même mise en page, mêmes textes, mêmes contrôles), puis les couleurs et la police du thème
    (recolorer). Un texte que la police du thème rendrait plus large que la police d'origine est ramené à la
    largeur mesurée à l'origine (textLength) : aucun débordement nouveau.
Aucun texte n'est modifié : seule la forme change.
"""
import hashlib
import html
import json
import os
import re
import sys
import tempfile
from collections import Counter
from functools import lru_cache

ICI = os.path.dirname(os.path.abspath(__file__))
FICHIER_THEMES = os.environ.get("GSS_THEMES_JSON") or os.path.join(ICI, "themes", "themes.json")
BIBLIOTHEQUE = os.path.join(ICI, "bibliotheque")
THEME_PAR_DEFAUT = "marine"          # style recommandé par l'agent design (repli si themes.json est illisible)
RETOUR_ARRIERE = "gss-2026-09"       # palette validée le 25/09/2026, rendu d'origine
FORMATS = ("page", "paysage")


# ── Registre ─────────────────────────────────────────────────────────────────
@lru_cache(maxsize=None)
def registre():
    try:
        return json.load(open(FICHIER_THEMES, encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        print(f"[themes_gss] themes.json illisible ({e}) : thème de retour arrière seulement.", file=sys.stderr)
        return {"styles": {}, "style_par_defaut": RETOUR_ARRIERE}


def styles():
    return dict(registre().get("styles") or {})


def themes_disponibles():
    return list(styles()) + [RETOUR_ARRIERE]


def theme_par_defaut():
    d = registre().get("style_par_defaut") or THEME_PAR_DEFAUT
    return d if d in themes_disponibles() else (THEME_PAR_DEFAUT if THEME_PAR_DEFAUT in styles() else RETOUR_ARRIERE)


def theme_actif(nom=None):
    """Thème demandé (argument, sinon GSS_THEME, sinon style par défaut). Thème inconnu : défaut + avertissement."""
    demande = (nom or os.environ.get("GSS_THEME") or "").strip()
    if not demande:
        return theme_par_defaut()
    if demande in themes_disponibles():
        return demande
    print(f"[themes_gss] Thème inconnu « {demande} » : thème par défaut « {theme_par_defaut()} » "
          f"(disponibles : {', '.join(themes_disponibles())}).", file=sys.stderr)
    return theme_par_defaut()


def est_retour(theme):
    return theme == RETOUR_ARRIERE


def style_page_retour():
    """Jetons du format page du thème de retour arrière (palette et police des schémas d'origine), None si absents."""
    ra = registre().get("retour_arriere") or {}
    return ra.get("style_page") if ra.get("id") == RETOUR_ARRIERE else None


def format_effectif(theme, fmt):
    """Retour arrière : toile paysage d'origine (octet pour octet), sauf la page de schéma « 1 schéma = 1 page »
    (format page demandé), dessinée sur toile portrait dans la palette d'origine (style_page de retour_arriere)."""
    if est_retour(theme):
        return "page" if fmt == "page" and style_page_retour() else "paysage"
    return fmt if fmt in FORMATS else "paysage"


def style(theme):
    return styles()[theme]


# ── Couleurs ─────────────────────────────────────────────────────────────────
def _hex(c):
    c = c.strip().upper()
    if re.fullmatch(r"#[0-9A-F]{3}", c):
        c = "#" + "".join(x * 2 for x in c[1:])
    return c


def _rgb(c):
    c = _hex(c).lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def _lum(c):
    def f(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = _rgb(c)
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def contraste(a, b):
    la, lb = sorted((_lum(a), _lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def _melange(c, fond, t):
    """t de la couleur c sur le fond (0 = fond, 1 = c)."""
    a, b = _rgb(c), _rgb(fond)
    return "#" + "".join(f"{round(b[i] + (a[i] - b[i]) * t):02X}" for i in range(3))


def sombre(st):
    return _lum(st["couleurs"]["fond_schema"]) < 0.08


def _pale(st, role):
    """Aplat « pâle » d'un rôle (bandeaux, formes, secteurs, étiquettes du moteur d'origine, qui portent du texte
    à l'encre) : la teinte la plus soutenue de la couleur du rôle qui garde l'encre lisible (contraste 4,5:1)."""
    c = st["couleurs"]
    vif = st["roles"][role]["vif"]
    for t in (0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15):
        m = _melange(vif, c["fond_schema"], t)
        if contraste(c["encre"], m) >= 4.5:
            return m
    return st["roles"][role]["clair"]


# Couleurs du moteur d'origine (gss_lib.py, gabarits.py) par usage.
_PALES = {"#6298C0": "bleu", "#B8CCB1": "vert", "#E78E83": "rouge", "#F0D3A3": "orange", "#ECDEC2": "sable",
          "#E5CA97": "or"}
_FONCES = {"#1D49A7": "bleu", "#377E3F": "vert", "#DD4E49": "rouge", "#E99842": "orange", "#8A7550": "sable",
           "#8A817C": "creme"}
_INCHANGEES = {"#FFFFFF", "#111111", "#1E1C1C", "#3A3736", "#4A4746", "#56524F", "#E8C6A2", "#2B2724"}


@lru_cache(maxsize=None)
def correspondance(theme):
    """Table couleur d'origine → couleur du thème, par usage : « fond » (aplat), « texte », « trait » (contour),
    « puce » (cercle plein de l'encre : puces de liste)."""
    st = style(theme)
    c, R = st["couleurs"], st["roles"]
    nuit = sombre(st)
    fonce = lambda r: R[r]["fonce"]  # noqa: E731
    texte_role = (lambda r: R[r]["vif"]) if nuit else fonce
    eau = "#0C1A30" if nuit else "#DCE7F0"
    t = {
        "fond": {"#D9D9D9": c["fond_schema"], "#FBFAF4": c["carte_fond"], "#ECE9E2": R["creme"]["clair"],
                 "#F5F5DE": R["creme"]["clair"], "#484545": fonce("sombre"), "#2E2B2B": c["encre"],
                 "#463A2F": c["encre"], "#000000": c["encre"], "#D6E3EA": eau, "#EDEAE6": c["surface"],
                 "#EDEAE7": c["surface_2"], "#E6E3E1": c["surface_2"], "#E9E5DE": c["surface_2"],
                 "#E3E0DD": c["surface_2"], "#F2F0EE": c["surface_2"], "#47494B": c["encre_2"]},
        "texte": {"#463A2F": c["encre"], "#000000": c["encre"], "#F5F5DE": R["sombre"]["sur_fonce"],
                  "#5B5451": c["encre_3"], "#B9423C": c["accent_texte"], "#484545": c["encre"],
                  "#47494B": c["encre_2"], "#2E2B2B": c["encre"]},
        "trait": {"#7A726F": st["fleches"]["couleur"], "#9A928E": st["liens"]["couleur"],
                  "#FBFAF4": c["fond_schema"], "#F5F5DE": R["sombre"]["sur_fonce"], "#463A2F": c["encre"],
                  "#484545": fonce("sombre"), "#2E2B2B": c["encre"], "#B9B2AE": c["filet"], "#C9C4C1": c["filet"],
                  "#BDB6B2": c["filet"], "#E9E5DE": c["surface_2"], "#000000": c["encre"], "#47494B": c["encre_2"]},
        "ligne": {"#7A726F": c["encre_3"]},
        "puce": {"#463A2F": c["accent"]},
    }
    for o, r in _PALES.items():
        t["fond"][o] = _pale(st, r)
        t["trait"][o] = _pale(st, r)
    for o, r in _FONCES.items():
        t["fond"][o] = fonce(r)
        t["trait"][o] = fonce(r)
        t["texte"][o] = texte_role(r)
    return t


# ── Mesure (police d'origine / police du thème) ──────────────────────────────
@lru_cache(maxsize=None)
def _police(chemin, taille4):
    from PIL import ImageFont
    return ImageFont.truetype(chemin, max(1, taille4))


def _fichier_lexend(poids):
    fixe = min((400, 500, 600, 700, 800), key=lambda w: abs(w - poids))
    return os.path.join(ICI, "polices", f"Lexend-{fixe}.ttf")


def _fichier_theme(st, poids, usage="texte"):
    f = st["polices"][usage]["fichiers"]
    p = min((int(x) for x in f), key=lambda w: (abs(w - poids), -w))
    return os.path.join(ICI, f[str(p)])


def _largeur(chemin, t, taille):
    return _police(chemin, round(taille * 4)).getlength(t) / 4


def famille_css(st, usage="texte"):
    p = st["polices"][usage]
    return f"'{p['famille']}', {p.get('repli', 'sans-serif')}"


# ── Recoloration du format paysage ───────────────────────────────────────────
_BALISE = re.compile(r"<(text|rect|circle|path|line|ellipse|polygon|polyline|g|feDropShadow|svg)\b([^>]*)>")
_TEXTE = re.compile(r"(<text\b[^>]*>)([^<]*)(</text>)")


def recolorer(svg, theme):
    """SVG du moteur d'origine (paysage) → couleurs et police du thème. Identité pour le retour arrière.
    Ne touche ni aux textes ni à la géométrie."""
    if est_retour(theme) or theme not in styles():
        return svg
    st = style(theme)
    t = correspondance(theme)
    ombre = st["carte"].get("ombre")

    def attr(tag, attrs):
        def sub(m):
            nom, val = m.group(1), _hex(m.group(2))
            if val in _INCHANGEES:
                return m.group(0)
            if nom == "stroke":
                usage = "ligne" if (tag == "line" and val in t["ligne"]) else "trait"
            elif nom == "flood-color":
                return f'{nom}="{(ombre or {}).get("couleur", m.group(2))}"'
            elif tag == "text":
                usage = "texte"
            elif tag == "circle" and val in t["puce"]:
                usage = "puce"
            else:
                usage = "fond"
            return f'{nom}="{t[usage].get(val, m.group(2))}"'
        a = re.sub(r'\b(fill|stroke|flood-color)="(#[0-9A-Fa-f]{3,6})"', sub, attrs)
        if tag == "feDropShadow" and not ombre:
            a = re.sub(r'flood-opacity="[\d.]+"', 'flood-opacity="0"', a)
        if tag == "svg":
            a = re.sub(r'font-family="[^"]*"', lambda _m: f'font-family="{famille_css(st)}"', a)
        return a

    svg = _BALISE.sub(lambda m: f"<{m.group(1)}{attr(m.group(1), m.group(2))}>", svg)
    svg = _numeros_lisibles(svg, theme)

    def ajuster(m):
        ouv, contenu, ferm = m.groups()
        if "textLength" in ouv or not contenu.strip():
            return m.group(0)
        taille = re.search(r'font-size="([\d.]+)"', ouv)
        poids = re.search(r'font-weight="(\d+)"', ouv)
        if not taille:
            return m.group(0)
        tx = html.unescape(contenu)
        taille, poids = float(taille.group(1)), int(poids.group(1)) if poids else 400
        origine = _largeur(_fichier_lexend(poids), tx, taille)
        nouveau = _largeur(_fichier_theme(st, poids), tx, taille)
        if nouveau * 1.03 <= origine or origine <= 0:
            return m.group(0)
        return f'{ouv[:-1]} textLength="{origine:.1f}" lengthAdjust="spacingAndGlyphs">{contenu}{ferm}'

    return _TEXTE.sub(ajuster, svg)


_JETON = re.compile(r"<(/?)(g|rect|circle|text)\b([^>]*?)(/?)>")


def _num(attrs, k):
    m = re.search(r'\b' + k + r'="(-?[\d.]+)"', attrs)
    return float(m.group(1)) if m else None


def _numeros_lisibles(svg, theme):
    """Texte à la couleur d'un rôle ou des dates (numéros « 01 », « 02 »… du moteur d'origine) posé sur un aplat pâle d'un rôle
    (bandeau de carte, étiquette) : sous 4,5:1 (3:1 à partir de 24 px), il prend l'encre du thème ou le texte sur
    foncé du rôle, celui des deux qui contraste le mieux avec l'aplat. Aplat repéré par la géométrie (rectangle ou
    cercle plein qui contient le pied du texte, hors groupes transformés) ; les autres textes ne changent pas."""
    st = style(theme)
    c, R = st["couleurs"], st["roles"]
    t = correspondance(theme)
    pales = {_hex(t["fond"][o]): r for o, r in _PALES.items()}
    textes_role = {_hex(t["texte"][o]) for o in _FONCES} | {_hex(t["texte"]["#B9423C"])}  # rôles et dates
    formes, pile = [], []
    out, pos = [], 0
    for m in _JETON.finditer(svg):
        ferme, tag, attrs, auto = m.groups()
        if tag == "g":
            if ferme:
                if pile:
                    pile.pop()
            elif not auto:
                pile.append("transform=" in attrs)
            continue
        if ferme or any(pile) or "transform=" in attrs:
            continue
        fill = re.search(r'\bfill="(#[0-9A-Fa-f]{3,6})"', attrs)
        if tag in ("rect", "circle"):
            if fill and "opacity=" not in attrs:
                if tag == "rect":
                    x, y, w, h = (_num(attrs, k) for k in ("x", "y", "width", "height"))
                    if w is not None and h is not None:
                        formes.append(("r", x or 0.0, y or 0.0, w, h, _hex(fill.group(1))))
                else:
                    cx, cy, r = (_num(attrs, k) for k in ("cx", "cy", "r"))
                    if None not in (cx, cy, r):
                        formes.append(("c", cx, cy, r, 0.0, _hex(fill.group(1))))
            continue
        if not fill or _hex(fill.group(1)) not in textes_role:
            continue
        x, y, taille = _num(attrs, "x"), _num(attrs, "y"), _num(attrs, "font-size") or 12.0
        if x is None or y is None:
            continue
        py = y - taille * 0.35
        fond = None
        for f in reversed(formes):
            if (f[0] == "r" and f[1] <= x <= f[1] + f[3] and f[2] <= py <= f[2] + f[4]) or \
               (f[0] == "c" and (x - f[1]) ** 2 + (py - f[2]) ** 2 <= f[3] ** 2):
                fond = f[5]
                break
        if fond not in pales:
            continue
        couleur = _hex(fill.group(1))
        cr = contraste(couleur, fond)
        if cr >= 4.5 or (taille >= 24 and cr >= 3):
            continue
        meilleure = max((c["encre"], R[pales[fond]]["sur_fonce"]), key=lambda k: contraste(k, fond))
        debut = m.start() + m.group(0).index(fill.group(0))
        out.append(svg[pos:debut] + f'fill="{meilleure}"')
        pos = debut + len(fill.group(0))
    out.append(svg[pos:])
    return "".join(out)


# ── Contrôle des textes d'un redessin ────────────────────────────────────────
_TXT = re.compile(r"<text([^>]*)>([^<]*)</text>")


def textes(svg):
    return [html.unescape(x) for _, x in _TXT.findall(svg)]


def _jetons(liste):
    return " ".join(liste).replace(" ", " ").replace(" ", " ").split()


def _blocs(svg):
    """Lignes de texte regroupées par bloc (attribut data-b du moteur page), dans l'ordre d'apparition."""
    out, index = [], {}
    for attrs, x in _TXT.findall(svg):
        m = re.search(r'data-b="(\d+)"', attrs)
        k = m.group(1) if m else f"x{len(out)}"
        if k not in index:
            index[k] = len(out)
            out.append([])
        out[index[k]].append(html.unescape(x))
    return [" ".join(b) for b in out]


def _contigu(sous, tout):
    n = len(sous)
    return n == 0 or any(tout[i:i + n] == sous for i in range(len(tout) - n + 1))


def comparer_textes(nouveau, origine, adapter=None):
    """Mêmes mots (mêmes chiffres, majuscules et signes, même nombre d'occurrences) que le schéma d'origine, et
    chaque bloc (titre, paragraphe, libellé) retrouvé d'un seul tenant dans le texte d'origine. `adapter` : texte
    d'origine adapté avant la comparaison (vocabulaire du cahier des charges : « chef de poste »)."""
    jn = _jetons(textes(nouveau))
    jo = _jetons([adapter(" ".join(textes(origine)))] if adapter else textes(origine))
    cn, co = Counter(jn), Counter(jo)
    r = {"textes_identiques": cn == co, "mots": len(jn), "mots_origine": len(jo)}
    if cn != co:
        r["mots_en_trop"] = sorted((cn - co).elements())[:20]
        r["mots_manquants"] = sorted((co - cn).elements())[:20]
    hors = [b for b in _blocs(nouveau) if not _contigu(_jetons([b]), jo)]
    r["blocs_non_contigus"] = hors[:10]
    r["ok"] = r["textes_identiques"] and not hors
    return r


# ── Cache de la bibliothèque par thème ───────────────────────────────────────
def _hash_fichiers(chemins):
    h = hashlib.sha1()
    for c in chemins:
        try:
            h.update(open(c, "rb").read())
        except OSError:
            h.update(b"-")
    return h.hexdigest()


@lru_cache(maxsize=None)
def empreinte(theme, fmt):
    """Empreinte du rendu : jetons du thème, moteur et spécifications. Elle change → le cache est refait."""
    moteur = ([os.path.join(ICI, "moteur_page", f) for f in ("theme.py", "gss_lib.py", "gabarits.py", "pictos.py")]
              if fmt == "page" else [os.path.join(ICI, f) for f in ("gss_lib.py", "gabarits.py")])
    moteur += [os.path.join(ICI, "themes_gss.py"), os.path.join(BIBLIOTHEQUE, "specs.json"),
               os.path.join(BIBLIOTHEQUE, "index.json")]
    jetons = style_page_retour() if est_retour(theme) else styles().get(theme)
    h = hashlib.sha1(json.dumps([theme, fmt, jetons], sort_keys=True, ensure_ascii=False).encode())
    h.update(_hash_fichiers(moteur).encode())
    return h.hexdigest()[:16]


def dossier_cache(theme, fmt):
    """Dossier du cache (bibliotheque/themes/<thème>/<format>), créé et vidé si l'empreinte a changé ;
    dossier temporaire si la bibliothèque n'est pas accessible en écriture ; None si aucun ne l'est."""
    for base in (os.path.join(BIBLIOTHEQUE, "themes"), os.path.join(tempfile.gettempdir(), "gss-schemas-themes")):
        d = os.path.join(base, theme, fmt)
        try:
            os.makedirs(d, exist_ok=True)
            f = os.path.join(d, "_empreinte.txt")
            e = empreinte(theme, fmt)
            if not os.path.exists(f) or open(f, encoding="utf-8").read().strip() != e:
                for x in os.listdir(d):
                    if x.endswith(".svg"):
                        os.remove(os.path.join(d, x))
                ecrire(f, e)
            return d
        except OSError:
            continue
    return None


def ecrire(chemin, contenu):
    """Écriture atomique (plusieurs processus peuvent remplir le cache en même temps)."""
    tmp = f"{chemin}.{os.getpid()}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(contenu)
    os.replace(tmp, chemin)


# ── Correspondance exportée pour le repli sans moteur Python (themes.ts : recolorerSvg) ──
def correspondance_exportee():
    """Tables couleur d'origine → couleur du thème de chaque style (et couleurs inchangées, ombre), telles que
    recolorer() les applique : themes.ts les relit dans themes.json pour recolorer un schéma d'origine quand le moteur
    Python est indisponible."""
    out = {"_inchangees": sorted(_INCHANGEES)}
    for nom in styles():
        out[nom] = dict(correspondance(nom), ombre=(style(nom)["carte"].get("ombre") or {}).get("couleur"))
    return out


if __name__ == "__main__" and "--exporter-correspondance" in sys.argv[1:]:
    # python3 themes_gss.py --exporter-correspondance : à relancer après un changement des couleurs d'un style.
    d = json.load(open(FICHIER_THEMES, encoding="utf-8"))
    d["correspondance_paysage"] = correspondance_exportee()
    ecrire(FICHIER_THEMES, json.dumps(d, ensure_ascii=False, indent=1) + "\n")
    print(f"correspondance_paysage : {len(d['correspondance_paysage']) - 1} styles exportés dans {FICHIER_THEMES}")
