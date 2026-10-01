// Correction 10, bug 2 : variantes « [À COMPLÉTER : X] » sur les rubriques réelles de la génération ign 14 (hors ligne).
import fs from 'fs';
import path from 'path';
import { poserReperes } from '../src/generation/reponse_libre_v2';
const d = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../_corpus_verif/_resultats/v-ign-14.json'), 'utf-8'));
const sections: Record<string, string> = {};
for (const [k, v] of Object.entries(d.sections || {})) if (typeof v === 'string') sections[k] = v;
const avant = Object.values(sections).join('\n').match(/\[À COMPLÉTER\s*:[^\]]*\]/g) || [];
const r = poserReperes(sections, Object.keys(sections), 100);
const apres = Object.values(sections).join('\n').match(/COMPLÉTER\s*:/g) || [];
console.log(`variantes avant : ${avant.length}`); avant.forEach((x) => console.log('  ', x));
console.log(`nouveaux repères : ${r.enPlace.length} en place`, r.enPlace.map((e) => e.question));
const ok = avant.length > 0 && apres.length === 0;
console.log(ok ? 'TOUT OK : plus aucune variante dans le texte remis' : `KO : ${apres.length} variante(s) restante(s)`);
process.exit(ok ? 0 : 1);
