/** Correction 2, bug D : part de la hauteur de la toile occupée par le dessin (hors fond) pour chaque SVG d'un dossier
 *  produit par dessiner_tout.py. Usage : <dossier> [seuil=0.77] */
import fs from 'fs';
import path from 'path';
(async () => {
  const dir = process.argv[2];
  const seuil = +(process.argv[3] || 0.77);
  const infos = JSON.parse(fs.readFileSync(path.join(dir, 'infos.json'), 'utf-8'));
  const puppeteer = require('puppeteer');
  const nav = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await nav.newPage();
  const res: any[] = [];
  for (const id of Object.keys(infos)) {
    const svg = fs.readFileSync(path.join(dir, `${id}.svg`), 'utf-8');
    await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    const r = await page.evaluate(() => {
      const s = document.querySelector('svg') as SVGSVGElement;
      const vb = s.viewBox.baseVal;
      const sb = s.getBoundingClientRect();
      let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity;
      s.querySelectorAll(':scope > *:not(defs)').forEach((e) => {
        if (e.tagName === 'rect' && +(e.getAttribute('width') || 0) >= vb.width && +(e.getAttribute('height') || 0) >= vb.height) return;
        const b = e.getBoundingClientRect();
        if (!b.width && !b.height) return;
        y0 = Math.min(y0, b.top); y1 = Math.max(y1, b.bottom); x0 = Math.min(x0, b.left); x1 = Math.max(x1, b.right);
      });
      return { f: (y1 - y0) / sb.height, haut: (y0 - sb.top) / sb.height, bas: (sb.bottom - y1) / sb.height, l: (x1 - x0) / sb.width };
    });
    res.push({ id, ...infos[id], ...r });
  }
  await nav.close();
  fs.writeFileSync(path.join(dir, 'mesures.json'), JSON.stringify(res, null, 1));
  const sous = res.filter((x) => x.f < seuil).sort((a, b) => a.f - b.f);
  const parG: Record<string, number[]> = {};
  for (const x of res) (parG[x.gabarit] ||= []).push(x.f);
  for (const x of sous) console.log(`${x.id}\t${x.gabarit}\tf=${x.f.toFixed(3)}\tlarg=${x.l.toFixed(2)}\t${x.titre}`);
  console.log(Object.entries(parG).map(([g, l]) => `${g}: n=${l.length} min=${Math.min(...l).toFixed(2)} sous=${l.filter((v) => v < seuil).length}`).join('\n'));
  console.log(`${res.length} schémas ; ${sous.length} sous ${seuil}`);
  process.exit(0);
})();
