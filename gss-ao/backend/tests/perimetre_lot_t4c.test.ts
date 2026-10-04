/**
 * Tour 4, correcteur (T4-REG-1) : DCE réduit au lot du mémoire sans retirer les passages communs à plusieurs lots ou à tous
 * les lots, ni ce qui suit un intitulé numéroté à tirets (« 3-2-Délais d'intervention », « 6-5-Non-respect des consignes »),
 * ni la phrase propre au lot écrite avec l'apostrophe typographique (« S’agissant du lot n° 2 »).
 */
import { describe, it, expect } from 'vitest';
import { perimetreDuLot } from '../src/generation/base_memoires';

const ANALYSE = { lots: [{ num: 'Lot 1', perimetre: 'Gardiennage du site A' }, { num: 'Lot 2', perimetre: 'Rondes du site B' }], sites: [] };
const DCE = ['', '', '--- CADRE DE REPONSE LOT 1 ---', 'Cadre', '', '--- RC ---', '3-1 Allotissement', 'Le marché est décomposé en 2 lots :',
  'Lot n°1 : gardiennage du site A', 'Lot n°2 : rondes du site B', "3-2-Délais d'intervention",
  "Pour l'ensemble des lots, le délai d'intervention sur site est de 30 minutes.",
  'Pour les lots 1 et 2, le titulaire réalise une reconnaissance approfondie de chacun des sites.',
  "3-3-Protection de l'environnement", 'Le titulaire veille au respect des prescriptions environnementales.',
  'S’agissant du lot n° 2, aucun de ses agents ne remplit les conditions requises pour être éligible à une reprise.',
  'Pour les lots 2 et 3, une ronde de nuit est réalisée.',
  '6-5-Non-respect des consignes', 'A chaque consigne non respectée par un agent du prestataire, une pénalité est appliquée.',
  'Pour chacun des lots, la durée du contrat est d’un an.'].join('\n');

describe('DCE réduit au lot du mémoire (T4-REG-1)', () => {
  it('mémoire du lot 1 : passages communs gardés, passages du lot 2 retirés', () => {
    const r = perimetreDuLot(ANALYSE, DCE)!;
    expect(r.lot).toBe('1');
    for (const p of ["Pour l'ensemble des lots, le délai d'intervention sur site est de 30 minutes.", 'Pour les lots 1 et 2, le titulaire réalise', 'Le titulaire veille au respect des prescriptions environnementales.', 'A chaque consigne non respectée', 'Pour chacun des lots, la durée du contrat']) expect(r.dce).toContain(p);
    for (const p of ['rondes du site B', 'S’agissant du lot n° 2', 'Pour les lots 2 et 3']) expect(r.dce).not.toContain(p);
  });
  it('mémoire du lot 2 : la phrase « S’agissant du lot n° 2 » et les passages communs gardés', () => {
    const dce2 = DCE.replace('CADRE DE REPONSE LOT 1', 'CADRE DE REPONSE LOT 2');
    const r = perimetreDuLot(ANALYSE, dce2)!;
    expect(r.lot).toBe('2');
    for (const p of ['S’agissant du lot n° 2, aucun de ses agents', 'Pour les lots 1 et 2, le titulaire réalise', 'Pour les lots 2 et 3, une ronde', "Pour l'ensemble des lots"]) expect(r.dce).toContain(p);
    expect(r.dce).not.toContain('gardiennage du site A');
  });
});
