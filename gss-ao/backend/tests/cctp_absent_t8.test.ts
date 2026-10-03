import { describe, it, expect } from 'vitest';
import { alerteCctpAbsent } from '../src/generation/memoire_generator';
import { DCE, aCorpus } from './fixtures/corpus';

/** Tour 8 (T8-COH-2) : DCE sans cahier des charges signalé à GSS. */
describe('DCE sans CCTP (T8-COH-2)', () => {
  it('RC seul qui cite le CCTP : la phrase du RC est citée, la question est posée', () => {
    const dce = '\n\n--- AWS-MPI-1876410-RC ---\nLe dossier de consultation comprend :\n- Le règlement de la consultation ;\n- Le Cahier des Clauses Techniques Particulières (CCTP) de chacun des lots ;\n- Le cadre de réponse technique (CRT).\n';
    const a = alerteCctpAbsent(dce);
    expect(a).toHaveLength(1);
    expect(a[0]).toBe("Le DCE cite le « Cahier des Clauses Techniques Particulières (CCTP) » (« Le Cahier des Clauses Techniques Particulières (CCTP) de chacun des lots ; ») : ce document n'est pas parmi les pièces du dossier ; le mémoire n'est donc pas adapté au cahier des charges du client. Pouvez-vous l'ajouter au dossier, puis relancer la génération ?");
  });
  it('aucune pièce ni citation : question sans rien supposer', () => {
    expect(alerteCctpAbsent('\n\n--- AE - LOT 1 ---\nActe d\'engagement.\n')[0]).toMatch(/^Aucun cahier des charges \(CCTP ou CCP\) n'a été trouvé dans le dossier/);
  });
  it('CCTP, CCP ou cahier des clauses particulières présent (nom ou titre de la pièce) : aucune alerte', () => {
    expect(alerteCctpAbsent('\n\n--- LOT 5 - CCTP - CAEN ---\nTexte.\n')).toEqual([]);
    expect(alerteCctpAbsent('\n\n--- C_C_T_P_ COMMUN ---\nTexte.\n')).toEqual([]);
    expect(alerteCctpAbsent('\n\n--- Cahierdesclausesparticulieres ---\nTexte.\n')).toEqual([]);
    expect(alerteCctpAbsent('\n\n--- 04 CCP 26R045 Rondes ---\nTexte.\n')).toEqual([]);
    expect(alerteCctpAbsent('\n\n--- Document 1 ---\n        CAHIER DES CLAUSES TECHNIQUES PARTICULIERES\nObjet : gardiennage.\n')).toEqual([]);
  });
  it.skipIf(!aCorpus('caen') || !aCorpus('ign') || !aCorpus('becquerel'))('corpus : aucune alerte quand le CCTP est au dossier', () => {
    for (const c of ['becquerel', 'caen', 'citedia', 'cstb', 'fontainebleau', 'havre1', 'ifits', 'ifsem', 'ign', 'imm', 'parc_expo', 'rouen_univ', 's2e', 'vitry', 'ca_normandie']) {
      if (aCorpus(c)) expect(alerteCctpAbsent(DCE(c)), c).toEqual([]);
    }
  });
});
