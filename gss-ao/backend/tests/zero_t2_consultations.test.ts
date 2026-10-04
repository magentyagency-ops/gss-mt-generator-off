// Campagne « zéro défaut », tour 2 : questions à GSS du cadre et de la réponse libre (T2-CONS-7, T2N-7).
import { describe, it, expect } from 'vitest';
import { questionOuverte, sansQuestionsRedites, sousTitreDeLEmplacement, piecesDemandeesParLeCadre } from '../src/generation/memoire_generator';

describe('demande jamais changée en question fermée au sens inversé (T2-CONS-7)', () => {
  it.each([
    ['GSS doit-elle joindre les CV détaillés, certificats et cartes professionnelles des agents affectés au marché ?', 'Pouvez-vous fournir les CV détaillés, certificats et cartes professionnelles des agents affectés au marché ?'],
    ["GSS doit-elle préciser le dispositif de remplacement d'un chien ne pouvant exercer ?", "Pouvez-vous préciser le dispositif de remplacement d'un chien ne pouvant exercer ?"],
    ['Joindre le modèle de rapport journalier au mémoire', 'Pouvez-vous fournir le modèle de rapport journalier au mémoire ?'],
    ["GSS doit préciser le dispositif de remplacement d'un chien.", "Pouvez-vous préciser le dispositif de remplacement d'un chien ?"],
    ['Quel est le partenaire de télésurveillance ?', 'Quel est le partenaire de télésurveillance ?'],
  ])('%s', (q, attendu) => {
    expect(questionOuverte(q)).toBe(attendu);
  });
});

describe('questions sans redite (T2-CONS-7, T2N-7)', () => {
  const emplacements = [
    "Pour le marché de la Mairie d'Etampes, quel délai GSS annonce-t-elle pour une action d’intervention courante, entre la réception du bon de commande et la mise en place des agents ?",
    "Pour le marché de la Mairie d'Etampes, quel délai GSS annonce-t-elle pour une action d’urgence liée à un débordement, entre l'appel de l'acheteur et l'arrivée des agents sur site ?",
    'En cas d’indisponibilité du chien prévu pour la prestation, quelle solution de remplacement GSS met-elle en œuvre et sous quel délai ?',
  ];
  it('donnée déjà demandée par un emplacement, document déjà dans le mémoire : retirés', () => {
    const qs = [
      'Pouvez-vous fournir les CV détaillés, certificats et cartes professionnelles des agents affectés au marché ?',
      'Quels sont les délais maximaux de mise en place d’une intervention courante et de réaction et d’arrivée sur site en urgence liée à un débordement à Étampes ?',
      "Pouvez-vous préciser le dispositif de remplacement d'un chien ne pouvant exercer ?",
      'Pouvez-vous fournir au mémoire le modèle de rapport journalier ?',
    ].map((question) => ({ question }));
    const r = sansQuestionsRedites(qs, { prioritaires: emplacements, texteMemoire: 'Modèle de rapport journalier : date, heure, nom de l’agent.' });
    expect(r.map((x) => x.question)).toEqual(['Pouvez-vous fournir les CV détaillés, certificats et cartes professionnelles des agents affectés au marché ?']);
  });
  it('exigence déjà traitée par une proposition de réponse (D5) : pas de question', () => {
    const q = [{ question: 'Quelle réponse GSS apporte-t-elle sur ce point : « Définir le responsable de la veille réglementaire, sa fréquence, le canal formel de notification au CNRS et le délai de transmission » ?' }];
    expect(sansQuestionsRedites(q, { exigencesProposees: ['Définir le responsable de la veille réglementaire, sa fréquence, le canal formel de notification au CNRS et le délai de transmission des évolutions.'] })).toEqual([]);
  });
  it('une question rattachée à un repère du texte est gardée', () => {
    const q = [{ question: "Pouvez-vous préciser le dispositif de remplacement d'un chien ?", sources: [3] }];
    expect(sansQuestionsRedites(q, { prioritaires: emplacements, garder: () => true })).toHaveLength(1);
  });
});

describe('emplacement seul sous un sous-titre du cadre (T2-CONS-7)', () => {
  it('sous-titre et pièces demandées par le cadre', () => {
    expect(sousTitreDeLEmplacement("• Agrément dirigeant CNAPS : M. MARCHANI Adil.\n\nAgrément et pièces justificatives\n[À COMPLÉTER]\n", 0)).toBe('Agrément et pièces justificatives');
    expect(sousTitreDeLEmplacement('Le délai proposé est de [À COMPLÉTER] heures.', 0)).toBe('');
    const p = piecesDemandeesParLeCadre('Composition des équipes mises à disposition comprenant : Le nombre d’équipes ; La composition des équipes (interlocuteur unique à la ville, encadrants, CV détaillés, agréments, certificats et cartes professionnelles, etc).', 'Agrément et pièces justificatives');
    expect(p).toMatch(/CV détaillés/);
    expect(p).toMatch(/cartes professionnelles/);
  });
});

describe('même question posée deux fois (T2N-7, ifsem 1001)', () => {
  it('échéances du planning : une seule question, repères réunis', () => {
    const qs = [
      { question: 'Pouvez-vous préciser les échéances applicables à l’envoi du planning prévisionnel nominatif (au moins 10 jours ouvrés avant le début du mois suivant), à sa validation par les agents et à sa transmission à l’acheteur, compte tenu du calendrier GSS indiqué au mémoire (J-10, J-7 et J-3) ?', sources: [1] },
      { question: 'GSS confirme-t-elle que le calendrier proposé au mémoire — envoi des plannings à J-10, validation par les agents à J-7 et transmission au CNRS à J-3 — est celui qu’elle appliquera ?', sources: [4] },
    ];
    const r = sansQuestionsRedites(qs, { garder: () => true });
    expect(r).toHaveLength(1);
    expect(r[0].sources).toEqual([1, 4]);
  });
});

// Tour 4, correcteur (T4-COH-6, rejeu cstb) : consolidation indisponible, demande brute sans citation : la clause d'assurance
// n'est pas redemandée quand la question de l'attestation Hiscox la couvre.
describe('clause d\'assurance non redemandée en mode dégradé (T4-COH-6)', () => {
  it('demande brute « Souscrire une assurance… » retirée près de la question Hiscox', () => {
    const qs = [
      { question: "Votre attestation d'assurance (Hiscox, contrat HA RCP0242762) couvre-t-elle ce que demande le CCTP : « souscrira une assurance couvrant la responsabilité du titulaire en cas d'accident, d'incendie ou d'explosion, ainsi que la perte de clés » ? Si oui, quelle garantie et quel montant faut-il indiquer ; sinon, faut-il le signaler à l'acheteur ?" },
      { question: "Souscrire une assurance couvrant la responsabilité du titulaire en cas d'accident, d'incendie ou d'explosion, ainsi que la perte de clés" },
    ];
    const r = sansQuestionsRedites(qs);
    expect(r).toHaveLength(1);
    expect(r[0].question).toMatch(/Hiscox/);
  });
});
