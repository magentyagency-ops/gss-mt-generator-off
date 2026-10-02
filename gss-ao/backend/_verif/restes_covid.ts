/**
 * Règle Covid de GSS (faits_gss.md : « pas de Covid / pass sanitaire ») appliquée sans l'ancienne exception globale
 * « sauf si le DCE en parle » : le mot Covid n'est jamais écrit (« plan Covid » → « plan de crise sanitaire ») ; une
 * mesure (pass sanitaire, gestes barrières, gel) n'est citée que si le DCE l'exige lui-même sous ce terme (Vitry).
 * Aucun appel OpenAI. Usage : npx ts-node --transpile-only _verif/restes_covid.ts
 */
import fs from 'fs';
import path from 'path';
import { sansContenuCovid } from '../src/generation/base_memoires';
import { appliquerModifications } from '../src/generation/memoire_type';
let ko = 0;
const verifier = (nom: string, ok: boolean, detail = '') => { console.log(`${ok ? 'OK ' : 'KO '} ${nom}${detail ? ` — ${detail}` : ''}`); if (!ok) ko++; };
const dce = (c: string) => fs.readFileSync(path.resolve(__dirname, `../../_corpus_verif/_dce_textes/${c}.txt`), 'utf-8');
const becq = dce('becquerel'), vitry = dce('vitry'), citedia = dce('citedia2');

const a = sansContenuCovid('Les renforts couvrent le plan Covid et le Plan Blanc. Les gestes barrières sont rappelés aux visiteurs. Un agent positif Covid est remplacé immédiatement. Les agents assurent le contrôle des pass sanitaires à l’entrée.', becq);
verifier('Becquerel : « plan Covid » → « plan de crise sanitaire »', /plan de crise sanitaire et le Plan Blanc/.test(a), a);
verifier('Becquerel : gestes barrières retirés (absents du DCE)', !/gestes barri/i.test(a), a);
verifier('Becquerel : le mot Covid jamais écrit, même cité par le DCE', !/covid/i.test(a), a);
verifier('Becquerel : contrôle des pass sanitaires gardé (le DCE le cite)', /pass sanitaires/.test(a), a);
const b = sansContenuCovid('Pendant la période covid, nos agents ont assuré le filtrage.', becq);
verifier('« période covid » → « crise sanitaire »', b === 'Pendant la crise sanitaire, nos agents ont assuré le filtrage.', b);
const v = 'En cas de crise sanitaire, GSS fournit le matériel nécessaire au contrôle du public et des pass sanitaires, notamment un lecteur de QR codes.';
verifier('Vitry : mesure exigée par le DCE gardée', sansContenuCovid(v, vitry) === v, sansContenuCovid(v, vitry));
const c = sansContenuCovid(`Accueil et filtrage. ${v}`, citedia);
verifier('Citédia (DCE muet) : pass sanitaires retirés', c === 'Accueil et filtrage.', c);
const sans = 'Texte sans rapport.';
verifier('texte sans mention : inchangé', sansContenuCovid(sans, becq) === sans);

const ref = 'Nos agents assurent le filtrage des entrées. Ils orientent les visiteurs.';
const r1 = appliquerModifications(ref, { ajouts: [{ texte: 'En cas d’agent positif Covid, GSS assure un remplacement immédiat.' }] }, { dce: becq, reference: ref });
verifier('adaptation : ajout avec le mot Covid refusé même si le DCE l\'emploie', !r1.appliquees.length && r1.refusees[0]?.raison === 'Covid', r1.refusees[0]?.raison);
const r2 = appliquerModifications(ref, { ajouts: [{ texte: 'En cas de crise sanitaire, nous fournissons un lecteur de QR codes pour le contrôle des pass sanitaires.' }] }, { dce: vitry, reference: ref });
verifier('adaptation : mesure exigée par le DCE acceptée (Vitry)', r2.appliquees.length === 1, r2.refusees[0]?.raison);
const r3 = appliquerModifications(ref, { ajouts: [{ texte: 'Les gestes barrières sont rappelés aux visiteurs.' }] }, { dce: becq, reference: ref });
verifier('adaptation : gestes barrières refusés quand le DCE ne les cite pas (Becquerel)', !r3.appliquees.length && r3.refusees[0]?.raison === 'Covid', r3.refusees[0]?.raison);
console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK');
