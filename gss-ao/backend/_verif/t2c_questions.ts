// Tour 2 (correcteur) : questions à GSS toujours sous forme de question ; alerte « cadre absent » sans nom coupé.
import fs from 'fs';
import { questionExacte, alerteCadreAbsent } from '../src/generation/memoire_generator';
const D = '../_corpus_verif/_dce_textes/';
for (const f of ['caen', 'cstb', 'becquerel']) console.log(f, '→', JSON.stringify(alerteCadreAbsent(fs.readFileSync(`${D}${f}.txt`, 'utf-8'))));
const cas = [
  'délai moyen maximum d’intervention sur site après appel de télésurveillance pour une levée de doute',
  "Diplômes détenus par l'équipe dédiée au marché.", 'Partenaire de télésurveillance retenu pour ce marché (ERYMA ou Delta).',
  "Nom exact de l'acheteur introuvable dans le DCE : à vérifier", 'préciser les mesures de sécurité des données personnelles, notamment la gestion des accès.',
  'Confirmer la disponibilité d’une attestation en cours de validité.', 'À confirmer : Les agents sont sensibilisés à la confidentialité ; cette sensibilisation est documentée.',
  'Confirmer auprès de GSS et de son assureur la souscription des garanties, et obtenir l’attestation correspondante.',
  "Nombre d'agents titulaires de l'équipe dédiée au marché.", 'Délai proposé hors Normandie, à confirmer par GSS (organisation locale) : 2 heures',
  'Information à fournir pour compléter : « Taux : [À COMPLÉTER] »', 'Exigence du DCE sans réponse dans le mémoire : Le titulaire doit fournir un registre.',
  'Pour un agent cynophile affecté, le chien doit être tenu en laisse.', 'À demander à l\'acheteur : plan des locaux à jour',
  'Proposition de réponse à valider (question nouvelle du DCE) : Assurances', 'Rubrique « X » : rédaction automatique indisponible, à relire.',
  'Critère « 2.1 » : quelle information faut-il écrire à la place du repère [À COMPLÉTER] ?', 'Taux de reprise du personnel en place proposé pour ce marché.',
  '« Les tenues » — à confirmer : les dimensions des marquages', 'GSS est-elle une PME ? L\'effectif est de 380 salariés.',
];
let ko = 0;
for (const c of cas) {
  const q = questionExacte(c);
  const ok = /^(?:Proposition|Rubrique «)/.test(q) || /\?\s*(?:\([^)]*\))?\s*$/.test(q) || /\?/.test(q);
  if (!ok) ko++;
  console.log(ok ? 'OK ' : 'KO ', q);
}
console.log(`${ko} anomalie(s)`);
