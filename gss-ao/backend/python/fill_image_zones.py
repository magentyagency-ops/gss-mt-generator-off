#!/usr/bin/env python3
"""
Remplissage des cadres « Zone d'image » d'un PDF par des images GÉNÉRÉES (OpenAI Images).

Pipeline (PyMuPDF -> OpenAI Images -> PyMuPDF) :
1. PyMuPDF repère chaque cadre blanc « Zone d'image » (le rectangle plein qui entoure le
   libellé) et extrait le CONTEXTE TEXTE de la page (titre de section + texte courant).
2. OpenAI génère une image photoréaliste fondée sur ce contexte (thème de la page),
   adaptée au client du DCE.
3. PyMuPDF dessine l'image pour REMPLIR le cadre (recadrage « cover »), recouvrant le
   libellé « Zone d'image ».

Usage:
  py fill_image_zones.py --input IN.pdf --output OUT.pdf --context ctx.json
Env:
  OPENAI_API_KEY (requis), IMAGE_MODEL (def. gpt-image-1)

ctx.json: { "clientName": str, "sites": [str], "analysis": {...}, "gssContext": str }

En l'absence de clé / en cas d'échec, le PDF est recopié tel quel (cadres conservés) :
la génération du mémoire n'est jamais bloquée par cette étape.
"""
import argparse
import io
import json
import os
import re
import sys
import time
import urllib.request

import fitz  # PyMuPDF
from PIL import Image


# Libellé du cadre : « Zone d'image » (apostrophe droite, courbe ’ ou accent `).
ZONE_RE = re.compile(r"zone\s*d[’'`]?\s*image", re.I)


def norm(s):
    return re.sub(r"\s+", " ", s or "").strip()


# ─── Détection des cadres « Zone d'image » + contexte texte de la page ───

def line_size(line):
    """Taille de police dominante d'une ligne (max des spans)."""
    return max((sp.get("size", 0) for sp in line.get("spans", [])), default=0)


# Seuil de corps : au-delà = un INTITULÉ de section (titre), en deçà = du texte courant.
HEADING_MIN_SIZE = 20.0
# Bandeau de tête (numéro de chapitre « I. PRESENTATION ») : on l'ignore comme titre.
TOP_BAND_Y = 95.0


def collect_lines(page):
    """Toutes les lignes de texte de la page (hors libellés « Zone d'image »), avec corps et géométrie."""
    out = []
    for b in page.get_text("dict").get("blocks", []):
        if b.get("type", 0) != 0:
            continue
        for l in b.get("lines", []):
            txt = norm("".join(sp.get("text", "") for sp in l.get("spans", [])))
            if not txt or ZONE_RE.search(txt):
                continue
            r = fitz.Rect(l["bbox"])
            out.append({"txt": txt, "size": line_size(l), "rect": r, "cy": (r.y0 + r.y1) / 2})
    return out


def zone_context(frame, lines):
    """Pour UN cadre, choisit l'intitulé de section le plus PROCHE (les pages à deux cadres ont deux
    titres distincts) puis le texte courant voisin. Donne le brief de l'image pour ce cadre précis."""
    fcy = (frame.y0 + frame.y1) / 2
    headings = [l for l in lines if l["size"] >= HEADING_MIN_SIZE and l["rect"].y0 >= TOP_BAND_Y]
    bodies = [l for l in lines if l["size"] < HEADING_MIN_SIZE and l["rect"].y0 >= TOP_BAND_Y]

    heading = ""
    if headings:
        nearest = min(headings, key=lambda l: abs(l["cy"] - fcy))
        # Lignes de titre proches (≤ 70 pt) du plus proche → on reconstitue un intitulé multi-lignes.
        grp = sorted((l for l in headings if abs(l["cy"] - nearest["cy"]) <= 70),
                     key=lambda l: (l["rect"].y0, l["rect"].x0))
        heading = norm(" ".join(l["txt"] for l in grp))

    # Texte courant voisin du cadre (au-dessus comme au-dessous), pour ancrer l'illustration.
    near = sorted((l for l in bodies if frame.y0 - 160 <= l["cy"] <= frame.y1 + 280),
                  key=lambda l: (l["rect"].y0, l["rect"].x0))
    body = norm(" ".join(l["txt"] for l in near)) or norm(" ".join(l["txt"] for l in bodies))
    return heading, body


