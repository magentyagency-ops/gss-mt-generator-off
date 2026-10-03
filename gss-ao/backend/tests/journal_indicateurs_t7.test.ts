import { describe, it, expect, vi } from 'vitest';
import { chargerMemoireType, evaluerIndicateurs, reinitialiserJournalIndicateurs } from '../src/generation/memoire_type';

/** Tour 7 (T7-COH-6) : chaque décision d'indicateur n'est écrite qu'une fois par génération au journal. */
describe('journal des indicateurs', () => {
  it('écrit une fois, même si les indicateurs sont évalués plusieurs fois ; de nouveau après remise à zéro', () => {
    const mt = chargerMemoireType();
    const ctx = { dce: 'Gardiennage du site. '.repeat(150), analyse: { clientName: 'X', operationalSummary: { agentProfiles: 'Agents SSIAP 1' } } } as any;
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      reinitialiserJournalIndicateurs();
      const ssiap = () => spy.mock.calls.filter((c) => /Indicateur SSIAP : écarté/.test(String(c[0]))).length;
      for (let i = 0; i < 5; i++) evaluerIndicateurs(mt, ctx);
      expect(ssiap()).toBe(1);
      reinitialiserJournalIndicateurs();
      evaluerIndicateurs(mt, ctx);
      expect(ssiap()).toBe(2);
    } finally { spy.mockRestore(); }
  });
});
