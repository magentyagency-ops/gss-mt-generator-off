// T10-COH-3 : lot du mémoire sur chaque DCE du corpus, avec une analyse qui annonce 3 lots.
import fs from 'fs';
import { lotsDuMemoire } from '../../src/generation/memoire_type';
const dir = `${__dirname}/../../../_corpus_verif/_dce_textes/`;
const analyse = { lots: [{ num: 'Lot 1', perimetre: 'gardiennage' }, { num: 'Lot 2', perimetre: 'sécurité incendie' }, { num: 'Lot 3', perimetre: 'télésurveillance' }] };
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.txt'))) {
  const r = lotsDuMemoire(analyse, fs.readFileSync(dir + f, 'utf8'));
  console.log(f.padEnd(18), JSON.stringify(r.lots), r.question ? `QUESTION : ${r.question}` : '');
}
