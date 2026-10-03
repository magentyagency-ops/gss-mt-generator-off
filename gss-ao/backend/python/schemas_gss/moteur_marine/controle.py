"""Contrôles de la planche validée « Marine & signal » v3 (repris tels quels de outils/rendre.py de l'agent design,
version 3), appliqués à chaque schéma dessiné par moteur_marine :
  1. TEXTES — mêmes mots que le schéma d'origine (mêmes chiffres, signes, majuscules, occurrences), chaque bloc
     retrouvé d'un seul tenant ; la typographie de rendu est normalisée (’ → ', exposants des ordinaux) ;
  2. DÉBORDEMENT — aucun texte, cadre, point ni trait hors de la toile ;
  3. SUPERPOSITIONS — texte / texte, cadre / cadre, texte à cheval sur un cadre, point sur un texte, point caché
     sous un cadre, trait sur un texte, trait sur un cadre ;
  4. ÉTIQUETTES — chaque étiquette de décision posée sur sa branche (distance ≤ 4 unités) ;
  5. CONTRASTE — chaque texte contre son fond réel (WCAG 2.1 AA : 4,5:1 ; 3:1 pour les grands textes) ;
  6. ÉCHELLE — plus petit texte ≥ 20 unités (10,2 pt) et toutes les tailles dans le palier du schéma ;
  7. OCCUPATION RÉELLE — boîte englobante de tout ce qui est dessiné.
"""
import html
import math
import re
from collections import Counter

from . import theme


def ratio(a, b):
    def lum(h):
        h = h.lstrip("#")
        r, g, b_ = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
        f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4  # noqa: E731
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b_)
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


# ── Textes ────────────────────────────────────────────────────────────────────
TXT = re.compile(r"<text([^>]*)>(.*?)</text>", re.S)
TAG = re.compile(r"<[^>]+>")


def _norm(t):
    return html.unescape(TAG.sub("", t)).replace("’", "'")


def textes(svg):
    return [_norm(t) for _, t in TXT.findall(svg)]


def jetons(lst):
    return " ".join(lst).replace("\xa0", " ").replace(" ", " ").split()


def blocs(svg):
    """Blocs du schéma redessiné (lignes regroupées par data-b), dans l'ordre d'apparition."""
    out, index = [], {}
    for attrs, t in TXT.findall(svg):
        m = re.search(r'data-b="(\d+)"', attrs)
        k = m.group(1) if m else f"x{len(out)}"
        if k not in index:
            index[k] = len(out)
            out.append([])
        out[index[k]].append(_norm(t))
    return [" ".join(b) for b in out]


def contigu(sous, tout):
    n = len(sous)
    if n == 0:
        return True
    for i in range(len(tout) - n + 1):
        if tout[i:i + n] == sous:
            return True
    return False


def grand(taille, poids):
    # 1 unité = 0,51 pt : 18 pt = 35 unités ; 14 pt gras = 27,4 unités
    return taille >= 35 or (taille >= 27.4 and poids >= 600)


# ── Géométrie ─────────────────────────────────────────────────────────────────
def _chev(a, b, m=0.0):
    ox = min(a[2], b[2]) - max(a[0], b[0])
    oy = min(a[3], b[3]) - max(a[1], b[1])
    return ox > m and oy > m


def _seg_rect(p1, p2, r):
    """Le segment p1-p2 coupe-t-il l'intérieur du rectangle r = (x0, y0, x1, y1) ? (Liang-Barsky)"""
    x0, y0, x1, y1 = r
    if x1 <= x0 or y1 <= y0:
        return False
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    t0, t1 = 0.0, 1.0
    for p, q in ((-dx, p1[0] - x0), (dx, x1 - p1[0]), (-dy, p1[1] - y0), (dy, y1 - p1[1])):
        if abs(p) < 1e-12:
            if q < 0:
                return False
        else:
            t = q / p
            if p < 0:
                t0 = max(t0, t)
            else:
                t1 = min(t1, t)
            if t0 > t1:
                return False
    return t1 - t0 > 1e-6


def _dist_seg_rect(p1, p2, r):
    if _seg_rect(p1, p2, r):
        return 0.0
    x0, y0, x1, y1 = r
    best = float("inf")
    coins = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    for c in coins:
        best = min(best, _dist_pt_seg(c, p1, p2))
    for p in (p1, p2):
        cx, cy = clamp(p[0], x0, x1), clamp(p[1], y0, y1)
        best = min(best, math.hypot(p[0] - cx, p[1] - cy))
    return best


def _dist_pt_seg(p, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L))
    return math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy))


