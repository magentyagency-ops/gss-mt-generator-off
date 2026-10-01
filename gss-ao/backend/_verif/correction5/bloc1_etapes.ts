// Correction 5, bug 3 : étapes du schéma de process du bloc 1 sans contenu propre au marché refusées (hors ligne).
import { defautsEtapesBesoin, CONSIGNE_COMPREHENSION } from '../../src/generation/reponse_libre_v2';
let ko = 0;
const becquerel13 = [
  { titre: 'Votre besoin', texte: 'Le Centre Henri Becquerel nous consulte pour le marché' },
  { titre: 'Vos enjeux', texte: 'Vos enjeux comprennent aussi des personnels mobilisables dans un délai de 2 heures' },
  { titre: 'Notre dispositif', texte: 'Le PC réalise les rondes de prévention' },
  { titre: 'Notre pilotage', texte: "Les plannings mensuels d'affectation" },
  { titre: 'Votre résultat', texte: 'Un service suivi' },
];
const d1 = defautsEtapesBesoin(becquerel13);
console.log(d1.join('\n'));
if (d1.length < 7) { ko++; console.log(`KO : ${d1.length} défauts relevés (7 attendus au moins)`); }
const bon = [
  { titre: 'Mobilisation sous 2 heures', texte: 'Des personnels mobilisables à moins de 20 km en cas de crise.' },
  { titre: 'SSIAP 2 au PC 24 h/24', texte: "L'agent SSIAP 2 du PC reste au PC et supervise la sécurité incendie." },
  { titre: 'Confidentialité des patients', texte: 'Agents formés au secret et à la discrétion en milieu hospitalier.' },
  { titre: 'Tuilage et main courante', texte: 'Relèves tracées dans Trackforce, plannings envoyés à J-10.' },
  { titre: 'Continuité de service', texte: 'Aucun poste vacant, de jour comme de nuit.' },
];
const d2 = defautsEtapesBesoin(bon);
if (d2.length) { ko++; console.log('KO faux positifs :', d2); } else console.log('OK  étapes concrètes acceptées');
if (!/titre NOMINAL/.test(CONSIGNE_COMPREHENSION)) { ko++; console.log('KO consigne'); }
console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK'); process.exit(ko ? 1 : 0);
