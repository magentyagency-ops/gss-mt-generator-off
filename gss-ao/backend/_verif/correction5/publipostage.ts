// Correction 5, bug 9 : accords du publipostage (hors ligne, aucun appel).
import { publiposter, sansCovidEnumere, appliquerModifications } from '../../src/generation/memoire_type';
const cas: Array<[string, any, string]> = [
  ["l'agent d'astreinte, qui est sur site en {{DELAI_ASTREINTE}} maximum ;", { DELAI_ASTREINTE: { valeur: '4 heures maximum' } }, "l'agent d'astreinte, qui est sur site en 4 heures maximum ;"],
  ["dans un délai maximal de {{DELAI_ASTREINTE}}.", { DELAI_ASTREINTE: { valeur: '4 heures maximum' } }, 'dans un délai maximal de 4 heures.'],
  ["pour une durée de {{DUREE_MARCHE}}. Suite", { DUREE_MARCHE: { valeur: "Période initiale d'un an, du 1er décembre 2026 au 30 novembre 2027" } }, "pour une durée d'un an, du 1er décembre 2026 au 30 novembre 2027. Suite"],
  ['Pour {{CLIENT}}, les réunions de suivi ont lieu {{FREQ_REUNIONS}}.', { CLIENT: { valeur: 'Centre Henri Becquerel', article: 'le' }, FREQ_REUNIONS: { valeur: 'Une fois par mois' } }, 'Pour le Centre Henri Becquerel, les réunions de suivi ont lieu une fois par mois.'],
  ['de façon inopinée, {{FREQ_CONTROLE_2}}.', { FREQ_CONTROLE_2: { valeur: 'Plusieurs fois par mois' } }, 'de façon inopinée, plusieurs fois par mois.'],
  ['{{FREQ_CONTROLE_2}}, nos contrôleurs passent.', { FREQ_CONTROLE_2: { valeur: 'Plusieurs fois par mois' } }, 'Plusieurs fois par mois, nos contrôleurs passent.'],
  ['sur le site de {{VILLE}}.', { VILLE: { valeur: 'Le Havre' } }, 'sur le site de Le Havre.'],
  ["et {{CLIENT}} peut, s'il le souhaite, être destinataire.", { CLIENT: { valeur: 'Association Nouvel IMM', article: "l'" } }, "et l'Association Nouvel IMM peut, si elle le souhaite, être destinataire."],
  ["et {{CLIENT}} peut, s'il le souhaite, être destinataire.", { CLIENT: { valeur: 'Centre Henri Becquerel', article: 'le' } }, "et le Centre Henri Becquerel peut, s'il le souhaite, être destinataire."],
  ["et {{CLIENT}} peut, s'il le souhaite, être destinataire.", { CLIENT: { valeur: 'Région Normandie', article: 'la' } }, "et la Région Normandie peut, si elle le souhaite, être destinataire."],
];
let ko = 0;
for (const [g, v, att] of cas) {
  const r = publiposter(g, v).texte;
  const ok = r === att; if (!ok) ko++;
  console.log(ok ? 'OK ' : 'KO ', r, ok ? '' : `\n    attendu : ${att}`);
}
const cv: Array<[string, string]> = [
  ["en cas de Plan Blanc, de Covid ou d'alerte urgence attentat.", "en cas de Plan Blanc ou d'alerte urgence attentat."],
  ['(ex : Plan Blanc, agent positif Covid, PSE / alerte urgence attentat)', '(ex : Plan Blanc, PSE / alerte urgence attentat)'],
  ["en cas de Plan Blanc ou de Covid.", "en cas de Plan Blanc."],
];
for (const [a, att] of cv) { const r = sansCovidEnumere(a); const ok = r === att; if (!ok) ko++; console.log(ok ? 'OK ' : 'KO ', r); }
const m = appliquerModifications('GSS prévoit un renfort ponctuel.', { remplacements: [{ extrait: 'un renfort ponctuel.', par: "un renfort ponctuel en cas de Plan Blanc, de Covid ou d'alerte urgence attentat." }] }, { dce: 'Plan Blanc, agent positif Covid, alerte urgence attentat' });
console.log(/covid/i.test(m.texte) ? 'KO' : 'OK ', m.texte); if (/covid/i.test(m.texte)) ko++;
console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK'); process.exit(ko ? 1 : 0);
