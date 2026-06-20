#!/usr/bin/env python3
"""
Réécriture des zones surlignées d'un PDF (pipeline : PyMuPDF -> GPT -> PyMuPDF).

1. PyMuPDF détecte les surlignages JAUNES (aplats vectoriels) et extrait le texte dessous,
   avec sa géométrie, sa taille de police, sa couleur et la couleur de fond locale.
2. GPT réécrit chaque passage, adapté au client du DCE, en gardant sens/logique, à longueur proche.
3. PyMuPDF SUPPRIME réellement l'ancien texte (rédaction = redaction) + recouvre le jaune, puis
   réinsère le texte réécrit à la MÊME taille, dans la même zone.

Usage:
  py rewrite_highlights.py --input IN.pdf --output OUT.pdf --context ctx.json
Env:
  OPENAI_API_KEY (requis), MEMOIRE_MODEL (def. gpt-4o-mini)

ctx.json: { "clientName": str, "sites": [str], "analysis": {...}, "gssContext": str }
"""
import argparse
import json
import os
import re
import sys
import time

import fitz  # PyMuPDF


# ─── Détection des surlignages ───

def is_yellow(c):
    """Couleur (tuple 0-1) proche du jaune surligneur."""
    return c is not None and len(c) >= 3 and c[0] > 0.78 and c[1] > 0.70 and c[2] < 0.6


