import { describe, it, expect } from 'vitest';
import { trierNouvelles, grouperNouvelles, controlerProposition, memoireTypeActif } from '../src/generation/reponse_libre_v2';
import { motifRefusAlignement, montantsRegistre } from '../src/generation/base_memoires';
import { chargerMemoireType, planMemoireType } from '../src/generation/memoire_type';

const mt = chargerMemoireType();
const plan = planMemoireType(mt, Object.fromEntries(Object.keys(mt.indicateurs).map((k) => [k, k !== 'HORS_NORMANDIE'])));
const ex = (sujet: string, exigence: string) => ({ sujet, exigence, theme: 'V', criticite: 'importante' } as any);

/** Tour 2 (T2N-3, parc_expo 202) : aucune proposition de réponse sur les clauses d'assurance du CCAP (administratif). */
describe('questions nouvelles : assurances et regroupement', () => {
  it('écarte les clauses d’assurance, garde l’assurance qualité', () => {
    const r = trierNouvelles(mt, plan, [
      ex('Assurances et garanties financières', 'Le titulaire doit être couvert par une assurance garantissant au minimum 10 000 000 € par sinistre.'),
      ex('Attestations d’assurance', "Le titulaire transmet chaque année une attestation d'assurance en cours de validité."),
      ex('Modification des assurances', "Le titulaire informe immédiatement de toute modification de son contrat d'assurance."),
      ex('Plan d’assurance qualité', 'Le titulaire remet un plan d’assurance qualité propre au marché, mis à jour chaque année avec le comité de pilotage.'),
    ]);
    const restantes = [...r.nouvelles, ...Object.values(r.rattachees).flat()].map((e) => e.sujet);
    expect(restantes).toEqual(['Plan d’assurance qualité']);
  });
  it('regroupe deux sujets qui ne diffèrent que par le nombre', () => {
    const g = grouperNouvelles([ex('Attestations de formation', 'a'), ex('Attestation de formation', 'b')]);
    expect(g.groupes.length).toBe(1);
  });
});

/** Tour 2 (T2N-2, T2N-3) : les faits de GSS ne sont jamais remplacés par un seuil du DCE ; propositions contrôlées. */
describe('faits de GSS et propositions', () => {
  it('refuse le remplacement d’un montant d’assurance de GSS', () => {
    expect(motifRefusAlignement('responsabilité civile professionnelle 300 000 € par sinistre et par année d’assurance', 'responsabilité civile professionnelle au minimum 10 000 000 € par sinistre')).not.toBe('');
    expect(motifRefusAlignement('contrat HA RCP0242762', 'contrat adapté')).not.toBe('');
    expect(motifRefusAlignement('les contrôles ont lieu deux fois par mois', 'les contrôles ont lieu trois fois par mois')).toBe('');
  });
  it('retire sous-traitance, amorce sans objet et garanties qui ne sont pas celles de GSS', () => {
    const t = [
      '## Confidentialité',
      'Les agents respectent la confidentialité des informations. Si une sous-traitance devait être mise en place, les obligations seraient communiquées au sous-traitant : [À COMPLÉTER].',
      '[CONSULTATION REQUISE : préciser les modalités de transmission à un éventuel sous-traitant]',
      '## Assurances',
      'Les garanties actuellement indiquées sont : responsabilité civile professionnelle au minimum 10 000 000 € par sinistre.',
      'Responsabilité civile professionnelle : 300 000 € par sinistre et par année d’assurance.',
      'Disponibilité d’une attestation couvrant la date de commencement des prestations si : [À COMPLÉTER].',
      '[CONSULTATION REQUISE : Confirmer la disponibilité d’une attestation]',
    ].join('\n');
    const r = controlerProposition(t, montantsRegistre());
    expect(r.texte).not.toMatch(/sous-trait/i);
    expect(r.texte).not.toMatch(/10 000 000/);
    expect(r.texte).toMatch(/300 000 €/);
    expect(r.texte).not.toMatch(/si : \[À COMPLÉTER\]/);
    expect(r.texte).not.toMatch(/Confirmer la disponibilité/);
    expect(r.questions.length).toBe(1);
    expect(r.questions[0]).toMatch(/\?$/);
  });
  it('le mémoire type actif est chargé', () => { expect(memoireTypeActif()).toBeTruthy(); });
});
