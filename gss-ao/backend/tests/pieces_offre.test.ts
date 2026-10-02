import { describe, it, expect } from 'vitest';
import { PIECES_OFFRE } from '../src/generation/memoire_generator';

/** Tour 1 (R1-2) : seule une phrase qui parle de remplir ou chiffrer une pièce financière est écartée ; un engagement de
 *  service qui cite le bordereau (Becquerel, 48 heures ouvrées) reste dans le mémoire et dans les exigences. */
describe('PIECES_OFFRE', () => {
  it('écarte le remplissage d’une pièce financière (imm 15)', () => {
    expect(PIECES_OFFRE.test('GSS complétera le BPU des prestations ponctuelles avec des taux distincts.')).toBe(true);
    expect(PIECES_OFFRE.test('Le candidat renseigne la DPGF jointe au dossier.')).toBe(true);
    expect(PIECES_OFFRE.test('Le DQE doit être complété et signé.')).toBe(true);
  });
  it('garde un engagement de service qui cite le BPU (Becquerel)', () => {
    expect(PIECES_OFFRE.test('Renforts exceptionnels commandés sur la base du BPU avec un délai de prévenance de 48 heures ouvrées')).toBe(false);
    expect(PIECES_OFFRE.test('- GSS répond aux prestations exceptionnelles de renfort commandées sur la base du BPU par bon de commande avec un délai de prévenance de 48 heures ouvrées.')).toBe(false);
  });
  it('garde les pièces de l’offre déjà écartées avant la refonte', () => {
    expect(PIECES_OFFRE.test('Le mémoire technique limité à 20 pages')).toBe(true);
    expect(PIECES_OFFRE.test('Acte d’engagement signé')).toBe(true);
  });
});
