/**
 * Tour 5, correcteur : lectures sans modèle du DCE rédigé autrement (T5G-1 délais « 0h20 » après un libellé ou dans une
 * cellule ; T5G-10 pièce unique CCAP-CCTP).
 */
import { describe, it, expect } from 'vitest';
import { normaliserExpressionsDelai, estCahierDesCharges, estPieceAdministrative, texteCctp } from '../src/generation/base_memoires';
import { preparerMemoireType, chargerMemoireType } from '../src/generation/memoire_type';

const prep = (corps: string) => preparerMemoireType({ analyse: { clientName: 'Ville de Rouen', projectTitle: 'Gardiennage' }, dce: `\n\n--- CCTP.pdf ---\nCAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES\nLe site est situé 1 place de l'Hôtel de Ville, 76000 Rouen. Le titulaire assure la télésurveillance et l'intervention sur alarme.\n${corps}\n`, referents: '' } as any, { memoireType: chargerMemoireType() } as any) as any;

describe('délai écrit en heures et minutes après un libellé ou dans une cellule (T5G-1)', () => {
  it('normalisation', () => {
    expect(normaliserExpressionsDelai("Délai d'intervention sur alarme : 0h20.")).toBe("Délai d'intervention sur alarme dans 20 minutes.");
    expect(normaliserExpressionsDelai("Intervention sur déclenchement d'alarme | 0h20")).toBe("Intervention sur déclenchement d'alarme | dans 20 minutes");
    expect(normaliserExpressionsDelai("Délai de remplacement d'un agent absent : 2h00.")).toBe("Délai de remplacement d'un agent absent dans 2 heures.");
    expect(normaliserExpressionsDelai('Délai de remplacement : 01h00.')).toBe('Délai de remplacement dans 1 heure.');
    expect(normaliserExpressionsDelai("Délai d'intervention : 0 h 20.")).toBe("Délai d'intervention dans 20 minutes.");
    expect(normaliserExpressionsDelai("Délai d'intervention : 00:20")).toBe("Délai d'intervention dans 20 minutes");
  });
  it('jamais une plage horaire', () => {
    expect(normaliserExpressionsDelai('Délai de présence : 8h00 - 19h00')).toBe('Délai de présence : 8h00 - 19h00');
    expect(normaliserExpressionsDelai('Horaires : de 8h00 à 19h00.')).toBe('Horaires : de 8h00 à 19h00.');
  });
  it('le délai du CCTP est imprimé, jamais le délai normand de GSS', () => {
    expect(prep("Délai d'intervention sur alarme : 0h20.").variables.DELAI_INTERVENTION_ALARME.valeur).toBe('20 minutes');
    expect(prep("Intervention sur déclenchement d'alarme | 0h20").variables.DELAI_INTERVENTION_ALARME.valeur).toBe('20 minutes');
    expect(prep("Délai de remplacement d'un agent absent : 2h00.").variables.DELAI_ASTREINTE.valeur).toBe('2 heures');
  });
});

describe('pièce unique CCAP-CCTP (T5G-10)', () => {
  for (const nom of ['CCAP-CCTP.pdf', 'CCAP_CCTP_gardiennage.pdf', 'CCAP valant CCTP.pdf', 'CCAP et CCTP.docx', 'CCTP-CCAP.pdf']) {
    it(`« ${nom} » est le cahier des charges`, () => {
      expect(estCahierDesCharges(nom)).toBe(true);
      expect(estPieceAdministrative(nom)).toBe(false);
      expect(texteCctp(`\n\n--- RC.pdf ---\nRÈGLEMENT\n\n--- ${nom} ---\nPARTIE 2 – CLAUSES TECHNIQUES\nremplacement dans un délai d'une heure\n`)).toMatch(/^=== /);
    });
  }
  it('un CCAP seul reste une pièce administrative', () => {
    expect(estCahierDesCharges('CCAP.pdf')).toBe(false);
    expect(estCahierDesCharges('CCAP gardiennage 2026.pdf')).toBe(false);
  });
});

import { niveauxHabilitation, qualificationsDuDce, frequenceReunionsDce, envoiPlanningsClientDce, frequenceInopinesDce, delaisDuDce } from '../src/generation/memoire_type';

describe('puce coupée en fin de ligne sous une introduction « … : » (T5G-2)', () => {
  it('le délai porté par la ligne de suite est lu', () => {
    const dce = "\n\n--- CCTP ---\nDéclenchement des actions :\n○ Le titulaire s'engage à intervenir le plus rapidement possible, en tout état de cause dans un\ndélai maximum de 20 minutes à compter du moment où il était informé par le centre de supervision.\n○ Il rend compte au client.\n";
    expect(delaisDuDce(dce, 'alarme').map((d: any) => d.minutes)).toEqual([20]);
  });
});

