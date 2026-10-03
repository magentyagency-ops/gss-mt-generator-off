import { describe, it, expect } from 'vitest';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-not-used';
import { alerteCctpAbsent } from '../src/generation/memoire_generator';

/** Tour 9 (T9-COH-5) : DCE remis en un seul fichier, RC puis CCTP : le CCTP est présent, aucune alerte. */
const RC = `REGLEMENT DE LA CONSULTATION\n(RC)\n\nMarché n : 2026-08\n\n${'Article du règlement de la consultation. '.repeat(120)}Le dossier comprend le cahier des clauses techniques particulières (CCTP). `;
const CCTP = `\n\nMARCHES DE L'ETAT ET DE SES ETABLISSEMENTS PUBLICS\n____\nCAHIER DES CLAUSES TECHNIQUES PARTICULIERES\n____\nMarché n : 2026-08\n\nArticle 1 - Objet. Surveillance des bâtiments.\n`;

describe('alerte « DCE sans CCTP » (T9-COH-5)', () => {
  it('un seul fichier, RC puis CCTP au-delà des 3 000 premiers caractères : aucune alerte', () => {
    expect(alerteCctpAbsent(`===== PIÈCE : DCE consultation 2026-08.pdf =====\n${RC}${CCTP}`)).toEqual([]);
  });
  it('en-tête « CCTP » répété sur les pages : aucune alerte', () => {
    expect(alerteCctpAbsent(`===== PIÈCE : DCE.pdf =====\n${RC}\nCCTP \nArticle 2.\nCCTP \nArticle 3.\nCCTP \nArticle 4.`)).toEqual([]);
  });
  it('RC seul qui cite le CCTP : l’alerte reste, avec la phrase du RC', () => {
    const a = alerteCctpAbsent(`===== PIÈCE : DCE consultation 2026-08.pdf =====\n${RC}`);
    expect(a.length).toBe(1);
    expect(a[0]).toMatch(/Le dossier comprend le cahier des clauses techniques particulières \(CCTP\)/);
  });
  it('pièce nommée RC qui porte le titre du CCTP dans sa liste des pièces : jamais tenue pour le CCTP', () => {
    expect(alerteCctpAbsent(`===== PIÈCE : Règlement de consultation.pdf =====\n${RC}\nPièces du dossier :\nCAHIER DES CLAUSES TECHNIQUES PARTICULIERES\n`).length).toBe(1);
  });
});
