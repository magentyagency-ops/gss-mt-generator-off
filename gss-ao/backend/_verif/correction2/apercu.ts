/** Correction 2, bug D : PNG des SVG d'un dossier (ids en arguments) pour contrôle visuel. Usage : <dossier> <id>… */
import fs from 'fs';
import path from 'path';
(async () => {
  const [dir, ...ids] = process.argv.slice(2);
  const puppeteer = require('puppeteer');
  const nav = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await nav.newPage();
  await page.setViewport({ width: 500, height: 635 });
  for (const id of ids) {
    const svg = fs.readFileSync(path.join(dir, `${id}.svg`), 'utf-8').replace(/(<svg\b[^>]*?) width="[\d.]+" height="[\d.]+"/, '$1 width="500" height="635"');
    await page.setContent(`<html><body style="margin:0;background:#fff">${svg}</body></html>`);
    await page.screenshot({ path: path.join(dir, `${id}.png`) });
  }
  await nav.close();
  process.exit(0);
})();
