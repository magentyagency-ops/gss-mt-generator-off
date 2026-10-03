// Tour 5 (T5-COH-1, citedia2 474) : ligne courte du DQE retenue, total hebdomadaire et estimation annuelle du DQE.
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { calculerDimensionnement, questionDimensionnement } from '../src/generation/dimensionnement';

const DQE = fs.readFileSync(path.join(__dirname, 'fixtures/dqe_citedia2.txt'), 'utf-8');
const poste = (plages: any[], h: number, citation: string) => ({ profil: 'Agent de sécurité', qualification: 'CQP APS ou CAP Agent de Sécurité – SSIAP1', lieu: null, agents_simultanes: 1, plages, heures_hebdo: h, heures_an: null, citation });
const REP = { postes: [
  poste([{ jours: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'], debut: '06:00', fin: '21:00' }], 8, 'Lundi au samedi 06h00 - 21h00 (jour) | 8'),
  poste([{ jours: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'], debut: '21:00', fin: '06:00' }], 66, 'Lundi au samedi 21h00 - 06h00 (nuit) | 66'),
  poste([{ jours: ['dimanche'], debut: '21:00', fin: '06:00' }], 10, 'Dimanche 21h00 - 06h00 (nuit) | 10'),
], cas_pratique: null, mises_en_situation: [] };

describe('DQE citedia2 (T5-COH-1)', () => {
  it('84 h par semaine, 3 948 h par an (47 semaines du DQE), 2,46 ETP', () => {
    const d = calculerDimensionnement(REP, DQE)!;
    expect(d.profils).toHaveLength(1);
    expect(d.profils[0].heuresSemaine).toBe(84);
    expect(d.profils[0].heuresAn).toBe(3948);
    expect(d.profils[0].etp).toBe(2.46);
    expect(d.alertes).toBeUndefined();
  });
  it('une ligne courte sans nombre ou absente du DCE reste écartée ; somme différente du total : question à GSS', () => {
    const d = calculerDimensionnement({ ...REP, postes: [REP.postes[0], REP.postes[1], { ...REP.postes[2], citation: 'Dimanche 21h00 - 06h00 (nuit)' }] }, DQE)!;
    expect(d.profils[0].heuresSemaine).toBe(74);
    expect(d.alertes![0]).toContain('totalisent 74 h par semaine alors que le DQE indique un total hebdomadaire de 84 h');
    expect(questionDimensionnement(d)).toContain('Attention : les postes relevés dans le DQE totalisent 74 h');
  });
});
