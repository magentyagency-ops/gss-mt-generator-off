import { describe, it, expect } from 'vitest';
import { questionExacte, questionCaseTableau } from '../src/generation/memoire_generator';

/** Tour 8 (T8CS-4) : questions du cadre sans consolidation par le modèle, dans la forme des cartes de l'assistant. */
describe('consultations du cadre sans consolidation (T8CS-4)', () => {
  it('case de tableau : jamais la forme interne « Colonne: … | Ligne: … »', () => {
    expect(questionExacte('Colonne: "Date de délivrance de l’autorisation d’exercer / Date d’obtention" | Ligne: "Autorisation dirigeant | "'))
      .toBe('Tableau du cadre, ligne « Autorisation dirigeant », colonne « Date de délivrance de l’autorisation d’exercer — Date d’obtention » : quelle valeur faut-il écrire ?');
    expect(questionCaseTableau('C.Q.P.A.D.S. | [CHAMP_28]', 'Formations suivies par les agents / Prénom'))
      .toBe('Tableau du cadre, ligne « C.Q.P.A.D.S. », colonne « Formations suivies par les agents — Prénom » : quelle valeur faut-il écrire ?');
  });
  it('intitulé numéroté d’une partie du cadre : l’information à écrire dans sa réponse', () => {
    expect(questionExacte('3.1 Les moyens humains assignés à la mission')).toBe('Quelle information faut-il écrire dans la réponse à « 3.1 Les moyens humains assignés à la mission » ?');
  });
  it('les autres formes sont inchangées', () => {
    expect(questionExacte('Quel est le délai ?')).toBe('Quel est le délai ?');
    expect(questionExacte('Réponse à relire : X')).toBe('Réponse à relire : X');
  });
});
