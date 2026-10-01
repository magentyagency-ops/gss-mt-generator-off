import path from 'path';
(async () => {
  const puppeteer = require('puppeteer');
  const nav = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const page = await nav.newPage();
  await page.setViewport({ width: 1100, height: 1500 });
  await page.goto(`file://${path.resolve(process.argv[2])}`, { waitUntil: 'load' });
  await page.evaluate('document.fonts.ready');
  const pages = process.argv.slice(3).map(Number);
  const r = await page.evaluate((pages: number[]) => pages.map((n) => {
    const s = document.querySelectorAll('section')[n - 1] as HTMLElement;
    const cs = getComputedStyle(s); const lh = parseFloat(getComputedStyle(s.querySelector('p') || s).lineHeight);
    const utile = s.offsetHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const els = Array.from(s.children).filter((e) => !/HEADER|FOOTER/.test(e.tagName)).map((e) => `${e.tagName}:${((e as HTMLElement).offsetHeight / lh).toFixed(1)}`);
    return { n, classe: s.className, lh, utileLignes: +(utile / lh).toFixed(1), els };
  }), pages);
  console.log(JSON.stringify(r, null, 1));
  process.exit(0);
})();
