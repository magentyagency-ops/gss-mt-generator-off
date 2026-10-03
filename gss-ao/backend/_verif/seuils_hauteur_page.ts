/**
 * D7 (seuils de conformité) — hauteur du DESSIN de chaque schéma sur sa page (1 schéma = 1 page), rapportée à la hauteur
 * utile (sous le titre, au-dessus du pied de page), mesurée comme _verif/reponse_libre_v2.ts dans le HTML rendu par
 * Marp, pour TOUS les schémas qui peuvent occuper une page de schéma :
 *  - les 180 schémas de la bibliothèque redessinés au format page (titre : celui de la spécification) ;
 *  - les schémas « spec » du mémoire type publipostés sur becquerel, caen et ign (titre : celui de la rubrique).
 * Aucun appel OpenAI.
 * Usage : npx ts-node --transpile-only -P tsconfig.json _verif/seuils_hauteur_page.ts <memoire.md d'un rendu (en-tête Marp)> <sortie> [thème]
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { feuilleMarp, imagesTheme, schemasBibliotheque, themeActif, pagesMarineV3 } from '../src/generation/themes';
import { dessinerSpecs } from '../src/generation/schema_service';
import { chargerMemoireType, preparerMemoireType, publierMemoire, type ContexteMarche } from '../src/generation/memoire_type';

const [prefixeMd, SORTIE, themeArg] = process.argv.slice(2);
const theme = themeActif(themeArg || 'marine');
const B = path.resolve(__dirname, '..');
const MARP_DIR = path.join(B, 'src/generation/marp');
const RACINE = path.resolve(__dirname, '../..');
const SPECS = path.join(B, 'python/schemas_gss/bibliotheque/specs.json');
fs.rmSync(SORTIE, { recursive: true, force: true });
fs.mkdirSync(SORTIE, { recursive: true });

async function main() {
  const pages: Array<{ id: string; source: string; titre: string; svg: string }> = [];
  // 1. Bibliothèque.
  const specs: any[] = JSON.parse(fs.readFileSync(SPECS, 'utf-8')).schemas;
  const biblio = schemasBibliotheque(specs.map((s) => s.id), 'page', theme);
  for (const s of specs) if (biblio.get(s.id)) pages.push({ id: s.id, source: 'bibliotheque', titre: s.titre || s.id, svg: biblio.get(s.id)! });
  // 2. Schémas « spec » du mémoire type publiposté.
  const analyses = JSON.parse(fs.readFileSync(path.join(B, 'tests/fixtures/memoire_type_analyses.json'), 'utf-8')).analyses;
  const mt = chargerMemoireType();
  for (const code of Object.keys(analyses)) {
    const ctx: ContexteMarche = { analyse: analyses[code], dce: fs.readFileSync(path.join(RACINE, '_corpus_verif/_dce_textes', `${code}.txt`), 'utf-8'), referents: '' };
    const rub = publierMemoire(preparerMemoireType(ctx, { memoireType: mt })).filter((r) => r.schema?.source === 'spec' && r.texte);
    const d = await dessinerSpecs(rub.map((r) => ({ id: `${code}-${r.id}`, gabarit: r.schema!.gabarit, params: r.schema!.params, source: r.texte!, titre_section: r.titre })), 'page', theme);
    for (const r of rub) { const x = d.get(`${code}-${r.id}`); if (x?.ok && x.svg) pages.push({ id: `${code}-${r.id}`, source: `spec ${r.schema!.gabarit}`, titre: r.titre, svg: x.svg }); }
  }
  // 3. Document Marp (en-tête du mémoire fourni : thème, polices), une page de schéma par schéma.
  const md = fs.readFileSync(prefixeMd, 'utf-8');
  const entete = md.slice(0, md.indexOf('<!-- _class: lead -->')).replace(/\n---\s*$/, '');
  // Style « marine » v3 : page de schéma comme dans le générateur (surtitre ou sa place gardée, puis le titre).
  const v3 = pagesMarineV3(theme);
  const corps = pages.map((p) => ['---', '<!-- _class: schema -->', `<!-- header: "${p.id}" -->`, '', ...(v3 ? ['<div class="gss-sur gss-sur-vide"></div>', ''] : []), `## ${p.titre.replace(/[<>\r\n]+/g, ' ')}`, '',
    '<div class="schema-page">', p.svg.replace(/\s*\n\s*/g, ' ').trim(), '</div>', ''].join('\n'));
  const travail = path.join(SORTIE, 'html');
  fs.mkdirSync(travail, { recursive: true });
  fs.writeFileSync(path.join(travail, 'gss-theme.css'), feuilleMarp(theme, fs.readFileSync(path.join(MARP_DIR, 'gss-theme.css'), 'utf-8')));
  for (const f of [path.join(MARP_DIR, 'logogss.png'), ...imagesTheme(theme)]) fs.copyFileSync(f, path.join(travail, path.basename(f)));
  fs.writeFileSync(path.join(travail, 'm.md'), `${entete.trimEnd()}\n\n${corps.join('\n').replace(/^---\n/, '')}`);
  execSync(`"${path.join(B, 'node_modules/.bin/marp')}" m.md --theme gss-theme.css --html --allow-local-files -o m.html --no-stdin`, { cwd: travail, stdio: 'pipe', timeout: 300000 });
  const puppeteer = require('puppeteer');
  const nav = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  let mesures: any[] = [];
  try {
    const page = await nav.newPage();
    await page.setViewport({ width: 1100, height: 1500 });
    await page.goto(`file://${path.join(travail, 'm.html')}`, { waitUntil: 'load', timeout: 300000 });
    await page.evaluate('document.fonts.ready');
    mesures = await page.evaluate(() => {
      const out: any[] = [];
      (Array.from(document.querySelectorAll('section')) as HTMLElement[]).forEach((s) => {
        const svg = s.querySelector('.schema-page svg') as SVGSVGElement | null;
        if (!svg || !s.classList.contains('schema')) return;
        const r = s.getBoundingClientRect();
        const cs = getComputedStyle(s);
        const vb = svg.viewBox.baseVal;
        let y0 = Infinity, y1 = -Infinity;
        svg.querySelectorAll(':scope > *:not(defs)').forEach((e) => {
          if (e.tagName === 'rect' && +(e.getAttribute('width') || 0) >= vb.width - 0.5 && +(e.getAttribute('height') || 0) >= vb.height - 0.5) return;
          const eb = e.getBoundingClientRect();
          if (!eb.width && !eb.height) return;
          y0 = Math.min(y0, eb.top); y1 = Math.max(y1, eb.bottom);
        });
        const k = r.height / s.offsetHeight;
        const h2 = s.querySelector('h2');
        const haut = h2 ? h2.getBoundingClientRect().bottom : r.top + parseFloat(cs.paddingTop) * k;
        const basU = r.bottom - parseFloat(cs.paddingBottom) * k;
        const b = svg.getBoundingClientRect();
        let max = 0;
        s.querySelectorAll(':scope > *:not(header):not(footer)').forEach((e) => { max = Math.max(max, (e as HTMLElement).getBoundingClientRect().bottom); });
        out.push({ hauteur: +((y1 - y0) / (basU - haut)).toFixed(3), lignes_titre: h2 ? Math.round(h2.getBoundingClientRect().height / (parseFloat(getComputedStyle(h2).lineHeight) * k || 1)) : 0,
          boite_svg: +(b.height / r.height).toFixed(3), largeur_svg: +(b.width / r.width).toFixed(3), deborde: max > basU + 2 });
      });
      return out;
    });
    // Captures des pages demandées (variable PNG_IDS, identifiants séparés par des virgules) pour la relecture visuelle.
    const voulues = new Set(String(process.env.PNG_IDS || '').split(',').filter(Boolean));
    if (voulues.size) {
      let k = 0;
      for (let i = 0; i < pages.length; i++) {
        if (!voulues.has(pages[i].id)) continue;
        // Présentation Marp (une diapositive visible à la fois) : diapositive i + 1 affichée par son ancre.
        await page.goto(`file://${path.join(travail, 'm.html')}#${i + 1}`, { waitUntil: 'load', timeout: 120000 });
        await page.evaluate('document.fonts.ready');
        await new Promise((r) => setTimeout(r, 400));
        const sec = (await page.$$('section.schema'))[i];
        await sec.screenshot({ path: path.join(SORTIE, `${pages[i].id}.png`) });
        k++;
      }
      console.log(`${k} capture(s) dans ${SORTIE}`);
    }
  } finally {
    await nav.close();
  }
  const res = pages.map((p, i) => ({ id: p.id, source: p.source, titre: p.titre, ...mesures[i] }));
  const h = res.map((x) => x.hauteur).sort((a, b) => a - b);
  const med = h.length % 2 ? h[(h.length - 1) / 2] : (h[h.length / 2 - 1] + h[h.length / 2]) / 2;
  const bilan = { theme, n: res.length, min: h[0], mediane: med, sous_0_85: res.filter((x) => x.hauteur < 0.85).length, debordements: res.filter((x) => x.deborde).length, res };
  fs.writeFileSync(path.join(SORTIE, 'hauteurs.json'), JSON.stringify(bilan, null, 1));
  console.log(`${theme} : ${bilan.n} schémas, hauteur min ${bilan.min}, médiane ${bilan.mediane}, sous 0,85 : ${bilan.sous_0_85}, débordements ${bilan.debordements}`);
  for (const x of res.filter((y) => y.hauteur < 0.85).sort((a, b) => a.hauteur - b.hauteur)) console.log(`  ${x.hauteur.toFixed(3)} ${x.id} (${x.source}, titre ${x.lignes_titre} ligne(s), boîte ${x.boite_svg})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
