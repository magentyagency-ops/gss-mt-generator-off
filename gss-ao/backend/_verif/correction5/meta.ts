// Correction 5, bug 7 : méta-commentaires et affirmations d'un point posé en question à GSS (hors ligne).
import fs from 'fs';
import { retirerCommentairesInternes } from '../../src/generation/base_memoires';
import { retirerAffirmationsQuestionnees } from '../../src/generation/reponse_libre_v2';
let ko = 0;
const meta = [
  "Le canal documenté est donc le téléphone et le courriel ; aucune application dédiée ni aucun extranet n'est indiqué.",
  "L'organisation ne désigne pas de poste distinct pour les effectuer.",
  'Le délai d\'arrivée des renforts pour les commandes ponctuelles à Paris doit être distingué du délai contractuel de remplacement.',
  "Notre dispositif s'appuie sur les processus décrits dans les blocs cités.",
  "Le marché est conclu pour une durée de 3 ans — aucune reconduction indiquée dans le CCTP.",
  "Le marché dure 3 ans ; aucune reconduction précisée dans le CCTP fourni.",
];
for (const m of meta) { const r = retirerCommentairesInternes(`Texte gardé. ${m}`); const ok = r.texte.trim() === 'Texte gardé.'; if (!ok) ko++; console.log(ok ? 'OK ' : 'KO ', r.texte); }
const garde = ['Nos agents sont formés au poste.', 'La main courante est horodatée et conservée 10 ans.'];
for (const g of garde) { const r = retirerCommentairesInternes(g); const ok = r.texte === g; if (!ok) ko++; console.log(ok ? 'OK ' : 'KO ', r.texte); }
// Proposition becquerel 13 « Formation des agents par poste » contre les questions posées à GSS.
const etat = JSON.parse(fs.readFileSync(require('path').resolve(__dirname, '../../../_corpus_verif/_resultats/v-becquerel-13.json'), 'utf-8'));
const questions: string[] = (etat.consultations || []).map((c: any) => (typeof c === 'string' ? c : c.question || c.texte || ''));
const prop = "Le titulaire du PC doit rester dans le PC, alors que les rondes sont également prévues. Lorsque l'agent SSIAP 2 reste au PC, les agents SSIAP 1 effectuent les rondes de prévention. Chaque agent reçoit une formation au poste.";
const r = retirerAffirmationsQuestionnees(prop, questions);
console.log('Questions SSIAP 1 :', questions.filter((q) => /SSIAP 1/.test(q)));
const ok = !/SSIAP 1 effectuent/.test(r.texte) && /formation au poste/.test(r.texte); if (!ok) ko++;
console.log(ok ? 'OK ' : 'KO ', r.texte, '| retirées :', r.retires);
// Aucune phrase retirée hors question posée.
const r2 = retirerAffirmationsQuestionnees(prop, ['Quel est le nombre de badges à fournir ?']); if (r2.retires.length) ko++; console.log(r2.retires.length ? 'KO' : 'OK ', 'sans question correspondante, rien retiré');
console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK'); process.exit(ko ? 1 : 0);
