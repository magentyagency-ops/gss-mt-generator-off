// ─── Overlay de la synthèse IA sur AO RNE.pdf ───
// Au lieu d'éditer le .docx (où le texte reflue et décale la mise en page), on DESSINE le texte
// par-dessus le PDF figé, à l'intérieur du cadre délimité par les balises « Contexte sur mesure
// début » (haut) et « … fin » (bas). Rien ne peut refluer : la mise en page reste intacte.

import fs from 'fs';
// @ts-ignore — types fournis par @types/pdf-parse
import pdfParse from 'pdf-parse';
import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

// ─── Réglages (ajustables après validation visuelle) ───
const BOX_LEFT = 93;          // bord gauche du cadre (le « des marqueurs est à x≈95)
const BOX_RIGHT = 503;        // bord droit (≈ largeur de contenu des titres de la page)
const COL_GAP = 22;           // gouttière entre les 2 colonnes (pt)
const FONT_SIZE = 10.5;       // taille du corps de texte (pt)
const LINE_LEADING = 1.32;    // interligne (× taille)
const TOP_INSET = 2;          // marge sous le marqueur d'ouverture avant la 1re ligne
const BOTTOM_INSET = 4;       // marge au-dessus du marqueur « fin »
const MASK_PAD_TOP = 15;      // recouvrement au-dessus de la base du marqueur (hauteur de glyphe)
const MASK_PAD_BOTTOM = 6;
const MODERATE_FILL = 0.6;    // on ne remplit qu'une fraction des lignes disponibles (pages aérées)

// Couleurs du design (mêmes que les autres pages) — ajustables.
const BG_HEX = 'D9D9D9';      // aplat gris clair des pages de corps
const TEXT_HEX = '1A1A1A';    // texte sombre, lisible sur le gris

