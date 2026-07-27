import { describe, it, expect } from 'vitest';
import { significantWords } from '../src/generation/memoire_generator';

/**
 * Garde-fou du filtre `filterAlreadyKnownInDb` : il compare un manque détecté aux questions déjà
 * posées pour LE MÊME dossier. La comparaison doit se faire MOT À MOT sur des mots porteurs de
 * sens. L'ancienne version testait l'inclusion en sous-chaîne avec un seul mot commun suffisant :
 * « les » matchait dans « télésurveillance », « prise » dans « entreprise » → 25 manques sur 25
 * étaient silencieusement supprimés et l'app affichait « 0 information manquante ».
 */
const communs = (a: string, b: string) => {
  const wa = significantWords(a), wb = significantWords(b);
  return [...wa].filter((w) => wb.has(w));
};
// Reproduit la règle de filterAlreadyKnownInDb : ≥ 2 mots communs ET ≥ 60 % des mots du manque.
const seraitSupprime = (manque: string, question: string) => {
  const mots = significantWords(manque);
  return communs(manque, question).length >= Math.max(2, Math.ceil(mots.size * 0.6));
};

describe('significantWords', () => {
  it('écarte les mots vides et normalise les accents', () => {
    const w = significantWords('Le titulaire doit être présent sur les lieux');
    expect(w.has('les')).toBe(false);
    expect(w.has('doit')).toBe(false);
    expect(w.has('present')).toBe(true);
  });

  it('ne fait pas de correspondance en sous-chaîne', () => {
    expect(communs('les rondes de nuit', 'localisation de la station de télésurveillance')).toEqual([]);
    expect(communs("la prise de fonction de l'agent", "adresse du siège de l'entreprise")).toEqual([]);
  });
});

describe('règle de suppression d\'un manque déjà recherché', () => {
  const question = 'Localisation de la station de télésurveillance :';

  it('ne supprime pas un manque sur un tout autre sujet', () => {
    expect(seraitSupprime(
      'Le titulaire doit conserver la main courante numérique 10 ans et permettre son export PDF et Excel',
      question,
    )).toBe(false);
    expect(seraitSupprime(
      'Le titulaire doit fournir des lampes ATEX et relier le PTI à son centre opérationnel',
      'N° CNAPS d’autorisation d’exercer pour l’établissement exécutant le marché :',
    )).toBe(false);
  });

  it('supprime bien un manque qui reprend le sujet de la question', () => {
    expect(seraitSupprime('Localisation de la station de télésurveillance', question)).toBe(true);
  });
});
