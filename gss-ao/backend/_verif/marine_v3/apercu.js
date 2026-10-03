// Aperçu PNG de SVG de schémas (polices du style embarquées), par le Chromium de puppeteer.
// Usage : node _verif/marine_v3/apercu.js <sortie.png> <a.svg> [b.svg …]   (schémas côte à côte, 500 px de large)
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
// Variante : node apercu.js <sortie.png> --dir <dossier> id1 id2 … (fichiers <dossier>/<id>.svg)
const args = process.argv.slice(2);
const sortie = args[0];
const svgs = args[1] === '--dir' ? args.slice(3).map((i) => path.join(args[2], `${i}.svg`)) : args.slice(1);
const POL = path.join(__dirname, '../../python/schemas_gss/polices');
const FAM = { IBMPlexSans: 'IBM Plex Sans', IBMPlexSansCondensed: 'IBM Plex Sans Condensed', IBMPlexMono: 'IBM Plex Mono', Lexend: 'Lexend' };
const ff = fs.readdirSync(POL).filter((f) => /\.ttf$/.test(f) && /-\d+\.ttf$/.test(f)).map((f) => {
  const m = /^(.*)-(\d+)\.ttf$/.exec(f);
  if (!FAM[m[1]]) return '';
  return `@font-face{font-family:'${FAM[m[1]]}';font-weight:${m[2]};src:url(data:font/ttf;base64,${fs.readFileSync(path.join(POL, f)).toString('base64')})}`;
}).join('');
const cases = svgs.map((s) => `<div class="c"><p>${path.basename(s)}</p>${fs.readFileSync(s, 'utf-8')}</div>`).join('');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${ff}body{margin:0;background:#ccc;display:flex;flex-wrap:wrap;gap:10px;padding:10px;width:${Math.min(svgs.length, 4) * 510}px}.c{background:#fff;width:500px}.c p{font:12px sans-serif;margin:2px}.c svg{width:500px;height:635px;display:block}</style></head><body>${cases}</body></html>`;
(async () => {
  const nav = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  const p = await nav.newPage();
  await p.setViewport({ width: Math.min(svgs.length, 4) * 510 + 20, height: 700 });
  await p.setContent(html, { waitUntil: 'load' });
  await p.evaluate('document.fonts.ready');
  await p.screenshot({ path: sortie, fullPage: true });
  await nav.close();
  console.log(sortie);
})().catch((e) => { console.error(e); process.exit(1); });
