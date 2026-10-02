import { describe, it, expect } from 'vitest';
import { questionExacte, motifRefusEngagement } from '../src/generation/memoire_generator';

/** Tour 4 (T4N-9) : questions correctes pour un libellé au pluriel ou qui coordonne plusieurs données. */
describe('questionExacte : pluriel et coordination (T4N-9)', () => {
  it('chaque donnée prend son article', () => {
    expect(questionExacte('taux horaires par qualification et montants de la décomposition, cohérents avec le bordereau de prix remis'))
      .toBe('Pouvez-vous indiquer les taux horaires par qualification et les montants de la décomposition, cohérents avec le bordereau de prix remis ?');
    expect(questionExacte('nom et coordonnées du chef de site')).toBe('Pouvez-vous indiquer le nom et les coordonnées du chef de site ?');
    expect(questionExacte('délai de remplacement et taux de reprise')).toBe('Pouvez-vous indiquer le délai de remplacement et le taux de reprise ?');
    expect(questionExacte('taux horaires par qualification')).toBe('Quels sont les taux horaires par qualification ?');
  });
  it('les libellés simples gardent leur forme', () => {
    expect(questionExacte('nom du chef de site')).toBe('Quel est le nom du chef de site ?');
    expect(questionExacte('date de fin de validité de la carte')).toBe('Quelle est la date de fin de validité de la carte ?');
    expect(questionExacte('taux de reprise du personnel')).toBe('Quel est le taux de reprise du personnel ?');
  });
});

/** Tour 4 (T4C-11, T4C-12) : puces d'engagement qui n'engagent à rien. */
describe('motifRefusEngagement : renvoi à un document de l\'offre, plan du RC (T4C-11, T4C-12)', () => {
  it('renvoi au cadre de réponse technique refusé, sans question', () => {
    const m = motifRefusEngagement('GSS respecte, pour les interventions programmées, les dates et délais du bon de commande ; les délais et conditions de mobilisation des personnels décrits au cadre financier sont indiqués dans le cadre de réponse technique.');
    expect(m).toBeTruthy();
    expect(m).not.toMatch(/sans réponse/);
  });
  it('plan du mémoire imposé par le RC refusé, sans question', () => {
    const m = motifRefusEngagement('GSS présentera les moyens humains et l\'encadrement, la continuité et les situations dégradées, les délais de remplacement et la capacité de renfort, les moyens matériels et outils de suivi, ainsi que la formation, la qualité, la démarche RSE et la cohérence du prix.');
    expect(m).toBe('plan du mémoire imposé par le RC, pas un engagement');
  });
  it('les vrais engagements restent', () => {
    expect(motifRefusEngagement('GSS présentera chaque mois au client un rapport d\'activité, les indicateurs de qualité et le planning du mois suivant.')).toBe('');
    expect(motifRefusEngagement('GSS paramétrera sans surcoût les transmetteurs téléphoniques.')).toBe('');
    expect(motifRefusEngagement('GSS consigne les événements reportés dans la main courante électronique.')).toBe('');
  });
});
