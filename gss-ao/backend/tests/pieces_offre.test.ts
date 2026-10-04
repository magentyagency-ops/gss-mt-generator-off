import { describe, it, expect } from 'vitest';
import { PIECES_OFFRE, motifRefusEngagement } from '../src/generation/memoire_generator';

/** Tour 1 (R1-2) : seule une phrase qui parle de remplir ou chiffrer une pièce financière est écartée ; un engagement de
 *  service qui cite le bordereau (Becquerel, 48 heures ouvrées) reste dans le mémoire et dans les exigences. */
describe('PIECES_OFFRE', () => {
  it('écarte le remplissage d’une pièce financière (imm 15)', () => {
    expect(PIECES_OFFRE.test('GSS complétera le BPU des prestations ponctuelles avec des taux distincts.')).toBe(true);
    expect(PIECES_OFFRE.test('Le candidat renseigne la DPGF jointe au dossier.')).toBe(true);
    expect(PIECES_OFFRE.test('Le DQE doit être complété et signé.')).toBe(true);
  });
  it('garde un engagement de service qui cite le BPU (Becquerel)', () => {
    expect(PIECES_OFFRE.test('Renforts exceptionnels commandés sur la base du BPU avec un délai de prévenance de 48 heures ouvrées')).toBe(false);
    expect(PIECES_OFFRE.test('- GSS répond aux prestations exceptionnelles de renfort commandées sur la base du BPU par bon de commande avec un délai de prévenance de 48 heures ouvrées.')).toBe(false);
  });
  it('garde les pièces de l’offre déjà écartées avant la refonte', () => {
    expect(PIECES_OFFRE.test('Le mémoire technique limité à 20 pages')).toBe(true);
    expect(PIECES_OFFRE.test('Acte d’engagement signé')).toBe(true);
  });
});

/** Tour 1 (T1C-02, B7) : puces d'engagement jamais remises. */
describe('motifRefusEngagement', () => {
  it('refuse les phrases sur le mémoire et les faits interdits', () => {
    expect(motifRefusEngagement('GSS précise le nombre d’agents présents au centre de permanence.')).not.toBe('');
    expect(motifRefusEngagement('GSS précise dans le mémoire technique le nombre de contrôleurs affectés au site.')).not.toBe('');
    expect(motifRefusEngagement('GSS indiquera les effectifs.')).not.toBe('');
    expect(motifRefusEngagement('GSS forme les agents sous-traitants aux consignes et pratiques de l’EPCF et n’affecte que des agents ainsi formés.')).not.toBe('');
    expect(motifRefusEngagement('En cas de recours à un tiers, GSS forme ses agents.')).not.toBe('');
  });
  it('garde un engagement de service', () => {
    expect(motifRefusEngagement('GSS transmet le planning mensuel au plus tard 15 jours avant le début du mois.')).toBe('');
    expect(motifRefusEngagement('Les agents sont formés aux consignes et pratiques de l’EPCF avant toute affectation.')).toBe('');
    expect(motifRefusEngagement('- GSS répond aux prestations exceptionnelles de renfort commandées sur la base du BPU par bon de commande avec un délai de prévenance de 48 heures ouvrées.')).toBe('');
  });
});

import { questionDEngagement } from '../src/generation/memoire_generator';
describe('questionDEngagement', () => {
  it('formule une question exacte', () => {
    expect(questionDEngagement('GSS précise dans le mémoire technique le nombre de contrôleurs affectés au site.')).toMatch(/^Combien de contrôleurs seront affectés au site \?/);
    expect(questionDEngagement('GSS précise le nombre d’agents présents au centre de permanence.')).toMatch(/^Combien d’agents seront présents au centre de permanence \?/);
  });
});

/** Tour 2 (T2C-3, cstb 221, b4_equipements) : « s'engage à préciser… » parle du mémoire au lieu de répondre. */
describe('motifRefusEngagement — infinitif et « s’engage à »', () => {
  const cstb = 'GSS s’engage à préciser les moyens matériels envisagés pour la prestation et son suivi, notamment le nombre de véhicules affectés, avec distinction jour/nuit si pertinente, les téléphones et leurs fonctionnalités.';
  it('refuse la promesse de donner l’information', () => {
    expect(motifRefusEngagement(cstb)).toMatch(/sans réponse/);
    expect(motifRefusEngagement('GSS s’engage à indiquer les effectifs affectés au site.')).toMatch(/sans réponse/);
    expect(motifRefusEngagement('GSS s’engage à communiquer le nombre d’agents.')).toMatch(/sans réponse/);
    expect(motifRefusEngagement('GSS va préciser le nombre de véhicules dans son offre.')).toMatch(/sans réponse/);
  });
  it('en tire une vraie question', () => {
    const q = questionDEngagement(cstb);
    expect(q).toMatch(/\?$/);
    expect(q).toMatch(/véhicules affectés/);
    expect(q).not.toMatch(/s’engage/);
  });
  it('garde un engagement de service', () => {
    expect(motifRefusEngagement('GSS s’engage à remplacer tout agent absent sous 2 heures.')).toBe('');
    expect(motifRefusEngagement('GSS transmet le planning mensuel au plus tard 10 jours avant le début du mois.')).toBe('');
  });
});

// Tour 4, correcteur (T4-COH-5, ign) : question tirée d'un engagement refusé, toujours avec son verbe à l'infinitif.
describe('questionDEngagement : verbe à l\'infinitif (T4-COH-5)', () => {
  it('verbe gardé quel que soit le début de l\'objet, verbes coordonnés au futur mis à l\'infinitif', () => {
    expect(questionDEngagement('GSS fournira dès la notification les scénarios servant à l’exercice trimestriel organisé par le SAIMG et se coordonnera avec l’intervenant ascenseurs pour la formation à la désincarcération.'))
      .toBe('Que prévoyez-vous pour fournir dès la notification les scénarios servant à l’exercice trimestriel organisé par le SAIMG et vous coordonner avec l’intervenant ascenseurs pour la formation à la désincarcération ?');
    expect(questionDEngagement('GSS transmettra au SAIMG un rapport pour chaque évaluation et mettra en place un plan d’action sous 15 jours si les connaissances sont insuffisantes.'))
      .toBe('Que prévoyez-vous pour transmettre au SAIMG un rapport pour chaque évaluation et mettre en place un plan d’action sous 15 jours si les connaissances sont insuffisantes ?');
    expect(questionDEngagement('GSS fournira chaque mois au client le planning nominatif des agents.')).toBe('Que prévoyez-vous pour fournir chaque mois au client le planning nominatif des agents ?');
    expect(questionDEngagement('GSS organisera une visite du site avant la prise de service.')).toBe('Que prévoyez-vous pour organiser une visite du site avant la prise de service ?');
  });
});
