// ─── Détection des passages surlignés en JAUNE dans le PDF ───
// Les surlignages de l'utilisateur ne sont PAS des annotations /Highlight (ils ont été aplatis en
// graphiques vectoriels dans le flux de page). On les retrouve donc en parcourant la liste
// d'opérateurs de chaque page (via le pdf.js embarqué par pdf-parse) : on repère les rectangles
// remplis d'une couleur jaune, on lit le texte qui tombe dessous, et on échantillonne la couleur de
// fond locale (le plus grand rectangle non‑jaune qui contient le surlignage) pour pouvoir masquer
// proprement ensuite. Un masque dessiné par‑dessus recouvre à la fois l'ancien texte ET le jaune.

// pdf.js (build node embarqué) suppose un DOM (FontLoader.insertRule, décodage d'images). On fournit
// des shims minimalistes : on n'utilise que la géométrie/couleurs (operator list) et le texte.
const g: any = global as any;
if (typeof g.document === 'undefined') {
  g.document = {
    createElement: () => ({ id: '', sheet: { cssRules: { length: 0 }, insertRule() { /* noop */ } }, remove() { /* noop */ } }),
    documentElement: { getElementsByTagName: () => [{ appendChild() { /* noop */ } }] },
  };
}
if (typeof g.Image === 'undefined') g.Image = class { set src(_v: any) { /* noop */ } };
// Node ≥21 expose un `navigator` global → pdf.js prend le chemin « mesure de police via canvas »
// (qui plante hors navigateur). On force le chemin SYNCHRONE en simulant un user-agent Gecko.
if (!g.navigator || !/Gecko/.test(g.navigator.userAgent || '')) {
  try { Object.defineProperty(g, 'navigator', { value: { userAgent: 'Mozilla/5.0 (X11; rv:99.0) Gecko/20100101 Firefox/99.0' }, configurable: true, writable: true }); }
  catch { /* navigator non configurable : ignoré */ }
}

// @ts-ignore — build interne de pdf-parse, pas de types
import pdfjs from 'pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js';

export interface YellowHighlight {
  pageIndex: number;                                   // 0-based
  left: number; right: number; top: number; bottom: number;  // bbox en points PDF (origine bas-gauche)
  text: string;                                        // texte existant sous le surlignage
  fontSize: number;                                    // taille de police d'origine (pt) → redraw à l'identique
  bgHex: string;                                       // couleur de fond locale (hex), pour le masque
  textHex: string;                                     // couleur de texte lisible déduite du fond
  maxBottom: number;                                   // y-plancher (PDF) : jusqu'où un bloc ajouté peut descendre sans recouvrir le texte en dessous
}

type Mat = number[]; // [a,b,c,d,e,f]
const apply = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const compose = (a: Mat, b: Mat): Mat => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
];

// `rgb` peut être un Uint8ClampedArray (pdf.js) : `.map` d'un tableau typé recoerce le résultat en
// nombre (→ 0) et casse le hex. On le convertit d'abord en tableau JS simple.
const toHex = (rgb: ArrayLike<number>) => Array.from(rgb).map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const isYellow = (c: number[] | null) => !!c && c[0] > 200 && c[1] > 180 && c[2] < 150;

interface Rect { left: number; right: number; top: number; bottom: number; color: number[]; area: number; }

/** Extrait les coins (x,y) d'un constructPath en appliquant la CTM courante. */
function pathPoints(OPS: any, subOps: number[], coords: number[], ctm: Mat): Array<[number, number]> {
  const cnt: Record<number, number> = {
    [OPS.moveTo]: 2, [OPS.lineTo]: 2, [OPS.curveTo]: 6, [OPS.curveTo2]: 4, [OPS.curveTo3]: 4, [OPS.closePath]: 0, [OPS.rectangle]: 4,
  };
  const pts: Array<[number, number]> = [];
  let c = 0;
  for (const op of subOps) {
    const n = cnt[op] != null ? cnt[op] : 0;
    const args = coords.slice(c, c + n); c += n;
    if (op === OPS.rectangle) {
      const [x, y, w, h] = args;
      [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].forEach(([px, py]) => pts.push(apply(ctm, px, py)));
    } else {
      for (let k = 0; k + 1 < args.length; k += 2) pts.push(apply(ctm, args[k], args[k + 1]));
    }
  }
  return pts;
}

