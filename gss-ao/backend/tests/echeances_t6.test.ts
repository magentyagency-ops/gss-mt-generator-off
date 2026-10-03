// Tour 6 (T6-COH-6) : validité de l'assurance et échéance ISO écrites en dur ; après l'échéance, plus imprimées, question à GSS.
import { describe, it, expect } from 'vitest';
import { chargerMemoireType, preparerMemoireType, publierRubrique, echeancesDepassees } from '../src/generation/memoire_type';

const mt = chargerMemoireType();
const prep = preparerMemoireType({ dce: 'Gardiennage des bureaux de Rouen (76000).', analyse: { clientName: 'Ville de Rouen' } } as any, { memoireType: mt });
const identite = mt.rubriques.find((r) => r.id === 'b2_identite')!;
const controle = mt.rubriques.find((r) => r.id === 'b5_controle_trois_niveaux')!;

describe('Échéances du texte de GSS', () => {
  it('avant le 16 mars 2027 et en 2026 : texte inchangé, aucune question', () => {
    const r = publierRubrique(mt, identite, prep.variables, prep.indicateurs, '', { date: new Date(2026, 9, 3) });
    expect(r.texte).toMatch(/attestation valable du 21 septembre 2026 au 16 mars 2027/);
    expect(r.texte).toMatch(/ISO 9001 en cours, prévue fin 2026/);
    expect(r.aConfirmer.filter((x) => x.variable.startsWith('echeance:'))).toEqual([]);
  });
  it('après le 16 mars 2027 : validité retirée, nouvelle attestation demandée ; ISO : échéance retirée, question', () => {
    const r = publierRubrique(mt, identite, prep.variables, prep.indicateurs, '', { date: new Date(2027, 2, 17) });
    expect(r.texte).not.toMatch(/attestation valable/);
    expect(r.texte).toMatch(/Hiscox, contrat HA RCP0242762 : responsabilité civile professionnelle/);
    expect(r.texte).toMatch(/certification ISO 9001 en cours\./);
    const q = r.aConfirmer.filter((x) => x.variable.startsWith('echeance:')).map((x) => x.question);
    expect(q).toEqual([
      "L'attestation d'assurance responsabilité civile Hiscox (contrat HA RCP0242762) a expiré le 16 mars 2027 : pouvez-vous joindre la nouvelle attestation (dates de validité et montants) ?",
      'La certification ISO 9001 était prévue fin 2026 : est-elle obtenue (date de certification) ou toujours en cours (nouvelle échéance) ?',
    ]);
    const c = publierRubrique(mt, controle, prep.variables, prep.indicateurs, '', { date: new Date(2027, 0, 2) });
    expect(c.texte).toMatch(/Notre démarche de certification ISO 9001 est en cours\./);
    expect(c.texte).not.toMatch(/prévue fin 2026/);
  });
  it('fonction seule', () => {
    expect(echeancesDepassees('certification ISO 9001 en cours, prévue fin 2026.', new Date(2026, 11, 31)).questions).toEqual([]);
  });
});
