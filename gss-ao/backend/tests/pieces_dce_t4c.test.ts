/**
 * Tour 4, correcteur (T4-COH-1, T4-COH-4, T4-COH-10) : pièces du DCE reconnues sous leurs noms réels (R_C.pdf, réglement de
 * consultation.pdf, Acte_engagement…, Acted_engagement.pdf, ATTRI1…) ; un acte d'engagement ou un RC qui cite le CCTP n'est
 * jamais pris pour le cahier des charges ; « Cahier des prescriptions techniques » (CPT) est un cahier des charges ; les
 * horaires de la procédure (remise des plis, bureaux, fuseau horaire) ne sont jamais des horaires imposés.
 */
import { describe, it, expect } from 'vitest';
import { estPieceAdministrative, estCahierDesChargesParContenu, estCahierDesCharges, horairesImposes, textePreuvesIndicateurs } from '../src/generation/base_memoires';
import { alerteCctpAbsent } from '../src/generation/memoire_generator';

const RC = "REGLEMENT DE LA CONSULTATION\nArticle 1 - Objet : prestations de surveillance et de gardiennage des bâtiments communaux.\nArticle 4 - Contenu du dossier de consultation : le présent règlement, l'acte d'engagement (ATTRI1), le cahier des clauses administratives particulières (CCAP) et le cahier des clauses techniques particulières (CCTP).\nArticle 6 - Critères : valeur technique 60 %, prix 40 %.";
const AE = "MARCHÉS PUBLICS\nACTE D'ENGAGEMENT\nATTRI1\nA - Objet de l'acte d'engagement : prestations de surveillance et de gardiennage.\nB - Engagement du titulaire : après avoir pris connaissance des pièces constitutives du marché, à savoir le cahier des clauses administratives particulières (CCAP) et le cahier des clauses techniques particulières (CCTP), le signataire s'engage à exécuter les prestations.\nC - Compte à créditer : IBAN …";

describe('pièces du DCE (T4-COH-1, T4-COH-10)', () => {
  it('noms réels des pièces administratives', () => {
    for (const n of ['R_C.pdf', 'réglement de consultation.pdf', 'Reglement-de-la-consultation.pdf', 'Acte_engagement_2026-01-SECU.pdf', 'Acted_engagement.pdf', 'ATTRI1_gardiennage.docx', 'Acte-d-engagement.pdf', 'Cahierdesclausesadministrativesparticulieres.pdf']) expect(estPieceAdministrative(n), n).toBe(true);
    for (const n of ['CCTP.pdf', 'Cahier des charges.pdf', 'CPT gardiennage.pdf']) expect(estPieceAdministrative(n), n).toBe(false);
  });
  it('acte d\'engagement mal nommé qui cite le CCTP : jamais le cahier des charges ; alerte « aucun cahier des charges »', () => {
    expect(estCahierDesChargesParContenu('Pièce 2.pdf', AE)).toBe(false);
    for (const [nomRC, nomAE] of [['R_C.pdf', 'ATTRI1.pdf'], ['réglement de consultation.pdf', 'Acte_engagement.pdf'], ['Reglement-de-la-consultation.pdf', 'Pièce 2.pdf']]) {
      expect(alerteCctpAbsent(`\n\n--- ${nomRC} ---\n${RC}\n\n--- ${nomAE} ---\n${AE}`).length, `${nomRC} + ${nomAE}`).toBeGreaterThan(0);
    }
  });
  it('« Cahier des prescriptions techniques » (CPT) : cahier des charges par son nom et par son contenu', () => {
    expect(estCahierDesCharges('CPT gardiennage.pdf')).toBe(true);
    expect(estCahierDesChargesParContenu('Pièce 3.pdf', "CAHIER DES PRESCRIPTIONS TECHNIQUES\nArticle 1 - Objet\nLe titulaire assure le gardiennage.")).toBe(true);
    expect(alerteCctpAbsent(`\n\n--- RC.pdf ---\n${RC}\n\n--- Pièce 3.pdf ---\nCahier des prescriptions techniques\nArticle 1 - Objet\nLe titulaire assure le gardiennage du site.`)).toEqual([]);
  });
  it('acte d\'engagement sous son nom réel : jamais une preuve des indicateurs', () => {
    expect(textePreuvesIndicateurs(`\n\n--- Acte_engagement_2026-01-SECU.pdf ---\n${AE}\nTitulaire du compte : GSS`)).not.toContain('Titulaire du compte');
  });
});

describe('horaires de la procédure (T4-COH-4)', () => {
  it('fuseau horaire, plis et bureaux de l\'acheteur : jamais des horaires imposés', () => {
    const dce = "\n\n--- CCTP.pdf ---\nLes agents sont présents sur site du lundi au vendredi de 21h00 à 06h00 pour assurer la surveillance.\nA ce titre, le fuseau horaire de référence est celui de (GMT+01:00) Paris, Bruxelles, Copenhague, Madrid pour la remise des plis à 12h00.\nCette copie est transmise sous pli scellé à l'adresse indiquée (horaires d'ouverture des bureaux : du Lundi au Vendredi de 09H00 à 12H30).";
    const h = horairesImposes(dce);
    expect(h.join(' ')).toMatch(/de 21h00 à 06h00/);
    expect(h.join(' ')).not.toMatch(/GMT|pli scellé|ouverture des bureaux/);
  });
});
