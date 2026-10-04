// Campagne « zéro défaut », tour 3 : fréquence des contrôles inopinés de GSS (T3-CONS-3, T3N-2).
import { describe, it, expect } from 'vitest';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-not-used';
import { preparerMemoireType, publierMemoire, chargerMemoireType, frequenceMensuelle, frequenceRempliePourGss } from '../src/generation/memoire_type';
import { adaptationsDesValeursImposees } from '../src/generation/adaptations_cctp';
import { MemoireGenerator } from '../src/generation/memoire_generator';

const DCE = `CCTP\n3. Contrôles du titulaire\nLe Titulaire ayant l'entière responsabilité de son personnel, s'attache, par des visites inopinées par un contrôleur à déceler les anomalies.\nLa fréquence des contrôles sera de plusieurs fois par mois.\nSite : 75014 Paris.`;
const IMPOSEES = { FREQ_CONTROLE_2: { valeur: 'plusieurs fois par mois', citation: 'La fréquence des contrôles sera de plusieurs fois par mois.' } };

describe('contrôles inopinés exigés « plusieurs fois par mois » (T3N-2)', () => {
  it('fréquences', () => {
    expect(frequenceMensuelle('au moins trois fois par mois')).toBe(3);
    expect(frequenceMensuelle('plusieurs fois par mois')).toBeNull();
    expect(frequenceMensuelle('une fois par semaine')).toBeCloseTo(4.33);
    expect(frequenceRempliePourGss('plusieurs fois par mois')).toBe(true);
    expect(frequenceRempliePourGss('au moins deux fois par mois')).toBe(true);
    expect(frequenceRempliePourGss('quatre fois par mois')).toBe(false);
    expect(frequenceRempliePourGss('au moins une fois par mois de nuit et au moins une fois par mois le week-end')).toBe(false);
  });
  it('l’engagement de GSS (au moins trois) reste, sans « [À COMPLÉTER] », sans question ni phrase adaptée', () => {
    const mt = chargerMemoireType();
    const ctx: any = { dce: DCE, analyse: { clientName: 'IMM' }, cover: { client: 'IMM' }, referents: '', imposees: IMPOSEES };
    const p: any = preparerMemoireType(ctx, { memoireType: mt });
    expect(p.variables.FREQ_CONTROLE_2.valeur).toBe('au moins trois fois par mois');
    expect(p.variables.CONTROLES_INOPINES_MENSUELS.valeur).toBe('au moins trois contrôles inopinés');
    expect(p.variables.CONTROLES_INOPINES_MENSUELS.question).toBeUndefined();
    const t = publierMemoire(p).map((r: any) => r.texte || '').join('\n');
    expect(t).toMatch(/au moins trois contrôles inopinés de nos contrôleurs/);
    expect(t).not.toMatch(/\[À COMPLÉTER\] de nos contrôleurs/);
    expect(adaptationsDesValeursImposees(mt, ctx, mt.rubriques.map((r: any) => r.id)).filter((a) => /contr[ôo]le/i.test(a.avant))).toEqual([]);
  });
  it('fréquence chiffrée plus élevée : le CCTP prime toujours', () => {
    const p: any = preparerMemoireType({ dce: DCE, analyse: { clientName: 'IMM' }, cover: { client: 'IMM' }, referents: '', imposees: { FREQ_CONTROLE_2: { valeur: 'quatre fois par mois', citation: 'quatre fois par mois' } } } as any, { memoireType: chargerMemoireType() });
    expect(p.variables.FREQ_CONTROLE_2.valeur).toBe('quatre fois par mois');
  });
});

describe('cohérence avec le CCTP : fréquence de contrôle de GSS jamais réécrite (T3-CONS-3)', () => {
  it('« au moins trois fois par mois » n’est pas remplacé par « plusieurs fois par mois »', async () => {
    const g: any = Object.create(MemoireGenerator.prototype);
    const PH = 'Contrôle 2 — le contrôle technique, réalisé par nos contrôleurs de façon inopinée, au moins trois fois par mois selon les besoins du site.';
    g.callOpenAI = async () => JSON.stringify({ corrections: [{ id: 'b5_controle', extrait: PH, remplacement: PH.replace('au moins trois fois par mois', 'plusieurs fois par mois'), exigence: 'La fréquence des contrôles sera de plusieurs fois par mois.', meme_obligation: 'fréquence' }] });
    const sections: Record<string, string> = { b5_controle: `Nos contrôles.\n\n• ${PH}` };
    const adaptations: any[] = [];
    const questions = new Set<string>();
    await g.corrigerContradictions(sections, [{ id: 'b5_controle', title: 'Le contrôle' }], [{ exigence: 'La fréquence des contrôles sera de plusieurs fois par mois.' }], [], questions, adaptations, undefined, [], DCE);
    expect(sections.b5_controle).toContain('au moins trois fois par mois');
    expect(adaptations).toEqual([]);
    expect([...questions]).toEqual([]);
  });
});

import { frequenceInopinesDce } from '../src/generation/memoire_type';
describe('fréquence des contrôles inopinés plus élevée lue sans modèle (T3G-7)', () => {
  it('« au moins quatre contrôles inopinés par mois », « hebdomadaires »', () => {
    expect(frequenceInopinesDce('CCTP. Le titulaire réalise au moins quatre contrôles inopinés par mois.')).toMatchObject({ valeur: 'au moins quatre fois par mois', mensuels: 'au moins quatre contrôles inopinés' });
    expect(frequenceInopinesDce('CCTP. Des contrôles inopinés hebdomadaires sont réalisés par le titulaire.')).toMatchObject({ valeur: 'chaque semaine', mensuels: 'au moins quatre contrôles inopinés' });
    expect(frequenceInopinesDce('La fréquence des contrôles inopinés sera de plusieurs fois par mois.')).toBeNull();
    expect(frequenceInopinesDce('Le titulaire réalise deux contrôles inopinés par mois.')).toBeNull();
  });
  it('publipostage : le CCTP prime, jamais « au moins trois » à côté de l’exigence de quatre', () => {
    const p: any = preparerMemoireType({ dce: 'CCTP. Le titulaire réalise au moins quatre contrôles inopinés par mois. Site 76000 Rouen.', analyse: { clientName: 'Ville de Rouen' }, cover: { client: 'Ville de Rouen' }, referents: '' } as any, { memoireType: chargerMemoireType() });
    expect(p.variables.FREQ_CONTROLE_2.valeur).toBe('au moins quatre fois par mois');
    expect(p.variables.CONTROLES_INOPINES_MENSUELS.valeur).toBe('au moins quatre contrôles inopinés');
  });
});

describe('fréquence plus élevée du DCE signalée à GSS (D8, T3G-7)', () => {
  it('phrase de GSS adaptée et signalée avec l’exigence du DCE', () => {
    const mt = chargerMemoireType();
    const ctx: any = { dce: 'CCTP. Le titulaire réalise au moins quatre contrôles inopinés par mois. Site 76000 Rouen.', analyse: { clientName: 'Ville de Rouen' }, cover: { client: 'Ville de Rouen' }, referents: '' };
    const a = adaptationsDesValeursImposees(mt, ctx, mt.rubriques.map((r: any) => r.id));
    expect(a.some((x) => /quatre contrôles inopinés par mois/.test(x.exigence))).toBe(true);
  });
});