def luminance(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def int_to_rgb01(v):
    return ((v >> 16 & 255) / 255.0, (v >> 8 & 255) / 255.0, (v & 255) / 255.0)


def line_text(line):
    return re.sub(r"\s+", " ", "".join(sp.get("text", "") for sp in line.get("spans", []))).strip()


def line_hl_words(line_bbox, words, yrects):
    """Au niveau MOT (les spans PyMuPDF regroupent souvent toute la ligne, ce qui masque les
    surlignages partiels). Renvoie (taux de couverture en largeur, liste des MOTS surlignés)."""
    covered = 0.0
    total = 0.0
    hl_words = []
    for w in words:
        wr = fitz.Rect(w[:4])
        cy = (wr.y0 + wr.y1) / 2
        if not (line_bbox.y0 - 1 <= cy <= line_bbox.y1 + 1):
            continue
        ww = wr.width
        if ww <= 0:
            continue
        total += ww
        inter = 0.0
        for yr in yrects:
            ir = wr & yr
            if not ir.is_empty:
                inter = max(inter, ir.width)
        if inter > ww * 0.4:
            hl_words.append(w[4])
            covered += ww
    return (covered / total if total else 0.0), hl_words


def detect_highlights(doc):
    """Renvoie la liste des zones surlignées. On s'appuie sur la structure blocs/lignes de PyMuPDF
    (ordre de lecture + colonnes). Pour CHAQUE zone on renvoie :
      - `bands`  : les bandes jaunes à RÉDIGER (suppression réelle du texte + recouvrement du jaune),
                   y compris les surlignages PARTIELS de ligne (sinon → résidus de mots surlignés) ;
      - `insert` : le rectangle où ÉCRIRE la réécriture = uniquement les lignes ENTIÈREMENT surlignées
                   contiguës depuis le haut (on n'écrit jamais par-dessus du texte non surligné voisin)."""
    regions = []
    for pno in range(doc.page_count):
        page = doc[pno]
        yellow, bg_fills = [], []  # bg_fills: (area, rect, color)
        for d in page.get_drawings():
            fill, rect = d.get("fill"), d.get("rect")
            if rect is None:
                continue
            # surlignage = jaune VIF (1,1,0). On exige b<0.35 pour écarter les orangés des infographies.
            if fill and len(fill) >= 3 and fill[0] > 0.8 and fill[1] > 0.8 and fill[2] < 0.35 and rect.width > 12 and 4 < rect.height < 60:
                yellow.append(+rect)
            elif fill is not None:
                bg_fills.append((rect.width * rect.height, +rect, tuple(fill)))
        if not yellow:
            continue

        words = page.get_text("words")
        blocks = [b for b in page.get_text("dict").get("blocks", []) if b.get("type", 0) == 0]
        all_lines = []
        for block in blocks:
            for line in block.get("lines", []):
                if not line_text(line):
                    continue
                lb = fitz.Rect(line["bbox"])
                cov, hl_words = line_hl_words(lb, words, yellow)
                # Une ligne fait partie d'une zone dès qu'elle a AU MOINS un mot sous le jaune (capte
                # les surlignages PARTIELS de ligne, ex. un seul mot) → sinon résidus de mots surlignés.
                all_lines.append({"bbox": lb, "spans": line["spans"],
                                  "cov": cov, "hl_words": hl_words, "hl": len(hl_words) > 0})

        # Zones = lignes surlignées CONSÉCUTIVES (même colonne, faible saut vertical). Une ligne non
        # surlignée intercalée coupe la zone.
        passages, cur = [], None
        for L in all_lines:
            if not L["hl"]:
                cur = None
                continue
            if cur:
                prev = cur[-1]["bbox"]
                same_col = not (L["bbox"].x0 > prev.x1 + 8 or L["bbox"].x1 < prev.x0 - 8)
                if same_col and (L["bbox"].y0 - prev.y1) < L["bbox"].height * 1.4:
                    cur.append(L)
                    continue
            cur = [L]
            passages.append(cur)

        for lines in passages:
            text = re.sub(r"\s+", " ", " ".join(w for L in lines for w in L["hl_words"])).strip()
            if not text:
                continue
            spans = [sp for L in lines for sp in L["spans"] if sp.get("text", "").strip()]
            sizes = sorted(sp["size"] for sp in spans) or [10.5]
            size = sizes[len(sizes) // 2]

            # Bandes à rédiger = toutes les bandes jaunes touchant la zone (couvre aussi le partiel).
            zone = fitz.Rect(lines[0]["bbox"])
            for L in lines[1:]:
                zone |= L["bbox"]
            bands = [[yr.x0, yr.y0, yr.x1, yr.y1] for yr in yellow if yr.intersects(zone + (-2, -3, 2, 3))]
            if not bands:
                bands = [[zone.x0, zone.y0, zone.x1, zone.y1]]

            # Lignes ENTIÈREMENT surlignées, contiguës depuis le haut → zone d'écriture sûre.
            full_run = []
            for L in lines:
                if L["cov"] > 0.75:
                    full_run.append(L)
                else:
                    break
            ins_lines = full_run or [lines[0]]
            ins = fitz.Rect(ins_lines[0]["bbox"])
            for L in ins_lines[1:]:
                ins |= L["bbox"]

            colors = {}
            for sp in spans:
                colors[sp.get("color", 0)] = colors.get(sp.get("color", 0), 0) + 1
            text_color = int_to_rgb01(max(colors, key=colors.get)) if colors else (0.1, 0.1, 0.1)

            cx, cy = (zone.x0 + zone.x1) / 2, (zone.y0 + zone.y1) / 2
            covering = [c for c in bg_fills if not is_yellow(c[2]) and c[1].x0 <= cx <= c[1].x1 and c[1].y0 <= cy <= c[1].y1]
            covering.sort(key=lambda c: -c[0])
            bg_color = covering[0][2][:3] if covering else (1.0, 1.0, 1.0)

            # On N'ÉTEND PAS la zone d'écriture vers le bas : elle se limite aux lignes surlignées
            # (sinon deux zones voisines se chevauchent et les réécritures se superposent). Si la
            # réécriture dépasse, `insert_fit` réduit légèrement la police plutôt que de déborder.
            regions.append({
                "page": pno,
                "bands": bands,
                "insert": [ins.x0, ins.y0, ins.x1, ins.y1],
                "size": size,
                "text": text,
                "bg": list(bg_color),
                "color": list(text_color),
            })
    return merge_overlapping_regions(regions)


def merge_overlapping_regions(regions):
    """Fusionne, par page, les zones dont les rectangles d'écriture se CHEVAUCHENT (cas des paragraphes
    qui s'enroulent autour d'une image → PyMuPDF les éclate en plusieurs groupes de lignes qui se
    recouvrent). Sans cela, plusieurs réécritures se dessinent au même endroit (texte illisible)."""
    by_page = {}
    for r in regions:
        by_page.setdefault(r["page"], []).append(r)
    out = []
    for pno, regs in by_page.items():
        used = [False] * len(regs)
        for i in range(len(regs)):
            if used[i]:
                continue
            grp = [regs[i]]
            used[i] = True
            box = fitz.Rect(regs[i]["insert"])
            changed = True
            while changed:
                changed = False
                for j in range(len(regs)):
                    if not used[j] and fitz.Rect(regs[j]["insert"]).intersects(box):
                        grp.append(regs[j])
                        used[j] = True
                        box |= fitz.Rect(regs[j]["insert"])
                        changed = True
            if len(grp) == 1:
                out.append(grp[0])
                continue
            grp.sort(key=lambda r: (r["insert"][1], r["insert"][0]))
            rep = max(grp, key=lambda r: (r["insert"][2] - r["insert"][0]) * (r["insert"][3] - r["insert"][1]))
            texts = []
            for r in grp:
                t = r["text"]
                if not any(t in u or u in t for u in texts):
                    texts.append(t)
            out.append({
                "page": pno,
                "bands": [b for r in grp for b in r["bands"]],
                "insert": [box.x0, box.y0, box.x1, box.y1],
                "size": rep["size"],
                "text": " ".join(texts),
                "bg": rep["bg"],
                "color": rep["color"],
            })
    return out


# ─── Réécriture GPT ───

def char_budget(r):
    """Nombre de caractères tenant dans le rectangle d'écriture, à la taille d'origine."""
    size = r["size"] if r["size"] > 4 else 10.5
    x0, y0, x1, y1 = r["insert"]
    width = max(1.0, x1 - x0)
    usable = max(0.0, y1 - y0)
    lines = int(usable / (size * 1.2)) + 1
    chars_per_line = max(1, int(width / (size * 0.5)))
    return lines * chars_per_line


MD_RE = re.compile(r"(^[\s>]*[-*#]\s)|[`*#]", re.MULTILINE)


# Marge de première ligne (alinéa) et facteur de remplissage : on vise un peu MOINS que la capacité
# brute du cadre pour que la réécriture tienne à la TAILLE D'ORIGINE (sinon insert_fit réduit la police).
FIRST_LINE_INDENT = "       "  # alinéa prononcé (espaces normaux : largeur fiable quelle que soit la fonte)
FILL_FACTOR = 0.88


def passage_budget(r):
    """Budget de caractères d'un passage : ce qui tient dans la zone (avec marge de sécurité pour rester à
    la taille d'origine), borné à ~1.1× l'original."""
    cap = int(char_budget(r) * FILL_FACTOR)
    return max(1, min(cap, int(len(r["text"]) * 1.1) or cap))


def is_valid_rewrite(text, original, budget):
    """Une réécriture est valable si : non vide, sans markdown, ni trop longue (≤ 1.15× budget),
    ni tronquée (≥ 30 % de la longueur d'origine)."""
    t = (text or "").strip()
    if not t:
        return False
    if MD_RE.search(t):
        return False
    if len(t) > budget * 1.15:
        return False
    if len(t) < max(1, len(original.strip()) * 0.3):
        return False
    return True


def _build_messages(passages, budgets, texts, ctx):
    client_name = ctx.get("clientName") or "le client"
    sites = ", ".join([s for s in (ctx.get("sites") or []) if s])
    passages_str = "\n\n".join(
        f"[{i+1}] (≈ {budgets[i]} caractères) PASSAGE À RÉÉCRIRE : {texts[i]}"
        for i in range(len(passages))
    )
    system = (
        "Tu es un rédacteur expert chez GSS (sécurité privée). On te donne des passages d'un mémoire "
        "technique GSS. Pour CHAQUE passage, tu RÉÉCRIS INTÉGRALEMENT le passage (remplacement complet, "
        "le texte d'origine sera retiré), en gardant la VOIX de GSS (\"nous\", \"nos agents\").\n"
        "RÈGLES STRICTES :\n"
        "- Même sujet, même sens, même logique et même structure que l'original, mais ADAPTÉ au client "
        f"\"{client_name}\"" + (f" et à ses sites ({sites})" if sites else "") + ". Comprends le secteur "
        "d'activité, le fonctionnement et les enjeux du client (issus de l'ANALYSE DU DCE) et relie-y le "
        "contenu du passage (enjeux, risques, contraintes, sites précis), en montrant comment GSS y répond.\n"
        "- Conserve une LONGUEUR PROCHE de l'original (≈ nombre de caractères indiqué, ne dépasse pas).\n"
        "- Concret et professionnel ; aucune puce, aucun markdown, aucun titre : du texte continu, phrases complètes.\n"
        "- Renvoie un JSON STRICT : {\"rewrites\": [\"...\", ...]} dans le MÊME ordre et le MÊME nombre que les "
        "passages. Chaque réécriture NON VIDE."
    )
    analysis = json.dumps(ctx.get("analysis", {}), ensure_ascii=False)[:6000]
    user = (
        f"ANALYSE DU DCE (client, secteur, sites, enjeux, risques, contraintes) :\n{analysis}\n\n"
        f"CONTEXTE GSS (extraits doc) :\n{(ctx.get('gssContext') or '')[:5000]}\n\n"
        f"PASSAGES (réécris chacun intégralement, adapté au client) :\n{passages_str}"
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def rewrite_batch(client, model, passages, budgets, texts, ctx):
    """Réécrit un sous-ensemble de passages (typiquement ceux d'une page) en UN appel GPT. Retry avec
    backoff sur 429 (TPM), calqué sur le backend Node. Renvoie la liste des réécritures (ordre conservé)."""
    if not passages:
        return []
    messages = _build_messages(passages, budgets, texts, ctx)
    backoffs = [8, 16]  # courts : on préfère retomber sur le texte d'origine que faire exploser le timeout
    for attempt in range(len(backoffs) + 1):
        try:
            resp = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.4,
                response_format={"type": "json_object"},
            )
            raw = resp.choices[0].message.content or "{}"
            try:
                return json.loads(raw).get("rewrites", [])
            except Exception:
                return []
        except Exception as e:  # noqa: BLE001 — on ne distingue que le 429
            is_429 = getattr(e, "status_code", None) == 429 or "429" in str(e)
            if is_429 and attempt < len(backoffs):
                wait = backoffs[attempt]
                print(f"[rewrite_highlights] 429 (TPM) — attente {wait}s…", file=sys.stderr)
                time.sleep(wait)
                continue
            print(f"[rewrite_highlights] appel GPT échoué : {e}", file=sys.stderr)
            return []


def rewrite_passages(regions, ctx):
    """Réécrit les passages PAGE PAR PAGE (1 appel GPT par page → cohérence locale + appariement fiable).
    Chaque réécriture est vérifiée (is_valid_rewrite) ; en cas d'échec on ré-essaie CE passage seul (×2),
    puis on retombe sur le texte d'origine. Renvoie une liste alignée 1:1 avec `regions`."""
    if not regions:
        return []
    # IMPORTANT : un échec GPT (clé absente/invalide, réseau…) ne doit JAMAIS empêcher la suppression du
    # surlignage. On retombe alors sur le texte d'origine, qui sera quand même réinséré → le jaune part.
    api_key = os.environ.get("OPENAI_API_KEY") or ""
    if not api_key.strip():
        print("[rewrite_highlights] OPENAI_API_KEY absente → texte d'origine conservé, surlignage retiré.", file=sys.stderr)
        return [r["text"].strip() for r in regions]
    try:
        from openai import OpenAI
        # max_retries=0 + timeout court : en cas de panne réseau l'échec est IMMÉDIAT (pas de hang qui
        # ferait dépasser le timeout de 300s du backend → fallback avec surlignage).
        client = OpenAI(api_key=api_key, max_retries=0, timeout=30)
    except Exception as e:  # noqa: BLE001
        print(f"[rewrite_highlights] OpenAI indisponible ({e}) → texte d'origine conservé, surlignage retiré.", file=sys.stderr)
        return [r["text"].strip() for r in regions]
    model = os.environ.get("MEMOIRE_MODEL", "gpt-4o-mini")

    # Budget de temps global : le page-par-page fait beaucoup d'appels séquentiels ; avec un compte à TPM
    # faible (429 + backoff) on risquait de dépasser le timeout de 300s du backend → process tué → AUCUNE
    # sortie → fallback avec TOUT le surlignage. On borne donc le temps passé en GPT : au-delà, les passages
    # restants gardent le texte d'origine et on enchaîne sur la rédaction (le jaune part toujours).
    time_budget = float(os.environ.get("REWRITE_TIME_BUDGET", "200"))
    start = time.monotonic()

    budgets = [passage_budget(r) for r in regions]
    out = [None] * len(regions)
    failures = 0

    # Groupement par page en conservant l'index global d'origine.
    by_page = {}
    for i, r in enumerate(regions):
        by_page.setdefault(r["page"], []).append(i)

    for pno, idxs in by_page.items():
        if time.monotonic() - start > time_budget:
            for gi in idxs:
                out[gi] = regions[gi]["text"].strip()  # plus de temps : texte d'origine, jaune retiré
            continue
        rewrites = rewrite_batch(
            client, model, idxs, [budgets[i] for i in idxs], [regions[i]["text"] for i in idxs], ctx,
        )
        if len(rewrites) != len(idxs):
            print(f"[rewrite_highlights] page {pno}: {len(rewrites)} réécriture(s) pour {len(idxs)} passage(s) (appariement partiel).", file=sys.stderr)
        for k, gi in enumerate(idxs):
            txt = (rewrites[k] if k < len(rewrites) else "") or ""
            txt = txt.strip()
            # Check + ré-essai ciblé du seul passage fautif (×2), puis fallback texte d'origine.
            for _ in range(2):
                if is_valid_rewrite(txt, regions[gi]["text"], budgets[gi]) or time.monotonic() - start > time_budget:
                    break
                retry = rewrite_batch(client, model, [gi], [budgets[gi]], [regions[gi]["text"]], ctx)
                txt = ((retry[0] if retry else "") or "").strip()
            if not is_valid_rewrite(txt, regions[gi]["text"], budgets[gi]):
                txt = regions[gi]["text"].strip()  # repli
                failures += 1
            out[gi] = txt

    if failures:
        print(f"[rewrite_highlights] {failures} passage(s) non réécrit(s) → texte d'origine conservé.", file=sys.stderr)
    return out


# ─── Remplacement dans le PDF ───

SENT_RE = re.compile(r"[^.!?…]+[.!?…]+")


def shrink_to_sentences(text, max_chars):
    if len(text) <= max_chars:
        return text
    kept = ""
    for s in SENT_RE.findall(text):
        if len(kept) + len(s) <= max_chars:
            kept += s
        else:
            break
    return kept.strip() or text


def insert_fit(page, rect, text, base_size, kw, indent=""):
    """Insère `text` dans `rect` SANS jamais déborder ni laisser vide. insert_textbox n'écrit RIEN et
    renvoie <0 si le texte ne tient pas → on peut réessayer sans risque de double rendu. Stratégie :
    on garde d'abord la taille d'origine, puis on la réduit par petits paliers ; en dernier recours on
    retire des phrases puis des mots. `indent` est un alinéa ajouté en tête (préservé à chaque essai).
    Renvoie True si quelque chose a été écrit."""
    if not text.strip():
        return False
    sizes = [base_size, base_size * 0.94, base_size * 0.88, base_size * 0.82, base_size * 0.76, base_size * 0.7]
    for s in sizes:
        if page.insert_textbox(rect, indent + text, fontsize=s, **kw) >= 0:
            return True
    smallest = sizes[-1]
    sents = SENT_RE.findall(text) or [text]
    while len(sents) > 1:
        sents = sents[:-1]
        if page.insert_textbox(rect, indent + "".join(sents).strip(), fontsize=smallest, **kw) >= 0:
            return True
    words = text.split()
    while words:
        if page.insert_textbox(rect, indent + " ".join(words), fontsize=smallest, **kw) >= 0:
            return True
        words = words[:-1]
    return False


def apply_rewrites(doc, regions, rewrites, fontfile):
    use_trebuc = bool(fontfile and os.path.exists(fontfile))
    # 1) Rédaction page par page : suppression RÉELLE de l'ancien texte (toutes les bandes jaunes, y
    #    compris les surlignages partiels de ligne) ET recouvrement du jaune (fill = couleur de fond).
    by_page = {}
    for idx, r in enumerate(regions):
        by_page.setdefault(r["page"], []).append(idx)
    for pno, idxs in by_page.items():
        page = doc[pno]
        for i in idxs:
            r = regions[i]
            for band in r["bands"]:
                # Marge VERTICALE seulement (couvrir toute la hauteur de glyphe) ; pas d'élargissement
                # horizontal pour ne pas rogner le mot voisin conservé (ex. « Il » après un surlignage partiel).
                page.add_redact_annot(fitz.Rect(band) + (0, -1.5, 0, 1.5), fill=tuple(r["bg"]))
        # On NE supprime PAS les graphiques (le fond de page est vectoriel) ; le `fill` recouvre le jaune.
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

    # 2) Insertion du texte réécrit dans la zone d'écriture (lignes entièrement surlignées), à la taille
    #    d'origine si possible, sans jamais laisser vide ni écraser le texte voisin conservé.
    filled = 0
    for i, r in enumerate(regions):
        page = doc[r["page"]]
        size = r["size"] if r["size"] > 4 else 10.5
        text = (rewrites[i] or "").strip()
        if not text:
            continue
        kw = dict(color=tuple(r["color"]), align=fitz.TEXT_ALIGN_LEFT)
        kw["fontname"] = "trebuc" if use_trebuc else "helv"
        if use_trebuc:
            kw["fontfile"] = fontfile
        rect = fitz.Rect(r["insert"])
        if insert_fit(page, rect, text, size, kw, indent=FIRST_LINE_INDENT):
            filled += 1
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
    regions = detect_highlights(doc)
    print(f"[rewrite_highlights] {len(regions)} zone(s) surlignée(s) détectée(s).", file=sys.stderr)
    if not regions:
        doc.save(args.output)
        print(json.dumps({"regions": 0, "filled": 0}))
        return

    try:
        rewrites = rewrite_passages(regions, ctx)
    except Exception as e:  # noqa: BLE001 — la réécriture ne doit jamais bloquer le retrait du surlignage
        print(f"[rewrite_highlights] réécriture échouée ({e}) → texte d'origine conservé, surlignage retiré.", file=sys.stderr)
        rewrites = [r["text"].strip() for r in regions]
    trebuc = os.environ.get("TREBUCHET_FONT") or r"C:\Windows\Fonts\trebuc.ttf"
    filled = apply_rewrites(doc, regions, rewrites, trebuc)
    doc.save(args.output, garbage=3, deflate=True)
    print(json.dumps({"regions": len(regions), "filled": filled}))


if __name__ == "__main__":
    main()
