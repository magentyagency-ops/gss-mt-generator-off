// Tour 2 (T2C-7) : questions à GSS en double (cstb 221) et délai normand posé pour un marché hors Normandie.
import fs from 'fs';
import { memeDemande, elementsSansDoublon } from '../src/generation/memoire_generator';
import { questionDelaiInapplicable } from '../src/generation/base_memoires';
const j = JSON.parse(fs.readFileSync('../_corpus_verif/_resultats/v-cstb-221.json', 'utf-8'));
const dce = fs.readFileSync('../_corpus_verif/_dce_textes/cstb.txt', 'utf-8');
const els = j.elements.map((e: any, i: number) => ({ cle: `GSS_X${i}`, question: e.q, statut: e.statut, pourAcheteur: e.acheteur, reperes: e.contexte ? [i] : [], contexte: e.contexte })).filter((e: any) => !questionDelaiInapplicable(e.question, dce, true));
const r = elementsSansDoublon(els as any);
for (const e of r) console.log('-', e.question.slice(0, 150));
console.log(r.length, 'questions (avant :', j.elements.length, ')');
console.log(memeDemande(j.elements[0].q, j.elements[8].q), memeDemande(j.elements[8].q, j.elements[9].q), memeDemande(j.elements[9].q, j.elements[10].q));
