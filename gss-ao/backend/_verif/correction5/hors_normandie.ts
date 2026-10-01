// Correction 5, bug 1 : délai d'astreinte hors Normandie (imm, Paris) — filtre déterministe, hors ligne.
import fs from 'fs';
import path from 'path';
import { delaisHorsNormandie, marcheHorsNormandie } from '../../src/generation/base_memoires';
const dce = fs.readFileSync(path.resolve(__dirname, '../../../_corpus_verif/_dce_textes/imm.txt'), 'utf-8');
let ko = 0;
const hn = marcheHorsNormandie({}, dce); if (!hn) ko++; console.log(hn ? 'OK ' : 'KO ', 'imm hors Normandie');
const cas: Array<[string, boolean]> = [
  ['- En cas d’absence non prévue, GSS mobilise l’agent d’astreinte dans un délai maximal de 60 minutes.', false],
  ["- En cas d'absence non prévue, GSS remplace l'agent dans un délai maximal de 4 heures.", true],
];
for (const [t, garde] of cas) { const r = delaisHorsNormandie(t, dce, true); const ok = (r.texte.trim() !== '') === garde; if (!ok) ko++; console.log(ok ? 'OK ' : 'KO ', garde ? 'gardé  ' : 'retiré ', t); }
console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK'); process.exit(ko ? 1 : 0);
