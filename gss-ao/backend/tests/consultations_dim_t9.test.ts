import { describe, it, expect } from 'vitest';
import { questionDelaiInapplicable } from '../src/generation/base_memoires';
import { questionDimensionnement } from '../src/generation/dimensionnement';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-not-used';
import { MemoireGenerator } from '../src/generation/memoire_generator';

/** Tour 9 (T9N-2) : la proposition de dimensionnement n'est jamais retirée par le filtre des délais hors Normandie. */
const DIM = { profils: [{ profil: 'Intervenant rondier', qualification: 'CNAPS', lieux: [], heuresSemaine: 96, heuresAn: 4992, etp: 3.11, titulaires: 4 }], titulaires: 4, suppleants: 2, casPratique: [] };
const DCE = 'Rondes du site de Grenoble, 38400 Saint-Martin-d’Hères. Ronde de nuit : 3 rondes.';

describe('proposition de dimensionnement hors Normandie (T9N-2)', () => {
  it('questionDelaiInapplicable : jamais vrai pour une proposition à valider ni pour un volume horaire', () => {
    const q = questionDimensionnement(DIM as any);
    expect(q).toMatch(/Intervenant rondier : 4 titulaires pour 96 h par semaine/);
    expect(questionDelaiInapplicable(q, DCE, true)).toBe(false);
    expect(questionDelaiInapplicable('Combien d’intervenants pour 96 h par semaine ?', DCE, true)).toBe(false);
    // Une vraie question de délai absente du DCE reste retirée hors Normandie.
    expect(questionDelaiInapplicable("GSS confirme-t-elle un délai maximal de 60 minutes pour l'arrivée de l'agent d'astreinte ?", DCE, true)).toBe(true);
  });
  it('consoliderAvecSources : la proposition reste dans les consultations hors Normandie', async () => {
    const gen: any = new MemoireGenerator();
    gen.consoliderAvecSourcesBrut = async (l: string[]) => l.map((question, i) => ({ question, sources: [i] }));
    const q = questionDimensionnement(DIM as any);
    const r = await gen.consoliderAvecSources([q, "GSS confirme-t-elle un délai maximal de 60 minutes pour l'arrivée de l'agent d'astreinte ?"], { dce: DCE, horsNormandie: true });
    expect(r.map((x: any) => x.question)).toEqual([q]);
  });
});
