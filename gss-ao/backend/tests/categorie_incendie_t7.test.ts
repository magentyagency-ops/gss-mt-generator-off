import { describe, it, expect } from 'vitest';
import { categorieDe } from '../src/generation/dimensionnement';

/** Tour 7 (T7N-7) : l'agent de sécurité incendie du DQE (sans « SSIAP 1 » dans le libellé) n'est pas un agent de sécurité générique. */
describe('categorieDe : agent de sécurité incendie', () => {
  it('libellé du DQE d’etampes2 « Agent de sécurité incendie »', () => {
    expect(categorieDe('Agent de sécurité incendie')).toBe('Agent de sécurité incendie');
    expect(categorieDe('Agent de securite incendie')).toBe('Agent de sécurité incendie');
    expect(categorieDe('Agent incendie')).toBe('Agent de sécurité incendie');
    expect(categorieDe('Agent SSIAP 1')).toBe('Agent de sécurité incendie');
  });
  it('les autres catégories ne changent pas', () => {
    expect(categorieDe('Agent de sécurité')).toBe('Agent de sécurité');
    expect(categorieDe('Agent de sécurité (ADS)')).toBe('Agent de sécurité');
    expect(categorieDe('Maître-chien')).toBe('Agent cynophile');
    expect(categorieDe('Chef d\'équipe SSIAP 2')).toBe('Chef d\'équipe de sécurité incendie');
    expect(categorieDe('Encadrant')).toBe('Encadrant');
    expect(categorieDe('Agent de sécurité ADS et SSIAP 1')).toBe('Agent de sécurité');
  });
});