export async function findYellowHighlights(pdfBuffer: Buffer): Promise<YellowHighlight[]> {
  const data = new Uint8Array(pdfBuffer);
  // En Node (pas de DOM) : on coupe le chargement de polices (FontLoader → document) et le décodage
  // natif d'images. On n'a besoin que de la liste d'opérateurs (géométrie/couleurs) et du texte.
  const doc = await pdfjs.getDocument({
    data, disableFontFace: true, nativeImageDecoderSupport: 'none', disableRange: true, disableStream: true,
  }).promise;
  const OPS = pdfjs.OPS;
  const out: YellowHighlight[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const view = page.getViewport(1);
    const pageW = view.width, pageH = view.height;
    const ops = await page.getOperatorList();
    let ctm: Mat = [1, 0, 0, 1, 0, 0];
    const stack: Mat[] = [];
    let fill: number[] | null = null;
    const yellowRects: Rect[] = [];
    const bgRects: Rect[] = [];
    const imgRects: Rect[] = [];   // emprises d'images/schémas (placées via la CTM courante)

    const IMG_OPS = [OPS.paintImageXObject, OPS.paintJpegXObject, OPS.paintImageMaskXObject, OPS.paintInlineImage]
      .filter((o) => o !== undefined);
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], a = ops.argsArray[i];
      if (fn === OPS.save) stack.push(ctm.slice());
      else if (fn === OPS.restore) { if (stack.length) ctm = stack.pop()!; }
      else if (fn === OPS.transform) ctm = compose(a, ctm);
      else if (fn === OPS.setFillRGBColor) fill = a;
      else if (fn === OPS.constructPath) {
        const pts = pathPoints(OPS, a[0] || [], a[1] || [], ctm);
        if (!pts.length) continue;
        const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
        const r: Rect = {
          left: Math.min(...xs), right: Math.max(...xs), top: Math.max(...ys), bottom: Math.min(...ys),
          color: fill || [255, 255, 255], area: 0,
        };
        r.area = (r.right - r.left) * (r.top - r.bottom);
        if (isYellow(fill)) yellowRects.push(r); else bgRects.push(r);
      } else if (IMG_OPS.includes(fn)) {
        // L'image est dessinée sur le carré unité, placée/dimensionnée par la CTM courante.
        const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => apply(ctm, x, y));
        const xs = corners.map((q) => q[0]), ys = corners.map((q) => q[1]);
        const r: Rect = {
          left: Math.min(...xs), right: Math.max(...xs), top: Math.max(...ys), bottom: Math.min(...ys),
          color: [255, 255, 255], area: 0,
        };
        r.area = (r.right - r.left) * (r.top - r.bottom);
        imgRects.push(r);
      }
    }

    // Obstacles = images + aplats vectoriels, EN EXCLUANT les fonds quasi pleine page (panneau de fond,
    // photo de décor) : un ajout doit s'arrêter au-dessus d'un SCHÉMA, pas du fond derrière le texte.
    const obstacles = [...imgRects, ...bgRects].filter(
      (r) => !((r.right - r.left) > pageW * 0.8 && (r.top - r.bottom) > pageH * 0.7),
    );

    // Surlignages plausibles : largeur réelle, hauteur d'une ligne de texte.
    let blocks = yellowRects
      .filter((r) => (r.right - r.left) > 60 && (r.top - r.bottom) > 4 && (r.top - r.bottom) < 60)
      .map((r) => ({ ...r }));
    if (!blocks.length) continue;

    // Fusionne les lignes contiguës d'un même surlignage (chevauchement horizontal + écart vertical court).
    blocks.sort((m, n) => n.top - m.top);
    const merged: Rect[] = [];
    for (const b of blocks) {
      const m = merged.find((M) => !(b.left > M.right + 8 || b.right < M.left - 8) && (M.bottom - b.top) < 12 && (b.bottom - M.top) < 12);
      if (m) { m.left = Math.min(m.left, b.left); m.right = Math.max(m.right, b.right); m.top = Math.max(m.top, b.top); m.bottom = Math.min(m.bottom, b.bottom); }
      else merged.push({ ...b });
    }

    const tc = await page.getTextContent();
    const lines = buildLines(tc.items);

    for (const b of merged) {
      const para = expandToParagraph(lines, b);
      if (!para || !para.text) continue;

      // Fond local = plus GRAND rectangle non‑jaune qui contient le surlignage (= le panneau de
      // fond, pas un petit élément décoratif). Repli sur blanc si rien ne le couvre.
      const cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;
      const covering = bgRects
        .filter((r) => r.left <= cx + 2 && r.right >= cx - 2 && r.bottom <= cy + 2 && r.top >= cy - 2)
        .sort((u, v) => v.area - u.area);
      const bg = covering.length ? covering[0].color : [255, 255, 255];
      // Texte lisible : clair sur fond sombre, sombre sur fond clair (luminance perçue).
      const lum = (0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2]) / 255;
      const textHex = lum < 0.5 ? 'F2F2F2' : '1A1A1A';

      out.push({
        pageIndex: p - 1, left: para.left, right: para.right, top: para.top, bottom: para.bottom,
        text: para.text, fontSize: para.size, bgHex: toHex(bg), textHex,
        maxBottom: floorBelow(lines, obstacles, para),
      });
    }
  }
  // Dédoublonne (deux surlignages dans le même paragraphe → un seul bloc) et trie.
  const dedup = out.filter((r, i) => !out.slice(0, i).some((o) => o.pageIndex === r.pageIndex && Math.abs(o.top - r.top) < 4 && Math.abs(o.bottom - r.bottom) < 4));
  return dedup.sort((a, b) => a.pageIndex - b.pageIndex || b.top - a.top);
}

