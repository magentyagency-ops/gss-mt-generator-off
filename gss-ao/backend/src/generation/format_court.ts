// ════════════════════════════════════════════════════════════════════════════════════════
// FORMAT COURT IMPOSÉ PAR LE RÈGLEMENT DE CONSULTATION (ex. « mémoire technique de douze pages
// maximum structuré comme suit : … »)
// ════════════════════════════════════════════════════════════════════════════════════════
// Quand le RC fixe un nombre de pages maximum ET un plan, le mémoire suit CE plan (une partie par
// point du RC, dans l'ordre) et tient dans la limite : rendu A4 compact (en-tête GSS sur la première
// page, pas de page de garde ni de sommaire séparés), quelques schémas GSS validés, nombre de pages
// mesuré sur le PDF produit. Si le texte dépasse, la police est réduite par paliers (lisibilité
// conservée), puis les schémas sont retirés ; le générateur condense le texte si cela ne suffit pas.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { themeActif, styleDuTheme, fontFaceTheme, familleTexte, luminance, contraste, LOGO_FOND_CLAIR } from './themes';

export interface PartieCourte { id: string; title: string; attendu?: string }
export interface FormatImpose { pagesMax: number; plan: PartieCourte[]; source: string }

const MARP_ASSETS = path.resolve(__dirname, 'marp');
const MOTEUR = path.resolve(__dirname, '../../python/schemas_gss');
const LEXEND = path.join(MOTEUR, 'polices', 'Lexend.ttf');

/** Passages du DCE qui fixent un nombre de pages (repérage déterministe, avant toute analyse IA). */
export function passagesLimitePages(dce: string): string[] {
  // « 12 pages », « (12) pages », « vingt (20) pages », « 15 feuillets », « 10 faces » … accompagné, à
  // proximité, d'un terme de limite (maximum, limité, ne pas dépasser, au plus…).
  const re = /\(?\b\d{1,3}\)?\s*(pages?|feuillets?|faces?)\b/gi;
  const limite = /maxim|limit|d[ée]pass|exc[èé]d|au plus|plafon/i;
  const out: Array<{ pos: number; texte: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(dce)) && out.length < 8) {
    const autour = dce.slice(Math.max(0, m.index - 90), m.index + m[0].length + 90);
    if (!limite.test(autour) || out.some((o) => Math.abs(o.pos - m!.index) < 800)) continue;
    out.push({ pos: m.index, texte: dce.slice(Math.max(0, m.index - 700), m.index + 1300) });
  }
  return out.map((o) => o.texte);
}

/** Nombre de pages d'un PDF (pdfinfo, sinon comptage des objets /Page). */
export function nombrePages(pdf: string): number {
  const r = spawnSync('pdfinfo', [pdf], { encoding: 'utf-8' });
  const m = /Pages:\s+(\d+)/.exec(r.stdout || '');
  if (m) return Number(m[1]);
  const brut = fs.readFileSync(pdf).toString('latin1');
  return (brut.match(/\/Type\s*\/Page[^s]/g) || []).length;
}

const echapper = (t?: string) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Couleurs et polices du format court : celles du thème (themes.ts), ou celles d'avant les thèmes (retour arrière,
 *  rendu identique). */
