// Tour 7 (T7-COH-2) : lieu du marché sur tout le corpus, avec la fonction en place (et lieuDuMarche si elle existe).
import fs from 'fs';
import path from 'path';
import * as bm from '../../src/generation/base_memoires';
const D = path.resolve(__dirname, '../../../_corpus_verif/_dce_textes');
for (const f of fs.readdirSync(D).filter((x) => x.endsWith('.txt')).sort()) {
  const dce = fs.readFileSync(path.join(D, f), 'utf-8');
  const s = bm.sitesDuMarche({}, dce);
  const l = (bm as any).lieuDuMarche ? (bm as any).lieuDuMarche({}, dce) : null;
  console.log(f.padEnd(18), String(bm.marcheHorsNormandie({}, dce)).padEnd(6), JSON.stringify(s), l ? JSON.stringify(l) : '');
}
