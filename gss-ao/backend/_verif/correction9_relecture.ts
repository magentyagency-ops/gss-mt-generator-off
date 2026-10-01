// Correction 9, bugs 5 et 11 : relecture déterministe (méta-commentaires, « GSS + infinitif », délai entre parenthèses,
// vocabulaire du CCTP, nom en capitales) sur les phrases relevées dans les générations ign 11 et etampes1 13.
import fs from 'fs';
import path from 'path';
import { retirerCommentairesInternes, interditsDce, confirmationsRegistreUtilisees } from '../src/generation/base_memoires';
let ko = 0;
const verifier = (nom: string, ok: boolean, detail = '') => { console.log(`${ok ? 'OK ' : 'KO '} ${nom}${detail ? ` — ${detail}` : ''}`); if (!ok) ko++; };
const r = (t: string) => retirerCommentairesInternes(t).texte;
const a = r('La permanence 24 h/24 et 7 j/7 permet de traiter les demandes à toute heure, sans annoncer de délai de mobilisation non prévu.');
verifier('incise « sans annoncer de délai » retirée', a === 'La permanence 24 h/24 et 7 j/7 permet de traiter les demandes à toute heure.', a);
const b = r("Les CV détaillés, agréments, certificats et cartes professionnelles des personnels proposés sont à transmettre avec l'offre.");
verifier('pièces à fournir → engagement', /sont joints à l’offre\.$/.test(b), b);
const c = r("Le rapport mentionne l'heure. Cet exemple illustre le format du compte rendu ; il ne préjuge pas des événements réels de la mission.");
verifier('« ne préjuge pas » retiré', c === "Le rapport mentionne l'heure.", c);
const c2 = r("Le rapport mentionne l'heure. Ces mentions illustrent le format de compte rendu et ne prétendent pas rapporter des événements réellement survenus.");
verifier('« ne prétendent pas rapporter » retiré (etampes1 14)', c2 === "Le rapport mentionne l'heure.", c2);
const d = r("GSS former chaque agent à la prévention de la malveillance. GSS fournir les tenues. GSS tenir le registre. GSS assure la relève. Le dossier premier de GSS entre en vigueur.");
verifier('GSS + infinitif', d === 'GSS forme chaque agent à la prévention de la malveillance. GSS fournit les tenues. GSS tient le registre. GSS assure la relève. Le dossier premier de GSS entre en vigueur.', d);
const e = r("3. Une fois arrivé sur place (selon la distance, en 2 heures), l'agent fait sa prise de service. Une fois arrivé (selon la distance, en 45 minutes à 2 heures), il prend son poste.");
verifier('parenthèse de délai', e === "3. Une fois arrivé sur place (dans un délai de 2 heures), l'agent fait sa prise de service. Une fois arrivé (selon la distance, en 45 minutes à 2 heures), il prend son poste.", e);
const dceIgn = fs.readFileSync(path.resolve(__dirname, '../../_corpus_verif/_dce_textes/ign.txt'), 'utf-8');
const f = interditsDce("Le chef de site contrôle les agents. Les responsables de site envoient leur rapport, en concertation avec l'IGN (responsable de site).", dceIgn);
verifier('IGN : « chef de poste », terme du CCTP', f === "Le chef de poste contrôle les agents. Les chefs de poste envoient leur rapport, en concertation avec l'IGN (responsable de site).", f);
const dceCit = fs.readFileSync(path.resolve(__dirname, '../../_corpus_verif/_dce_textes/citedia2.txt'), 'utf-8');
verifier('Citédia : vocabulaire inchangé', interditsDce('Le chef de site contrôle.', dceCit) === 'Le chef de site contrôle.');
const g = confirmationsRegistreUtilisees('Responsable incendie : ATTOU NESRINE');
verifier('nom en capitales → prénom en minuscules', g.some((x) => /ATTOU Nesrine/.test(x)) && !g.some((x) => /NESRINE/.test(x)), g.join(' | '));
console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK');
