// T10C-2 / T10-COH-1 : délais imposés lus par sujet sur tout le corpus, code de référence (dist passé en argument) contre code courant.
import fs from 'fs';
import { delaiDuDce, delaisDuDce } from '../../src/generation/memoire_type';
const log = console.log; console.log = () => {};
const A = require(process.argv[2]);
const dir = `${__dirname}/../../../_corpus_verif/_dce_textes/`;
const sujets = ['alarme', 'remplacement', 'pti', 'commande', 'ssi'];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.txt'))) {
  const dce = fs.readFileSync(dir + f, 'utf8');
  for (const s of sujets) {
    const a = A.delaiDuDce(dce, s), b = delaiDuDce(dce, s as any);
    const tous = [...new Set(delaisDuDce(dce, s as any).map((d) => d.valeur))].join(', ');
    if (a !== b || tous) log(`${a !== b ? 'DIFF' : '    '} ${f.padEnd(18)} ${s.padEnd(13)} avant « ${a} » après « ${b} »  [${tous}]`);
  }
}
