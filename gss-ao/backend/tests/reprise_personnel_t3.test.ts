// T3N-5 : « personnel en place » sans reprise (ifsem : plan de formation, niveau équivalent) ne déclenche plus la rubrique
// de reprise ni la question du taux de reprise.
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { chargerMemoireType, evaluerIndicateurs } from '../src/generation/memoire_type';

const mt = chargerMemoireType();
const reprise = (dce: string, analyse: any = { clientName: 'X', sites: [] }) => (evaluerIndicateurs(mt, { analyse, dce, referents: '' } as any) as any).REPRISE_PERSONNEL.valeur;
const lire = (c: string) => { try { return fs.readFileSync(path.resolve(__dirname, `../../_corpus_verif/_dce_textes/${c}.txt`), 'utf-8'); } catch { return ''; } };

describe('indicateur REPRISE_PERSONNEL (T3N-5)', () => {
  it('« personnel en place » hors reprise : faux', () => {
    expect(reprise('La politique de formation, notamment le plan de formation proposé pour le personnel en place. Encadrement de niveau équivalent au personnel en place.')).toBe(false);
  });
  it('reprise du personnel en place : vrai', () => {
    expect(reprise('Le titulaire reprend le personnel en place affecté au marché.')).toBe(true);
    expect(reprise('Taux de reprise du personnel en place : ……')).toBe(true);
    expect(reprise('Article 12 – Reprise du personnel. Article L 1224-1 du Code du travail.')).toBe(true);
  });
  it('analyse qui dit que la reprise n’est pas prévue : faux', () => {
    expect(reprise('Surveillance des locaux.', { clientName: 'X', operationalSummary: { agentProfiles: 'SSIAP 1 ; taux de reprise du personnel : non précisé' } })).toBe(false);
    expect(reprise('Surveillance des locaux.', { clientName: 'X', operationalSummary: { agentProfiles: 'Reprise du personnel : aucune' } })).toBe(false);
    expect(reprise('Surveillance des locaux.', { clientName: 'X', operationalSummary: { agentProfiles: 'Reprise du personnel prévue (annexe 8)' } })).toBe(true);
  });
  it('DCE du corpus : ifsem faux ; havre2 et citedia vrais', () => {
    if (!lire('ifsem')) return;
    expect(reprise(lire('ifsem'))).toBe(false);
    expect(reprise(lire('havre2'))).toBe(true);
    expect(reprise(lire('citedia'))).toBe(true);
  });
});
