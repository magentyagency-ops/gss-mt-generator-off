/**
 * Tour 4, correcteur (T4N-4, imm) : une ligne de sommaire du CCTP (« Réunions de suivi mensuelles …… 37 ») n'est jamais citée
 * comme exigence ; la phrase du corps de l'article l'est.
 */
import { describe, it, expect } from 'vitest';
import { phraseFrequenceReunionsDce } from '../src/generation/memoire_type';

describe('sommaire du CCTP (T4N-4)', () => {
  it('phrase du corps de l\'article, jamais la ligne du sommaire', () => {
    const dce = [
      'SOMMAIRE',
      'a. Réunions de suivi mensuelles ................................................................................................................. 37',
      'b. Rapport annuel …………………………… 38',
      '',
      'ARTICLE 12 – SUIVI DU MARCHÉ',
      '',
      'a. Réunions de suivi mensuelles',
      '',
      'Le Titulaire participe à une réunion mensuelle de suivi avec le représentant de l\'établissement.',
    ].join('\n');
    const p = phraseFrequenceReunionsDce(dce);
    expect(p).not.toMatch(/\.{5,}|…/);
    expect(p).toMatch(/participe à une réunion mensuelle de suivi/);
  });
});
