#!/usr/bin/env python3
"""
Remplacement DÉTERMINISTE des balises <…> (ex. « <entreprise> ») par le client du DCE, en
conservant POLICE, TAILLE et COULEUR d'origine, et en retirant le surlignage éventuel.

Contrairement à la réécriture GPT des surlignages (rewrite_highlights.py, qui ré-insère tout en
Trebuchet), on re-rend ICI le segment dans SA propre fonte/sa taille/sa couleur : la page de garde
« SURETE POUR <entreprise> » devient « SURETE POUR Université de Rouen Normandie » dans la MÊME
Arial-Black 18. À lancer AVANT rewrite_highlights : on retire le jaune de la balise, donc l'étape
GPT ne la retouche pas.

Usage:
  py replace_placeholders.py --input IN.pdf --output OUT.pdf --context ctx.json
ctx.json: { "clientName": str, ... }
"""
import argparse
import json
import os
import re
import sys

import fitz  # PyMuPDF


# Balises remplacées par le NOM DU CLIENT (entreprise = client du DCE). On reste volontairement
# restrictif pour ne pas écraser d'éventuelles autres balises sans rapport.
CLIENT_PLACEHOLDER_RE = re.compile(
    r"<\s*(?:entreprise|client|soci[ée]t[ée]|acheteur|nom[_ ]?client)\s*>", re.I
)

# Fontes Windows usuelles → fichier TTF, pour réinsérer dans la MÊME police que l'original.
FONT_FILES = {
    "arialblack": r"C:\Windows\Fonts\ariblk.ttf",
    "arialbold": r"C:\Windows\Fonts\arialbd.ttf",
    "arial": r"C:\Windows\Fonts\arial.ttf",
    "trebuchetms": r"C:\Windows\Fonts\trebuc.ttf",
    "trebuchetmsbold": r"C:\Windows\Fonts\trebucbd.ttf",
    "timesnewroman": r"C:\Windows\Fonts\times.ttf",
    "calibri": r"C:\Windows\Fonts\calibri.ttf",
    "verdana": r"C:\Windows\Fonts\verdana.ttf",
}


def int_to_rgb01(v):
    return ((v >> 16 & 255) / 255.0, (v >> 8 & 255) / 255.0, (v & 255) / 255.0)


def is_yellow(c):
    return c is not None and len(c) >= 3 and c[0] > 0.8 and c[1] > 0.8 and c[2] < 0.4


def resolve_font(font_name):
    """(fontname, fontfile) pour insert_textbox, en respectant gras/italique. None → helv intégré."""
    key = re.sub(r"[^a-z]", "", (font_name or "").lower())
    # « Arial-Black » → arialblack ; « TrebuchetMS-Bold » → trebuchetmsbold, etc.
    path = FONT_FILES.get(key)
    if not path:
        # Repli : si le nom contient « bold », viser une variante grasse connue.
        if "black" in key or "bold" in key:
            path = FONT_FILES.get("arialblack")
    if path and os.path.exists(path):
        return key or "custom", path
    return None, None


