// Tour 2 (T2C-8) : rattachement des exigences du CCTP de cstb 221 (matrice de la génération réelle) : jamais d'exigence
// « absence imprévue » sous l'absence prévue, jamais d'exigence d'exécution dans le bloc de présentation.
import fs from 'fs';
import { chargerMemoireType, planMemoireType, exigencesParRubrique } from '../src/generation/memoire_type';
import { motifRefusEngagement } from '../src/generation/memoire_generator';
const mt = chargerMemoireType();
const plan = planMemoireType(mt, Object.fromEntries(Object.keys(mt.indicateurs).map((k) => [k, k !== 'HORS_NORMANDIE'])));
const ex = (rubrique: string, exigence: string) => ({ rubrique, exigence, sujet: '', theme: 'V', criticite: 'importante' } as any);
const matrice = [
  ex('b5_remplacement_prevu', 'Le titulaire remplace toute absence imprévue d’un agent rondier.'),
  ex('b5_remplacement_prevu', 'Toute absence prévue est signalée au CSTB au moins 48 heures à l’avance.'),
  ex('b2_catalogue', 'La ronde d’ouverture comprend l’ouverture du portail et la mise hors alarme des bâtiments.'),
  ex('b2_catalogue', 'Les rondes de nuit sont effectuées entre 21h30 et 06h30, trois fois par nuit.'),
  ex('b2_identite', 'Le titulaire justifie de son autorisation d’exercer délivrée par le CNAPS.'),
];
const { parRubrique, nouvelles } = exigencesParRubrique(mt, plan, matrice);
let ko = 0;
for (const [id, l] of Object.entries(parRubrique)) for (const e of l) console.log(`${id} ← ${e.exigence}`);
for (const e of nouvelles) console.log(`(nouvelle) ${e.exigence}`);
if ((parRubrique.b5_remplacement_prevu || []).some((e) => /impr[ée]vu/i.test(e.exigence))) ko++;
if ((parRubrique.b2_catalogue || []).length) ko++;
if (!(parRubrique.b2_identite || []).length) ko++;
const m = motifRefusEngagement('GSS s’engage à remplacer toute absence imprévue dans le délai contractuel.');
console.log('engagement « délai contractuel » :', m || 'accepté');
if (!m) ko++;
console.log(ko ? `${ko} anomalie(s)` : 'Tout est conforme.');
process.exit(ko ? 1 : 0);
