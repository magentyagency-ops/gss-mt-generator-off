// Campagne « zéro défaut », tour 2 : limite de pages du RC au-delà de 40 pages (T2-COH-2) et limite par critère (T2-GEN-9).
import { describe, it, expect } from 'vitest';
import { limitePagesMemoire } from '../src/generation/format_court';
import { MemoireGenerator } from '../src/generation/memoire_generator';

describe('lecture sans modèle de la limite de pages', () => {
  it('au-delà de 40 pages : limite lue (T2-COH-2)', () => {
    expect(limitePagesMemoire(['Le mémoire technique ne devra pas excéder 60 pages.'])?.pages).toBe(60);
    expect(limitePagesMemoire(['Le mémoire technique est limité à 12 pages.'])?.pages).toBe(12);
  });
  it('limite par critère ou par sous-critère : jamais lue comme limite totale (T2-GEN-9)', () => {
    expect(limitePagesMemoire(['Le mémoire technique ne devra pas excéder 5 pages par critère.'])).toBeNull();
    expect(limitePagesMemoire(['Mémoire technique : 3 pages maximum par sous-critère, soit 4 sous-critères.'])).toBeNull();
    // Une limite « par lot » est celle du mémoire (un mémoire par lot).
    expect(limitePagesMemoire(['Le mémoire technique est limité à 10 pages par lot.'])?.pages).toBe(10);
  });
});

describe('format imposé lu par le modèle (réponse simulée)', () => {
  const dce = (phrase: string) => `===== PIÈCE : RC.pdf =====\n\nARTICLE 4 - CONTENU DE L'OFFRE\n\nL'offre comprend l'acte d'engagement et un mémoire technique. ${phrase}\n\nARTICLE 5 - JUGEMENT DES OFFRES\n\nValeur technique 60 %.`;
  const lire = async (reponse: any, phrase: string) => {
    const g: any = new MemoireGenerator('hors-ligne' as any);
    g.callOpenAI = async () => JSON.stringify(reponse);
    return { r: await g.detecterFormatImpose(dce(phrase)), alertes: g.alertesFormat as string[] };
  };
  it('60 pages : format imposé appliqué, plus de réponse libre de 120 pages (T2-COH-2)', async () => {
    const phrase = 'Le mémoire technique ne devra pas excéder 60 pages.';
    const { r } = await lire({ limite: true, pagesMax: 60, citation: phrase, plan: [], criteres: [] }, phrase);
    expect(r?.pagesMax).toBe(60);
  });
  it('5 pages par critère sur 4 critères : 20 pages au total, 5 par partie (T2-GEN-9)', async () => {
    const phrase = 'Le mémoire technique ne devra pas excéder 5 pages par critère.';
    const plan = [{ titre: 'Moyens humains' }, { titre: 'Moyens matériels' }, { titre: 'Organisation' }, { titre: 'Développement durable' }];
    // Le modèle lit 5 pages sans signaler la limite par partie : la phrase citée la donne.
    const { r } = await lire({ limite: true, pagesMax: 5, pagesParPartie: null, citation: phrase, plan, criteres: [] }, phrase);
    expect(r?.pagesParPartie).toBe(5);
    expect(r?.pagesMax).toBe(20);
    expect(r?.plan).toHaveLength(4);
  });
  it('limite par partie sans plan lisible : aucune limite inventée, alerte à GSS', async () => {
    const phrase = 'Le mémoire technique ne devra pas excéder 5 pages par critère.';
    const { r, alertes } = await lire({ limite: true, pagesMax: 5, pagesParPartie: 5, citation: phrase, plan: [], criteres: [] }, phrase);
    expect(r).toBeNull();
    expect(alertes.join(' ')).toMatch(/limite chaque partie du mémoire technique à 5 pages/);
  });
});
