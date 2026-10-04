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
