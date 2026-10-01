/**
 * Correction 2, bug D : hauteur RÉELLE du dessin des pages de schéma (union des boîtes des éléments dessinés, hors fond
 * de toile), rapportée à la hauteur utile (sous le titre, au-dessus du pied de page). Usage : <m.html> [seuil=0.70]
 */
import path from 'path';
export async function mesurerDessins(html: string): Promise<Array<{ page: number; titre: string; utile: number; boite: number; k: number }>> {
  const puppeteer = require('puppeteer');
  const nav = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  try {
    const page = await nav.newPage();
    await page.setViewport({ width: 1100, height: 1500 });
    await page.goto(`file://${path.resolve(html)}`, { waitUntil: 'load' });
    await page.evaluate('document.fonts.ready');
    return await page.evaluate(() => {
      const out: any[] = [];
      Array.from(document.querySelectorAll('section')).forEach((s, i) => {
        const svg = s.querySelector('.schema-page svg') as SVGSVGElement | null;
        if (!svg || !s.classList.contains('schema')) return;
        const r = s.getBoundingClientRect();
        const k = r.height / (s as HTMLElement).offsetHeight;
        const cs = getComputedStyle(s);
        const bas = r.bottom - parseFloat(cs.paddingBottom) * k;
        const h2 = s.querySelector('h2');
        const haut = h2 ? h2.getBoundingClientRect().bottom : r.top + parseFloat(cs.paddingTop) * k;
        const vb = svg.viewBox.baseVal;
        let y0 = Infinity, y1 = -Infinity;
        svg.querySelectorAll(':scope > *:not(defs)').forEach((e) => {
          const el = e as SVGGraphicsElement;
          // Fond de toile (rectangle de la taille du viewBox) : non compté.
          if (el.tagName === 'rect' && +(el.getAttribute('width') || 0) >= vb.width && +(el.getAttribute('height') || 0) >= vb.height) return;
          const b = el.getBoundingClientRect();
          if (!b.width && !b.height) return;
          y0 = Math.min(y0, b.top); y1 = Math.max(y1, b.bottom);
        });
        out.push({ page: i + 1, titre: (h2?.textContent || '').trim(), utile: +((y1 - y0) / (bas - haut)).toFixed(3), boite: +(svg.getBoundingClientRect().height / r.height).toFixed(3), k: +(svg.getBoundingClientRect().height / (bas - haut)).toFixed(3) });
      });
      return out;
    });
  } finally {
    await nav.close();
  }
}
if (require.main === module) {
  (async () => {
    const seuil = +(process.argv[3] || 0.7);
    const m = await mesurerDessins(process.argv[2]);
    const sous = m.filter((x) => x.utile < seuil).sort((a, b) => a.utile - b.utile);
    for (const x of sous) console.log(`p.${x.page}\t${x.utile}\t(toile/utile ${x.k})\t${x.titre}`);
    console.log(`${m.length} pages de schéma ; ${sous.length} sous ${seuil} ; min ${Math.min(...m.map((x) => x.utile))} ; moyenne ${(m.reduce((a, x) => a + x.utile, 0) / m.length).toFixed(3)}`);
    process.exit(0);
  })();
}
