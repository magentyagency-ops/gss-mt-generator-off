/**
 * Tour 4, correcteur (T4G-3) : délais et fréquences du CCTP écrits en tableau, en liste à puces ou dans la phrase suivante, lus
 * sans modèle : le délai du CCTP (20 ou 10 minutes) est imprimé, jamais le délai normand de GSS (45 minutes) ; « 4 par mois »
 * de contrôles inopinés en tableau compte quatre contrôles.
 */
import { describe, it, expect } from 'vitest';
import { preparerMemoireType, delaiDuDce } from '../src/generation/memoire_type';

const TETE = "\n\n--- CCTP ---\nCAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES\nARTICLE 1 – OBJET\nSurveillance du siège de la Caisse, 12 rue Jeanne d'Arc, 76000 Rouen. Un agent de sécurité est présent du lundi au vendredi de 7h00 à 21h00. Le site est raccordé à une station de télésurveillance ; le titulaire assure l'intervention d'un rondier sur alarme. Les agents travaillant seuls sont équipés d'un PTI.\n";
const lire = (dce: string) => {
  const prep: any = preparerMemoireType({ analyse: { clientName: "Caisse d'épargne Normandie", sites: [{ name: 'Siège', address: "12 rue Jeanne d'Arc, 76000 Rouen" }] }, dce, referents: '' } as any);
  return { astreinte: prep.variables.DELAI_ASTREINTE?.valeur, alarme: prep.variables.DELAI_INTERVENTION_ALARME?.valeur, pti: prep.variables.DELAI_PTI?.valeur, freq: prep.variables.FREQ_CONTROLE_2?.valeur };
};

describe('délais du CCTP en tableau, en liste et dans la phrase suivante (T4G-3)', () => {
  it('tableau Word et rendu étiqueté', () => {
    const r = lire(`${TETE}ARTICLE 7 – DÉLAIS D'INTERVENTION\nLe titulaire respecte les délais maximaux suivants :\nÉvénement | Délai maximal\nRemplacement d'un agent absent | 1 heure\nIntervention sur déclenchement d'alarme | 20 minutes\nDéclenchement d'un PTI | 10 minutes\n\n=== TABLEAUX (cellules étiquetées par en-tête de colonne) ===\nRemplacement d'un agent absent — Délai maximal: 1 heure\nIntervention sur déclenchement d'alarme — Délai maximal: 20 minutes\nDéclenchement d'un PTI — Délai maximal: 10 minutes\n`);
    expect(r).toMatchObject({ astreinte: '1 heure', alarme: '20 minutes', pti: '10 minutes' });
  });
  it('liste à puces sous une introduction sur les délais', () => {
    const r = lire(`${TETE}ARTICLE 7 – DÉLAIS D'INTERVENTION\nLes délais maximaux sont les suivants :\n- remplacement d'un agent absent : 1 heure ;\n- intervention sur alarme : 20 minutes ;\n- levée de doute PTI : 10 minutes.\n`);
    expect(r).toMatchObject({ astreinte: '1 heure', alarme: '20 minutes', pti: '10 minutes' });
  });
  it('« Délai maximum : 20 minutes » dans la phrase suivante, « 20 minutes au plus tard après », « 2 hrs », « a 2 heures pour »', () => {
    expect(delaiDuDce('En cas d\'alarme, un agent se rend sur site. Délai maximum : 20 minutes.', 'alarme')).toBe('20 minutes');
    expect(delaiDuDce('Le rondier doit être sur site 20 minutes au plus tard après l\'appel de la télésurveillance.', 'alarme')).toBe('20 minutes');
    expect(delaiDuDce('Tout agent absent est remplacé dans un délai de 2 hrs.', 'remplacement')).toBe('2 heures');
    expect(delaiDuDce("Le titulaire a 2 heures pour pourvoir au remplacement d'un agent absent.", 'remplacement')).toBe('2 heures');
  });
  it('contrôles inopinés « 4 par mois » en tableau : quatre contrôles', () => {
    const r = lire(`${TETE}ARTICLE 10 – CONTRÔLES ET SUIVI\nContrôle | Fréquence\nContrôle inopiné des agents sur site | 4 par mois\n`);
    expect(String(r.freq)).toMatch(/quatre fois par mois/);
  });
});
