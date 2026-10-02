/**
 * HARNAIS HORS LIGNE (aucun appel OpenAI) — format court, génération réelle imm 16 : « Chargé d'affaire dédié :
 * [À COMPLÉTER] » (ajout de l'adaptation, sans question) et « Taux de reprise du personnel en place : [À COMPLÉTER] »
 * (question perdue à la fusion des consultations) reçoivent chacun une question ; un emplacement dont le repère est déjà
 * couvert par une question n'en reçoit pas d'autre.
 */
import { questionsDesEmplacements, type ElementACompleter } from '../src/generation/completion';
const sections: Record<string, string> = {
  c1: "Pour le marché de l'IMM, votre interlocuteur unique est :\n- Interlocuteur unique : MARCHANI Adil ;\n- Chargé d’affaire dédié : [À COMPLÉTER].",
  c2: "Notre partenaire en télésurveillance est [À COMPLÉTER], avec qui nous collaborons.\n⟦AC:3⟧\n\nTaux de reprise du personnel en place : [À COMPLÉTER]. Les agents repris suivent la même intégration.\n⟦AC:4⟧",
};
const elements: ElementACompleter[] = [{ cle: 'Q1', question: 'Quel partenaire de télésurveillance GSS retient-elle : ERYMA ou Delta ?', contexte: '', statut: 'ouvert', reperes: [3] }];
const a = questionsDesEmplacements(sections, elements, (id) => (id === 'c1' ? 'Organisation et moyens humains' : 'Continuité de service'));
let ko = 0;
const qs = a.map((e) => e.question);
console.log(qs.join('\n'));
if (a.length !== 2) { ko++; console.log(`ÉCHEC : ${a.length} question(s) ajoutée(s), 2 attendues`); }
if (!qs.some((q) => /Chargé d’affaire dédié/.test(q))) { ko++; console.log('ÉCHEC : pas de question pour le chargé d’affaire'); }
if (!qs.some((q) => /Taux de reprise du personnel en place/.test(q))) { ko++; console.log('ÉCHEC : pas de question pour le taux de reprise'); }
if (qs.some((q) => /partenaire/i.test(q))) { ko++; console.log('ÉCHEC : question en double pour le partenaire'); }
if (!a.find((e) => /Taux de reprise/.test(e.question))?.reperes?.includes(4)) { ko++; console.log('ÉCHEC : repère du taux de reprise non rattaché'); }
console.log(ko ? `${ko} échec(s)` : '5/5 contrôles conformes');
process.exit(ko ? 1 : 0);
