/**
 * Tour 4, correcteur (T4-CONS-8) : citedia2 1462, réponse réelle du modèle. La période « hors période d'été et fériés, soit
 * 47 semaines » est lue (47 semaines) ; l'estimation annuelle du DQE fixe les heures par an, aucune alerte « compté sur
 * toute l'année » ; une citation n'est jamais coupée au milieu d'un mot ou d'un sigle.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { calculerDimensionnement, joursDePeriode, citationCourte } from '../src/generation/dimensionnement';

const DQE = fs.readFileSync(path.join(__dirname, 'fixtures/dqe_citedia2.txt'), 'utf-8');
const REP = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/dimensionnement_citedia2_1462.json'), 'utf-8'));

describe('période de l\'année d\'un poste (T4-CONS-8)', () => {
  it('« soit 47 semaines » : 47 semaines de 7 jours', () => {
    expect(joursDePeriode("hors période d'été et fériés, soit 47 semaines")).toBe(329);
    expect(joursDePeriode('sur 40 semaines par an')).toBe(280);
  });
  it('estimation annuelle du DQE : 3 948 h, 2,46 ETP, aucune alerte de période', () => {
    const d: any = calculerDimensionnement(REP, DQE);
    expect(d.profils[0].heuresAn).toBe(3948);
    expect(d.profils[0].etp).toBe(2.46);
    expect((d.alertes || []).join(' ')).not.toMatch(/n'a pas pu être lue|toute l'année/);
  });
  it('citation coupée sur une fin de mot, avec « … »', () => {
    const c = "AGENT DE SECURITE Titulaire d'une carte professionnelle et de l’agrément aux palpations de sécurité délivrés par le C.N.A.P.S., qualification CQP APS";
    const court = citationCourte(c, 120);
    expect(court.endsWith('…')).toBe(true);
    expect(court).not.toMatch(/C\.N\.…$/);
    expect(c.startsWith(court.slice(0, -1))).toBe(true);
    expect(/\s/.test(c.charAt(court.length - 1))).toBe(true);
  });
});
