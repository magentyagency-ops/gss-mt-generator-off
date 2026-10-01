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
import { themeActif, styleDuTheme, fontFaceTheme, familleTexte, policesDuTheme, contraste, LOGO_FOND_CLAIR } from './themes';

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

/**
 * Format court : le texte de compréhension renvoie aux « blocs » du mémoire type (« développée au bloc 5 »), alors que le
 * mémoire suit les parties du RC. Chaque renvoi devient celui de la partie du RC qui reprend réellement les rubriques
 * du bloc (« dans la partie 2 « Continuité de service » ») ; un bloc dont aucune rubrique n'a été reprise, ou réparti
 * sur trop de parties, perd son renvoi (avec le participe qui l'introduit : « , développée au bloc 4 »).
 */
export function renvoisVersParties(
  texte: string,
  blocs: Array<{ numero: number; rubriques: string[] }>,
  parties: Array<{ id: string; title: string }>,
  retenues: Record<string, string[]>,
  /** Titres des rubriques du mémoire type (id → titre) : un renvoi qui cite ses rubriques (« bloc 4 : « La
   *  planification » ») est rattaché à la partie qui reprend CES rubriques. */
  titres: Record<string, string> = {},
): string {
  const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const partiesDe = (ids: string[]): number[] => parties.map((p, i) => ((retenues[p.id] || []).some((id) => ids.includes(id)) ? i : -1)).filter((i) => i >= 0);
  const partiesDuBloc = (n: number): number[] => partiesDe(blocs.find((x) => x.numero === n)?.rubriques || []);
  const partiesDesTitres = (cites: string[]): number[] => {
    const ids = Object.keys(titres).filter((id) => cites.some((c) => norm(titres[id]) === norm(c)));
    return ids.length ? partiesDe(ids) : [];
  };
  const libelle = (idx: number[]) => (idx.length > 1
    ? `${idx.slice(0, -1).map((i) => i + 1).join(', ')} et ${idx[idx.length - 1] + 1}`
    : (parties[idx[0]].title.trim().length <= 60 ? `${idx[0] + 1} « ${parties[idx[0]].title.trim()} »` : `${idx[0] + 1}`));
  // « bloc 5 », « blocs 3 et 5 », éventuellement suivis des rubriques citées : « bloc 4 : « La planification » et « … » ».
  const RX = /(,\s*)?(\b(?:d[ée]velopp|d[ée]crit|pr[ée]sent|d[ée]taill|trait)[ée]?e?s?\s+)?\b(au|aux|du|des|le|les|dans les?|en)?\s*\b[Bb]locs?\s+(\d)((?:\s*(?:,|et)\s*\d)*)(?![\d])(\s*:\s*«[^»]{1,120}»(?:\s*(?:,|et|;)\s*«[^»]{1,120}»)*)?/g;
  return String(texte || '').replace(RX, (m, virgule: string | undefined, participe: string | undefined, prep: string | undefined, n1: string, suite: string, cites: string | undefined) => {
    const citations = [...String(cites || '').matchAll(/«\s*([^»]+?)\s*»/g)].map((x) => x[1]);
    if (citations.length) {
      // Rubriques citées : elles restent (titres de sous-parties du mémoire), précédées de leur partie si elle est unique.
      const idx = partiesDesTitres(citations);
      const liste = citations.map((c) => `« ${c} »`).join(citations.length > 2 ? ', ' : ' et ');
      return `${virgule || ''}${idx.length === 1 ? `partie ${idx[0] + 1} : ` : ''}${liste}`;
    }
    const numeros = [Number(n1), ...[...(suite || '').matchAll(/\d/g)].map((x) => Number(x[0]))];
    const idx = [...new Set(numeros.flatMap(partiesDuBloc))].sort((a, b) => a - b);
    if (!idx.length || idx.length > 2) return '';
    const pluriel = idx.length > 1;
    const p = (prep || '').toLowerCase();
    const prepNouvelle = /^(?:au|aux|dans|en)/.test(p) ? (pluriel ? 'dans les parties' : 'dans la partie')
      : /^(?:du|des)$/.test(p) ? (pluriel ? 'des parties' : 'de la partie')
        : /^(?:le|les)$/.test(p) ? (pluriel ? 'les parties' : 'la partie')
          : (pluriel ? 'parties' : 'partie');
    return `${virgule || ''}${participe || ''}${prepNouvelle} ${libelle(idx)}`;
  }).replace(/\(\s*[:;,]\s*/g, '(').replace(/[;,]\s*[:;,]\s*/g, '; ').replace(/\(\s*\)/g, '').replace(/ +([,.)])/g, '$1').replace(/ {2,}/g, ' ');
}

