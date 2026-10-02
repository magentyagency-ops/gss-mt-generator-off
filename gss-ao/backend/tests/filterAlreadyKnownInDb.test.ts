import { describe, it, expect } from 'vitest';

// Clé factice : aucun appel OpenAI ni aucune lecture de base (le constructeur exige une clé présente).
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-not-used';

import { MemoireGenerator } from '../src/generation/memoire_generator';

/**
 * Garde-fou de `filterAlreadyKnownInDb` (détection des manques). Historique :
 *  - l'ancienne version comparait en sous-chaîne avec un seul mot commun suffisant : « les » matchait
 *    « télésurveillance », « prise » « entreprise » → 25 manques sur 25 supprimés en silence et l'app
 *    affichait « 0 information manquante » ;
 *  - une version intermédiaire comparait mot à mot (significantWords, ≥ 2 mots et 60 %) ;
 *  - depuis le commit c184a18 (30 juillet 2026), le filtre est volontairement désactivé : « If an info
 *    is missing for THIS dossier, it must be displayed, even if a similar question was asked in the past
 *    or for another dossier. » significantWords a été retirée avec lui (8f573bf).
 * Comportement attendu, vérifié ici : aucun manque détecté pour le dossier n'est masqué, quel que soit
 * son recouvrement avec une recherche ou une question déjà en base, et la base n'est pas interrogée.
 */
type Manque = { id: string; label: string; context: string; criticite: 'bloquant' | 'facultatif' | 'normal' };
const manque = (id: string, label: string, criticite: Manque['criticite'] = 'normal'): Manque => ({ id, label, context: '', criticite });

const generateur = () => {
  const gen = new MemoireGenerator() as any;
  let lectures = 0;
  gen.ragDbClient = () => { lectures++; throw new Error('la base ne doit pas être interrogée'); };
  return { gen, lectures: () => lectures };
};

describe('filterAlreadyKnownInDb : aucun manque du dossier n\'est masqué', () => {
  it('garde un manque sur un tout autre sujet que les questions déjà posées', async () => {
    const { gen, lectures } = generateur();
    const champs = [
      manque('req-1', 'Le titulaire doit conserver la main courante numérique 10 ans et permettre son export PDF et Excel'),
      manque('req-2', 'Le titulaire doit fournir des lampes ATEX et relier le PTI à son centre opérationnel', 'bloquant'),
      manque('req-3', 'les rondes de nuit'),
      manque('req-4', "la prise de fonction de l'agent"),
    ];
    expect(await gen.filterAlreadyKnownInDb(champs, 'dossier-test')).toEqual(champs);
    expect(lectures()).toBe(0);
  });

  it('garde aussi un manque qui reprend le sujet d\'une question déjà posée (décision c184a18)', async () => {
    const { gen, lectures } = generateur();
    const champs = [manque('req-1', 'Localisation de la station de télésurveillance', 'bloquant')];
    const res = await gen.filterAlreadyKnownInDb(champs, 'dossier-test');
    expect(res).toEqual(champs);
    expect(res[0].criticite).toBe('bloquant');
    expect(lectures()).toBe(0);
  });

  it('liste vide : renvoie une liste vide', async () => {
    const { gen } = generateur();
    expect(await gen.filterAlreadyKnownInDb([], 'dossier-test')).toEqual([]);
  });
});
