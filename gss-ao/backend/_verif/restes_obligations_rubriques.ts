/** Relevé : obligations chiffrées du CCTP transmises à l'adaptation de chaque rubrique « adapte » (obligationsPourRubrique),
 *  sur les DCE du corpus. Usage : npx ts-node --transpile-only _verif/restes_obligations_rubriques.ts [codes…] */
import fs from 'fs';
import path from 'path';
import { chargerMemoireType, obligationsPourRubrique } from '../src/generation/memoire_type';
const mt = chargerMemoireType();
const codes = process.argv.slice(2).length ? process.argv.slice(2) : ['ign', 'becquerel', 'citedia2', 'imm', 'rouen_univ', 'etampes1'];
for (const code of codes) {
  const dce = fs.readFileSync(path.resolve(__dirname, `../../_corpus_verif/_dce_textes/${code}.txt`), 'utf-8');
  console.log(`===== ${code}`);
  for (const r of mt.rubriques.filter((x) => x.mode === 'adapte')) {
    const ob = obligationsPourRubrique(r, dce);
    if (ob.length) console.log(`--- ${r.id}\n${ob.map((o) => `   • ${o.slice(0, 220)}`).join('\n')}`);
  }
}
