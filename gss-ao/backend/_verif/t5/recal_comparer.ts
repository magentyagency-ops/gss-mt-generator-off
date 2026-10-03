/** Compare, capture par capture, le recalage du code de HEAD (_verif/t5/avant) et celui de l'arbre de travail. */
import fs from 'fs';
import path from 'path';
import * as apres from '../../src/generation/memoire_type_cadre';
import * as avant from './avant/memoire_type_cadre';
for (const dir of process.argv.slice(2)) for (const f of fs.readdirSync(dir).filter((x) => /^recalage_\d+\.json$/.test(x)).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
  const o = { ...d.options, dce: '' };
  const a = avant.recalerSurReference(d.reference, d.reponse, o), b = apres.recalerSurReference(d.reference, d.reponse, o);
  const la = a.texte.split('\n'), lb = b.texte.split('\n');
  const diff = lb.filter((l) => !la.includes(l)).map((l) => `APRES ${l}`).concat(la.filter((l) => !lb.includes(l)).map((l) => `AVANT ${l}`));
  console.log(`${path.basename(dir)}/${f} : ${a.fidelite.toFixed(2)} → ${b.fidelite.toFixed(2)}, ${diff.length} ligne(s) différente(s)`);
  for (const l of diff) console.log(`   ${l.slice(0, 260)}`);
}
