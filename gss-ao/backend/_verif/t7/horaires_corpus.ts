// Tour 7 (T7CS-4, T7-COH-3) : horaires du texte de secours du bloc 1, sur tout le corpus.
import fs from 'fs';
import path from 'path';
import { horairesImposes } from '../../src/generation/base_memoires';
import { horairesLisibles } from '../../src/generation/reponse_libre_v2';
const D = path.resolve(__dirname, '../../../_corpus_verif/_dce_textes');
for (const f of fs.readdirSync(D).filter((x) => x.endsWith('.txt')).sort()) {
  const dce = fs.readFileSync(path.join(D, f), 'utf-8');
  const h = horairesImposes(dce, 15);
  console.log(`\n=== ${f} : ${h.length} brut(s)`);
  for (const x of h) console.log('  brut  ', x.slice(0, 260));
  for (const x of horairesLisibles(h)) console.log('  LISIBLE', x.slice(0, 260));
}
