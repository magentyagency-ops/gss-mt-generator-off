import { describe, it, expect } from 'vitest';
import { preparerMemoireType, delaiDuDce } from '../src/generation/memoire_type';
import { DCE, aCorpus } from './fixtures/corpus';

/** Tour 9 (T9CS-1) : agent conducteur de chien et surveillance à distance reconnus sans modèle (ifits). */
const prep = (dce: string) => preparerMemoireType({ dce, analyse: { clientName: 'Acheteur' } } as any);

describe('indicateurs CYNOPHILE et TELESURVEILLANCE (T9CS-1)', () => {
  it('termes du DCE : « agent conducteur de chien », « surveillance à distance de l’alarme »', () => {
    const p = prep("Le présent marché a pour objet la prestation de services en gardiennage avec agent conducteur de chien et le contrôle de surveillance à distance des locaux. En cas de déclenchement de l'alarme intrusion, le titulaire doit être en capacité d'envoyer sur le site un agent pour intervention en moins de 30 (trente) minutes.");
    expect(p.indicateurs.CYNOPHILE).toBe(true);
    expect(p.indicateurs.TELESURVEILLANCE).toBe(true);
    const ids = p.plan.rubriques.map((r: any) => r.id);
    expect(ids).toContain('b3_formation_cynophile');
    expect(ids).toContain('b4_proc_alarme');
    expect(p.variables.DELAI_INTERVENTION_ALARME.valeur).toBe('30 minutes');
  });
  it('rappel réglementaire seul (« décret … relatif aux activités de surveillance à distance ») : pas de télésurveillance', () => {
    expect(prep('Le titulaire respecte le décret n°91-1206 du 26 novembre 1991 relatif aux activités de surveillance à distance. Gardiennage des locaux.').indicateurs.TELESURVEILLANCE).toBe(false);
  });
  it('« UNE (1) heure » et « 30 (trente) minutes » : le chiffre du DCE', () => {
    expect(delaiDuDce('Le personnel de remplacement est sur site dans les UNE (1) heure.', 'remplacement')).toBe('1 heure');
    expect(delaiDuDce("En cas de déclenchement de l'alarme, un agent intervient en moins de 30 (trente) minutes.", 'alarme')).toBe('30 minutes');
  });
  it.skipIf(!aCorpus('ifits'))('ifits : rubriques de l’agent cynophile et de la procédure sur alarme, délai de 30 minutes du CCTP', () => {
    const p = prep(DCE('ifits'));
    expect(p.indicateurs.CYNOPHILE).toBe(true);
    expect(p.indicateurs.TELESURVEILLANCE).toBe(true);
    const ids = p.plan.rubriques.map((r: any) => r.id);
    expect(ids).toEqual(expect.arrayContaining(['b3_formation_cynophile', 'b4_proc_alarme']));
    expect(p.variables.DELAI_INTERVENTION_ALARME.valeur).toBe('30 minutes');
  });
  it('corpus : aucun autre DCE ne bascule (CYNOPHILE, TELESURVEILLANCE)', () => {
    const attendu: Record<string, [boolean, boolean]> = { becquerel: [false, false], ca_normandie: [false, true], caen: [false, true], citedia: [false, true], citedia2: [false, true], cstb: [false, true], etampes1: [true, false], etampes2: [true, false], fontainebleau: [true, false], havre1: [true, false], havre2: [true, false], ifsem: [true, true], ign: [true, false], imm: [false, true], parc_expo: [true, false], rouen_univ: [true, true], s2e: [false, false], vitry: [true, true] };
    for (const [c, [cyno, tele]] of Object.entries(attendu)) {
      if (!aCorpus(c)) continue;
      const i = prep(DCE(c)).indicateurs;
      expect([c, i.CYNOPHILE, i.TELESURVEILLANCE]).toEqual([c, cyno, tele]);
    }
  });
});
