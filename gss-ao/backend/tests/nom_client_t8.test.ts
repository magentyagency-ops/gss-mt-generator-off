import { describe, it, expect } from 'vitest';
import { formesClient, teteNominale } from '../src/generation/memoire_type';

/** Tour 8 (T8-COH-4) : nom long de l'acheteur, forme courte jamais réduite à la forme juridique ni absente. */
describe('forme courte d’un nom long (T8-COH-4)', () => {
  it('nom propre après la forme juridique, avec l’article que le DCE emploie (EPCC Opéra de Rouen Normandie)', () => {
    const f = formesClient('Établissement public de coopération culturelle Opéra de Rouen Normandie', "L'Opéra de Rouen Normandie confie la surveillance du Théâtre des Arts.");
    expect(f.court).toMatchObject({ article: "l'", nom: 'Opéra de Rouen Normandie' });
  });
  it('EPIC : le nom d’usage, sans article inventé', () => {
    const f = formesClient('Établissement public industriel et commercial Rouen Normandie Tourisme & Congrès', 'Établissement public industriel et commercial Rouen Normandie Tourisme & Congrès. 76000 Rouen.');
    expect(f.court).toMatchObject({ article: '', nom: 'Rouen Normandie Tourisme & Congrès' });
  });
  it('syndicat : tête nominale avec ses compléments coordonnés (« à vocation multiple »)', () => {
    expect(teteNominale("Syndicat intercommunal à vocation multiple de la région d'Yvetot")).toBe('Syndicat intercommunal à vocation multiple');
    expect(teteNominale('Syndicat mixte de gestion des déchets ménagers et assimilés de la région elbeuvienne')).toBe('Syndicat mixte');
    expect(formesClient("Syndicat intercommunal à vocation multiple de la région d'Yvetot", '').court).toMatchObject({ article: 'le', nom: 'Syndicat intercommunal à vocation multiple' });
  });
});
