/**
 * Cadre imposé : toile des schémas recadrée sur son contenu (ROGNER_TOILE de visuels_cadre.ts).
 * Rend chaque schéma de la bibliothèque (toile paysage, thème actif) et l'organigramme deux fois : sans recadrage
 * (même code que rendrePng avant la correction) et avec rendrePng ; les PNG vont dans <sortie>/avant et <sortie>/apres,
 * comparés ensuite par restes_rognage.py (aucun pixel de contenu perdu, marges restantes). Aucun appel OpenAI.
 * Usage : npx ts-node --transpile-only _verif/restes_rognage.ts <sortie> [ids…]
 */
import fs from 'fs';
import path from 'path';
import { schemasBibliotheque, themeActif, fontFaceTheme } from '../src/generation/themes';
import { organigrammeSvg } from '../src/generation/organigramme';
import { rendrePng } from '../src/generation/visuels_cadre';

const OUT = process.argv[2];
const theme = themeActif();
const index: any[] = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../python/schemas_gss/bibliotheque/index.json'), 'utf-8'));
const ids = process.argv.length > 3 ? process.argv.slice(3) : index.map((x) => x.id);

async function sansRecadrage(svgs: string[]): Promise<Buffer[]> {
  const polices = fontFaceTheme(theme);
  const puppeteer = require('puppeteer');
  const b = await puppeteer.launch({ headless: 'new', executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--disable-gpu'] });
  const out: Buffer[] = [];
  try {
    const page = await b.newPage();
    await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
    for (const svg of svgs) {
      await page.setContent(`<html><head><style>${polices}</style></head><body style="margin:0;background:#fff">${svg}</body></html>`, { waitUntil: 'load' });
      await page.evaluate('document.fonts.ready');
      const el = await page.$('svg');
      out.push(el ? await el.screenshot() : Buffer.alloc(0));
    }
  } finally { await b.close(); }
  return out;
}

(async () => {
  fs.mkdirSync(path.join(OUT, 'avant'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'apres'), { recursive: true });
  const m = schemasBibliotheque(ids, 'paysage', theme);
  const liste: Array<{ id: string; svg: string }> = ids.filter((id) => m.get(id)).map((id) => ({ id, svg: m.get(id)! }));
  const org = organigrammeSvg('paysage', theme);
  if (org && process.argv.length <= 3) liste.push({ id: 'organigramme', svg: org });
  const avant = await sansRecadrage(liste.map((x) => x.svg));
  const apres = await rendrePng(liste.map((x) => x.svg), theme);
  liste.forEach((x, i) => {
    fs.writeFileSync(path.join(OUT, 'avant', `${x.id}.png`), avant[i]);
    if (apres[i]) { fs.copyFileSync(apres[i], path.join(OUT, 'apres', `${x.id}.png`)); fs.rmSync(apres[i], { force: true }); }
  });
  console.log(`thème ${theme} : ${liste.length} schéma(s) rendus`);
})();
