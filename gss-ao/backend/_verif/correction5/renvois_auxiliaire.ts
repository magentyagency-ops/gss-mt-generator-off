// Tour 1 (COH-T1-02) : un renvoi « détaillé au bloc n » qui ne peut pas être rattaché à une partie du RC ne laisse
// jamais de phrase tronquée (« le processus de reprise est. ») ni de virgule orpheline.
import { renvoisVersParties } from '../../src/generation/format_court';
const blocs = [{ numero: 3, rubriques: ['b3_reprise_personnel'] }, { numero: 5, rubriques: ['b5_controle_fond'] }];
const parties = [{ id: 'c1', title: 'Organisation' }, { id: 'c2', title: 'Continuité' }];
const vide = { c1: [], c2: [] };
const cas: Array<[string, string, Record<string, string[]>]> = [
  ['Le CCTP prévoit la reprise du personnel en place ; le processus de reprise est détaillé au bloc 3.', 'Le CCTP prévoit la reprise du personnel en place.', vide],
  ['Le CCTP prévoit la reprise du personnel en place ; le processus de reprise est décrit dans le bloc 3.', 'Le CCTP prévoit la reprise du personnel en place.', vide],
  ['Intro. Les contrôles sont présentés au bloc 5. Suite ici.', 'Intro. Suite ici.', vide],
  ['La procédure, développée au bloc 3, garantit X.', 'La procédure garantit X.', vide],
  ['Le suivi est assuré, développé au bloc 4.', 'Le suivi est assuré.', vide],
  ['Le processus est détaillé au bloc 3.', 'Le processus est détaillé dans la partie 1 « Organisation ».', { c1: ['b3_reprise_personnel'], c2: [] }],
];
let ko = 0;
for (const [t, attendu, ret] of cas) {
  const r = renvoisVersParties(t, blocs, parties, ret);
  const ok = r === attendu && !/\b(?:est|sont|sera|seront)\.\s*$/.test(r);
  if (!ok) ko++;
  console.log(ok ? 'OK ' : 'KO ', JSON.stringify(r));
}
console.log(ko ? `${ko} échec(s)` : 'Tout est conforme.');
process.exit(ko ? 1 : 0);
