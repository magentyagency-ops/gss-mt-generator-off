// Campagne « zéro défaut », tour 3 : engagements du CCTP rattachés au sujet de leur rubrique (T3N-10, T3-CONS-1).
import { describe, it, expect } from 'vitest';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-not-used';
import { chargerMemoireType, exigencesParRubrique } from '../src/generation/memoire_type';
import { motifRefusEngagement } from '../src/generation/memoire_generator';

const mt = chargerMemoireType();
const plan: any = { rubriques: mt.rubriques };
const ou = (exigence: string, rubrique: string) => {
  const { parRubrique, nouvelles } = exigencesParRubrique(mt, plan, [{ exigence, rubrique } as any]);
  return { ids: Object.keys(parRubrique), nouvelles: nouvelles.length };
};

describe('engagements hors du sujet de leur rubrique (T3N-10)', () => {
  it('clause de prix : jamais rattachée (« les heures de nuit seront valorisées… »)', () => {
    expect(ou('Les heures de nuit seront valorisées pour toute période comprise entre 21h00 et 6h00.', 'b5_controle_nuit')).toEqual({ ids: [], nouvelles: 0 });
    expect(motifRefusEngagement('GSS applique la valorisation des heures de nuit à toute période comprise entre 21 h 00 et 6 h 00.')).toBe('clause de prix ou de facturation');
  });
  it('présence d’un agent sur un site : jamais sous une rubrique de formation (ign 1351)', () => {
    const r = ou("À Carnot-Cassini, du samedi 19h00 au lundi 7h00, seul un SSIAP 2 sera présent et n'effectuera pas de rondes techniques.", 'b3_formation_ssiap_b');
    expect(r.ids.filter((x) => x.startsWith('b3_formation'))).toEqual([]);
  });
  it('mobilisation de profils : jamais sous « la protection rapprochée »', () => {
    const r = ou('Le titulaire doit pouvoir mobiliser des APS, des agents cynophiles et des SSIAP.', 'b3_formation_apr');
    expect(r.ids.filter((x) => x.startsWith('b3_formation'))).toEqual([]);
  });
  it('une exigence de formation reste dans sa rubrique de formation', () => {
    expect(ou('Les agents en charge de la vigilance devront être titulaires du diplôme SSIAP 1 à jour de leur recyclage.', 'b3_formation_ssiap_a').ids).toEqual(['b3_formation_ssiap_a']);
  });
});
