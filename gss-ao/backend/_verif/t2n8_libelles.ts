// Tour 2 (T2N-8) : libellés des questions du cadre dans les consultations (vitry 202 et autres cadres déjà générés).
import fs from 'fs';
import path from 'path';
import { libelleQuestionCadre } from '../src/generation/memoire_type_cadre';
const dir = path.resolve(__dirname, '../../_corpus_verif/_resultats');
let n = 0;
for (const f of fs.readdirSync(dir).filter((x) => /^v-.*\.json$/.test(x))) {
  let d: any; try { d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')); } catch { continue; }
  if (d.mode !== 'cadre') continue;
  for (const c of d.champs || []) {
    const l = libelleQuestionCadre(c.libelle);
    if (l !== c.libelle) { n++; if (/vitry-202/.test(f)) console.log(`${f} ${c.cle}\n  avant : ${c.libelle.slice(0, 200)}\n  après : ${l}`); }
  }
}
console.log(`${n} libellé(s) raccourci(s) sur les cadres du corpus`);