interface TextLine { y: number; size: number; left: number; right: number; text: string; }

/** Regroupe les items texte d'une page en lignes (même ligne de base à ~0.4·taille près), en
 *  SÉPARANT les colonnes (gros écart horizontal = gouttière) pour ne pas entrelacer 2 colonnes. */
function buildLines(items: any[]): TextLine[] {
  const clusters: Array<{ y: number; its: any[] }> = [];
  for (const it of items) {
    if (!(it.str || '').trim()) continue;
    const y = it.transform[5], size = Math.abs(it.transform[0]) || 10;
    let cl = clusters.find((c) => Math.abs(c.y - y) <= Math.max(2, size * 0.4));
    if (!cl) { cl = { y, its: [] }; clusters.push(cl); }
    cl.its.push(it);
  }
  const out: TextLine[] = [];
  const flush = (seg: any[]) => {
    if (!seg.length) return;
    const ss = seg.map((i) => Math.abs(i.transform[0])).filter((s) => s > 1).sort((a, b) => a - b);
    out.push({
      y: seg[0].transform[5], size: ss.length ? ss[Math.floor(ss.length / 2)] : 10,
      left: Math.min(...seg.map((i) => i.transform[4])),
      right: Math.max(...seg.map((i) => i.transform[4] + (i.width || 0))),
      text: seg.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim(),
    });
  };
  for (const cl of clusters) {
    cl.its.sort((a, b) => a.transform[4] - b.transform[4]);
    let seg: any[] = [];
    let prevRight: number | null = null;
    for (const it of cl.its) {
      const x = it.transform[4], size = Math.abs(it.transform[0]) || 10;
      if (prevRight !== null && x - prevRight > Math.max(40, size * 2.5)) { flush(seg); seg = []; } // gouttière
      seg.push(it); prevRight = x + (it.width || 0);
    }
    flush(seg);
  }
  return out.sort((a, b) => b.y - a.y);
}