function jetonsCourt(theme: string) {
  const p = styleDuTheme(theme)?.pages;
  if (!p) {
    return { police: 'Arial, Helvetica, sans-serif', encre: '#1f2937', accent: '#dc2626', fort: '#111827', gris: '#4b5563', bandeau: '#494545',
      bandeauTexte: '#fff', numero: '#fca5a5', titre: '#dc2626', teteTableau: '#484545', teteTableauTexte: '#F5F5DE', filet: '#CFC9C5',
      ligne: '#F7F5EF', pied: '#6b7280', logo: 'logogss.png', extra: '' };
  }
  const v = (k: string, d: string) => p[k] || d;
  const bandeau = v('--gss-tableau-tete', '#0B2545');
  const bandeauTexte = v('--gss-tableau-tete-texte', '#FFFFFF');
  const accentCouv = v('--gss-couverture-accent', v('--gss-accent', '#E85D15'));
  const enteteFond = v('--gss-entete-fond', '#0B2545');
  const enteteTexte = v('--gss-entete-texte', '#FFFFFF');
  const fond = v('--gss-fond-page', '#FFFFFF');
  // En-tête de la première page dans le bandeau du thème (logo, titre de l'offre), polices du thème embarquées.
  const extra = `${fontFaceTheme(theme)}
html, body { background: ${fond}; }
h1, h2, h3, h4, header.tete .t1, header.tete .t2 { font-family: ${v('--gss-police-titre', 'sans-serif')}; }
header.tete { background: ${enteteFond}; padding: 7px 12px; border-bottom: 3px solid ${v('--gss-entete-filet', accentCouv)}; }
header.tete .t1 { color: ${contraste(accentCouv, enteteFond) >= 4.5 ? accentCouv : enteteTexte}; }
header.tete .t2 { color: ${enteteTexte}; }
header.tete .t3 { color: ${enteteTexte}; opacity: .8; }
h1 { font-weight: ${v('--gss-titre-graisse', '600')}; padding: 4px 9px; }
li::marker { color: ${v('--gss-accent', accentCouv)}; }
`;
  return {
    police: familleTexte(theme) || 'Arial, Helvetica, sans-serif', encre: v('--gss-encre', '#1f2937'), accent: v('--gss-accent', '#dc2626'),
    fort: v('--gss-titre', '#111827'), gris: v('--gss-encre-2', '#4b5563'), bandeau, bandeauTexte,
    numero: contraste(accentCouv, bandeau) >= 3 ? accentCouv : bandeauTexte, titre: v('--gss-titre', '#dc2626'), teteTableau: bandeau,
    teteTableauTexte: bandeauTexte, filet: v('--gss-filet', '#CFC9C5'), ligne: v('--gss-tableau-ligne', '#F7F5EF'),
    pied: luminance(fond) < 0.2 ? '#6b7280' : v('--gss-encre-3', '#6b7280'),
    logo: styleDuTheme(theme)?.logo === 'encre' ? LOGO_FOND_CLAIR : 'logogss.png', extra,
  };
}