const TITRE_ENGAGEMENTS = '## Nos engagements sur les exigences du cahier des charges';
const MOTS_NEUTRES_ENGAGEMENT = new Set(['gss', 'prendra', 'prend', 'compte', 'les', 'des', 'aux', 'une', 'un', 'de', 'du', 'la', 'le', 'et', 'en', 'au', 'ses', 'sur', 'pour', 'dans', 'par', 'est', 'sont', 'ainsi', 'que', 'qui', 'avec', 'l', 'd', 's', 'ceux', 'celles', 'pris']);
const motsEngagement = (t: string) => new Set(t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
  .filter((w) => w && (w.length >= 3 || /\d/.test(w)) && !MOTS_NEUTRES_ENGAGEMENT.has(w)));

/**
 * « Le titulaire » du CCTP est GSS : dans le texte remis par GSS, l'exigence recopiée se dit à la voix de GSS (« une
 * copie est remise au titulaire » → « à GSS », « le titulaire gère » → « GSS gère »). « Titulaire du SSIAP, du poste… »
 * (diplôme, poste tenu par un agent) n'est pas touché.
 */
export function voixDeGss(texte: string): string {
  const SAUF = String.raw`(?!\s+(?:du|d['’]un|d['’]une|des)\s+(?:SSIAP|dipl|poste|PC|carte|permis|CQP|titre|certificat|habilitation|SST|brevet))`;
  return String(texte || '')
    .replace(new RegExp(String.raw`\b([Aa])u titulaire(?: du march[ée])?\b${SAUF}`, 'g'), (_m, a: string) => (a === 'A' ? 'À GSS' : 'à GSS'))
    .replace(new RegExp(String.raw`\b([Dd])u titulaire(?: du march[ée])?\b${SAUF}`, 'g'), (_m, d: string) => `${d}e GSS`)
    .replace(new RegExp(String.raw`\b[Ll]e titulaire(?: du march[ée])?\b${SAUF}`, 'g'), 'GSS');
}

/**
 * Puces « Nos engagements » du format court : une puce dont les mots sont repris à 60 % au moins (3 mots ou plus) par
 * une puce déjà gardée est une redite (« accès du boulevard Jourdan… » répété trois fois) et disparaît ; les
 * exigences recopiées passent à la voix de GSS.
 */
