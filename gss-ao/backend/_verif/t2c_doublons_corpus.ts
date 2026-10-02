// Tour 2 (T2C-7) : paires de questions fusionnées par memeDemande sur toutes les générations déjà faites (relecture),
// après la mise en forme actuelle (questionExacte) ; les paires identiques au caractère près ne sont pas affichées.
import fs from 'fs';
import path from 'path';
import { memeDemande, questionExacte } from '../src/generation/memoire_generator';
const R = path.resolve(__dirname, '../../_corpus_verif/_resultats');
let n = 0;
for (const f of fs.readdirSync(R).filter((x) => /^v-.*\.json$/.test(x))) {
  let j: any; try { j = JSON.parse(fs.readFileSync(path.join(R, f), 'utf-8')); } catch { continue; }
  const qs: string[] = (j.elements || []).map((e: any) => e.q || e.question).filter(Boolean).map((q: string) => questionExacte(q.replace(/^Exigence du DCE à laquelle le mémoire doit répondre : « (.*) »\. Comment GSS y répond-elle \(moyen, délai ou document à indiquer\) \?$/, '$1')));
  for (let a = 0; a < qs.length; a++) for (let b = a + 1; b < qs.length; b++) if (qs[a] !== qs[b] && memeDemande(qs[a], qs[b])) { n++; console.log(`${f}\n  A ${qs[a].slice(0, 170)}\n  B ${qs[b].slice(0, 170)}`); }
}
console.log(n, 'paire(s) fusionnée(s) (hors questions identiques)');
