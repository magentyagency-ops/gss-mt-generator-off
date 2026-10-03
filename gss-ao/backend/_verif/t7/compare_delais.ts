// Tour 7 (REG7-1, T7N-4) : filtre des délais hors Normandie, avant (189ce28) et après, sur toutes les sections du corpus.
// Préparer d'abord : git show 189ce28:gss-ao/backend/src/generation/base_memoires.ts > _verif/t7/base_memoires_avant.ts
import fs from 'fs';
import path from 'path';
import * as avant from './base_memoires_avant';
import * as apres from '../../src/generation/base_memoires';
const R = path.resolve(__dirname, '../../../_corpus_verif/_resultats');
const D = path.resolve(__dirname, '../../../_corpus_verif/_dce_textes');
let n = 0, diff = 0;
for (const f of fs.readdirSync(R).filter((x) => x.endsWith('.json'))) {
  let j: any; try { j = JSON.parse(fs.readFileSync(path.join(R, f), 'utf-8')); } catch { continue; }
  const code = j.code || f.replace(/^v-/, '').replace(/-\d+\.json$/, '');
  const fd = path.join(D, `${code}.txt`); if (!fs.existsSync(fd)) continue;
  const dce = fs.readFileSync(fd, 'utf-8');
  if (!apres.marcheHorsNormandie({}, dce)) continue;
  const secs = j.sections && typeof j.sections === 'object' ? j.sections : {};
  for (const [id, t] of Object.entries(secs)) {
    if (typeof t !== 'string') continue;
    n++;
    const a = avant.delaisHorsNormandie(t, dce, true), b = apres.delaisHorsNormandie(t, dce, true);
    if (a.texte !== b.texte || JSON.stringify(a.retires) !== JSON.stringify(b.retires)) {
      diff++;
      console.log(`\n=== ${f} ${id}`);
      console.log(' avant retirés :', JSON.stringify(a.retires));
      console.log(' après retirés :', JSON.stringify(b.retires));
      const la = a.texte.split('\n'), lb = b.texte.split('\n');
      for (const l of la) if (!lb.includes(l)) console.log('  - ' + l.slice(0, 300));
      for (const l of lb) if (!la.includes(l)) console.log('  + ' + l.slice(0, 300));
    }
  }
}
console.log(`\n${n} sections, ${diff} différentes`);
