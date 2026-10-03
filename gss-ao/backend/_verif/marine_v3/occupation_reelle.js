// Occupation RÉELLE de la toile (comme la mesure D7 dans la page rendue) : union des boîtes des éléments du SVG (hors fond
// de toile) mesurée par Chromium, rapportée à la hauteur de la toile. Usage : node occupation_reelle.js <dossier svg> [seuil]
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const [dir, seuil = '0.905'] = process.argv.slice(2);
const POL = path.join(__dirname, '../../python/schemas_gss/polices');
const FAM = { IBMPlexSans: 'IBM Plex Sans', IBMPlexSansCondensed: 'IBM Plex Sans Condensed', IBMPlexMono: 'IBM Plex Mono' };
const ff = fs.readdirSync(POL).map((f) => /^(.*)-(\d+)\.ttf$/.exec(f)).filter((m) => m && FAM[m[1]])
  .map((m) => `@font-face{font-family:'${FAM[m[1]]}';font-weight:${m[2]};src:url(data:font/ttf;base64,${fs.readFileSync(path.join(POL, m[0])).toString('base64')})}`).join('');
(async () => {
  const nav = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-gpu-vsync'] });
  const p = await nav.newPage();
  const res = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.svg')).sort()) {
    const svg = fs.readFileSync(path.join(dir, f), 'utf-8');
    await p.setContent(`<html><head><style>${ff}body{margin:0}svg{width:1000px;height:1270px;display:block}</style></head><body>${svg}</body></html>`);
    await p.evaluate('document.fonts.ready');
    const r = await p.evaluate(() => {
      const s = document.querySelector('svg');
      const vb = s.viewBox.baseVal;
      const b = s.getBoundingClientRect();
      let y0 = Infinity, y1 = -Infinity;
      s.querySelectorAll(':scope > *:not(defs)').forEach((e) => {
        if (e.tagName === 'rect' && +(e.getAttribute('width') || 0) >= vb.width - 0.5 && +(e.getAttribute('height') || 0) >= vb.height - 0.5) return;
        const eb = e.getBoundingClientRect();
        if (!eb.width && !eb.height) return;
        y0 = Math.min(y0, eb.top); y1 = Math.max(y1, eb.bottom);
      });
      return +((y1 - y0) / b.height).toFixed(3);
    });
    res.push([f.replace('.svg', ''), r]);
  }
  await nav.close();
  const bas = res.filter((x) => x[1] < +seuil).sort((a, b) => a[1] - b[1]);
  console.log(JSON.stringify({ n: res.length, min: Math.min(...res.map((x) => x[1])), sous_seuil: bas }));
})().catch((e) => { console.error(e); process.exit(1); });
