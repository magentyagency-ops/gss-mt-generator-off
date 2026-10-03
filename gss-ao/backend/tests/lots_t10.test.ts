// T10-COH-3 : accord-cadre en plusieurs lots, mémoire jamais présenté pour « (lots 1, 2 et 3) » quand le RC demande une offre
// par lot ; question exacte à GSS ; lot du mémoire lu dans les pièces propres à un lot.
import { describe, it, expect } from 'vitest';
import { lotsDuMemoire, chargerMemoireType, preparerMemoireType } from '../src/generation/memoire_type';
import { alerteLots } from '../src/generation/memoire_generator';
import { aCorpus, DCE } from './fixtures/corpus';

const ANALYSE = { lots: [{ num: '1', perimetre: "Gardiennage de l'Hôpital Nord de Marseille" }, { num: '2', perimetre: 'Sécurité incendie (SSIAP) du site de Gap' }, { num: '3', perimetre: 'Télésurveillance des sites' }] };
const SUD = "\n\n--- RC - Reglement de la consultation.docx ---\nLa consultation est allotie en 3 lots. Un mémoire technique distinct est remis pour chaque lot.\n\n--- CCTP - Cahier des clauses techniques particulieres.docx ---\nGardiennage.";

describe('lot du mémoire (T10-COH-3)', () => {
  it('plusieurs lots sans pièce propre à un lot : question exacte, rien d’imprimé', () => {
    const r = lotsDuMemoire(ANALYSE, SUD);
    expect(r.question).toBe("Le DCE comporte 3 lots (1 : Gardiennage de l'Hôpital Nord de Marseille ; 2 : Sécurité incendie (SSIAP) du site de Gap ; 3 : Télésurveillance des sites) et le RC demande une offre distincte par lot : pour quel lot ce mémoire est-il remis ?");
    expect(alerteLots(ANALYSE, SUD)).toEqual([r.question]);
    const p = preparerMemoireType({ dce: SUD, analyse: ANALYSE } as any, { memoireType: chargerMemoireType() });
    expect(p.variables.LOTS.valeur).toBeNull();
  });
  it('pièce propre à un lot (« CADRE DE REPONSE LOT N°2 ») : ce lot, sans question', () => {
    const dce = `${SUD}\n\n--- CADRE DE REPONSE LOT N°2.docx ---\nSous-critère 1.\n\n--- BPU lot n°2 - 54.6.10.xlsx ---\nx\n\n--- CCAP communs pour touts les lots 54.6.09 et 54.6.10.pdf ---\nx`;
    expect(lotsDuMemoire(ANALYSE, dce)).toEqual({ lots: ['2'] });
    expect(alerteLots(ANALYSE, dce)).toEqual([]);
  });
  it('cadre de réponse commun à plusieurs lots : ces lots, sans question', () => {
    expect(lotsDuMemoire(ANALYSE, `${SUD}\n\n--- 5-Mémoire Technique - lots 1-2-3_GSS.docx ---\nx`)).toEqual({ lots: ['1', '2', '3'] });
  });
  it('« (en cas de non allotissement) » d’un formulaire n’est pas un marché non alloti', () => {
    expect(lotsDuMemoire(ANALYSE, `${SUD} DC1 : pour le marché public (en cas de non allotissement).`).question).toBeTruthy();
    expect(lotsDuMemoire(ANALYSE, `${SUD} Le marché n'est pas alloti.`)).toEqual({ lots: [] });
  });
});

describe.skipIf(!aCorpus('citedia2', 'havre1', 'rouen_univ'))('corpus (T10-COH-3)', () => {
  it('citedia2 lot 2, havre1 lot 1, rouen_univ lots 1-2-3', () => {
    const a = { lots: [{ num: 'Lot 1' }, { num: 'Lot 2' }, { num: 'Lot 3' }] };
    expect(lotsDuMemoire(a, DCE('citedia2')).lots).toEqual(['2']);
    expect(lotsDuMemoire(a, DCE('havre1')).lots).toEqual(['1']);
    expect(lotsDuMemoire(a, DCE('rouen_univ'))).toEqual({ lots: ['1', '2', '3'] });
  });
});
