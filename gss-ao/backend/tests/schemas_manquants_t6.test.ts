// Tour 6 (T6-COH-4, T6N-6) : une page de schéma prévue et absente du document rendu est signalée à GSS.
import { describe, it, expect } from 'vitest';
import { rubriquesSansSchema } from '../src/generation/memoire_generator';

const plan: any = { rubriques: [
  { id: 'b1_comprehension', titre: 'Notre compréhension de votre besoin', mode: 'besoin', schema: null },
  { id: 'b2_references_intro', titre: 'Nos références', mode: 'fixe', schema: null },
  { id: 'b4_rondes', titre: 'Les rondes', mode: 'fixe', schema: { source: 'spec' } },
  { id: 'b4_lmc', titre: 'Le LMC', mode: 'fixe', schema: { source: 'bibliotheque', ref: 'II-X' } },
] };
const textes = { b1_comprehension: 'x', b2_references_intro: 'x', b4_rondes: 'x', b4_lmc: 'x', v2_q_docs: 'x' };

describe('Pages de schéma manquantes', () => {
  it('compréhension en tête, rubriques à schéma prévu et propositions ; jamais une rubrique sans schéma prévu', () => {
    const l = rubriquesSansSchema(plan, [{ id: 'v2_q_docs', title: 'Documents réglementaires de vigilance' }], textes, new Map([['b4_lmc#schema', '<svg/>']]));
    expect(l.map((x) => x.id)).toEqual(['b1_comprehension', 'b4_rondes', 'v2_q_docs']);
    expect(l[0].besoin).toBe(true);
  });
  it('tout est dessiné : rien à signaler', () => {
    const tous = new Map(Object.keys(textes).map((id) => [`${id}#schema`, '<svg/>']));
    expect(rubriquesSansSchema(plan, [{ id: 'v2_q_docs', title: 'D' }], textes, tous)).toEqual([]);
  });
});
