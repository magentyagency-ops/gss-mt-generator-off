// Tour 2 (T2N-8, vitry 202) : libellé des propositions du cadre réduit à l'intitulé de la question, sans paragraphe de
// consigne, barème, pointillés ni fragments de tableau.
import { describe, it, expect } from 'vitest';
import { libelleQuestionCadre } from '../src/generation/memoire_type_cadre';

describe('libellé des questions du cadre (T2N-8)', () => {
  it('critère et sous-critère de grille', () => {
    expect(libelleQuestionCadre("SOUS CRITERE 1 : Mises en situation (sur 20 points) ; DESCRIPTION DES ATTENTES DE L’ACHETEUR ; Sous critère 1 : Mises en situation : Vous devez assurer la sécurité d’un forum (mise en situation 1) d’un concert (mise en situation 2) (voir plans joints) .")).toBe('Sous-critère 1 : Mises en situation');
    expect(libelleQuestionCadre('CRITERE 3 : PERFORMANCE ENVIRONNEMENTALE (sur 15 points) ; ) ; DESCRIPTION DES ATTENTES DE L’ACHETEUR ; Qualité des mesures')).toBe('Critère 3 : Performance environnementale');
    expect(libelleQuestionCadre('Critère démarche environnementale – sur 100 points – pondération 10% ; Mesures mises en œuvre')).toBe('Critère démarche environnementale');
  });
  it('tableau de références : pointillés, années et montants vides retirés', () => {
    expect(libelleQuestionCadre('2023 - Dénomination sociale (public ou privé) ; – n° de téléphone du contact dans cet établissement ; - Montant annuel HT ; 2025 : ….. € ; 2024 : ….. € ; 2023 :'))
      .toBe('Dénomination sociale (public ou privé) ; n° de téléphone du contact dans cet établissement ; Montant annuel HT');
  });
  it('question ordinaire inchangée, longue coupée à un mot entier', () => {
    expect(libelleQuestionCadre('3.1 Les moyens humains assignés à la mission :')).toBe('3.1 Les moyens humains assignés à la mission');
    const l = libelleQuestionCadre(`Organisation ${'des moyens humains et matériels '.repeat(10)}`);
    expect(l.length).toBeLessThanOrEqual(161);
    expect(l).toMatch(/\S…$/);
    expect(l).not.toMatch(/matéri…$/);
  });
});
