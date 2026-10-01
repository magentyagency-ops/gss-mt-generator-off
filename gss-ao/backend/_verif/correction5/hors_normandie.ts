// Correction 5, bug 1 : délai d'astreinte hors Normandie (imm, Paris) — filtre déterministe, hors ligne.
import fs from 'fs';
import path from 'path';
import { delaisHorsNormandie, marcheHorsNormandie } from '../../src/generation/base_memoires';
const dce = fs.readFileSync(path.resolve(__dirname, '../../../_corpus_verif/_dce_textes/imm.txt'), 'utf-8');
let ko = 0;
const hn = marcheHorsNormandie({}, dce); if (!hn) ko++; console.log(hn ? 'OK ' : 'KO ', 'imm hors Normandie');
// Correction 10 : un seuil de pénalité du DCE (« Absence d'un agent ou retard supérieur à 60 min — 300 € HT /
// manquement ») n'est ni promis par GSS ni présenté comme un délai fixé : la phrase devient une pénalité du marché.
const PENALITE = 'Le marché pénalise toute absence ou tout retard d’agent de plus de 60 minutes ; GSS organise ses remplacements en conséquence.';
const cas: Array<[string, string | null]> = [
  ['- En cas d’absence non prévue, GSS mobilise l’agent d’astreinte dans un délai maximal de 60 minutes.', PENALITE],
  ["- En cas d'absence non prévue, GSS remplace l'agent dans un délai maximal de 4 heures.", null],
  // Génération réelle imm 14 : « remplaçant » (ç) et prise de service.
  ["- En cas d’absence non prévue, GSS veille à ce que l’agent remplaçant prenne son service au plus tard dans les 60 minutes.", PENALITE],
  ['- GSS veille à éviter toute absence d’agent au poste et tout retard supérieur à 60 minutes.', PENALITE],
];
for (const [t, attendu] of cas) {
  const r = delaisHorsNormandie(t, dce, true);
  const ok = attendu === null ? r.texte === t : r.texte.includes(attendu) && !/\bde [aeiouéh]/i.test(r.texte.replace(/de plus/, ''));
  if (!ok) ko++;
  console.log(ok ? 'OK ' : 'KO ', attendu === null ? 'gardé  ' : 'reformulé', t, '\n   →', r.texte);
}
// Élision : un seuil de pénalité d'intervention donne « délais d’intervention », jamais « délais de intervention ».
{
  const dceSynthetique = 'Pénalités. Intervention sur site au-delà de 30 minutes : 150 € HT par manquement.';
  const r = delaisHorsNormandie('GSS intervient sur place en 30 minutes.', dceSynthetique, true);
  const ok = r.texte.includes('Le marché fixe des délais d’intervention de 30 minutes') && !/de intervention/.test(r.texte);
  if (!ok) ko++;
  console.log(ok ? 'OK ' : 'KO ', 'élision', r.texte);
}
console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK'); process.exit(ko ? 1 : 0);
