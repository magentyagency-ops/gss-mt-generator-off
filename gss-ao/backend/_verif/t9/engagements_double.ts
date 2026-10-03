// Tour 9 (T9N-4) : engagements en double retirés par sansEngagementsEnDouble sur les générations réelles archivées
// (_corpus_verif/_resultats, réponse libre) : chaque retrait est affiché avec la puce qui le contient.
const fs = require('fs');
const B = '/Users/stanislastolegano/GSS-Version Finale/clarencegss/gss-ao';
const { sansEngagementsEnDouble } = require(B + '/backend/src/generation/reponse_libre_v2');
const D = `${B}/_corpus_verif/_resultats`;
let n = 0, r = 0;
for (const f of fs.readdirSync(D).filter((x: string) => x.endsWith('.json'))) {
  let d: any; try { d = JSON.parse(fs.readFileSync(`${D}/${f}`, 'utf-8')); } catch { continue; }
  const sections = d.sections && typeof d.sections === 'object' && !Array.isArray(d.sections) ? d.sections : {};
  for (const [id, t] of Object.entries(sections) as Array<[string, any]>) {
    if (typeof t !== 'string' || !t.includes('## Nos engagements')) continue;
    n++;
    const x = sansEngagementsEnDouble(t);
    for (const p of x.retirees) { r++; console.log(`${f} ${id} : ${p.slice(0, 200)}`); }
  }
}
console.log(`listes examinées : ${n}, puces retirées : ${r}`);
