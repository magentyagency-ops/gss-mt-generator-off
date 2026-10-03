import { describe, it, expect } from 'vitest';
import { regrouperQuestions, type ElementACompleter } from '../src/generation/completion';

/** Tour 7 (T7N-3) : deux questions de délai différentes (etampes2 553) ne restent jamais dans le même groupe. */
describe('groupes après réécriture des questions de délai du cadre (T7N-3)', () => {
  it('intervention courante et action d’urgence : deux groupes, deux cartes', () => {
    const g = 'preciser les delais d intervention d urgence et de mise en place d une prestation commandee hors normandie';
    const els: ElementACompleter[] = [
      { cle: 'GSS_AC_1', question: "Marché hors Normandie : quel délai GSS annonce-t-elle pour une intervention courante, entre la réception du bon de commande et la mise en place des agents ?", contexte: 'Délai proposé pour une intervention courante : [À COMPLÉTER].', statut: 'ouvert', groupe: g },
      { cle: 'GSS_AC_2', question: "Marché hors Normandie : quel délai GSS annonce-t-elle pour une action d'urgence, entre l'appel de l'acheteur et l'arrivée des agents sur site ?", contexte: "Délai proposé pour une action d'urgence : [À COMPLÉTER].", statut: 'ouvert', groupe: g },
      { cle: 'GSS_AC_3', question: 'Quel est le numéro de téléphone de la permanence ?', contexte: 'Téléphone : [À COMPLÉTER]', statut: 'ouvert', groupe: 'telephone' },
      { cle: 'GSS_AC_4', question: 'Quel est le numéro de téléphone de la permanence ?', contexte: 'Joignable au [À COMPLÉTER]', statut: 'ouvert', groupe: 'permanence' },
    ];
    regrouperQuestions(els);
    expect(els[0].groupe).not.toBe(els[1].groupe);
    expect(els[2].groupe).toBe(els[3].groupe);
  });
});
