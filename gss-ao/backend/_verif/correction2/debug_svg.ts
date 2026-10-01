import path from 'path';
(async () => {
  const puppeteer = require('puppeteer');
  const nav = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const page = await nav.newPage();
  await page.setViewport({ width: 1100, height: 1500 });
  await page.goto(`file://${path.resolve(process.argv[2])}`, { waitUntil: 'load' });
  const n = +process.argv[3];
  console.log(await page.evaluate((n: number) => {
    const s = document.querySelectorAll('section')[n - 1];
    const svg = s.querySelector('.schema-page svg') as SVGSVGElement;
    const sb = svg.getBoundingClientRect();
    const out = [svg.getAttribute('viewBox')];
    svg.querySelectorAll(':scope > *:not(defs)').forEach((e) => { const b = e.getBoundingClientRect(); if (b.height > sb.height * 0.85) out.push(e.outerHTML.slice(0, 200)); });
    return out.join('\n');
  }, n));
  await nav.close(); process.exit(0);
})();
