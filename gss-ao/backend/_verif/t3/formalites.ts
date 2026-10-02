import { FORMALITES_OFFRE, questionFormalite, controlerProposition } from '../../src/generation/reponse_libre_v2';
for (const t of ['Visite obligatoire des lieux', 'Cette visite obligatoire aura lieu le 7 Octobre 2026 à 09H00.', 'Cadre de réponse du lot 2', 'Le document cadre de réponse obligatoire joint dans le D.C.E.', 'Le candidat renseignera un cadre de réponse par lot auquel il soumissionne', 'Rondes de sécurité dans les parcs', 'Gestion des clés et badges']) console.log(FORMALITES_OFFRE.test(t) ? 'FORMALITÉ' : 'technique ', t);
console.log(questionFormalite({ exigence: 'Cette visite obligatoire aura lieu le 7 Octobre 2026 à 09H00.' }));
const p = controlerProposition(`## Visite\nLa visite obligatoire des lieux a été effectuée le 7 octobre 2026 à 09h00. L’attestation remise à l’issue de la visite est jointe à l’offre. Cette visite permet de prendre en compte les conditions d’exécution. GSS a obtenu son autorisation d'exercer le 12/02/2015.`);
console.log(p);
