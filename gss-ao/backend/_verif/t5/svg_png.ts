/** SVG → PNG avec le rendu du cadre (visuels_cadre.rendrePng), pour relire un schéma. Usage : svg_png.ts <svg> <png> */
import fs from 'fs';
const vc = require('../../src/generation/visuels_cadre');
const { themeActif } = require('../../src/generation/themes');
const [svgF, pngF] = process.argv.slice(2);
(async () => {
  const f = vc.rendrePng ? vc.rendrePng : null;
  if (!f) { console.log('rendrePng non exporté'); process.exit(1); }
  const [png] = await f([fs.readFileSync(svgF, 'utf-8')], themeActif());
  fs.copyFileSync(png, pngF);
  console.log('PNG', pngF);
  process.exit(0);
})();