export interface ZoneBox {
  pageIndex: number;          // index 0-based de la page
  topY: number;               // y (PDF, origine bas) du marqueur d'ouverture = haut du cadre
  bottomY: number;            // y du marqueur « fin » = bas du cadre
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const CONTEXT_RE = /contexte\s+sur\s+mesure/i;
const FIN_RE = /\bfin\b/i;

/**
 * Repère les cadres éditables dans le PDF : sur chaque page, le marqueur d'ouverture
 * (« Contexte sur mesure [début] » SANS « fin ») donne le haut du cadre, et « … fin » le bas.
 * Renvoie une zone par page concernée, dans l'ordre des pages.
 */
export async function findZoneBoxes(pdfBuffer: Buffer): Promise<ZoneBox[]> {
  const boxes: ZoneBox[] = [];
  await pdfParse(pdfBuffer, {
    pagerender: (pd: any) => pd.getTextContent().then((tc: any) => {
      const page: number = pd.pageNumber;
      let openY: number | null = null;
      let finY: number | null = null;
      for (const it of tc.items) {
        const t = (it.str || '').trim();
        if (!t || !CONTEXT_RE.test(t)) continue;
        const y = it.transform[5];
        if (FIN_RE.test(t)) finY = y;       // « Contexte sur mesure fin »
        else openY = y;                     // « Contexte sur mesure » / « … début »
      }
      // Marqueurs parfois éclatés en items séparés : reconstituer via le voisinage.
      if (openY === null || finY === null) {
        const ys = tc.items.filter((it: any) => CONTEXT_RE.test((it.str || '')))
          .map((it: any) => it.transform[5]);
        const fins = tc.items.filter((it: any) => FIN_RE.test((it.str || '')) && it.transform[5] < 200)
          .map((it: any) => it.transform[5]);
        if (openY === null && ys.length) openY = Math.max(...ys);
        if (finY === null && fins.length) finY = Math.min(...fins);
      }
      if (openY !== null && finY !== null && openY > finY) {
        boxes.push({ pageIndex: page - 1, topY: openY, bottomY: finY });
      }
      return '';
    }),
  });
  return boxes.sort((a, b) => a.pageIndex - b.pageIndex);
}

/** Découpe un paragraphe en lignes tenant dans `maxWidth` (sans couper les mots, sauf mot trop long). */
function wrapParagraph(text: string, maxWidth: number, font: PDFFont, size: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  const w = (s: string) => font.widthOfTextAtSize(s, size);
  for (let word of words) {
    // mot plus large qu'une colonne → on le coupe caractère par caractère
    while (w(word) > maxWidth && word.length > 1) {
      let k = word.length;
      while (k > 1 && w(word.slice(0, k)) > maxWidth) k--;
      if (cur) { lines.push(cur); cur = ''; }
      lines.push(word.slice(0, k));
      word = word.slice(k);
    }
    const trial = cur ? cur + ' ' + word : word;
    if (w(trial) <= maxWidth) cur = trial;
    else { if (cur) lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  return lines;
}

interface Line { text: string; justify: boolean; }

/** Transforme des paragraphes en lignes (avec drapeau justification + lignes vides entre paragraphes). */
function paragraphsToLines(paras: string[], maxWidth: number, font: PDFFont, size: number): Line[] {
  const out: Line[] = [];
  paras.forEach((p, pi) => {
    const wl = wrapParagraph(p, maxWidth, font, size);
    wl.forEach((t, i) => out.push({ text: t, justify: i < wl.length - 1 })); // dernière ligne d'un § non justifiée
    if (pi < paras.length - 1) out.push({ text: '', justify: false });       // respiration entre §
  });
  return out;
}

/** Dessine une ligne ; si `justify`, répartit l'espace pour atteindre `width` (texte aligné des 2 côtés). */
function drawLine(page: PDFPage, line: Line, x: number, y: number, width: number, font: PDFFont, size: number, color: any) {
  if (!line.text) return;
  const words = line.text.split(' ');
  if (!line.justify || words.length === 1) {
    page.drawText(line.text, { x, y, size, font, color });
    return;
  }
  const wordsWidth = words.reduce((s, wd) => s + font.widthOfTextAtSize(wd, size), 0);
  const gap = (width - wordsWidth) / (words.length - 1);
  let cursor = x;
  for (const wd of words) {
    page.drawText(wd, { x: cursor, y, size, font, color });
    cursor += font.widthOfTextAtSize(wd, size) + gap;
  }
}

/** Dessine un ensemble de lignes dans UNE colonne (de haut en bas), borné à `maxLines`. */
function drawColumn(page: PDFPage, lines: Line[], x: number, topY: number, colWidth: number,
  lineHeight: number, font: PDFFont, size: number, color: any) {
  let y = topY - size;                 // 1re ligne juste sous le haut du cadre
  for (const line of lines) {
    drawLine(page, line, x, y, colWidth, font, size, color);
    y -= lineHeight;
  }
}

/**
 * Dessine la synthèse (texte continu) sur le PDF : répartit le texte sur les zones (pages 5–8),
 * 2 colonnes équilibrées par zone, mêmes couleurs/fond, sans déborder du cadre. Renvoie le PDF final.
 */
export async function overlaySynthesis(
  pdfBuffer: Buffer, fullText: string, fontBytes: Buffer | null,
): Promise<{ bytes: Uint8Array; zonesUsed: number; linesDrawn: number; truncated: boolean }> {
  const boxes = await findZoneBoxes(pdfBuffer);
  const doc = await PDFDocument.load(pdfBuffer);
  let font: PDFFont;
  if (fontBytes) { doc.registerFontkit(fontkit); font = await doc.embedFont(fontBytes, { subset: true }); }
  else font = await doc.embedFont(StandardFonts.Helvetica);

  const pages = doc.getPages();
  const bg = hexToRgb(BG_HEX);
  const textColor = hexToRgb(TEXT_HEX);
  const colWidth = (BOX_RIGHT - BOX_LEFT - COL_GAP) / 2;
  const lineHeight = FONT_SIZE * LINE_LEADING;

  if (boxes.length === 0) return { bytes: await doc.save(), zonesUsed: 0, linesDrawn: 0, truncated: false };

  // Capacité (lignes) par zone, plafonnée par le taux de remplissage modéré.
  const capOf = (b: ZoneBox) => {
    const usable = (b.topY - TOP_INSET) - (b.bottomY + BOTTOM_INSET);
    const perCol = Math.max(0, Math.floor(usable / lineHeight));
    return Math.floor(perCol * 2 * MODERATE_FILL);
  };
  const caps = boxes.map(capOf);

  // Découpe le texte une seule fois (largeur de colonne identique partout) puis répartit équitablement.
  const paras = fullText.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  const allLines = paragraphsToLines(paras, colWidth, font, FONT_SIZE);

  const N = boxes.length;
  const share = Math.ceil(allLines.length / N);
  let cursor = 0, linesDrawn = 0, zonesUsed = 0;
  let truncated = false;

  boxes.forEach((b, i) => {
    const page = pages[b.pageIndex];
    if (!page) return;
    // Masque : recouvre le cadre (et les marqueurs) avec l'aplat de fond du design.
    const rectBottom = b.bottomY - MASK_PAD_BOTTOM;
    const rectTop = b.topY + MASK_PAD_TOP;
    page.drawRectangle({ x: BOX_LEFT - 4, y: rectBottom, width: (BOX_RIGHT - BOX_LEFT) + 8, height: rectTop - rectBottom, color: bg });

    const take = Math.min(caps[i], share, allLines.length - cursor);
    if (take <= 0) return;
    const zoneLines = allLines.slice(cursor, cursor + take);
    cursor += take;
    zonesUsed++;
    linesDrawn += zoneLines.filter((l) => l.text).length;

    // 2 colonnes équilibrées : moitié gauche / moitié droite.
    const half = Math.ceil(zoneLines.length / 2);
    const col1 = zoneLines.slice(0, half);
    const col2 = zoneLines.slice(half);
    drawColumn(page, col1, BOX_LEFT, b.topY - TOP_INSET, colWidth, lineHeight, font, FONT_SIZE, textColor);
    drawColumn(page, col2, BOX_LEFT + colWidth + COL_GAP, b.topY - TOP_INSET, colWidth, lineHeight, font, FONT_SIZE, textColor);
  });

  if (cursor < allLines.filter((l) => l.text).length) truncated = true;
  return { bytes: await doc.save(), zonesUsed, linesDrawn, truncated };
}

/** Lit la police Trebuchet MS du système (Windows) pour coller au design ; null → repli Helvetica. */
export function loadTrebuchetFont(): Buffer | null {
  const candidates = [
    'C:/Windows/Fonts/trebuc.ttf',
    process.env.WINDIR ? `${process.env.WINDIR}/Fonts/trebuc.ttf` : '',
  ].filter(Boolean);
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return fs.readFileSync(p); } catch { /* ignore */ }
  }
  return null;
}
