// Tour 5 (T5CP-7, cstb 551) : engagements du CCTP sans valeur, rôles inversés, garantie d'assurance absente de l'attestation,
// rattachement au thème.
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { motifRefusEngagement, questionDEngagement } from '../src/generation/memoire_generator';
import { chargerMemoireType, preparerMemoireType, exigencesParRubrique } from '../src/generation/memoire_type';

describe('engagements du CCTP (T5CP-7)', () => {
  it('délai sans valeur : refusé, question exacte du délai', () => {
    const x = "GSS s'engage à réaliser la levée de doute sur site dans un délai moyen maximum après l'appel de la télésurveillance.";
    expect(motifRefusEngagement(x)).toMatch(/délai sans valeur/);
    expect(questionDEngagement(x)).toMatch(/^Quel délai GSS annonce-t-elle pour cette exigence du CCTP : « réaliser la levée de doute/);
    expect(motifRefusEngagement("GSS s'engage à respecter le délai d'intervention de levée de doute indiqué pour le marché.")).toMatch(/délai sans valeur/);
    expect(motifRefusEngagement('GSS réalise la levée de doute dans un délai maximum de 30 minutes après l’appel.')).toBe('');
  });
  it('faculté de l’acheteur et garantie absente de l’attestation : refusées', () => {
    expect(motifRefusEngagement("GSS autorise l'intervenant à utiliser le portillon piéton.")).toMatch(/faculté de l'acheteur/);
    const a = "GSS souscrit une assurance garantissant la responsabilité de GSS en cas d'accident, d'incendie ou d'explosion, ainsi qu'en cas de perte de clés.";
    expect(motifRefusEngagement(a)).toMatch(/garantie d'assurance absente/);
    expect(questionDEngagement(a)).toMatch(/^Votre attestation d'assurance \(Hiscox/);
  });
});

const DCE = path.join(__dirname, '../../_corpus_verif/_dce_textes/cstb.txt');
describe.skipIf(!fs.existsSync(DCE))('rattachement thématique des exigences (T5CP-7)', () => {
  it('assurance, comportement, congés et rondes d’ouverture vont à la rubrique de leur thème', () => {
    const mt = chargerMemoireType();
    const prep = preparerMemoireType({ analyse: {}, dce: fs.readFileSync(DCE, 'utf-8'), cover: {}, referents: '' } as any, { memoireType: mt });
    const m = [
      { exigence: "Le titulaire souscrit une assurance garantissant sa responsabilité en cas d'accident, d'incendie ou d'explosion.", rubrique: 'b4_proc_incendie' },
      { exigence: "La consommation d'alcool, le tabac et l'écoute de la radio sont interdits aux intervenants.", rubrique: 'b2_valeurs' },
      { exigence: 'Le titulaire affecte en nombre suffisant une équipe d’intervenants pour couvrir l’année et les congés.', rubrique: 'b3_interlocuteur_unique' },
      { exigence: 'Les rondes d’ouverture et de fermeture sont réalisées aux heures prévues.', rubrique: 'b4_proc_ordre_alerte' },
    ] as any[];
    const r = exigencesParRubrique(mt, prep.plan, m).parRubrique;
    const ou = (k: number) => Object.entries(r).find(([, l]) => l.includes(m[k]))?.[0];
    expect(ou(0)).toBe('b2_identite');
    expect(['b4_lmc', 'b5_controle_technique', 'b5_controle_trois_niveaux']).toContain(ou(1));
    expect(['b5_remplacement_prevu', 'b5_remplacement_imprevu', 'b3_adequation']).toContain(ou(2));
    expect(ou(3)).toBe('b4_rondes');
  });
});
