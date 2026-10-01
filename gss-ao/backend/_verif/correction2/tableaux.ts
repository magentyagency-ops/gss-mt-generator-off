/** Correction 2, bug F : hauteur réelle des lignes de tableau (en lignes de corps de texte) et longueur des cellules,
 *  pour recaler l'estimation du découpage des pages. Usage : <m.html>… */
import path from 'path';
(async () => {
  const puppeteer = require('puppeteer');
  const nav = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const out: any[] = [];
  for (const f of process.argv.slice(2)) {
    const page = await nav.newPage();
    await page.setViewport({ width: 1100, height: 1500 });
    await page.goto(`file://${path.resolve(f)}`, { waitUntil: 'load' });
    await page.evaluate('document.fonts.ready');
    out.push(...await page.evaluate(() => Array.from(document.querySelectorAll('section table')).flatMap((t) => {
      const s = t.closest('section') as HTMLElement;
      const lh = parseFloat(getComputedStyle(s.querySelector('p') || s).lineHeight);
      return Array.from(t.querySelectorAll('tr')).map((tr) => ({ cells: Array.from(tr.children).map((c) => (c.textContent || '').trim().length), md: Array.from(tr.children).map((c) => (c.textContent || '').trim()).join(' | ').length + 4 + tr.children.length, h: +((tr as HTMLElement).offsetHeight / lh).toFixed(2), th: !!tr.querySelector('th') }));
    })));
    await page.close();
  }
  await nav.close();
  console.log(JSON.stringify(out));
  process.exit(0);
})();
