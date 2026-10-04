// Campagne « zéro défaut », tour 2 : règles de lecture du DCE rédigé autrement (T2-GEN-3 et suivants).
import { describe, it, expect } from 'vitest';
import { chargerMemoireType, preparerMemoireType, qualificationsDuDce } from '../src/generation/memoire_type';

const BASE = `CAHIER DES CLAUSES TECHNIQUES PARTICULIERES
Article 1 - Objet
Le présent marché a pour objet le gardiennage de l'entrepôt de la société, 12 rue de la Mare, 76800 Saint-Étienne-du-Rouvray.
Article 2 - Prestations
Un agent de sécurité assure la surveillance du site du lundi au vendredi de 7h00 à 19h00.
Article 3 - Dispositions particulières
`;

describe('une phrase qui nie une condition ne la déclenche jamais (T2-GEN-3)', () => {
  const mt = chargerMemoireType();
  const temoin = preparerMemoireType({ analyse: { clientName: 'Société X' }, dce: BASE, referents: '' } as any, { memoireType: mt });
  const rubT = new Set(temoin.plan.rubriques.map((r: any) => r.id));
  it.each([
    ['CYNOPHILE', "L'emploi d'agents cynophiles est interdit sur le site."],
    ['CYNOPHILE', "Aucun maître-chien n'est demandé dans le cadre du présent marché."],
    ['TELESURVEILLANCE', "La télésurveillance du site n'est pas comprise dans le présent marché."],
    ['ATEX', 'Le site ne comporte aucune zone ATEX.'],
    ['APR', "Aucune mission de protection rapprochée n'est attendue."],
    ['EVENEMENTIEL', 'Les manifestations culturelles organisées sur le site ne font pas partie du marché.'],
    ['SSIAP', "Les agents ne sont pas tenus d'être titulaires du SSIAP."],
    ['RONDES', "Aucune ronde n'est demandée."],
    ['REPRISE_PERSONNEL', "Le présent marché n'emporte aucune reprise du personnel en place."],
    ['REPRISE_PERSONNEL', "Le titulaire n'est pas tenu de reprendre le personnel actuel."],
    ['ACCUEIL_PUBLIC', "Le site n'accueille pas de public : aucun visiteur n'y est reçu."],
    ['VIDEOSURVEILLANCE', "Le site ne dispose d'aucune caméra de vidéosurveillance."],
  ])('%s : %s', (ind, ph) => {
    const prep = preparerMemoireType({ analyse: { clientName: 'Société X' }, dce: `${BASE}${ph}\n`, referents: '' } as any, { memoireType: mt });
    expect(prep.indicateurs[ind]).toBeFalsy();
    expect(prep.plan.rubriques.map((r: any) => r.id).filter((id: string) => !rubT.has(id))).toEqual([]);
  });
  it('qualification niée jamais exigée ; exigence à double négation gardée', () => {
    expect(qualificationsDuDce(`${BASE}Les agents ne sont pas tenus d'être titulaires du SSIAP.\n`)).toEqual([]);
    expect(qualificationsDuDce(`${BASE}Le titulaire ne pourra pas employer d'agent qui ne soit titulaire du SSIAP 1.\n`)).toContain('SSIAP 1');
  });
  it('une affirmation déclenche toujours la rubrique', () => {
    const prep = preparerMemoireType({ analyse: { clientName: 'Société X' }, dce: `${BASE}Le titulaire met à disposition un agent cynophile la nuit.\n`, referents: '' } as any, { memoireType: mt });
    expect(prep.indicateurs.CYNOPHILE).toBe(true);
  });
});