describe('habilitation électrique écrite avec des espaces (T5G-3)', () => {
  it('« H0 B0 » = H0B0, « H0 B0 V » = H0B0V, « B1 V » = B1V', () => {
    expect(niveauxHabilitation('habilitation électrique H0 B0.')).toEqual(['H0B0']);
    expect(niveauxHabilitation('habilitation électrique H0B0 V.')).toEqual(['H0B0V']);
    expect(niveauxHabilitation('habilitations électriques H0 B0 V')).toEqual(['H0B0V']);
    expect(niveauxHabilitation('habilitation électrique B1 V')).toEqual(['B1V']);
    expect(qualificationsDuDce("Les agents sont titulaires du CQP APS, du SST et de l'habilitation électrique H0 B0.")).toEqual(['CQP APS', 'SST', 'habilitation électrique H0B0']);
  });
});

describe('CQP écrit en toutes lettres (T5G-14)', () => {
  for (const t of ['titulaires du CQP Agent de Prévention et de Sécurité', 'titulaires du CQP « Agent de prévention et de sécurité »', 'TFP Agent de Prévention et de Sécurité', 'CQP agent de prévention et de sécurité (APS)']) {
    it(t, () => expect(qualificationsDuDce(t)).toContain('CQP APS'));
  }
});

describe('fréquence des réunions écrite autrement (T5G-13)', () => {
  const f = (t: string) => frequenceReunionsDce(`\n\n--- CCTP ---\n${t}\n`);
  it('formes lues', () => {
    expect(f('Une réunion de suivi a lieu 1 fois par mois.')).toBe('chaque mois');
    expect(f('Fréquence des réunions de suivi : 1 fois par mois.')).toBe('chaque mois');
    expect(f('Réunions de suivi : une par mois.')).toBe('chaque mois');
    expect(f('Une réunion de suivi a lieu deux fois par an.')).toBe('chaque semestre');
    expect(f('Une réunion de bilan annuelle est organisée.')).toBe('chaque année');
    expect(f('Une réunion de suivi est organisée trois fois par an.')).toBe('trois fois par an');
  });
  it('jamais la fréquence d\'un autre document', () => {
    expect(f('Le titulaire remet chaque mois un rapport qui sert de support à la réunion de suivi.')).toBe('');
    expect(f('Le titulaire transmet un bilan annuel lors de la réunion de suivi.')).toBe('');
  });
});

describe('envoi des plannings au client (T5G-7)', () => {
  const j = (t: string) => envoiPlanningsClientDce(`\n\n--- CCTP ---\n${t}\n`)?.jours;
  it('semaines et J-N', () => {
    expect(j('Le planning mensuel est adressé à la Ville une semaine avant le début du mois concerné.')).toBe(7);
    expect(j('Le planning mensuel est adressé à la Ville au moins deux semaines avant le début du mois.')).toBe(14);
    expect(j('Le titulaire transmet à la Ville les plannings du mois suivant à J-7.')).toBe(7);
    expect(j('Le planning est transmis au plus tard le 25 du mois en cours.')).toBe(5);
  });
});

describe('contrôles inopinés écrits « libellé : valeur » (T5G-8)', () => {
  const v = (t: string) => frequenceInopinesDce(`\n\n--- CCTP ---\n${t}\n`)?.valeur;
  it('« Contrôles inopinés : 4 par mois minimum », « : 4/mois »', () => {
    expect(v('Contrôles inopinés : 4 par mois minimum.')).toBe('au moins quatre fois par mois');
    expect(v('Contrôles inopinés : 4/mois.')).toBe('quatre fois par mois');
    expect(v('Le titulaire réalise au moins quatre contrôles inopinés par mois.')).toBe('au moins quatre fois par mois');
  });
});

import { evaluerIndicateurs } from '../src/generation/memoire_type';

describe('indicateurs : nuit sans vacation, télésurveillance de l\'acheteur (T5G-11, T5G-12)', () => {
  const ind = (corps: string) => evaluerIndicateurs(chargerMemoireType(), { dce: `\n\n--- CCTP.pdf ---\nCAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES\nLe titulaire assure l'accueil du public du lundi au vendredi de 8h00 à 18h00, 1 place de l'Hôtel de Ville, 76000 Rouen.\n${corps}\n`, analyse: {} } as any) as any;
  it('« fermé la nuit » ou « placé sous alarme la nuit » : pas de vacation de nuit', () => {
    expect(ind('Le bâtiment est fermé la nuit, les week-ends et les jours fériés.').VACATIONS_NUIT.valeur).toBe(false);
    expect(ind('La nuit, le bâtiment est placé sous alarme.').VACATIONS_NUIT.valeur).toBe(false);
    expect(ind('Un agent assure la surveillance de nuit de 20h00 à 6h00.').VACATIONS_NUIT.valeur).toBe(true);
  });
  it('télésurveillance assurée par les services de la Ville : hors du marché', () => {
    const e = ind('La nuit, le bâtiment est placé sous alarme ; la télésurveillance est assurée par les services de la Ville.');
    expect(e.TELESURVEILLANCE.valeur).toBe(false);
    expect(e.TELESURVEILLANCE_HORS_MARCHE.valeur).toBe(true);
    expect(ind('Le titulaire assure la télésurveillance du site et intervient sur alarme.').TELESURVEILLANCE.valeur).toBe(true);
    expect(ind('La télésurveillance fait l\'objet d\'un marché distinct.').TELESURVEILLANCE_HORS_MARCHE.valeur).toBe(true);
  });
});
