/**
 * Tour 4, correcteur (T4-CONS-5, T4-CONS-6, T4-CONS-13) : clauses de volume ou de montant de l'acheteur et déclarations de
 * candidature jamais imprimées comme engagements de GSS ; engagements du CCTP rattachés à la rubrique de leur objet principal
 * (délai d'intervention sur alarme → procédure d'intervention ; second agent et ses horaires → adéquation des moyens humains).
 */
import { describe, it, expect } from 'vitest';
import { CLAUSE_PRIX, chargerMemoireType, exigencesParRubrique } from '../src/generation/memoire_type';
import { PIECES_OFFRE, motifRefusEngagement } from '../src/generation/memoire_generator';

describe('clauses de l\'acheteur et déclarations de candidature (T4-CONS-5, T4-CONS-6)', () => {
  it('clause de volume ou de montant : jamais un engagement', () => {
    const prix = "GSS exécutera les prestations commandées par bons de commande au BPU, selon les quantités réellement exécutées ; l'accord-cadre sera sans minimum et plafonné à 200 000 € HT par an.";
    const volume = 'GSS prévoit un volume prévisionnel de 360 heures par an pour les prestations exceptionnelles, sans minimum ni maximum de prestations.';
    expect(CLAUSE_PRIX.test(prix)).toBe(true);
    expect(CLAUSE_PRIX.test(volume)).toBe(true);
    expect(motifRefusEngagement(prix)).not.toBe('');
    expect(motifRefusEngagement(volume)).not.toBe('');
    // Engagement de service qui cite le BPU : gardé.
    expect(motifRefusEngagement('GSS répond aux prestations exceptionnelles de renfort commandées sur la base du BPU par bon de commande avec un délai de prévenance de 48 heures ouvrées.')).toBe('');
  });
  it('déclaration de candidature : pièce de l\'offre, jamais un engagement', () => {
    const t = "GSS s'engage à attester l'absence des interdictions de soumissionner prévues aux articles L.2141-1 à L.2141-5 et L.2141-7 à L.2141-11 du Code de la commande publique, ainsi que le respect des obligations relatives à l'emploi des travailleurs handicapés prévues aux articles L.5212-1 à L.5212-11 du Code du travail.";
    expect(PIECES_OFFRE.test(t)).toBe(true);
    expect(motifRefusEngagement(t)).toBe('pièce de l\'offre');
    expect(PIECES_OFFRE.test('Le candidat fournit le DUME ou les formulaires DC1 et DC2.')).toBe(true);
    // Engagement RSE de GSS sur l'emploi : gardé.
    expect(PIECES_OFFRE.test('GSS favorise l\'insertion et l\'emploi de personnes en situation de handicap.')).toBe(false);
  });
});

describe('rattachement des engagements à la rubrique de leur objet (T4-CONS-13)', () => {
  const mt = chargerMemoireType();
  const plan = { rubriques: mt.rubriques.map((r) => ({ id: r.id })) } as any;
  const ou = (exigence: string, rubrique: string) => {
    const r = exigencesParRubrique(mt, plan, [{ exigence, rubrique } as any]);
    return Object.entries(r.parRubrique).find(([, l]) => l.some((e) => e.exigence === exigence))?.[0] || '';
  };
  it('délai d\'intervention sur alarme : procédure d\'intervention, jamais la formation (HO/BE)', () => {
    expect(ou("Alarme technique : intervenir en 30 minutes maximum, sauf bouton anti-agression en 15 minutes maximum ; vérifier l'équipement, acquitter le défaut seulement après contrôle, effectuer si nécessaire des opérations simples en environnement à risque électrique (HO/BE).", 'b3_formation_secourisme')).toBe('b4_proc_alarme');
  });
  it('second agent et ses horaires : adéquation des moyens humains, jamais la main courante', () => {
    expect(ou("Le second agent SSIAP 1/CQP APS doit avoir les mêmes qualifications, périmètre d'intervention et règles de traçabilité que le premier ; il peut être sollicité du lundi au samedi de 22h à 6h et 24h/24 les dimanches et jours fériés.", 'b4_main_courante')).toBe('b3_adequation');
  });
  it('clause de prix et déclaration de candidature : aucune rubrique', () => {
    expect(ou("L'accord-cadre est sans minimum et plafonné à 200 000 € HT par an.", 'b5_outils_suivi')).toBe('');
    expect(ou("Attester l'absence des interdictions de soumissionner prévues aux articles L.2141-1 à L.2141-5.", 'b5_remplacement_prevu')).toBe('');
  });
});

// Tour 4, correcteur (T4N-6, becquerel 1401) : phrase ajoutée par l'adaptation hors du sujet de sa rubrique.
import { rubriqueDeLAjout } from '../src/generation/memoire_type';
describe('phrase ajoutée par l\'adaptation rangée dans la rubrique de son sujet (T4N-6)', () => {
  const mt = chargerMemoireType();
  const ids = mt.rubriques.map((r) => r.id);
  it('confidentialité ajoutée sous « La reprise du personnel en place » : livre des missions et consignes', () => {
    expect(rubriqueDeLAjout(mt, ids, 'b3_reprise_personnel', "L'ensemble du personnel maintient confidentielles les données médicales, scientifiques, professionnelles et de sûreté ; il ne divulgue pas la présence de patients ni les protocoles de sûreté, notamment attentat.")).toBe('b4_lmc');
  });
  it('phrase du sujet de la rubrique : reste', () => {
    expect(rubriqueDeLAjout(mt, ids, 'b3_reprise_personnel', 'Le personnel en place repris conserve son ancienneté et ses avantages acquis.')).toBe('b3_reprise_personnel');
  });
});