def find_zones(doc):
    """Renvoie la liste des cadres à remplir : {page, frame:[x0,y0,x1,y1], heading, body}."""
    zones = []
    for pno in range(doc.page_count):
        page = doc[pno]
        # Libellés « Zone d'image » de la page (un cadre par libellé).
        labels = []
        for b in page.get_text("dict").get("blocks", []):
            if b.get("type", 0) != 0:
                continue
            for l in b.get("lines", []):
                txt = norm("".join(sp.get("text", "") for sp in l.get("spans", [])))
                if ZONE_RE.search(txt):
                    labels.append(fitz.Rect(l["bbox"]))
        if not labels:
            continue

        # Rectangles pleins (avec remplissage) candidats à être le cadre.
        rects = [d["rect"] for d in page.get_drawings()
                 if d.get("rect") is not None and d.get("fill") is not None]
        lines = collect_lines(page)

        for lb in labels:
            cx, cy = (lb.x0 + lb.x1) / 2, (lb.y0 + lb.y1) / 2
            # Le cadre = le plus PETIT rectangle plein (>40×40) qui contient le libellé
            # (on écarte ainsi le fond pleine page et la grande carte sombre).
            cands = [r for r in rects
                     if r.x0 - 1 <= cx <= r.x1 + 1 and r.y0 - 1 <= cy <= r.y1 + 1
                     and r.width > 40 and r.height > 40]
            frame = min(cands, key=lambda r: r.width * r.height) if cands else (lb + (-6, -6, 6, 6))
            heading, body = zone_context(frame, lines)
            zones.append({
                "page": pno,
                "frame": [frame.x0, frame.y0, frame.x1, frame.y1],
                "heading": heading,
                "body": body,
            })
    return zones


# ─── Génération d'image (OpenAI Images) ───

def build_prompt(zone, ctx):
    client_name = (ctx.get("clientName") or "").strip()
    sites = ", ".join(s for s in (ctx.get("sites") or []) if s)
    theme = zone["heading"] or zone["body"][:120] or "société de sécurité privée"
    body = zone["body"][:400]
    parts = [
        "Photographie d'entreprise professionnelle, photoréaliste, haut de gamme, "
        "destinée au mémoire technique d'une société de sécurité privée (GSS).",
        f"Thème de l'illustration : {theme}.",
    ]
    if body:
        parts.append(f"Contexte de la page : {body}.")
    if client_name:
        parts.append(f"Adaptée au client « {client_name} »" + (f" et à ses sites ({sites})." if sites else "."))
    parts.append(
        "Cadre professionnel, lumière naturelle, ambiance corporate sobre et rassurante, "
        "agents et personnel en tenue soignée. "
        "STRICTEMENT AUCUN texte, aucun mot, aucun logo ni filigrane dans l'image."
    )
    return " ".join(parts)


def pick_size(model, w, h):
    """Choisit le format d'image le plus proche de l'orientation du cadre."""
    ratio = w / h if h else 1.0
    if model.startswith("dall-e-3"):
        if ratio > 1.25:
            return "1792x1024"
        if ratio < 0.8:
            return "1024x1792"
        return "1024x1024"
    # gpt-image-1
    if ratio > 1.25:
        return "1536x1024"
    if ratio < 0.8:
        return "1024x1536"
    return "1024x1024"


def retry_wait(err, default):
    """Délai d'attente conseillé par l'API (« try again in 12s »/« Retry-After »), sinon `default`."""
    s = str(err)
    m = re.search(r"try again in\s+([\d.]+)\s*s", s, re.I) or re.search(r"retry[- ]after[:=]?\s*([\d.]+)", s, re.I)
    if m:
        try:
            return min(90.0, float(m.group(1)) + 1.0)
        except ValueError:
            pass
    return default


# Génération robuste : les limites de débit (429/RPM/IPM) sont FRÉQUENTES quand on enchaîne
# une dizaine d'images → on réessaie longtemps (jusqu'à ~6 min/image) en respectant le délai
# conseillé par l'API, afin que TOUS les cadres finissent par être remplis.
RATE_LIMIT_BACKOFFS = [15, 25, 40, 60, 60, 75, 90]


def generate_image(client, model, prompt, size, quality):
    """Renvoie les octets PNG de l'image générée, ou None. Réessaie longtemps sur 429 (débit)."""
    for attempt in range(len(RATE_LIMIT_BACKOFFS) + 1):
        try:
            kwargs = dict(model=model, prompt=prompt, size=size, n=1)
            if quality and model.startswith("gpt-image"):
                kwargs["quality"] = quality
            # dall-e-* renvoie une URL par défaut ; on force le base64. gpt-image-1 renvoie
            # déjà du base64 et n'accepte PAS response_format → on ne le passe que pour dall-e.
            if model.startswith("dall-e"):
                kwargs["response_format"] = "b64_json"
            resp = client.images.generate(**kwargs)
            datum = resp.data[0]
            b64 = getattr(datum, "b64_json", None)
            if b64:
                import base64
                return base64.b64decode(b64)
            url = getattr(datum, "url", None)
            if url:
                with urllib.request.urlopen(url, timeout=60) as r:
                    return r.read()
            return None
        except Exception as e:  # noqa: BLE001
            is_429 = getattr(e, "status_code", None) == 429 or "429" in str(e) or "rate limit" in str(e).lower()
            if is_429 and attempt < len(RATE_LIMIT_BACKOFFS):
                wait = retry_wait(e, RATE_LIMIT_BACKOFFS[attempt])
                print(f"[fill_image_zones] 429 (débit) — attente {wait:.0f}s… (essai {attempt+1})", file=sys.stderr)
                time.sleep(wait)
                continue
            print(f"[fill_image_zones] génération image échouée : {e}", file=sys.stderr)
            return None


