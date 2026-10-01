// Correction 5, bug 13 : puces d'engagement dédoublonnées et voix de GSS (format court, hors ligne).
import { nettoyerEngagements, voixDeGss } from '../../src/generation/format_court';
const t = `Texte de GSS.

## Nos engagements sur les exigences du cahier des charges

- GSS prendra en compte le périmètre hospitalier de l'IMM, comprenant la galerie souterraine, ainsi que le classement ERP : type U, 2e catégorie pour le bâtiment principal, 4e catégorie pour le bâtiment P et 5e catégorie pour la Maison des Parents. Les accès pris en compte sont ceux du boulevard Jourdan (4 accès piétons et 4 véhicules) et de l'avenue Reille (1 accès piéton et 1 véhicule).
- GSS prendra en compte les accès du boulevard Jourdan (4 accès piétons et 4 véhicules) et de l'avenue Reille (1 accès piéton et 1 véhicule).
- GSS prendra en compte le classement de l'établissement de soins en 2e catégorie.
- GSS prendra en charge l'ensemble du périmètre de l'établissement, comprenant ses bâtiments, locaux, ouvrages, installations et équipements.
- GSS réalise obligatoirement un contrôle contradictoire trimestriel sur site. La fiche est visée par les deux parties et une copie est remise immédiatement au titulaire.`;
const r = nettoyerEngagements(t);
console.log(r);
let ko = 0;
const n = (r.match(/^- /gm) || []).length;
if (n !== 3) { ko++; console.log(`KO : ${n} puces (3 attendues)`); }
if (/au titulaire/.test(r) || !/remise immédiatement à GSS/.test(r)) { ko++; console.log('KO voix'); }
const v: Array<[string, string]> = [
  ['Le titulaire gère le personnel pendant les pauses.', 'GSS gère le personnel pendant les pauses.'],
  ['le matériel du titulaire est porté à la connaissance de l\'IMM.', 'le matériel de GSS est porté à la connaissance de l\'IMM.'],
  ['un agent titulaire du SSIAP 2.', 'un agent titulaire du SSIAP 2.'],
  ['le titulaire du SSIAP 2 reste au PC.', 'le titulaire du SSIAP 2 reste au PC.'],
];
for (const [a, att] of v) { const x = voixDeGss(a); if (x !== att) { ko++; console.log('KO', x); } else console.log('OK ', x); }
console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK'); process.exit(ko ? 1 : 0);
