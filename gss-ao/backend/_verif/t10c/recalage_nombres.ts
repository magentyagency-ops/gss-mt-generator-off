// T10N-4 : recalage du cadre, nombre du DCE accepté seulement avec la même unité ; effectif calculé jamais remplacé.
// Entrée : recalage_etampes2_553_4.json (rejeu etampes2 553, CAPTURE_RECALAGE, référence publipostée « équipe de 26 »).
import fs from 'fs';
import { recalerSurReference } from '../../src/generation/memoire_type_cadre';
import { nombresDceCompatibles } from '../../src/generation/memoire_type';
const r = JSON.parse(fs.readFileSync(`${__dirname}/recalage_etampes2_553_4.json`, 'utf-8'));
const dce = fs.readFileSync(`${__dirname}/../../../_corpus_verif/_dce_textes/etampes2.txt`, 'utf-8');
const ligne = (t: string) => (/[^\n]*équipe de \d+ agents titulaires[^\n]*/.exec(t) || [''])[0].slice(0, 70);
const res = recalerSurReference(r.reference, r.reponse, { ...r.options, dce });
console.log('référence :', ligne(r.reference)); console.log('réponse   :', ligne(r.reponse)); console.log('recalée   :', ligne(res.texte), res.fidelite.toFixed(2));
const cas: Array<[string, string, string, boolean]> = [
  ['Le rondier arrive en 45 minutes.', 'Le rondier arrive en 30 minutes.', "L'intervention a lieu dans un délai de 30 minutes.", true],
  ['Une équipe de 26 agents titulaires.', 'Une équipe de 24 agents titulaires.', 'Permanence 24h/24. Ligne 24 du BPU.', false],
  ['Contrôle 2 fois par mois.', 'Contrôle 4 fois par mois.', 'Le titulaire réalise 4 contrôles par mois.', false],
  ['Contrôle 2 fois par mois.', 'Contrôle 4 fois par mois.', 'Le titulaire réalise 4 fois par mois un contrôle.', true],
];
let ko = 0;
for (const [ref, cand, d, attendu] of cas) { const ok = nombresDceCompatibles(ref, cand, d).size > 0 === attendu; if (!ok) ko++; console.log(ok ? 'OK ' : 'KO ', cand, '|', d); }
if (!/équipe de 26 agents titulaires/.test(res.texte)) ko++;
console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK'); process.exit(ko ? 1 : 0);
