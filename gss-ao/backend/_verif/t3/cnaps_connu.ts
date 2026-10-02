import { sansDonneesCnapsConnues } from '../../src/generation/base_memoires';
for (const q of [
  "Pour l'autorisation d'exercer du dirigeant, quels sont le numéro, la date d'obtention et la date de fin de validité ?",
  "Quelle est la date de fin de validité de l’autorisation d’exercer de GLOBAL SECURITY SERVICES délivrée par le CNAPS ?",
  "Pour l'autorisation d'exercer de l'entreprise, quels sont le numéro, la date d'obtention et la date de fin de validité ?",
  "Quel est le numéro d'agrément du dirigeant ?",
  "Pour chaque agent, quels sont son numéro individuel d’agrément et la date de validité ?",
  "Quelles sont les dates de délivrance et de fin de validité de l’agrément CNAPS du dirigeant Adil Marchani ?",
]) console.log(JSON.stringify(q), '\n   →', JSON.stringify(sansDonneesCnapsConnues(q)));
