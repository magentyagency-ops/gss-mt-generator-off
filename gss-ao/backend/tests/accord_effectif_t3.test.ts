// T3C-6 : effectif publiposté égal à 1 accordé au singulier (havre2 341 : « une équipe de 1 agents titulaires »).
import { describe, it, expect } from 'vitest';
import { accorderEffectifUn } from '../src/generation/memoire_type';

describe('accord d’un effectif égal à 1 (T3C-6)', () => {
  it('singulier pour 1, pluriel inchangé ailleurs', () => {
    expect(accorderEffectifUn('Nous mettons en place une équipe de 1 agents titulaires, qui assurent les missions de façon régulière.'))
      .toBe('Nous mettons en place une équipe de 1 agent titulaire, qui assure les missions de façon régulière.');
    expect(accorderEffectifUn('une équipe suppléante de 1 agents formés au site')).toBe('une équipe suppléante de 1 agent formé au site');
    expect(accorderEffectifUn('une équipe de 21 agents titulaires, qui assurent')).toBe('une équipe de 21 agents titulaires, qui assurent');
    expect(accorderEffectifUn('soit 0,1 agents')).toBe('soit 0,1 agents');
  });
});
