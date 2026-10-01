// Correction 5, bug 8 : renvois « bloc n » réécrits vers les parties du RC en format court (hors ligne).
import { renvoisVersParties } from '../../src/generation/format_court';
const blocs = [
  { numero: 1, rubriques: ['b1_comprehension'] }, { numero: 2, rubriques: ['b2_identite'] },
  { numero: 3, rubriques: ['b3_recrutement', 'b3_formation'] }, { numero: 4, rubriques: ['b4_main_courante', 'b4_lmc'] },
  { numero: 5, rubriques: ['b5_absences', 'b5_qualite', 'b5_integration'] },
];
const parties = [
  { id: 'p1', title: 'Moyens humains' }, { id: 'p2', title: 'Continuité de service' }, { id: 'p3', title: 'Moyens matériels et outils de suivi / reporting' },
  { id: 'p4', title: 'Formation, qualité et RSE' }, { id: 'p5', title: 'Compréhension des enjeux du CCTP et cohérence du prix' },
];
const retenues = { p1: ['b3_recrutement'], p2: ['b5_absences', 'b5_integration'], p3: ['b4_main_courante'], p4: ['b3_formation', 'b5_qualite'], p5: ['b1_comprehension'] };
const cas: Array<[string, string]> = [
  ["notre réponse relève des processus d'absence, développés au bloc 5.", "notre réponse relève des processus d'absence, développés dans les parties 2 « Continuité de service » et 4 « Formation, qualité et RSE »."],
  ['notre réponse associe la main courante électronique du bloc 4 au suivi qualité.', 'notre réponse associe la main courante électronique de la partie 3 « Moyens matériels et outils de suivi / reporting » au suivi qualité.'],
  ['les formations décrites aux blocs 3 et 5.', 'les formations décrites dans les parties 1 « Moyens humains » et 2 « Continuité de service »'],
  ['notre identité, développée au bloc 2.', 'notre identité.'],
];
let ko = 0;
for (const [t, att] of cas) { const r = renvoisVersParties(t, blocs, parties, retenues); const ok = !/\bblocs?\s+\d/i.test(r); if (!ok) ko++; console.log(ok ? 'OK ' : 'KO ', r, r === att ? '' : `\n    (attendu indicatif : ${att})`); }
console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK'); process.exit(ko ? 1 : 0);
