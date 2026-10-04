/**
 * Tour 4, correcteur (T4N-3, havre2 1352) : le numéro de l'agrément de l'entreprise, connu et imprimé, n'est jamais redemandé ;
 * le marqueur du modèle qui le demandait est réduit à la donnée inconnue ; la question restante sur les dates CNAPS est la
 * question unique de questions_gss_une_fois.
 */
import { describe, it, expect } from 'vitest';
import { sansDonneesCnapsConnues } from '../src/generation/base_memoires';
import { completerIdentiteCnaps } from '../src/generation/memoire_generator';

describe('données CNAPS connues jamais redemandées (T4N-3)', () => {
  it('« le numéro de l\'agrément de l\'entreprise » retiré de la question, seul : question retirée', () => {
    expect(sansDonneesCnapsConnues('Pouvez-vous fournir les dates de fin de validité de l’autorisation d’exercer et le numéro de l’agrément de l’entreprise ?')).toBe('Pouvez-vous fournir les dates de fin de validité de l’autorisation d’exercer ?');
    expect(sansDonneesCnapsConnues("Quel est le numéro de l'agrément de l'entreprise ?")).toBeNull();
  });
  it('marqueur [CONSULTATION REQUISE] réduit à la donnée inconnue quand la valeur connue est écrite', () => {
    const champ = "• Agrément de l’entreprise : [À COMPLÉTER].\n[CONSULTATION REQUISE : Transmettre les dates de fin de validité de l’autorisation d’exercer et le numéro de l’agrément de l’entreprise.]";
    const r = completerIdentiteCnaps(champ);
    expect(r).toContain('• Agrément de l’entreprise : AUT-076-2114-02-12-20140458592.');
    expect(r).not.toMatch(/numéro de l’agrément/);
    expect(completerIdentiteCnaps("• Agrément de l’entreprise : [À COMPLÉTER].\n[CONSULTATION REQUISE : Quel est le numéro de l'agrément de l'entreprise ?]")).not.toMatch(/CONSULTATION/);
  });
});