def bg_under(page, rect):
    """Couleur de fond visible sous `rect` : le remplissage NON jaune le PLUS HAUT dans l'ordre de
    dessin (z-order) qui recouvre le centre du rect ; sinon blanc. Sert à recouvrir l'ancien texte."""
    cx, cy = (rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2
    covering = []
    for d in page.get_drawings():
        r, fill = d.get("rect"), d.get("fill")
        if r is None or fill is None or is_yellow(fill):
            continue
        if r.x0 <= cx <= r.x1 and r.y0 <= cy <= r.y1:
            covering.append(tuple(fill[:3]))
    # Le dernier dessiné est au-dessus (bande de couleur posée sur le fond pleine page).
    return covering[-1] if covering else (1.0, 1.0, 1.0)


def find_targets(page, client):
    """Segments (spans) de la page contenant une balise client. Renvoie pour chacun : géométrie,
    texte substitué, taille, couleur, police, rect de surlignage jaune éventuel."""
    targets = []
    yellow = [d["rect"] for d in page.get_drawings() if is_yellow(d.get("fill")) and d.get("rect")]
    for b in page.get_text("dict").get("blocks", []):
        if b.get("type", 0) != 0:
            continue
        for line in b.get("lines", []):
            for sp in line.get("spans", []):
                txt = sp.get("text", "")
                if not CLIENT_PLACEHOLDER_RE.search(txt):
                    continue
                new_txt = CLIENT_PLACEHOLDER_RE.sub(client, txt).rstrip()
                rect = fitz.Rect(sp["bbox"])
                hl = [yr for yr in yellow if yr.intersects(rect)]
                targets.append({
                    "rect": rect,
                    "text": new_txt,
                    "size": sp.get("size", 12.0),
                    "color": int_to_rgb01(sp.get("color", 0)),
                    "font": sp.get("font", ""),
                    "yellow": hl,
                })
    return targets


def fit_one_line(text, base_size, avail_width, fontfile):
    """Plus grande taille (≤ taille d'origine) pour que TOUT le titre tienne sur UNE seule ligne dans
    `avail_width`. Mesure avec la vraie fonte (Arial-Black…) pour un calcul exact. Plancher à 7 pt."""
    try:
        font = fitz.Font(fontfile=fontfile) if fontfile else fitz.Font("helv")
    except Exception:  # noqa: BLE001
        font = fitz.Font("helv")
    safe = avail_width * 0.995  # marge minimale : on remplit presque toute la largeur → titre au plus gros
    width = font.text_length(text, fontsize=base_size)
    if width <= safe or width <= 0:
        return base_size
    return max(7.0, base_size * safe / width)


def replace(doc, client):
    replaced = 0
    for pno in range(doc.page_count):
        page = doc[pno]
        targets = find_targets(page, client)
        if not targets:
            continue
        # 1) Recouvrement : on efface l'ancien segment (et le jaune) avec le fond visible local.
        for t in targets:
            cover = fitz.Rect(t["rect"])
            for yr in t["yellow"]:
                cover |= yr
            page.add_redact_annot(cover + (-1, -2, 1, 2), fill=bg_under(page, t["rect"]))
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

        # 2) Réinsertion dans la MÊME police/couleur, le client À LA SUITE du titre, sur UNE SEULE
        #    ligne : on calcule la plus grande taille (≤ taille d'origine) qui fait tenir tout le titre
        #    « SECURITE INCENDIE - SURETE POUR <client> » d'un trait dans la largeur (pas de retour ligne).
        right = page.rect.width - 16  # titre étendu presque jusqu'au bord → taille maximale sur une ligne
        for t in targets:
            r = t["rect"]
            fontname, fontfile = resolve_font(t["font"])
            size = fit_one_line(t["text"], t["size"], right - r.x0, fontfile)
            kw = dict(color=t["color"], align=fitz.TEXT_ALIGN_LEFT)
            if fontfile:
                kw["fontname"], kw["fontfile"] = fontname, fontfile
            else:
                kw["fontname"] = "helv"
            # Boîte d'UNE ligne (hauteur = interligne) → insert_textbox ne renvoie jamais à la ligne.
            box = fitz.Rect(r.x0, r.y0 - 1, right, r.y0 + size * 1.6 + 2)
            if page.insert_textbox(box, t["text"], fontsize=size, **kw) >= 0:
                replaced += 1
                print(f"[replace_placeholders] page {pno+1}: « {t['text'][:60]} » (taille {size:.1f}/{t['size']:.0f}, {t['font']})", file=sys.stderr)
    return replaced


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--context", required=True)
    args = ap.parse_args()

    with open(args.context, "r", encoding="utf-8") as f:
        ctx = json.load(f)
    client = (ctx.get("clientName") or "").strip()

    doc = fitz.open(args.input)
    if not client or client.lower() == "le client":
        # Sans nom de client fiable, on ne touche à rien (on évite d'écrire « le client »).
        print("[replace_placeholders] nom de client indisponible → balises conservées.", file=sys.stderr)
        doc.save(args.output)
        print(json.dumps({"replaced": 0}))
        return

    try:
        n = replace(doc, client)
    except Exception as e:  # noqa: BLE001 — ne jamais bloquer la génération
        print(f"[replace_placeholders] échec ({e}) → balises conservées.", file=sys.stderr)
        n = 0
    doc.save(args.output, garbage=3, deflate=True)
    print(json.dumps({"replaced": n}))


if __name__ == "__main__":
    main()
