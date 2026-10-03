// Tour 6 (T6N-7) : la coquille « CNPAS » du DCE cstb n'est jamais reprise à la voix de GSS ; les citations restent exactes.
import { describe, it, expect } from 'vitest';
import { voixDeGss } from '../src/generation/format_court';

describe('Sigle CNAPS à la voix de GSS', () => {
  it('corrigé hors citation, gardé dans une citation du DCE', () => {
    expect(voixDeGss("GSS affectera des agents disposant de l'agrément préfectoral CNPAS exigé par le CCP.")).toBe("GSS affectera des agents disposant de l'agrément préfectoral CNAPS exigé par le CCP.");
    expect(voixDeGss('| Intervenant rondier | Agrément préfectoral CNPAS | 4 |')).toBe('| Intervenant rondier | Agrément préfectoral CNAPS | 4 |');
    expect(voixDeGss('Le CCP exige « un agrément préfectoral CNPAS ».')).toBe('Le CCP exige « un agrément préfectoral CNPAS ».');
  });
});
