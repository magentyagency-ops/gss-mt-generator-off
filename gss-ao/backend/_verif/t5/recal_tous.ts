/** Rejoue toutes les captures de recalage d'un dossier (recalage_<n>.json) avec le code courant et affiche les différences. */
import fs from 'fs';
import path from 'path';
import { recalerSurReference } from '../../src/generation/memoire_type_cadre';
const dir = process.argv[2];
for (const f of fs.readdirSync(dir).filter((x) => /^recalage_\d+\.json$/.test(x)).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
  const r = recalerSurReference(d.reference, d.reponse, { ...d.options, dce: '' });
  const a = String(d.resultat.texte).split('\n'), b = r.texte.split('\n');
  const diff = b.filter((l) => !a.includes(l)).concat(a.filter((l) => !b.includes(l)).map((l) => `AVANT ${l}`));
  console.log(`${f} : ${d.resultat.fidelite.toFixed(2)} → ${r.fidelite.toFixed(2)}, ${diff.length} ligne(s) différente(s)`);
  for (const l of diff) console.log(`   ${l.slice(0, 220)}`);
}
