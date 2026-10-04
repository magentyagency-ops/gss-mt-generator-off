// Campagne « zéro défaut », tour 3 : jalon d'envoi des plannings au client et exigence du CCTP (T3-CONS-4).
import { describe, it, expect } from 'vitest';
import { envoiPlanningsClientDce, preparerMemoireType, publierMemoire, chargerMemoireType } from '../src/generation/memoire_type';
import { adaptationsDesValeursImposees } from '../src/generation/adaptations_cctp';

const mt = chargerMemoireType();
const planif = (dce: string) => {
  const ctx: any = { dce, analyse: { clientName: 'Ville de Rouen' }, cover: { client: 'Ville de Rouen' }, referents: '' };
  const p: any = preparerMemoireType(ctx, { memoireType: mt });
  return { p, ctx, texte: publierMemoire(p).find((r: any) => r.id === 'b4_planification')?.texte || '' };
};

describe('jalon d’envoi des plannings au client (T3-CONS-4)', () => {
  it('lecture du délai du DCE', () => {
    expect(envoiPlanningsClientDce('6.5 TRANSMISSION DU PLANNING MENSUEL Le planning mensuel de chaque bâtiment est transmis par le titulaire au SAIMG. Cette transmission se fait de manière systématique au moins sept (7) jours avant le début du mois concerné.')?.jours).toBe(7);
    expect(envoiPlanningsClientDce('Les plannings mensuels devront être transmis au responsable sécurité au moins 10 jours avant le début du mois considéré.')?.jours).toBe(10);
    expect(envoiPlanningsClientDce('Le titulaire transmet le planning mensuel au plus tard 5 jours avant le début du mois.')?.jours).toBe(5);
    expect(envoiPlanningsClientDce('Les modifications de plannings sont transmises au plus tard 4 jours ouvrés avant leur prise d’effet.')).toBeNull();
  });
  it('sans exigence : J-3 de GSS ; exigence de 5 jours : J-5, phrase signalée (D8)', () => {
    expect(planif('CCTP. Le site est gardé.').texte).toMatch(/- J-3 : envoi des plannings à la Ville de Rouen/);
    const r = planif('CCTP. Le titulaire transmet le planning mensuel au plus tard 5 jours avant le début du mois.');
    expect(r.texte).toMatch(/- J-5 : envoi des plannings à la Ville de Rouen/);
    expect(r.texte).not.toMatch(/J-3 : envoi/);
    const a = adaptationsDesValeursImposees(mt, r.ctx, ['b4_planification']);
    expect(a.length).toBe(1);
    expect(a[0].exigence).toMatch(/5 jours avant le début du mois/);
  });
  it('exigence à 7 jours ou plus (ign, becquerel) : jalon demandé à GSS, jamais J-3 à côté de l’engagement', () => {
    const r = planif('CCTP. Le planning mensuel est transmis par le titulaire. Cette transmission se fait de manière systématique au moins sept (7) jours avant le début du mois concerné.');
    expect(r.texte).not.toMatch(/J-3 : envoi/);
    expect(r.texte).toMatch(/\[À COMPLÉTER\] : envoi des plannings/);
    expect(String(r.p.variables.JALON_ENVOI_CLIENT.question)).toMatch(/au moins 7 jours avant le début du mois/);
  });
});

import { dateDebutMarche } from '../src/generation/memoire_type';
describe('date de début du marché sous toutes ses tournures (T3G-11)', () => {
  for (const ph of ['Le présent marché prendra effet le 1er janvier 2027.', "L'accord-cadre prendra effet à compter du 1er janvier 2027.", "L'accord-cadre débutera le 01/01/2027.", 'Le contrat démarrera le 1er janvier 2027.', 'Date de commencement des prestations : 01/01/2027', 'La durée du marché est de 12 mois à compter du 1er janvier 2027.', "Le marché est conclu pour une période initiale d'un an à compter du 1er janvier 2027."]) {
    it(ph, () => { expect(dateDebutMarche(ph)).toBe('1er janvier 2027'); });
  }
  it('jamais une date de notification ou de remise des offres', () => {
    expect(dateDebutMarche('Le marché est conclu pour un an à compter de sa notification.')).toBe('');
    expect(dateDebutMarche('Les offres sont à remettre avant le 15 novembre 2026. Le marché est notifié le 1er décembre 2026.')).toBe('');
  });
});
