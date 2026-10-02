import { describe, it, expect } from 'vitest';
import { normComparaison } from '../src/generation/memoire_generator';

/** Tour 4 (T4C-6) : la prime de fin d'année écrite avec l'apostrophe typographique est reconnue comme texte de GSS. */
describe('garde-fou des faits non sourcés : apostrophes typographiques (T4C-6)', () => {
  it('« Prime de fin d’année » (’) est retrouvée dans le mémoire type écrit avec « \' »', () => {
    const doc = normComparaison("Nous avons mis en place une prime de fin d'année qui récompense nos agents").replace(/\s+/g, '');
    expect(doc.includes(normComparaison('Prime de fin d’année').replace(/\s+/g, ''))).toBe(true);
    expect(doc.includes(normComparaison('Prime de fin d‘année').replace(/\s+/g, ''))).toBe(true);
  });
  it('une prime absente du mémoire type reste non sourcée', () => {
    const doc = normComparaison("Nous avons mis en place une prime de fin d'année").replace(/\s+/g, '');
    expect(doc.includes(normComparaison('avance sur salaire').replace(/\s+/g, ''))).toBe(false);
  });
});
