/**
 * PAGES DE TEXTE « 1 à 2 pages de texte, puis 1 page de schéma » : aucune page ne déborde, dans chaque thème.
 * Toutes les rubriques du mémoire type publiposté (DCE Becquerel, themes_fixtures.json) sont mises en page avec une page
 * de schéma ; le HTML rendu par Marp (même feuille que le PDF) est mesuré dans Chromium : débordement de la zone utile
 * et remplissage de chaque page de texte. Hors ligne, aucun appel OpenAI.
 * Usage : npx ts-node --transpile-only -P tsconfig.json _verif/themes_debordements.ts <dossier_de_sortie> [thèmes séparés par des virgules]
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { MarpGenerator, AssembleChapter } from '../src/generation/marp_generator';
import { feuilleMarp, imagesTheme, estRetourArriere, themesDisponibles } from '../src/generation/themes';

const SORTIE = path.resolve(process.argv[2] || path.join(__dirname, 'sorties_themes_debordements'));
const THEMES = (process.argv[3] || themesDisponibles().join(',')).split(',');
const MARP_DIR = path.resolve(__dirname, '../src/generation/marp');
const ROMAIN = ['I', 'II', 'III', 'IV', 'V'];
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1270" width="100%" preserveAspectRatio="xMidYMid meet"><rect width="1000" height="1270" fill="#E5EBF3"/></svg>';

async function mesurer(theme: string, markdown: string): Promise<any> {
  const travail = path.join(SORTIE, `html_${theme}`);
  fs.rmSync(travail, { recursive: true, force: true });
  fs.mkdirSync(travail, { recursive: true });
  const base = fs.readFileSync(path.join(MARP_DIR, 'gss-theme.css'), 'utf-8');
  fs.writeFileSync(path.join(travail, 'gss-theme.css'), estRetourArriere(theme) ? base : feuilleMarp(theme, base));
  for (const f of [path.join(MARP_DIR, 'logogss.png'), ...imagesTheme(theme)]) fs.copyFileSync(f, path.join(travail, path.basename(f)));
  fs.symlinkSync(path.join(MARP_DIR, 'media'), path.join(travail, 'media'));
  fs.writeFileSync(path.join(travail, 'm.md'), markdown);
  execSync(`"${path.resolve(__dirname, '../node_modules/.bin/marp')}" m.md --theme gss-theme.css --html --allow-local-files -o m.html --no-stdin`, { cwd: travail, stdio: 'pipe' });
  const puppeteer = require('puppeteer');
  const nav = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  try {
    const page = await nav.newPage();
    await page.setViewport({ width: 1100, height: 1500 });
    await page.goto(`file://${path.join(travail, 'm.html')}`, { waitUntil: 'networkidle0', timeout: 120_000 });
    await page.evaluate('document.fonts.ready');
    return await page.evaluate(() => {
      const out: any[] = [];
      Array.from(document.querySelectorAll('section')).forEach((s: any, i) => {
        if (s.classList.length) return;                       // pages de texte seulement
        const r = s.getBoundingClientRect();
        const k = r.height / s.offsetHeight;
        const cs = getComputedStyle(s);
        const haut = r.top + parseFloat(cs.paddingTop) * k;
        const bas = r.bottom - parseFloat(cs.paddingBottom) * k;
        let max = haut;
        s.querySelectorAll(':scope > *:not(header):not(footer)').forEach((e: any) => { max = Math.max(max, e.getBoundingClientRect().bottom); });
        out.push({ page: i + 1, remplissage: +((max - haut) / (bas - haut)).toFixed(3), depassement_mm: +(((max - bas) / k) * 0.2646).toFixed(1) });
      });
      return out;
    });
  } finally {
    await nav.close();
  }
}

async function main() {
  fs.mkdirSync(SORTIE, { recursive: true });
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'themes_fixtures.json'), 'utf-8'));
  const chapters: AssembleChapter[] = fx.blocs.filter((b: any) => b.rubriques.length).map((b: any, i: number) => ({
    key: ROMAIN[i + 1], title: b.titre,
    sections: b.rubriques.filter((r: any) => r.texte).map((r: any) => ({ id: r.id, title: r.titre, text: r.texte, schemaPleinePage: { titre: r.titre, svg: SVG } })),
  }));
  const bilan: Record<string, any> = {};
  for (const theme of THEMES) {
    const md: string = (new MarpGenerator(SORTIE) as any).buildMarkdown(chapters, fx.cover, new Map(), new Map(), theme);
    const pages = await mesurer(theme, md);
    const deb = pages.filter((p: any) => p.depassement_mm > 0);
    const rem = pages.map((p: any) => p.remplissage).sort((a: number, b: number) => a - b);
    bilan[theme] = { pages_de_texte: pages.length, debordements: deb, remplissage_median: rem[Math.floor(rem.length / 2)], remplissage_max: rem[rem.length - 1],
      pages_pleines_a_90: rem.filter((x: number) => x >= 0.9).length };
    console.log(theme, JSON.stringify(bilan[theme]));
  }
  fs.writeFileSync(path.join(SORTIE, 'bilan_debordements.json'), JSON.stringify(bilan, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
