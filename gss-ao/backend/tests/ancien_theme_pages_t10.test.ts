// T10N-5 : mémoire type (v2) rendu dans le thème de retour arrière « gss-2026-09 » : 2 pages de texte au plus quand elles
// suffisent (main courante : 3 pages de 7, 20 et 6 lignes avant), jamais un sous-titre ni une amorce de liste en bas de page.
import { describe, it, expect } from 'vitest';
import { MarpGenerator } from '../src/generation/marp_generator';
import { chargerMemoireType } from '../src/generation/memoire_type';

describe('pages de texte du thème gss-2026-09 avec le mémoire type (T10N-5)', () => {
  const mt = chargerMemoireType();
  const texte = (id: string) => String(mt.rubriques.find((r) => r.id === id)!.texte).replace(/\{\{#si [^}]+\}\}|\{\{\/si\}\}/g, '').replace(/\{\{[^}]+\}\}/g, 'Trackforce');
  const pages = (id: string, theme = 'gss-2026-09') => MarpGenerator.enumerateContentSlides([{ key: 'IV', title: 'Moyens', sections: [{ id, title: id, text: texte(id), texteSeul: true }] } as any], theme);
  for (const id of ['b4_main_courante', 'b2_ecologie_energie_recyclage', 'b2_catalogue']) {
    it(`${id} : 2 pages au plus, aucune page qui finit sur un sous-titre ou une amorce`, () => {
      const p = pages(id);
      expect(p.length).toBeLessThanOrEqual(2);
      for (const s of p) expect(s.text.trim()).not.toMatch(/(?:^|\n)(?:#{1,6} [^\n]*|\*\*[^*\n]+\*\*|[^\n]*:)\s*$/);
    });
  }
  it('thème de la refonte (marine) : découpage inchangé', () => {
    expect(pages('b4_main_courante', 'marine').length).toBe(1);
  });
});