/**
 * Plancher (y PDF) jusqu'où un bloc AJOUTÉ après le paragraphe surligné peut descendre sans recouvrir
 * le contenu figé en dessous. On prend l'obstacle le plus HAUT parmi : la 1re ligne de texte sous le
 * paragraphe ET le 1er schéma/image sous le paragraphe (même colonne). Marge de sécurité au-dessus.
 * Si rien en dessous → repli prudent (6 lignes).
 */
function floorBelow(
  lines: TextLine[], obstacles: Rect[], para: { left: number; right: number; bottom: number; size: number },
): number {
  const overlapsCol = (l: number, r: number) => l < para.right + 4 && r > para.left - 4;
  const candidates: number[] = [];

  // Texte sous le paragraphe : on se cale au-dessus du haut de glyphe de la ligne la plus proche.
  const below = lines.filter((l) => l.y < para.bottom - 1 && overlapsCol(l.left, l.right));
  if (below.length) {
    const next = below.reduce((a, b) => (b.y > a.y ? b : a));
    candidates.push(next.y + next.size * 0.85 + para.size * 0.4);
  }

  // Schémas/images sous le paragraphe : on se cale au-dessus de leur bord supérieur.
  for (const o of obstacles) {
    if (o.top < para.bottom - 1 && overlapsCol(o.left, o.right)) candidates.push(o.top + para.size * 0.4);
  }

  // Plancher = l'obstacle le plus HAUT (le plus contraignant). Sinon repli prudent.
  if (!candidates.length) return para.bottom - para.size * 6;
  return Math.max(...candidates);
}

/** Étend une ligne surlignée au PARAGRAPHE entier qui la contient (lignes contiguës, même taille,
 *  même colonne, sans grand saut vertical), pour donner de la matière à la personnalisation IA. */
function expandToParagraph(lines: TextLine[], b: { left: number; right: number; top: number; bottom: number }):
  { left: number; right: number; top: number; bottom: number; size: number; text: string } | null {
  // Lignes-graines : base dans la zone surlignée ET chevauchement horizontal (bonne colonne).
  const seeds = lines.map((l, i) => ({ l, i }))
    .filter(({ l }) => l.y >= b.bottom - 2 && l.y <= b.top + 2 && l.left < b.right + 4 && l.right > b.left - 4);
  if (!seeds.length) return null;
  let top = seeds[0].i, bot = seeds[seeds.length - 1].i;
  const sameBlock = (a: TextLine, c: TextLine, gap: number) =>
    gap <= a.size * 1.9 && Math.abs(a.size - c.size) <= a.size * 0.4 && a.left < c.right && a.right > c.left;
  const MAX = 14;                                   // garde-fou anti‑emballement
  while (top - 1 >= 0 && (bot - top) < MAX) {       // vers le haut (y plus grand)
    const cur = lines[top], prev = lines[top - 1];
    if (sameBlock(cur, prev, prev.y - cur.y)) top--; else break;
  }
  while (bot + 1 < lines.length && (bot - top) < MAX) { // vers le bas (y plus petit)
    const cur = lines[bot], next = lines[bot + 1];
    if (sameBlock(cur, next, cur.y - next.y)) bot++; else break;
  }
  const block = lines.slice(top, bot + 1);
  const size = block.map((l) => l.size).sort((a, c) => a - c)[Math.floor(block.length / 2)];
  return {
    left: Math.min(...block.map((l) => l.left)),
    right: Math.max(...block.map((l) => l.right)),
    top: lines[top].y + size * 0.85,
    bottom: lines[bot].y - size * 0.28,
    size,
    text: block.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim(),
  };
}
