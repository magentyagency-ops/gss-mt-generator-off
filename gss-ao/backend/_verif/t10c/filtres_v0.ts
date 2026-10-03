// T10REG-1 : filtre des commentaires internes, 697d1ab (dist de base0) contre le code courant, sur les rubriques
// réellement rédigées du corpus (_corpus_verif/_resultats, générations 1 à 11) : phrases retirées par le code courant seul.
import fs from 'fs';
import { retirerCommentairesInternes } from '../../src/generation/base_memoires';
const log = console.log; console.log = () => {}; console.warn = () => {};
const A = require(process.argv[2]);
const dir = `${__dirname}/../../../_corpus_verif/_resultats/`;
let n = 0; const ex: string[] = [];
for (const f of fs.readdirSync(dir).filter((x) => /^v-[a-z_0-9]+-([1-9]|1[01])\.json$/.test(x))) {
  let d: any; try { d = JSON.parse(fs.readFileSync(dir + f, 'utf8')); } catch { continue; }
  for (const [id, t] of Object.entries<any>(d.sections || {})) {
    const a = new Set(A.retirerCommentairesInternes(String(t)).retires);
    for (const x of retirerCommentairesInternes(String(t)).retires) if (!a.has(x)) { n++; ex.push(`${f} ${id} | ${x.slice(0, 240)}`); }
  }
}
log(`phrases retirées par le code courant et gardées par 697d1ab : ${n}`); ex.forEach((x) => log('  · ' + x));
