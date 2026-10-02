// T3N-8 : titres des réponses du cadre dans le premier message de l'assistant, comme dans les consultations (havre2 335).
import { describe, it, expect } from 'vitest';
import { libelleChampEtat } from '../src/generation/memoire_generator';

describe('libellé d’une réponse du cadre dans l’état (T3N-8)', () => {
  it('question numérotée sous une autre section : la question seule', () => {
    expect(libelleChampEtat('2.1 L’organisation mise en place pour le contrôle de la prestation,', '2.3 Le centre de permanence téléphonique et la personne référente joignable 24h/24h'))
      .toBe('2.3 Le centre de permanence téléphonique et la personne référente joignable 24h/24h');
  });
  it('paragraphe de consigne : le titre de la section seul, sans capitales', () => {
    expect(libelleChampEtat('MESURES ET INITIATIVES SOCIETALES MISES EN PLACE DANS LE CADRE DE LA PRESTATION', 'Le renvoi vers un rapport général de la responsabilité sociétale de l’entreprise (du groupe) est à proscrire.'))
      .toBe('Mesures et initiatives societales mises en place dans le cadre de la prestation');
    expect(libelleChampEtat('Moyens humains', 'Le soumissionnaire décrit les moyens…')).toBe('Moyens humains');
  });
  it('cas ordinaires inchangés', () => {
    expect(libelleChampEtat('3. Moyens', 'Les qualifications des agents')).toBe('3. Moyens — Les qualifications des agents');
    expect(libelleChampEtat('', 'Question seule')).toBe('Question seule');
    expect(libelleChampEtat('Titre', 'Titre et suite')).toBe('Titre et suite');
  });
});
