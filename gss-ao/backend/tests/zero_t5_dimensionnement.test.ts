/** Tour 5, correcteur : poste dédié jamais écarté comme optionnel, poste mobilisé à la demande écarté (T5N-7), citation de
 *  l'alerte coupée sur une fin de mot (T5N-8). */
import { describe, it, expect } from 'vitest';
import { posteOptionnel, citationCourte } from '../src/generation/dimensionnement';

describe('poste optionnel (T5N-7)', () => {
  it('1er SSIAP1 dédié de 21h à 9h, « mobilisable … pour des interventions à la demande » : compté', () => {
    expect(posteOptionnel("La mise en place d’un 1er SSIAP1 avec qualification CQP APS dédié de 21h à 9h, toute l’année du lundi au samedi, et 24h/24 les dimanches et jours fériés et mobilisable pour toutes interventions incluses et pour des interventions à la demande le reste du temps", 'SSIAP1')).toBe(false);
  });
  it('« La mobilisation à la demande d’un second SSIAP1 » : écarté', () => {
    expect(posteOptionnel("La mobilisation à la demande d’un second SSIAP1 avec qualification CQP APS de 22h à 6h les soirs d'événements", 'SSIAP1')).toBe(true);
  });
  it('règles antérieures inchangées', () => {
    expect(posteOptionnel('Un agent de sécurité en option de 8h à 18h', 'ADS')).toBe(true);
    expect(posteOptionnel("Un agent assure l'ouverture des salles à la demande des enseignants de 8h à 18h", 'ADS')).toBe(false);
  });
});

describe('citation de l\'alerte (T5N-8)', () => {
  it('coupée sur une fin de mot avec « … »', () => {
    const c = citationCourte("La mise en place d’un 1er SSIAP1 avec qualification CQP APS dédié de 21h à 9h, toute l’année du lundi au samedi, et 24h/24 les dimanches et jours fériés", 120);
    expect(c.endsWith('…')).toBe(true);
    expect(c).not.toMatch(/24h\/…$|24h\/$/);
  });
});
