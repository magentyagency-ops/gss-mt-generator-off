// Correction 9, bug 4 : bloc 1 « Notre compréhension de votre besoin » de ign 11 (1 attente, 1 vigilance) complété au
// minimum (4 attentes chiffrées, 3 points de vigilance, sanctionnées d'abord) ; défauts du schéma (intitulé de poste,
// pas d'étape de résultat).
import fs from 'fs';
import path from 'path';
import { completerBesoinMinimum, defautsEtapesBesoin } from '../src/generation/reponse_libre_v2';
import { obligationsChiffrees } from '../src/generation/base_memoires';
let ko = 0;
const verifier = (nom: string, ok: boolean, detail = '') => { console.log(`${ok ? 'OK ' : 'KO '} ${nom}${detail ? ` — ${detail}` : ''}`); if (!ok) ko++; };
const ign = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../_corpus_verif/_resultats/v-ign-11.json'), 'utf-8'));
const dce = fs.readFileSync(path.resolve(__dirname, '../../_corpus_verif/_dce_textes/ign.txt'), 'utf-8');
const texte: string = ign.sections.b1_comprehension;
const sources = obligationsChiffrees(dce).slice(0, 25).map((o) => ({ exigence: o.phrase }));
const r = completerBesoinMinimum(texte, sources, undefined, dce);
const partie = (t: string, rx: RegExp) => (t.split(/(?=^## )/m).find((p) => rx.test(p)) || '');
const n = (p: string) => (p.match(/^\s*[-*•]\s+\S/gm) || []).length;
console.log(partie(r.texte, /^## Vos attentes/) + partie(r.texte, /^## Les points de vigilance/));
verifier('au moins 4 attentes', n(partie(r.texte, /^## Vos attentes/)) >= 4, `${n(partie(texte, /^## Vos attentes/))} → ${n(partie(r.texte, /^## Vos attentes/))}`);
verifier('au moins 3 points de vigilance', n(partie(r.texte, /^## Les points de vigilance/)) >= 3, `${n(partie(texte, /^## Les points de vigilance/))} → ${n(partie(r.texte, /^## Les points de vigilance/))}`);
verifier('remplaçant sous 2 heures (sanctionné) en tête des ajouts', /deux \(2\) heures|2 heures/.test(partie(r.texte, /^## Vos attentes/)));
const etapes = [
  { titre: 'Deux bâtiments', texte: 'Carnot-Cassini et Coriolis sont surveillés 24 h/24.' },
  { titre: 'Agents qualifiés', texte: 'Les SSIAP 2, SSIAP 1 et ADS tiennent les postes prescrits' },
  { titre: 'Main courante', texte: 'Trackforce trace chaque ronde et chaque événement.' },
  { titre: 'Pilotage mensuel', texte: 'Le chef de poste rend compte chaque mois.' },
  { titre: 'Rapport mensuel', texte: 'Le rapport mensuel est remis au SAIMG.' },
];
const d = defautsEtapesBesoin(etapes);
d.forEach((x) => console.log(`  défaut : ${x}`));
verifier('carte « tiennent les postes prescrits » refusée', d.some((x) => /intitulés de poste/.test(x)));
verifier('dernière étape sans résultat refusée', d.some((x) => /résultat obtenu/.test(x)));
verifier('étape de résultat acceptée', !defautsEtapesBesoin([...etapes.slice(2, 4), { titre: 'Site sécurisé en continu', texte: 'Les deux bâtiments restent sécurisés sans interruption.' }]).length);
{
  // Génération réelle ign 12 : bloc 1 sans sous-partie « Vos attentes » et une seule vigilance (méta-commentaire).
  const t12: string = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../_corpus_verif/_resultats/v-ign-12.json'), 'utf-8')).sections.b1_comprehension;
  const r12 = completerBesoinMinimum(t12, sources, undefined, dce);
  verifier('ign 12 : sous-partie « Vos attentes » créée avec 4 attentes, 3 vigilances', n(partie(r12.texte, /^## Vos attentes/)) >= 4 && n(partie(r12.texte, /^## Les points de vigilance/)) >= 3, `${r12.ajoutees} ajout(s)`);
  const { retirerCommentairesInternes } = require('../src/generation/base_memoires');
  const vig = '- **Point de vigilance** : le RC, le rapport de visite terrain et les annexes relatives au personnel sont absents des pièces analysées ; les modalités de visite ne peuvent être établies.';
  verifier('ign 12 : vigilance « absents des pièces analysées » retirée', !retirerCommentairesInternes(vig).texte.includes('pièces analysées'));
}
console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK');