function html(
  parties: Array<{ titre: string; texte: string; schema?: string; garder?: boolean }>,
  cover: { client?: string; title?: string; ref?: string },
  corps: number,
  theme: string = themeActif(),
): string {
  const md = new (require('markdown-it'))({ html: false, breaks: false, linkify: false });
  const j = jetonsCourt(theme);
  const police = fs.existsSync(LEXEND) ? `@font-face{font-family:'Lexend';src:url('file://${LEXEND}') format('truetype');font-weight:100 900;}` : '';
  const logo = path.join(MARP_ASSETS, j.logo);
  // Objet du marché ; « Mémoire technique » (valeur par défaut) ferait doublon avec le bandeau.
  const objet = /^m[ée]moire technique$/i.test((cover.title || '').trim()) ? '' : (cover.title || '').trim();
  const blocs = parties.map((p, i) => `
<section>
  <h1><span class="num">${i + 1}.</span> ${echapper(p.titre)}</h1>
  ${md.render(p.texte.replace(/^#\s+/gm, '## '))}
  ${p.schema ? `<figure class="schema">${p.schema}</figure>` : ''}
</section>`).join('\n');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
${police}
@page { size: A4; margin: 13mm 14mm 14mm 14mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: ${j.police}; font-size: ${corps}pt; line-height: 1.32; color: ${j.encre}; }
header.tete { display: flex; align-items: center; gap: 12px; border-bottom: 3px solid ${j.accent}; padding-bottom: 7px; margin-bottom: 9px; }
header.tete img { width: 46px; height: 46px; }
header.tete .t1 { font-size: 8.5pt; font-weight: bold; letter-spacing: .08em; color: ${j.accent}; }
header.tete .t2 { font-size: 13pt; font-weight: bold; color: ${j.fort}; text-transform: uppercase; }
header.tete .t3 { font-size: 9pt; color: ${j.gris}; }
h1 { font-size: ${corps + 3}pt; color: ${j.bandeauTexte}; background: ${j.bandeau}; padding: 3px 8px; margin: 10px 0 5px; break-after: avoid; }
h1 .num { color: ${j.numero}; }
h2 { font-size: ${corps + 1}pt; color: ${j.titre}; margin: 7px 0 3px; break-after: avoid; }
h3, h4 { font-size: ${corps + 0.5}pt; color: ${j.titre}; margin: 5px 0 2px; break-after: avoid; }
p { margin: 0 0 4px; text-align: justify; }
ul, ol { margin: 0 0 4px; padding-left: 16px; }
li { margin: 0 0 1px; }
strong { color: ${j.fort}; }
table { border-collapse: collapse; width: 100%; margin: 3px 0 6px; font-size: ${corps - 0.5}pt; break-inside: avoid; }
th { background: ${j.teteTableau}; color: ${j.teteTableauTexte}; text-align: left; padding: 2px 5px; }
td { border: 1px solid ${j.filet}; padding: 2px 5px; vertical-align: top; }
tr:nth-child(even) td { background: ${j.ligne}; }
figure.schema { margin: 5px auto 7px; text-align: center; break-inside: avoid; }
figure.schema svg { width: 100%; height: auto; max-height: 72mm; }
${j.extra}</style></head><body>
<header class="tete">
  ${fs.existsSync(logo) ? `<img src="file://${logo}" alt="">` : ''}
  <div><div class="t1">MÉMOIRE TECHNIQUE — GLOBAL SECURITY SERVICES</div>
  <div class="t2">${echapper(objet || cover.client || '')}</div>
  <div class="t3">${[objet ? cover.client : '', cover.ref].filter(Boolean).map(echapper).join(' — ')}</div></div>
</header>
${blocs}
</body></html>`;
}

/**
 * Rend le mémoire au format court et renvoie le PDF et son nombre de pages. Réduit la police par
 * paliers (10 → 9 pt) puis retire les schémas (du dernier au premier) tant que la limite est dépassée.
 */
export async function rendreFormatCourt(
  parties: Array<{ titre: string; texte: string; schema?: string; garder?: boolean }>,
  cover: { client?: string; title?: string; ref?: string },
  pagesMax: number,
  dossierSortie: string,
  themeDemande?: string,
  /** Police minimale essayée (10 : essai de mise en page à la police normale seulement, sans retrait de schéma). */
  policeMin = 9,
): Promise<{ filePath: string; pages: number; corps: number; schemasRetires: number }> {
  // Thème de style : celui du mémoire déjà rendu s'il est fourni, sinon GSS_THEME / style par défaut.
  const theme = themeActif(themeDemande);
  const pied = jetonsCourt(theme).pied;
  const puppeteer = require('puppeteer');
  const navigateur = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--allow-file-access-from-files'],
  });
  const travail = fs.mkdtempSync(path.join(os.tmpdir(), 'gss-court-'));
  const pdf = path.join(dossierSortie, `Mémoire technique GSS (format RC)_${Date.now()}.pdf`);
  try {
    const page = await navigateur.newPage();
    const essai = async (pts: typeof parties, corps: number): Promise<number> => {
      const f = path.join(travail, 'memoire.html');
      fs.writeFileSync(f, html(pts, cover, corps, theme), 'utf-8');
      await page.goto(`file://${f}`, { waitUntil: 'load', timeout: 120_000 });
      await page.pdf({
        path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true,
        displayHeaderFooter: true, headerTemplate: '<span></span>',
        footerTemplate: `<div style="width:100%;font-size:7.5pt;color:${pied};padding:0 14mm;display:flex;justify-content:space-between;font-family:Arial"><span>GSS — Global Security Services</span><span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
        timeout: 300_000,
      });
      return nombrePages(pdf);
    };
    let pts = parties.map((p) => ({ ...p }));
    let schemasRetires = 0;
    for (const corps of [10, 9.5, 9].filter((c) => c >= policeMin)) {
      const n = await essai(pts, corps);
      if (n <= pagesMax || corps === policeMin) return { filePath: pdf, pages: n, corps, schemasRetires };
    }
    // Police minimale atteinte : les schémas cèdent la place au texte (le contenu prime).
    for (let i = pts.length - 1; i >= 0; i--) {
      if (!pts[i].schema || pts[i].garder) continue;
      pts = pts.map((p, k) => (k === i ? { ...p, schema: undefined } : p));
      schemasRetires++;
      const n = await essai(pts, 9);
      if (n <= pagesMax) return { filePath: pdf, pages: n, corps: 9, schemasRetires };
    }
    return { filePath: pdf, pages: nombrePages(pdf), corps: 9, schemasRetires };
  } finally {
    await navigateur.close();
    fs.rmSync(travail, { recursive: true, force: true });
  }
}
