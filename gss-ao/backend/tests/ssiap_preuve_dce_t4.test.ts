import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { chargerMemoireType, evaluerIndicateurs, qualificationsDuDce, sansMentionsNiees, variablesDuMarche, valeursIndicateurs } from '../src/generation/memoire_type';

const DCE = (code: string) => {
  const f = path.resolve(__dirname, '../../_corpus_verif/_dce_textes', `${code}.txt`);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf-8') : '';
};

/** Tour 4 (T4N-3) : SSIAP et qualifications de l'équipe jamais déduits d'une mention niée ni de la seule analyse. */
describe('indicateur SSIAP et diplômes de l\'équipe dédiée (T4N-3)', () => {
  const mt = chargerMemoireType();

  it('une mention niée de l\'analyse est retirée', () => {
    expect(sansMentionsNiees('Agents de sécurité titulaires de la carte professionnelle (aucun agent SSIAP exigé)')).not.toMatch(/SSIAP/);
    expect(sansMentionsNiees('2 agents SSIAP 1, aucun SSIAP 2')).toBe('2 agents SSIAP 1,');
    expect(sansMentionsNiees("pas d'agent cynophile")).toBe('');
    expect(sansMentionsNiees('Poste SSIAP 1 24h/24 sans interruption')).toBe('Poste SSIAP 1 24h/24 sans interruption');
  });

  const caen = DCE('caen');
  it.skipIf(!caen)('caen (aucun SSIAP dans le DCE) : ni l\'analyse niée, ni une exigence rattachée à une rubrique SSIAP ne rendent l\'indicateur vrai', () => {
    const analyseNiee = { operationalSummary: { agentProfiles: 'Agents de sécurité titulaires de la carte professionnelle (aucun agent SSIAP exigé)' } };
    const matrice = [{ exigence: 'Formation des agents aux consignes du site', rubrique: 'b3_formation_ssiap_a' }];
    expect(evaluerIndicateurs(mt, { dce: caen, analyse: analyseNiee, matrice } as any).SSIAP.valeur).toBe(false);
    // Même une analyse qui affirme « SSIAP » ne suffit pas : le DCE lisible n'en parle pas.
    expect(evaluerIndicateurs(mt, { dce: caen, analyse: { operationalSummary: { agentProfiles: 'Agents SSIAP 1' } }, matrice: [] } as any).SSIAP.valeur).toBe(false);
    expect(qualificationsDuDce(caen, analyseNiee)).toEqual([]);
    expect(qualificationsDuDce(caen, { operationalSummary: { agentProfiles: 'Agents SSIAP 1' } })).toEqual([]);
    // Diplômes de l'équipe : ceux des lignes du tableau (agent de sécurité CQP APS), jamais « SSIAP 1 ».
    const ctx: any = { dce: caen, analyse: analyseNiee, matrice, registre: [] };
    const ind = valeursIndicateurs(evaluerIndicateurs(mt, ctx));
    const v = variablesDuMarche(mt, ctx, ind);
    expect(v.DIPLOMES_EQUIPE?.valeur).toEqual(['CQP APS']);
    expect(String(v.LIGNES_EQUIPE_DEDIEE?.valeur)).not.toMatch(/SSIAP/);
  });

  it('un DCE qui exige des agents de sécurité incendie garde l\'indicateur (etampes1, s2e)', () => {
    for (const code of ['etampes1', 's2e', 'imm', 'rouen_univ', 'ign']) {
      const dce = DCE(code);
      if (!dce) continue;
      expect(evaluerIndicateurs(mt, { dce, analyse: {}, matrice: [] } as any).SSIAP.valeur, code).toBe(true);
    }
  });

  const citedia2 = DCE('citedia2');
  it.skipIf(!citedia2)('citedia2 : dimensionnement du lot 2 (SSIAP 1 et CQP APS) → diplômes sans le SSIAP 2 du chef d\'équipe du lot 1', () => {
    const dimensionnement = { titulaires: 3, suppleants: 2, casPratique: [], profils: [
      { profil: 'Agent de sécurité incendie', qualification: 'SSIAP 1', lieux: [], heuresSemaine: 84, heuresAn: 4380, etp: 2.4, titulaires: 2 },
      { profil: 'Agent de sécurité', qualification: 'CQP APS', lieux: [], heuresSemaine: 35, heuresAn: 1820, etp: 1, titulaires: 1 },
    ] };
    const ctx: any = { dce: citedia2, analyse: {}, matrice: [], registre: [], dimensionnement };
    const ind = valeursIndicateurs(evaluerIndicateurs(mt, ctx));
    expect(qualificationsDuDce(citedia2)).toContain('SSIAP 2');
    expect(variablesDuMarche(mt, ctx, ind).DIPLOMES_EQUIPE?.valeur).toEqual(['SSIAP 1', 'CQP APS']);
  });
});
