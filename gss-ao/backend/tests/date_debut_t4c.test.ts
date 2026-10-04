/**
 * Tour 4, correcteur (T4G-4, T4G-7) : date de début du marché lue sous toutes ses formes et écrite sous une forme unique
 * (« 1er janvier 2027 »), jamais avec la casse du DCE ; jamais une date de remise des offres ni de notification.
 */
import { describe, it, expect } from 'vitest';
import { dateDebutMarche } from '../src/generation/memoire_type';

describe('date de début du marché (T4G-4, T4G-7)', () => {
  it('forme unique, quelle que soit la casse du DCE', () => {
    expect(dateDebutMarche('Les prestations débuteront à compter du 1er Janvier 2027.')).toBe('1er janvier 2027');
    expect(dateDebutMarche('LE MARCHE DEBUTE LE 1ER JANVIER 2027')).toBe('1er janvier 2027');
    expect(dateDebutMarche('Le marché débutera le 15 MARS 2027.')).toBe('15 mars 2027');
  });
  it('tournures et mises en forme courantes', () => {
    for (const t of ['La prestation démarre le 1er janvier 2027.', 'Le marché est exécuté à compter du 1er janvier 2027.', "Période d'exécution : du 1er janvier 2027 au 31 décembre 2027.",
      'Les prestations sont exécutées du 1er janvier 2027 au 31 décembre 2027.', 'Date prévisionnelle de début des prestations | 1er janvier 2027',
      'Date prévisionnelle de début des prestations      01/01/2027', 'Date prévisionnelle de début des prestations\n01/01/2027']) expect(dateDebutMarche(t), t).toBe('1er janvier 2027');
  });
  it('jamais une date de remise des offres ni de notification', () => {
    expect(dateDebutMarche('Date limite de remise des offres : 12/11/2026.')).toBe('');
    expect(dateDebutMarche('La notification du marché interviendra le 1er décembre 2026.')).toBe('');
  });
});
