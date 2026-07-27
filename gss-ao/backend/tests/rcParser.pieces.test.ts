import { describe, it, expect } from 'vitest';
import { parseRcText } from '../src/analysis/rcParser';
import { ExtractionMethod } from '../src/schemas/common';

/**
 * Extrait RÉEL du RC « Consultation n° 2026-01-SECU » (Nouvel IMM, marché privé) :
 * numérotation « Article 7 – … » + sous-sections « 7.1 Pièces de la candidature » (sans tiret),
 * là où le parseur ne connaissait que le gabarit Rouen (« 4.1 – … »).
 */
const RC_IMM = `
Article 6 – Contenu du dossier de consultation (DCE)
Le dossier de consultation comprend :
– le présent Règlement de la consultation (RC) ;
– le Cahier des Clauses Administratives Particulières (CCAP) et ses annexes ;
– le Cahier des Clauses Techniques Particulières (CCTP) et ses annexes ;
– le modèle d'acte d'engagement et le bordereau de prix (annexe financière).

Article 7 – Présentation des candidatures et des offres
Chaque candidat produit un dossier complet, daté et signé, comprenant les pièces suivantes.
7.1 Pièces de la candidature
– lettre de candidature précisant l'identité du candidat et l'habilitation du signataire à l'engager ;
– extrait Kbis de moins de trois (3) mois ;
– déclaration sur l'honneur attestant la régularité du candidat au regard de ses obligations sociales et fiscales ;
– capacités économiques et financières : chiffre d'affaires des trois derniers exercices, attestation d'assurance de responsabilité civile professionnelle ;
– capacités professionnelles et techniques : autorisation d'exercice et agrément des dirigeants délivrés par le CNAPS, cartes professionnelles des agents, qualifications SSIAP 1 et SSIAP 2 et SST (ou équivalent), références de prestations similaires.
7.2 Pièces de l'offre
– l'acte d'engagement (modèle fourni par le Client), daté et signé ;
– le bordereau de prix (annexe financière) complété ;
– le CCAP et le CCTP paraphés et acceptés sans réserve ;
– le cas échéant, les demandes d'acceptation des sous-traitants et d'agrément de leurs conditions de paiement ;
– un mémoire technique (douze (12) pages maximum) structuré comme suit : organisation et moyens humains.
7.3 Conditions de remise
Les dossiers (candidature et offre) sont adressés en une seule fois.
`;

describe('parseRcText — pièces requises sur un RC hors gabarit Rouen', () => {
  const rc = parseRcText(RC_IMM, ExtractionMethod.PDF_PARSE, 'RC_SECURITE_IMM_2026.pdf');
  const noms = (l: { nom: string }[]) => l.map(p => p.nom);

  it('détecte les pièces de candidature malgré la numérotation « 7.1 »', () => {
    expect(rc.pieces_candidature.length).toBeGreaterThan(0);
    expect(noms(rc.pieces_candidature)).toEqual(
      expect.arrayContaining([
        'Lettre de candidature',
        'Extrait Kbis',
        "Déclaration sur l'honneur",
        "Attestation d'assurance RC professionnelle",
        "Autorisation d'exercice CNAPS / agrément des dirigeants",
        'Cartes professionnelles des agents',
      ]),
    );
  });

  it("détecte les pièces de l'offre", () => {
    expect(noms(rc.pieces_offre)).toEqual(
      expect.arrayContaining([
        "Acte d'Engagement complété, daté et signé",
        'BPU / bordereau de prix (annexe financière)',
        'Mémoire technique valant cadre de réponse',
        'CCAP et CCTP paraphés et acceptés sans réserve',
      ]),
    );
  });

  it('ne mélange pas candidature et offre (bornes de section respectées)', () => {
    expect(noms(rc.pieces_candidature)).not.toContain("Acte d'Engagement complété, daté et signé");
    expect(noms(rc.pieces_offre)).not.toContain('Extrait Kbis');
  });

  it('ne pousse plus le warning « aucune pièce détectée »', () => {
    expect(rc.source.warnings.join(' ')).not.toMatch(/Aucune pièce/i);
  });
});
