// Tour 6 (T6C-3, T6-COH-2, T6C-10) : délai ou fréquence du CCTP qui remplace la valeur de GSS au publipostage, signalé
// à GSS (D8) ; délai normand retiré hors Normandie présenté comme une règle de GSS, jamais comme une exigence du CCTP.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { chargerMemoireType, preparerMemoireType, publierMemoire } from '../src/generation/memoire_type';
import { adaptationsDesValeursImposees, exigenceHorsNormandie, consultationsAdaptations, messageAdaptations, estRegleGss, phraseLisible, type PhraseAdaptee } from '../src/generation/adaptations_cctp';

import { DCE, aCorpus } from './fixtures/corpus';
const mt = chargerMemoireType();
const signaler = (ctx: any) => {
  const ids = publierMemoire(preparerMemoireType(ctx, { memoireType: mt })).filter((p) => p.texte).map((p) => p.id);
  return adaptationsDesValeursImposees(mt, ctx, ids);
};

describe('Délai imposé par le CCTP à la place de celui de GSS (D8)', () => {
  it.skipIf(!aCorpus('caen'))('caen 475 : « en 45 minutes » de GSS devenu « en 30 minutes » est signalé, avec la phrase du CCTP', () => {
    const l = signaler({ dce: DCE('caen'), analyse: { clientName: 'ACOSS' } });
    const alarme = l.filter((a) => a.rubrique === 'b4_proc_alarme');
    expect(alarme.length).toBe(1);
    expect(alarme[0].avant).toMatch(/en 45 minutes au maximum/);
    expect(alarme[0].apres).toMatch(/en 30 minutes au maximum/);
    expect(alarme[0].exigence).toMatch(/30 minutes/);
    // « 1 heure » du CCTP pour le remplacement = « 60 minutes » de GSS : pas une adaptation.
    expect(l.some((a) => /60 minutes/.test(a.avant) && !/60 minutes/.test(a.apres))).toBe(false);
  });
  it('DCE normand qui impose 20 et 15 minutes : deux phrases signalées ; DCE à Paris : signalées aussi', () => {
    const normand = "Marché de surveillance du site de Caen (14000). Rondes, PTI, télésurveillance, astreinte. En cas d'alarme, l'agent intervient sur site dans un délai de 20 minutes. En cas d'alarme PTI sans réponse, le titulaire est sur place dans un délai de 15 minutes.";
    const n = signaler({ dce: normand, analyse: { clientName: 'Ville de Caen' } });
    expect(n.some((a) => /20 minutes/.test(a.apres) && /45 minutes/.test(a.avant))).toBe(true);
    expect(n.some((a) => /15 minutes/.test(a.apres))).toBe(true);
    const paris = signaler({ dce: normand.replace('site de Caen (14000)', 'siège, 12 rue de Rivoli, 75001 Paris'), analyse: { clientName: 'Ville de Paris' } });
    expect(paris.some((a) => /20 minutes/.test(a.apres))).toBe(true);
  });
  it('aucun délai imposé : rien n\'est signalé', () => {
    expect(signaler({ dce: 'Gardiennage des bureaux de Rouen (76000), rondes et télésurveillance.', analyse: {} })).toEqual([]);
  });
});

describe('Délai normand retiré hors Normandie : motif, pas exigence du CCTP (T6C-10)', () => {
  it.skipIf(!aCorpus('etampes1'))('etampes1 : lieu nommé d\'après le DCE, libellé « motif (règle de GSS) »', () => {
    const e = exigenceHorsNormandie(DCE('etampes1'), {});
    expect(e).toMatch(/^Marché hors Normandie \(marché d'Étampes\)/);
    expect(estRegleGss(e)).toBe(true);
    const a: PhraseAdaptee = { n: 1, rubrique: 'x', titre: 'T', origine: 'dont 100 mobilisables en 48 heures.', adaptee: '', exigence: e, etape: 'x', statut: 'a_valider' };
    expect(consultationsAdaptations([a])[0]).toMatch(/motif \(règle de GSS, pas une exigence du CCTP\) : Marché hors Normandie/);
    expect(consultationsAdaptations([a])[0]).not.toMatch(/exigence du CCTP : «/);
    expect(messageAdaptations([a])).toMatch(/- Motif \(règle de GSS/);
    expect(messageAdaptations([{ ...a, exigence: 'Le titulaire intervient en 30 minutes.' }])).toMatch(/- Exigence du CCTP : « Le titulaire/);
  });
  it('puce de police Word retirée d\'une phrase citée', () => {
    expect(phraseLisible(' Délai maximal d’intervention : 30 minutes.')).toBe('Délai maximal d’intervention : 30 minutes.');
  });
});

describe('Valeur « de GSS » lue elle aussi dans le DCE', () => {
  it.skipIf(!aCorpus('cstb'))('cstb : la fréquence des réunions (DCE) remplacée par celle extraite du DCE n\'est pas une phrase adaptée de GSS', () => {
    const l = signaler({ dce: DCE('cstb'), analyse: { clientName: 'CSTB' }, imposees: { FREQ_REUNIONS: { valeur: 'une fois par an ; la première année, un point intermédiaire à mi-année', citation: 'Des rencontres annuelles seront organisées' } } });
    expect(l.some((a) => a.rubrique === 'b5_reunions_indicateurs')).toBe(false);
  });
});
