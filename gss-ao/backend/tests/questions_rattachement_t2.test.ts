import { describe, it, expect } from 'vitest';
import { memeDemande, elementsSansDoublon, motifRefusEngagement } from '../src/generation/memoire_generator';
import { questionDelaiInapplicable } from '../src/generation/base_memoires';
import { chargerMemoireType, planMemoireType, exigencesParRubrique, preparerMemoireType, publierMemoire, evaluerIndicateurs } from '../src/generation/memoire_type';

const mt = chargerMemoireType();
const DCE_CSTB = `Pendant la fermeture du site, les bâtiments sont sécurisés avec un système de détection de présence et un système de
détection incendie, tous deux reliés à des alarmes gérées par une entreprise de télésurveillance (hors marché).
Note 5 : Le titulaire indiquera dans le cadre de réponse et/ou son mémoire technique, le délai moyen maximum pour intervenir
sur site afin d’effectuer sa levée de doute suite à l’appel de la télésurveillance. CSTB, 24 rue Joseph Fourier, 38400 Saint Martin d'Hères.`;

/** Tour 2 (T2C-7, cstb 221) : questions à GSS sans doublon, sans délai normand hors Normandie, partenaire hors sujet. */
describe('questions à GSS : doublons, délais, télésurveillance hors marché', () => {
  it('fusionne deux formulations de la même demande, jamais deux demandes distinctes', () => {
    const a = 'Quel est le délai moyen maximum d’intervention sur site après appel de télésurveillance pour une levée de doute ?';
    const b = 'GSS indiquera-t-elle le délai moyen maximum d’arrivée sur site du rondier après l’appel de la télésurveillance pour effectuer une levée de doute ?';
    expect(memeDemande(a, b)).toBe(true);
    expect(memeDemande('Quel est le nombre total d’agents proposés par GSS pour assurer la sécurité du forum ?', 'Quel est le nombre total d’agents proposés par GSS pour assurer la sécurité du concert ?')).toBe(false);
    expect(memeDemande('Quel est le chiffre d’affaires HT total de GSS réalisé en 2025, en euros ?', 'Quel est le chiffre d’affaires HT total de GSS réalisé en 2024, en euros ?')).toBe(false);
    expect(memeDemande('Combien d’agents de sécurité seront en service au groupe scolaire le dimanche ?', 'Combien d’agents de sécurité incendie seront en service au groupe scolaire le dimanche ?')).toBe(false);
    const els = elementsSansDoublon([
      { cle: 'Q1', question: a, contexte: '… : [À COMPLÉTER]', statut: 'ouvert', reperes: [1] },
      { cle: 'Q2', question: 'Quel est le nom du responsable technique unique ?', contexte: '', statut: 'ouvert' },
      { cle: 'Q3', question: b, contexte: '', statut: 'ouvert' },
    ]);
    expect(els.map((e) => e.cle)).toEqual(['Q1', 'Q2']);
    // Question sans emplacement posée avant celle qui porte l'emplacement : c'est elle qui est retirée.
    const els2 = elementsSansDoublon([
      { cle: 'Q3', question: b, contexte: '', statut: 'ouvert' },
      { cle: 'Q1', question: a, contexte: '… : [À COMPLÉTER]', statut: 'ouvert', reperes: [1] },
    ]);
    expect(els2.map((e) => e.cle)).toEqual(['Q1']);
  });

  it('jamais de question sur un délai chiffré absent du DCE hors Normandie, ni sur un délai déjà au registre', () => {
    const q = 'GSS confirme-t-elle un délai maximal de 60 minutes pour l’arrivée de l’agent d’astreinte en cas d’absence imprévue ?';
    expect(questionDelaiInapplicable(q, DCE_CSTB, true)).toBe(true);
    expect(questionDelaiInapplicable(q, 'CCTP sans délai de remplacement.', false)).toBe(true);
    // Délai que le DCE demande : la question reste.
    expect(questionDelaiInapplicable('Quel est le délai moyen maximum pour intervenir sur site après l’appel de la télésurveillance ?', DCE_CSTB, true)).toBe(false);
    expect(questionDelaiInapplicable('Le CCTP impose 30 minutes : GSS confirme-t-elle ce délai de 30 minutes ?', 'arrivée sous 30 minutes', true)).toBe(false);
  });

  it('télésurveillance hors marché : la phrase du partenaire n’est pas reprise et aucune question n’est posée', () => {
    const ind = evaluerIndicateurs(mt, { analyse: { clientName: 'CSTB' }, dce: DCE_CSTB });
    expect(ind.TELESURVEILLANCE_HORS_MARCHE.valeur).toBe(true);
    const texte = (dce: string) => publierMemoire(preparerMemoireType({ analyse: { clientName: 'CSTB' }, dce }, { memoireType: mt })).find((r) => r.id === 'b4_proc_alarme')?.texte || '';
    expect(texte(DCE_CSTB)).not.toMatch(/partenaire en télésurveillance/);
    expect(texte(DCE_CSTB)).toMatch(/station de télésurveillance reçoit un signal/);
    const autre = 'Le site est relié à une station de télésurveillance ; le rondier intervient sur alarme.';
    expect(evaluerIndicateurs(mt, { analyse: {}, dce: autre }).TELESURVEILLANCE_HORS_MARCHE.valeur).toBe(false);
    expect(texte(autre)).toMatch(/Notre partenaire en télésurveillance est/);
  });
});

/** Tour 2 (T2C-8, cstb 221) : exigences du CCTP rattachées à la bonne rubrique. */
describe('rattachement des exigences du CCTP', () => {
  const plan = planMemoireType(mt, Object.fromEntries(Object.keys(mt.indicateurs).map((k) => [k, k !== 'HORS_NORMANDIE' && k !== 'TELESURVEILLANCE_HORS_MARCHE'])));
  const ex = (rubrique: string, exigence: string) => ({ rubrique, exigence, sujet: '', theme: 'V', criticite: 'importante' } as any);
  it('absence imprévue jamais sous l’absence prévue, exigence d’exécution jamais dans le bloc de présentation', () => {
    const { parRubrique } = exigencesParRubrique(mt, plan, [
      ex('b5_remplacement_prevu', 'Le titulaire remplace toute absence imprévue d’un agent rondier.'),
      ex('b5_remplacement_prevu', 'Toute absence prévue est signalée au CSTB au moins 48 heures à l’avance.'),
      ex('b2_catalogue', 'Les rondes de nuit sont effectuées entre 21h30 et 06h30, trois fois par nuit.'),
      ex('b2_identite', 'Le titulaire justifie de son autorisation d’exercer délivrée par le CNAPS.'),
    ]);
    expect((parRubrique.b5_remplacement_prevu || []).map((e) => e.exigence)).toEqual(['Toute absence prévue est signalée au CSTB au moins 48 heures à l’avance.']);
    expect((parRubrique.b5_remplacement_imprevu || []).length).toBe(1);
    expect(parRubrique.b2_catalogue).toBeUndefined();
    expect(Object.entries(parRubrique).some(([id, l]) => /^b4_/.test(id) && l.some((e) => /rondes de nuit/.test(e.exigence)))).toBe(true);
    expect((parRubrique.b2_identite || []).length).toBe(1);
  });

  it('un engagement qui renvoie à un « délai contractuel » non chiffré est refusé', () => {
    expect(motifRefusEngagement('GSS s’engage à remplacer toute absence imprévue dans le délai contractuel.')).not.toBe('');
    expect(motifRefusEngagement('GSS remplace l’agent absent dans le délai contractuel de 2 heures.')).toBe('');
  });
});
