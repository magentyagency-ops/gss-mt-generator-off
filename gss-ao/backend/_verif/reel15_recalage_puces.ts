/**
 * HARNAIS HORS LIGNE (aucun appel OpenAI) — cadre imposé, recalage sur le texte de GSS (recalerSurReference) : les
 * phrases propres à la question que le modèle a écrites à la suite d'une puce de GSS (génération réelle rouen_univ 15 :
 * « • d'un téléphone portable : … si nécessaire. Pour le lot 1, GSS met à disposition les deux véhicules… ») forment
 * leur propre paragraphe après la liste ; la puce de GSS reste intacte et la fidélité reste à 1,00.
 */
import { recalerSurReference } from '../src/generation/memoire_type_cadre';
const reference = [
  "Nos agents et nos encadrants se déplacent en permanence dans le cadre de leurs missions : la qualité des moyens mis à leur disposition est déterminante pour leur confort de travail, leur efficacité et leur rapidité.",
  "• La communication est au cœur des missions de l'agent de sécurité : il doit pouvoir alerter, rendre compte et communiquer en permanence avec le reste de l'équipe. Selon la nature de leur mission et leurs besoins, nos agents disposent :",
  "• de talkies-walkies et d'oreillettes : les talkies-walkies permettent aux agents de communiquer d'un point à l'autre du site et de coordonner leurs actions.",
  "• d'un téléphone portable : notre organisation prévoit une ligne téléphonique d'astreinte dédiée au site ; les agents disposent donc sur place d'un téléphone, ou de plusieurs si nécessaire.",
].join('\n');
const ajout1 = "Pour le lot 1, GSS met à disposition les deux véhicules prévus par le CCTP, à motorisation thermique et Crit’Air 1.";
const ajout2 = 'Les téléphones sont équipés des numéros utiles à la mission et sont remplacés en moins de 24 heures en cas de panne.';
const reponse = reference.replace(/plusieurs si nécessaire\.$/, `plusieurs si nécessaire. ${ajout1} ${ajout2}`);
const r = recalerSurReference(reference, reponse);
let ko = 0;
const attendu = `${reference}\n\n${ajout1} ${ajout2}`;
if (r.texte !== attendu) { ko++; console.log(`ÉCHEC\nobtenu :\n${r.texte}\n\nattendu :\n${attendu}`); }
if (r.fidelite < 0.999) { ko++; console.log(`ÉCHEC fidélité ${r.fidelite}`); }
// Phrase de GSS seule sur sa ligne, sans ajout : inchangée.
const r2 = recalerSurReference(reference, reference);
if (r2.texte !== reference) { ko++; console.log(`ÉCHEC texte de GSS seul :\n${r2.texte}`); }
console.log(ko ? `${ko} échec(s)` : '3/3 contrôles conformes');
process.exit(ko ? 1 : 0);
