import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { delaiDuDce } from '../src/generation/memoire_type';

const DCE = (n: string) => fs.readFileSync(path.join(__dirname, '../../_corpus_verif/_dce_textes', `${n}.txt`), 'utf-8');

/** Tour 4 (T4C-4) : le délai de remplacement d'un véhicule n'est jamais le délai de remplacement d'un agent. */
describe('delaiDuDce : remplacement du personnel seulement (T4C-4)', () => {
  it('rouen_univ : « remplacés en moins de 24H par un véhicule équivalent » n\'est pas un délai de remplacement d\'agent', () => {
    expect(delaiDuDce('En cas de panne ils devront être remplacés en moins de 24H par un véhicule équivalent.', 'remplacement')).toBe('');
    expect(delaiDuDce(DCE('rouen_univ'), 'remplacement')).toBe('');
  });
  it('les délais de remplacement d\'agent du corpus sont gardés', () => {
    expect(delaiDuDce(DCE('caen'), 'remplacement')).toBe('1 heure');
    expect(delaiDuDce(DCE('imm'), 'remplacement')).toBe('4 heures');
    expect(delaiDuDce(DCE('ign'), 'remplacement')).toBe('2 heures');
    expect(delaiDuDce('Remplacement sous 4h maximum.', 'remplacement')).toBe('4 heures');
    expect(delaiDuDce("En cas de défaillance d'un agent équipé de son téléphone, il est remplacé dans un délai de deux heures.", 'remplacement')).toBe('2 heures');
  });
});
