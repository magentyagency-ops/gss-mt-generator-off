// T3C-8 : une question à GSS ne redemande jamais un numéro CNAPS déjà connu du registre (havre2 341).
import { describe, it, expect } from 'vitest';
import { sansDonneesCnapsConnues } from '../src/generation/base_memoires';

describe('données CNAPS connues retirées des questions (T3C-8)', () => {
  it('numéro de l’agrément du dirigeant retiré', () => {
    expect(sansDonneesCnapsConnues("Pour l'autorisation d'exercer du dirigeant, quels sont le numéro, la date d'obtention et la date de fin de validité ?"))
      .toBe("Pour l'autorisation d'exercer du dirigeant, quelles sont la date d'obtention et la date de fin de validité ?");
  });
  it('entreprise : numéro et date d’obtention connus, seule la fin de validité reste', () => {
    expect(sansDonneesCnapsConnues("Pour l'autorisation d'exercer de l'entreprise, quels sont le numéro, la date d'obtention et la date de fin de validité ?"))
      .toBe("Pour l'autorisation d'exercer de l'entreprise, quelle est la date de fin de validité ?");
  });
  it('question réduite au numéro : retirée', () => {
    expect(sansDonneesCnapsConnues("Quel est le numéro d'agrément du dirigeant ?")).toBeNull();
  });
  it('questions sans donnée connue, ou sur les agents : inchangées', () => {
    for (const q of [
      'Quelle est la date de fin de validité de l’autorisation d’exercer de GLOBAL SECURITY SERVICES délivrée par le CNAPS ?',
      'Quelles sont les dates de délivrance et de fin de validité de l’agrément CNAPS du dirigeant Adil Marchani ?',
      'Pour chaque agent, quels sont son numéro individuel d’agrément et la date de validité ?',
      'Quel délai annoncez-vous ?',
    ]) expect(sansDonneesCnapsConnues(q)).toBe(q);
  });
});

describe('question fusionnée entreprise et dirigeant (havre2 361)', () => {
  it('la date d’obtention de l’autorisation de l’entreprise, connue, n’est plus demandée', () => {
    expect(sansDonneesCnapsConnues('Quelles sont les dates d’obtention et de fin de validité des autorisations CNAPS de l’entreprise et du dirigeant ?'))
      .toBe("Quelle est la date de fin de validité de l'autorisation d'exercer CNAPS de l'entreprise, et quelles sont les dates d'obtention et de fin de validité de l'agrément CNAPS du dirigeant ?");
  });
});