export function nettoyerEngagements(texte: string): string {
  const i = texte.indexOf(`\n${TITRE_ENGAGEMENTS}\n`);
  if (i < 0) return texte;
  const debut = texte.slice(0, i + TITRE_ENGAGEMENTS.length + 2);
  const gardees: Array<Set<string>> = [];
  const sortie: string[] = [];
  for (const ligne of texte.slice(i + TITRE_ENGAGEMENTS.length + 2).split('\n')) {
    if (!/^- /.test(ligne)) { sortie.push(ligne); continue; }
    const mots = motsEngagement(ligne);
    const redite = mots.size > 0 && gardees.some((g) => {
      const communs = [...mots].filter((w) => g.has(w)).length;
      return communs >= 3 && communs / mots.size >= 0.6;
    });
    if (redite) continue;
    gardees.push(mots);
    sortie.push(voixDeGss(ligne));
  }
  return `${debut}${sortie.join('\n')}`.replace(/\n{3,}/g, '\n\n');
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

/** Règle @font-face de la police du texte du thème, graisse la plus proche de 400 seulement (pied de page). */
function fontFacePied(theme: string): string {
  const famille = styleDuTheme(theme)?.polices?.texte?.famille;
  const p = policesDuTheme(theme).filter((x) => x.famille === famille).sort((a, b) => Math.abs(a.poids - 400) - Math.abs(b.poids - 400))[0];
  if (!p) return '';
  try {
    const b64 = fs.readFileSync(p.chemin).toString('base64');
    return `<style>@font-face{font-family:'${p.famille}';src:url(data:font/ttf;base64,${b64}) format('truetype');font-weight:400;font-style:normal;}</style>`;
  } catch { return ''; }
}

/** Couleurs et polices du format court : celles du thème (themes.ts), ou celles d'avant les thèmes (retour arrière,
 *  rendu identique). */
function jetonsCourt(theme: string) {
  const p = styleDuTheme(theme)?.pages;
  if (!p) {
    return { police: 'Arial, Helvetica, sans-serif', encre: '#1f2937', accent: '#dc2626', fort: '#111827', gris: '#4b5563', bandeau: '#494545',
      bandeauTexte: '#fff', numero: '#fca5a5', titre: '#dc2626', teteTableau: '#484545', teteTableauTexte: '#F5F5DE', filet: '#CFC9C5',
      ligne: '#F7F5EF', pied: '#6b7280', piedPolice: 'Arial', piedStyle: '', logo: 'logogss.png', extra: '' };
  }
  const v = (k: string, d: string) => p[k] || d;
  const bandeau = v('--gss-tableau-tete', '#0B2545');
  const bandeauTexte = v('--gss-tableau-tete-texte', '#FFFFFF');
  const accentCouv = v('--gss-couverture-accent', v('--gss-accent', '#E85D15'));
  const enteteFond = v('--gss-entete-fond', '#0B2545');
  const enteteTexte = v('--gss-entete-texte', '#FFFFFF');
  const fond = v('--gss-fond-page', '#FFFFFF');
  // En-tête de la première page dans le bandeau du thème (logo, titre de l'offre), polices du thème embarquées.
  // Fond de page aussi sous les marges @page (Chromium ne les peint qu'avec le fond de @page) : un thème sombre n'a
  // plus de cadre blanc autour de la page, et le pied de page s'y écrit en couleur claire.
  const extra = `${fontFaceTheme(theme)}
@page { background: ${fond}; }
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
    // Numéro de partie : texte du titre de partie (corps + 3 pt en gras, sous 14 pt gras) → 4,5:1.
    numero: contraste(accentCouv, bandeau) >= 4.5 ? accentCouv : bandeauTexte, titre: v('--gss-titre', '#dc2626'), teteTableau: bandeau,
    teteTableauTexte: bandeauTexte, filet: v('--gss-filet', '#CFC9C5'), ligne: v('--gss-tableau-ligne', '#F7F5EF'),
    pied: v('--gss-encre-3', '#6b7280'),
    // Pied de page dans la police du texte du thème : le modèle de pied de page de Chromium ne voit pas les @font-face
    // de la page, la police (graisse normale) y est donc embarquée.
    piedPolice: familleTexte(theme) || 'Arial', piedStyle: fontFacePied(theme),
    logo: styleDuTheme(theme)?.logo === 'encre' ? LOGO_FOND_CLAIR : 'logogss.png', extra,
  };
}

/** Schéma dessiné sur une toile portrait (format « page » du moteur) : affiché en grand, sur au moins la moitié de la page. */
function schemaPortrait(svg?: string): boolean {
  const m = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(String(svg || '').slice(0, 2000));
  return !!m && Number(m[2]) > Number(m[1]);
}

function html(
  parties: Array<{ titre: string; texte: string; schema?: string; garder?: boolean; tete?: boolean }>,
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
  // Schéma de toile portrait (process de la compréhension, organigramme) : en grand (consigne 3 : lisible en 5 secondes),
  // en tête de sa partie pour le process ; schéma paysage : dans le texte, comme avant.
  const figure = (p: { schema?: string }) => (p.schema ? `<figure class="schema${schemaPortrait(p.schema) ? ' grand' : ''}">${p.schema}</figure>` : '');
  const blocs = parties.map((p, i) => `
<section>
  <h1><span class="num">${i + 1}.</span> ${echapper(p.titre)}</h1>
  ${p.tete ? figure(p) : ''}
  ${md.render(p.texte.replace(/^#\s+/gm, '## '))}
  ${p.tete ? '' : figure(p)}
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
figure.schema.grand svg { width: auto; max-width: 100%; height: 150mm; max-height: 150mm; display: block; margin: 0 auto; }
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
  parties: Array<{ titre: string; texte: string; schema?: string; garder?: boolean; tete?: boolean }>,
  cover: { client?: string; title?: string; ref?: string },
  pagesMax: number,
  dossierSortie: string,
  themeDemande?: string,
  /** Police minimale essayée (10 : essai de mise en page à la police normale seulement, sans retrait de schéma). */
  policeMin = 9,
): Promise<{ filePath: string; pages: number; corps: number; schemasRetires: number }> {
  // Thème de style : celui du mémoire déjà rendu s'il est fourni, sinon GSS_THEME / style par défaut.
  const theme = themeActif(themeDemande);
  const { pied, piedPolice, piedStyle } = jetonsCourt(theme);
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
        footerTemplate: `${piedStyle}<div style="width:100%;font-size:7.5pt;color:${pied};padding:0 14mm;display:flex;justify-content:space-between;font-family:${piedPolice.replace(/"/g, "'")}"><span>GSS — Global Security Services</span><span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
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