def clamp(v, a, b):
    return max(a, min(b, v))


def _rt(t, m=0.0):
    return (t["x0"] + m, t["y0"] + m, t["x1"] - m, t["y1"] - m)


def _rz(z, m=0.0):
    return (z["x0"] + m, z["y0"] + m, z["x1"] - m, z["y1"] - m)


def controler(s, svg, ref_svg):
    r = {}
    t_new, t_ref = textes(svg), textes(ref_svg)
    j_new, j_ref = jetons(t_new), jetons(t_ref)
    c_new, c_ref = Counter(j_new), Counter(j_ref)
    r["textes_identiques"] = c_new == c_ref
    r["mots"] = len(j_new)
    r["mots_original"] = len(j_ref)
    if not r["textes_identiques"]:
        r["mots_en_trop"] = sorted((c_new - c_ref).elements())
        r["mots_manquants"] = sorted((c_ref - c_new).elements())
    bl = blocs(svg)
    hors = [b for b in bl if not contigu(b.replace("\xa0", " ").split(), j_ref)]
    r["blocs"] = len(bl)
    r["blocs_non_contigus"] = hors
    W, H = s.W, s.H
    T_, Z, PTS, TR = s.textes, s.zones, s.points, s.traits
    deb = []
    for t in T_:
        if t["x0"] < -0.5 or t["x1"] > W + 0.5 or t["y0"] < -0.5 or t["y1"] > H + 0.5:
            deb.append(f"texte hors toile : {t['t']!r}")
    for z in Z:
        if z["x0"] < -0.5 or z["x1"] > W + 0.5 or z["y0"] < -0.5 or z["y1"] > H + 0.5:
            deb.append(f"cadre hors toile : {z['x0']:.0f},{z['y0']:.0f},{z['x1']:.0f},{z['y1']:.0f}")
    for p in PTS:
        if p["cx"] - p["r"] < -0.5 or p["cx"] + p["r"] > W + 0.5 or p["cy"] - p["r"] < -0.5 or p["cy"] + p["r"] > H + 0.5:
            deb.append(f"point hors toile : {p['cx']:.0f},{p['cy']:.0f}")
    for tr in TR:
        for (x, y) in tr["pts"]:
            if x < -0.5 or x > W + 0.5 or y < -0.5 or y > H + 0.5:
                deb.append(f"trait hors toile : {x:.0f},{y:.0f}")
                break
    r["debordements"] = deb
    sup = []
    for i in range(len(T_)):
        a = T_[i]
        for j in range(i + 1, len(T_)):
            b = T_[j]
            if a["b"] is not None and a["b"] == b["b"]:
                continue
            if _chev(_rt(a), _rt(b), 1.5):
                sup.append(f"textes : {a['t']!r} / {b['t']!r}")
    for i in range(len(Z)):
        for j in range(i + 1, len(Z)):
            if _chev(_rz(Z[i]), _rz(Z[j]), 1.5):
                sup.append(f"cadres {tuple(round(v) for v in _rz(Z[i]))} / {tuple(round(v) for v in _rz(Z[j]))}")
    for t in T_:
        for z in Z:
            if _chev(_rt(t), _rz(z), 1.5):
                dedans = t["x0"] >= z["x0"] - 1 and t["x1"] <= z["x1"] + 1 and t["y0"] >= z["y0"] - 1 and t["y1"] <= z["y1"] + 1
                if not dedans:
                    sup.append(f"texte à cheval sur un cadre : {t['t']!r}")
    r["superpositions"] = sup
    # point / texte, point caché
    pt_txt, caches = [], []
    for p in PTS:
        rp = (p["cx"] - p["r"], p["cy"] - p["r"], p["cx"] + p["r"], p["cy"] + p["r"])
        for t in T_:
            if p["porteur"] is not None and t["b"] == p["porteur"]:
                continue
            if _chev(rp, _rt(t, 0.5), 0.5):
                # distance réelle cercle / rectangle
                cx_, cy_ = clamp(p["cx"], t["x0"], t["x1"]), clamp(p["cy"], t["y0"], t["y1"])
                if math.hypot(p["cx"] - cx_, p["cy"] - cy_) < p["r"] - 0.5:
                    pt_txt.append(f"point ({p['type']}) sur le texte {t['t']!r}")
        for z in Z:
            if z["z"] > p["z"] and z["opaque"]:
                cx_, cy_ = clamp(p["cx"], z["x0"], z["x1"]), clamp(p["cy"], z["y0"], z["y1"])
                if math.hypot(p["cx"] - cx_, p["cy"] - cy_) < p["r"] * 0.6:
                    caches.append(f"point ({p['type']}) caché sous un cadre {tuple(round(v) for v in _rz(z))}")
    r["points_sur_texte"] = pt_txt
    r["points_caches"] = caches
    # trait / texte, trait sur un cadre
    tr_txt, tr_cad = [], []
    for tr in TR:
        segs = list(zip(tr["pts"][:-1], tr["pts"][1:]))
        for t in T_:
            rt = _rt(t, 1.0)
            if any(_seg_rect(a, b, rt) for a, b in segs):
                masque = any(z["opaque"] and z["z"] > tr["z"] and t["x0"] >= z["x0"] - 1 and t["x1"] <= z["x1"] + 1
                             and t["y0"] >= z["y0"] - 1 and t["y1"] <= z["y1"] + 1 for z in Z)
                # un numéro posé sur son disque, dessiné après le trait, masque le trait
                masque = masque or any(p_["z"] > tr["z"] and p_["porteur"] is not None and p_["porteur"] == t["b"]
                                       for p_ in PTS)
                if not masque:
                    tr_txt.append(f"{tr['type']} sur le texte {t['t']!r}")
        for z in Z:
            if tr["z"] > z["z"] and any(_seg_rect(a, b, _rz(z, 3)) for a, b in segs):
                tr_cad.append(f"{tr['type']} tracé sur un cadre {tuple(round(v) for v in _rz(z))}")
    r["traits_sur_texte"] = tr_txt
    r["traits_sur_cadre"] = tr_cad
    # étiquettes sur leur branche
    loin = []
    for e in s.etiquettes:
        rect_e = (e["cx"] - e["w"] / 2, e["cy"] - e["h"] / 2, e["cx"] + e["w"] / 2, e["cy"] + e["h"] / 2)
        d = min(_dist_seg_rect(a, b, rect_e) for a, b in zip(e["branche"][:-1], e["branche"][1:]))
        if d > 4:
            loin.append(f"étiquette {e['t']!r} à {d:.0f} unités de sa branche")
    r["etiquettes_loin"] = loin
    # contrastes
    faibles = []
    for t in T_:
        mini = 3.0 if grand(t["taille"], t["poids"]) else 4.5
        rr = ratio(t["couleur"], t["fond"])
        if rr < mini:
            faibles.append(f"{t['t']!r} {t['couleur']} sur {t['fond']} = {rr:.2f} (min {mini})")
    r["contrastes_faibles"] = faibles
    # échelle
    th = theme.courant()
    pal = th.paliers[s.palier]
    permises = {round(v, 1) for k, v in pal.items() if isinstance(v, (int, float)) and k not in ("plaque", "pad")}
    tailles = sorted({round(t["taille"], 1) for t in T_})
    r["palier"] = s.palier
    r["tailles"] = tailles
    r["tailles_hors_echelle"] = [v for v in tailles if v not in permises]
    r["taille_texte_min"] = round(min((t["taille"] for t in T_), default=0), 1)
    petits = sorted({f"{t['t']!r} ({t['taille']:.1f})" for t in T_ if t["taille"] < th.t_min - 0.05})
    r["textes_trop_petits"] = petits
    # occupation réelle du dessin
    bx = ([(t["x0"], t["y0"], t["x1"], t["y1"]) for t in T_] + [_rz(z) for z in Z]
          + [(p["cx"] - p["r"], p["cy"] - p["r"], p["cx"] + p["r"], p["cy"] + p["r"]) for p in PTS]
          + [(min(x for x, _ in tr["pts"]), min(y for _, y in tr["pts"]), max(x for x, _ in tr["pts"]),
              max(y for _, y in tr["pts"])) for tr in TR]
          + [(d_["x0"], d_["y0"], d_["x1"], d_["y1"]) for d_ in s.decors])
    if bx:
        r["occupation_hauteur"] = round((max(b[3] for b in bx) - min(b[1] for b in bx)) / H, 3)
        r["occupation_largeur"] = round((max(b[2] for b in bx) - min(b[0] for b in bx)) / W, 3)
    r["ok"] = (r["textes_identiques"] and not hors and not deb and not sup and not faibles and not petits
               and not pt_txt and not caches and not tr_txt and not tr_cad and not loin
               and not r["tailles_hors_echelle"])
    return r


DEFAUTS = ("blocs_non_contigus", "debordements", "superpositions", "points_sur_texte", "points_caches",
           "traits_sur_texte", "traits_sur_cadre", "etiquettes_loin", "contrastes_faibles", "textes_trop_petits",
           "tailles_hors_echelle")
