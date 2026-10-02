import { describe, it, expect } from 'vitest';
import { questionExacte } from '../src/generation/memoire_generator';

/** Tour 3 : questions à GSS exactes. */
describe('questions exactes à GSS (tour 3)', () => {
  it('T3C-7 : une personne à désigner, jamais « Quelle donnée faut-il indiquer ici »', () => {
    const q = questionExacte("Information à fournir : Chargé d'affaires dédié");
    expect(q).toMatch(/^Qui sera le chargé d'affaires dédié pour ce marché \(nom, fonction et téléphone\) \?/);
    expect(q).toMatch(/MARCHANI Adil, responsable de marché et interlocuteur unique de GSS, peut-il être indiqué \?$/);
    expect(questionExacte('Valeur à fournir : Chef de poste')).toBe('Qui sera le chef de poste pour ce marché (nom, fonction et téléphone) ?');
    expect(questionExacte('Information à fournir : Nombre de véhicules')).toBe('Combien de véhicules ?');
    for (const x of ["Information à fournir : Chargé d'affaires dédié", 'Information à fournir : Délai de mobilisation']) expect(questionExacte(x)).not.toMatch(/\bici\b/);
  });
});
