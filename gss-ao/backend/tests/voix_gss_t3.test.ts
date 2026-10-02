import { describe, it, expect } from 'vitest';
import { voixDeGss } from '../src/generation/format_court';

/** Tour 3 (T3C-4, citedia 341) : seul le titulaire du marché à venir est GSS, jamais le titulaire sortant ou un autre. */
describe('voix de GSS : « le titulaire »', () => {
  it('autre titulaire que GSS : inchangé', () => {
    for (const t of ['avec Citédia et, le cas échéant, avec le Titulaire sortant.', 'du titulaire précédent', 'Le titulaire actuel du marché', 'le titulaire du marché sortant', 'le titulaire en place', 'le titulaire entrant', 'le titulaire antérieur']) {
      expect(voixDeGss(t)).toBe(t);
    }
  });
  it('titulaire du marché : GSS', () => {
    expect(voixDeGss('Le titulaire gère les clés.')).toBe('GSS gère les clés.');
    expect(voixDeGss('une copie est remise au titulaire.')).toBe('une copie est remise à GSS.');
    expect(voixDeGss('Le titulaire du marché assure les rondes.')).toBe('GSS assure les rondes.');
    expect(voixDeGss('les consignes du titulaire du marché.')).toBe('les consignes de GSS.');
    expect(voixDeGss('le titulaire du SSIAP 1')).toBe('le titulaire du SSIAP 1');
  });
});
