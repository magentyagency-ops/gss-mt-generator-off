// Correction 2, bug E : détection des anciens acheteurs de GSS cités dans une proposition de réponse.
import { acheteursCites } from '../src/generation/base_memoires';
const cas: Array<[string, string, string[]]> = [
  ["Un plan de prévention établi avec l'Université de Rouen Normandie avant le démarrage.", 'École nationale des ponts et chaussées', ['Université de Rouen Normandie']],
  ["Un plan de prévention établi avec l'Université de Rouen Normandie avant le démarrage.", 'Université de Rouen Normandie', []],
  ['Comme pour la CAF du Val-de-Marne, la passation est préparée.', 'ACOSS', ['CAF du Val-de-Marne']],
  ['Les agents de la CAF sont informés.', 'CAF du Val-de-Marne', []],
  ["Un plan de prévention établi avec l'ENPC avant le démarrage.", 'ENPC', []],
  ['Sur le site du CIC Amiens, deux agents assurent la sécurisation.', 'ENPC', []],
];
let ko = 0;
for (const [t, c, attendu] of cas) {
  const r = acheteursCites(t, c);
  const ok = JSON.stringify(r) === JSON.stringify(attendu);
  if (!ok) ko++;
  console.log(ok ? 'OK ' : 'KO ', `[${c}]`, JSON.stringify(r), ok ? '' : `attendu ${JSON.stringify(attendu)}`);
}
console.log(ko ? `${ko} écart(s)` : 'tous conformes');
