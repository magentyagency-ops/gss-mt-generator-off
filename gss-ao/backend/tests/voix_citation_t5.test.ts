import { describe, it, expect } from 'vitest';
import { voixDeGss } from '../src/generation/format_court';

/** Tour 5 (T5CP-6, cstb 551) : une citation du DCE entre guillemets reste mot pour mot, jamais réécrite à la voix de GSS. */
describe('voix de GSS : citations du DCE gardées', () => {
  it('citation entre « » : inchangée', () => {
    const t = '- **« Le titulaire devra donc veiller à éviter des changements trop fréquents »** : nous préparons les passations';
    expect(voixDeGss(t)).toBe(t);
    expect(voixDeGss('« une copie est remise au titulaire » ; le titulaire gère les clés.')).toBe('« une copie est remise au titulaire » ; GSS gère les clés.');
  });
  it('citation entre guillemets droits ou anglais : inchangée', () => {
    expect(voixDeGss('"Le titulaire assure les rondes" : le titulaire du marché les trace.')).toBe('"Le titulaire assure les rondes" : GSS les trace.');
    expect(voixDeGss('“Le titulaire assure les rondes”.')).toBe('“Le titulaire assure les rondes”.');
  });
  it('hors citation : toujours à la voix de GSS', () => {
    expect(voixDeGss('Le titulaire gère les clés.')).toBe('GSS gère les clés.');
  });
});