# ─── Recadrage « cover » + insertion dans le cadre ───

def cover_crop(img_bytes, target_w, target_h):
    """Redimensionne + recadre l'image pour REMPLIR exactement le cadre (style CSS object-fit:cover)."""
    im = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    iw, ih = im.size
    if iw <= 0 or ih <= 0:
        return None
    scale = max(target_w / iw, target_h / ih)
    nw, nh = max(1, int(iw * scale)), max(1, int(ih * scale))
    im = im.resize((nw, nh), Image.LANCZOS)
    left = (nw - target_w) // 2
    top = (nh - target_h) // 2
    im = im.crop((left, top, left + target_w, top + target_h))
    out = io.BytesIO()
    im.save(out, format="PNG")
    return out.getvalue()


def fill_zones(doc, zones, ctx):
    api_key = os.environ.get("OPENAI_API_KEY") or ""
    if not api_key.strip():
        print("[fill_image_zones] OPENAI_API_KEY absente → cadres conservés.", file=sys.stderr)
        return 0
    try:
        from openai import OpenAI
        # timeout généreux : une image gpt-image-1 peut prendre 1-2 min ; max_retries=0 car on
        # gère nous-mêmes le backoff sur 429 (retry conseillé par l'API).
        client = OpenAI(api_key=api_key, max_retries=0, timeout=180)
    except Exception as e:  # noqa: BLE001
        print(f"[fill_image_zones] OpenAI indisponible ({e}) → cadres conservés.", file=sys.stderr)
        return 0
    model = os.environ.get("IMAGE_MODEL", "gpt-image-1")
    quality = os.environ.get("IMAGE_QUALITY", "").strip()  # gpt-image-1 : low|medium|high|auto

    # Cadres exploitables (assez grands pour porter une image).
    todo = [z for z in zones if fitz.Rect(z["frame"]).width >= 20 and fitz.Rect(z["frame"]).height >= 20]
    if not todo:
        return 0

    # Génération CONCURRENTE (réseau) pour tenir tous les cadres dans le temps imparti. La limite de
    # parallélisme reste modérée pour ne pas saturer le débit de l'API (chaque appel a son backoff 429).
    try:
        workers = max(1, min(len(todo), int(os.environ.get("IMAGE_CONCURRENCY", "3"))))
    except ValueError:
        workers = 3

    def render(z):
        rect = fitz.Rect(z["frame"])
        size = pick_size(model, rect.width, rect.height)
        img = generate_image(client, model, build_prompt(z, ctx), size, quality)
        if not img:
            return z, None, size
        tw, th = max(1, int(rect.width * 3)), max(1, int(rect.height * 3))  # ~3× le cadre = net à l'impression
        return z, cover_crop(img, tw, th), size

    from concurrent.futures import ThreadPoolExecutor
    results = []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        results = list(ex.map(render, todo))

    # Insertion SÉQUENTIELLE dans le PDF (PyMuPDF n'est pas thread-safe en écriture). L'image opaque
    # remplit le cadre et recouvre le libellé « Zone d'image ».
    filled = 0
    for z, png, size in results:
        if not png:
            print(f"[fill_image_zones] page {z['page']+1}: cadre NON rempli (génération échouée) — « {z['heading'][:50]} »", file=sys.stderr)
            continue
        doc[z["page"]].insert_image(fitz.Rect(z["frame"]), stream=png, keep_proportion=False, overlay=True)
        filled += 1
        print(f"[fill_image_zones] page {z['page']+1}: cadre rempli ({size}) — « {z['heading'][:50]} »", file=sys.stderr)
    return filled


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--context", required=True)
    args = ap.parse_args()

    with open(args.context, "r", encoding="utf-8") as f:
        ctx = json.load(f)

    doc = fitz.open(args.input)
    zones = find_zones(doc)
    print(f"[fill_image_zones] {len(zones)} cadre(s) « Zone d'image » détecté(s).", file=sys.stderr)
    if not zones:
        doc.save(args.output)
        print(json.dumps({"zones": 0, "filled": 0}))
        return

    try:
        filled = fill_zones(doc, zones, ctx)
    except Exception as e:  # noqa: BLE001 — l'échec ne doit jamais bloquer la génération
        print(f"[fill_image_zones] remplissage échoué ({e}) → cadres conservés.", file=sys.stderr)
        filled = 0
    doc.save(args.output, garbage=3, deflate=True)
    print(json.dumps({"zones": len(zones), "filled": filled}))


if __name__ == "__main__":
    main()
