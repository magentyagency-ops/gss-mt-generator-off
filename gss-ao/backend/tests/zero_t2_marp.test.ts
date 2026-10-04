// Campagne « zéro défaut », tour 2 : pagination (T2-REG-1).
import { describe, it, expect } from 'vitest';
import { decouperPagesTexte, splitIntoSlideChunks } from '../src/generation/marp_generator';
import { LIMITES_MARINE_V3 } from '../src/generation/marp_pages_marine';

describe('deux tableaux distincts de même en-tête restent deux tableaux (T2-REG-1)', () => {
  const t = "Planning des deux sites.\n\n| Poste | Horaires |\n|---|---|\n| Agent SSIAP 1 | 7h-19h |\n| Agent SSIAP 1 | 19h-7h |\n\n| Poste | Horaires |\n|---|---|\n| Agent ADS | 8h-18h |\n| Agent ADS | 18h-8h |\n\nFin.";
  const enTetes = (pages: string[]) => (pages.join('\n').match(/\| Poste \| Horaires \|/g) || []).length;
  it('retour arrière, style par défaut et style marine', () => {
    expect(enTetes(decouperPagesTexte(t, true))).toBe(2);
    expect(enTetes(splitIntoSlideChunks(t))).toBe(2);
    expect(enTetes(splitIntoSlideChunks(t, LIMITES_MARINE_V3 as any))).toBe(2);
  });
});
