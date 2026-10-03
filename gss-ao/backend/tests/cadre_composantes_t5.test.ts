// Tour 5 (T5CP-2, etampes2 552) : chaque composante du cadre que le mémoire type de GSS traite reçoit la rubrique de GSS
// (interlocuteur unique, agréments, contrôles, méthodologie, délais, absence et intrusion d'une mise en situation).
import { describe, it, expect } from 'vitest';
import { candidatsReference, rubriquesThematiques, referencesPrincipales, attribuerRubriques, type CandidatReference } from '../src/generation/memoire_type_cadre';
import { chargerMemoireType } from '../src/generation/memoire_type';

const mt = chargerMemoireType();
const textes = Object.fromEntries(mt.rubriques.filter((r) => r.texte && r.mode !== 'besoin').map((r) => [r.id, r.texte!]));
const ids = Object.keys(textes);
const Q4 = 'Le nombre d’équipes ; La composition des équipes (interlocuteur unique à la ville, encadrants, CV détaillés, agréments, certificats et cartes professionnelles, etc)';
const Q5 = 'Engagement de la société sur la stabilité des équipes : Détails du recours à la sous-traitance et à l’intérim ; Description des modalités de contrôle des agents salariés, intérimaires et des sociétés de sous-traitance';
const Q6 = 'Descriptif de la méthodologie de sécurisation des sites visés';
const Q7 = 'Délais d’interventions proposés par le candidat';
const Q10 = 'Mise en situation appliquée : Descriptif de la solution suggérée par le candidat en cas d’absence de 2 agents et d’1 chien ne pouvant exercer ; Descriptif de la solution en cas de débordement: intrusion au sein du périmètre défini et dégradation de type vandalisme';

describe('composantes du cadre traitées par le mémoire type (T5CP-2)', () => {
  it('rubriques nommées par la question', () => {
    expect(rubriquesThematiques(Q4, ids)).toEqual(['b3_interlocuteur_unique', 'b2_identite']);
    expect(rubriquesThematiques(Q5, ids)).toEqual(['b5_controle_trois_niveaux']);
    expect(rubriquesThematiques(Q6, ids, { evenementiel: true })).toEqual(['b5_mise_en_place', 'b5_evenementiel']);
    expect(rubriquesThematiques(Q6, ids)).toEqual(['b5_mise_en_place']);
    expect(rubriquesThematiques(Q7, ids)).toEqual(['b5_commande_supplementaire']);
    expect(rubriquesThematiques(Q10, ids, { hors: true })).toEqual(['b5_remplacement_prevu', 'b5_remplacement_imprevu', 'b4_proc_intrusion']);
    // Cas pratique : seules les procédures nommées, jamais une rubrique de présentation.
    expect(rubriquesThematiques('Présentation du dispositif humain : interlocuteur unique', ids, { hors: true })).toEqual([]);
  });
  it('mise en situation : les procédures de GSS sont candidates, jamais vide', () => {
    const c = candidatsReference(mt, textes, `${Q10} Cas pratique : sécurisation d’un périmètre`, { hors: true, questionSeule: Q10 });
    expect(c.map((x) => x.id).sort()).toEqual(['b4_proc_intrusion', 'b5_remplacement_imprevu', 'b5_remplacement_prevu']);
    expect(c.every((x) => x.theme)).toBe(true);
    expect(candidatsReference(mt, textes, 'Cas pratique : gardiennage d’un site municipal', { hors: true })).toEqual([]);
  });
  it('attribution : la rubrique va au champ qui la nomme ; les rubriques nommées restent à côté de la principale', () => {
    const scores = Object.fromEntries(ids.map((id) => [id, id === 'b3_adequation' ? 0.6 : 0.5]));
    const c4 = candidatsReference(mt, textes, Q4, { scores, questionSeule: Q4 });
    const c5 = candidatsReference(mt, textes, Q5, { scores, questionSeule: Q5 });
    const a = attribuerRubriques([{ id: 4, libelle: 'Q4', candidats: c4 }, { id: 5, libelle: 'Q5', candidats: c5 }]);
    expect(a.candidats.get(4)!.map((x) => x.id)).toEqual(expect.arrayContaining(['b3_interlocuteur_unique', 'b2_identite']));
    expect(a.candidats.get(5)!.map((x) => x.id)).toContain('b5_controle_trois_niveaux');
    const r = (id: string, score: number, theme = false): CandidatReference => ({ cle: id, id, titre: id, texte: '', score, ...(theme ? { theme: true } : {}) });
    expect(referencesPrincipales([r('b3_adequation', 0.6), r('b3_recrutement', 0.5), r('b3_interlocuteur_unique', 0.95, true), r('b2_identite', 0.94, true)]).map((x) => x.id))
      .toEqual(['b3_interlocuteur_unique', 'b2_identite', 'b3_adequation']);
  });
});

describe('clauses environnementales (etampes1 594)', () => {
  it('flotte et écogestes : les deux volets de l’engagement écologique de GSS', () => {
    expect(rubriquesThematiques('Clauses environnementales (Flotte automobile, écogestes…)', ids)).toEqual(['b2_ecologie_mobilite_numerique', 'b2_ecologie_energie_recyclage']);
  });
});
