/** Rejoue les captures de recalage (recalage_<n>.json) avec le code courant et compare au code de HEAD b189ae1 (_verif/t6/avant). */
import fs from 'fs';
import path from 'path';
import { recalerSurReference } from '../../src/generation/memoire_type_cadre';
import * as avant from './avant/memoire_type_cadre';
let total = 0, changes = 0;
for (const dir of process.argv.slice(2)) for (const f of fs.readdirSync(dir).filter((x) => /^recalage_\d+\.json$/.test(x)).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
  const r = recalerSurReference(d.reference, d.reponse, { ...d.options, dce: '' });
  total++;
  const r0 = avant.recalerSurReference(d.reference, d.reponse, { ...d.options, dce: '' }); d.resultat = r0; if (r.texte === r0.texte) continue;
  changes++;
  console.log(`\n##### ${path.basename(dir)}/${f} : fidélité ${d.resultat.fidelite.toFixed(2)} → ${r.fidelite.toFixed(2)}`);
  const a = String(d.resultat.texte).split('\n'), b = r.texte.split('\n');
  for (const l of b.filter((x) => !a.includes(x))) console.log(`  + ${l.slice(0, 200)}`);
  for (const l of a.filter((x) => !b.includes(x))) console.log(`  - ${l.slice(0, 200)}`);
  if (process.env.COMPLET) console.log('----\n' + r.texte);
}
console.log(`\n${changes}/${total} recalage(s) changé(s).`);
