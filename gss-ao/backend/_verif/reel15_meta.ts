/**
 * HARNAIS HORS LIGNE (aucun appel OpenAI) — commentaire sur le DCE dans le texte remis (génération réelle ign 15 :
 * « ; la télésurveillance externalisée n'est pas stipulée au CCTP ») : la proposition est retirée, le reste de la phrase
 * est gardé ; une phrase qui ne fait que ce commentaire est retirée ; une phrase utile qui cite le CCTP reste.
 */
import { retirerCommentairesInternes } from '../src/generation/base_memoires';
const cas: Array<[string, string]> = [
  ['Les agents réalisent les rondes et interventions sur alarmes conformément aux consignes ; la télésurveillance externalisée n’est pas stipulée au CCTP. Le PCA est une prestation sur bon de commande.',
    'Les agents réalisent les rondes et interventions sur alarmes conformément aux consignes. Le PCA est une prestation sur bon de commande.'],
  ["La télésurveillance n'est pas stipulée au CCTP. Le PCA reste ouvert de 7h00 à 19h00.", 'Le PCA reste ouvert de 7h00 à 19h00.'],
  ['Le CCTP prévoit des rondes ; elles sont assurées à pied.', 'Le CCTP prévoit des rondes ; elles sont assurées à pied.'],
];
let ko = 0;
for (const [entree, attendu] of cas) {
  const r = retirerCommentairesInternes(entree).texte.trim();
  if (r !== attendu) { ko++; console.log(`ÉCHEC\n  entrée  : ${entree}\n  obtenu  : ${r}\n  attendu : ${attendu}`); }
}
console.log(ko ? `${ko} échec(s)` : `${cas.length}/${cas.length} cas conformes`);
process.exit(ko ? 1 : 0);
