// Correction 9, bug 7 : Citédia (Rennes, hors Normandie), délais de 2 h et 24 h tirés d'un seuil de pénalité du CCAP.
import fs from 'fs';
import path from 'path';
import { delaisHorsNormandie } from '../src/generation/base_memoires';
let ko = 0;
const verifier = (nom: string, ok: boolean, detail = '') => { console.log(`${ok ? 'OK ' : 'KO '} ${nom}${detail ? ` — ${detail}` : ''}`); if (!ok) ko++; };
const dce = fs.readFileSync(path.resolve(__dirname, '../../_corpus_verif/_dce_textes/citedia2.txt'), 'utf-8');
const cit = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../_corpus_verif/_resultats/v-citedia2-12.json'), 'utf-8')).texte_docx as string;
const extraits = [
  "Les équipes et l’astreinte GSS sont présentes sur la moitié nord de la France, de Nantes à Lille et jusqu’à Reims. GSS organise la mobilisation pour respecter les délais prévus au C.C.T.P. : mise à disposition sous 2 heures pour une demande urgente et sous 24 heures selon la demande.",
  "Dès réception de la demande, GSS récapitule le besoin, planifie les agents et transmet le planning ainsi que les consignes nécessaires. L’organisation est dimensionnée pour répondre aux délais contractuels de 2 heures en urgence ou de 24 heures selon la demande ; la confirmation de prise en charge est adressée à Citédia Métropole.",
  "Le remplacement s’appuie en priorité sur un agent suppléant déjà formé au site. GSS organise la réception, le traitement et la confirmation de chaque demande afin de respecter ces délais.",
];
verifier('extraits présents dans le texte généré', extraits.every((x) => cit.includes(x.slice(0, 60))));
for (const x of extraits) {
  const r = delaisHorsNormandie(x, dce, true);
  console.log(`  → ${r.texte}\n    (question : ${r.retires.length} phrase(s) posée(s) à GSS)`);
  verifier('aucun délai promis par GSS', !/GSS[^.;]*\b(?:2|24) heures/.test(r.texte) && !/dimensionnée pour répondre aux délais contractuels de 2/.test(r.texte));
  verifier('ni CCTP cité, ni « ces délais » sans antécédent', !/C\.C\.T\.P\.\s*:\s*mise/.test(r.texte) && !/\bces délais\b/.test(r.texte));
}
const r1 = delaisHorsNormandie(extraits[0], dce, true);
verifier('délais attribués au marché', /Le marché fixe des délais de mise à disposition de 2 heures et de 24 heures/.test(r1.texte), r1.texte);
console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK');
