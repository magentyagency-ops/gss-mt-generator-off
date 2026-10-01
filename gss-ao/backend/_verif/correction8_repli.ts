// Correction 8 : le repli TypeScript (recolorerSvg) donne les mêmes couleurs que le rendu paysage du moteur Python
// (recolorer), pour les 180 schémas de la bibliothèque et les 5 styles. Écarts tolérés : police et textLength (le repli
// garde la police d'origine) et textes rendus lisibles sur aplat pâle (_numeros_lisibles, côté Python seulement).
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { recolorerSvg, registreThemes } from '../src/generation/themes';
const MOTEUR = path.resolve(__dirname, '../python/schemas_gss');
const ids: string[] = JSON.parse(fs.readFileSync(path.join(MOTEUR, 'bibliotheque', 'index.json'), 'utf-8')).map((x: any) => x.id);
const bilan: any = {};
for (const theme of Object.keys(registreThemes().styles)) {
  const r = spawnSync('python3', ['-c', `import sys,json;sys.path.insert(0,'.');import themes_gss as T
ids=json.load(sys.stdin);print(json.dumps({i:T.recolorer(open('bibliotheque/'+i+'.svg',encoding='utf-8').read(),'${theme}') for i in ids}))`],
  { cwd: MOTEUR, input: JSON.stringify(ids), encoding: 'utf-8', maxBuffer: 512 << 20 });
  const py = JSON.parse(r.stdout);
  let ecartsHorsTexte = 0; let textes = 0; const exemples: string[] = [];
  for (const id of ids) {
    const ts = recolorerSvg(fs.readFileSync(path.join(MOTEUR, 'bibliotheque', `${id}.svg`), 'utf-8'), theme);
    const norm = (s: string) => s.replace(/ textLength="[\d.]+" lengthAdjust="spacingAndGlyphs"/g, '').replace(/(<svg\b[^>]*?)font-family="[^"]*"/, '$1').match(/<[^>]+>/g) || [];
    const a = norm(ts); const b = norm(py[id]);
    if (a.length !== b.length) { ecartsHorsTexte++; exemples.push(`${id}: ${a.length} balises / ${b.length}`); continue; }
    a.forEach((x, i) => {
      if (x === b[i]) return;
      if (x.startsWith('<text') && x.replace(/fill="[^"]*"/, '') === b[i].replace(/fill="[^"]*"/, '')) { textes++; return; }
      ecartsHorsTexte++; if (exemples.length < 5) exemples.push(`${id}: ${x.slice(0, 120)} ≠ ${b[i].slice(0, 120)}`);
    });
  }
  bilan[theme] = { schemas: ids.length, ecarts_hors_textes_lisibles: ecartsHorsTexte, textes_rendus_lisibles_cote_python: textes, exemples };
}
console.log(JSON.stringify(bilan, null, 1));
