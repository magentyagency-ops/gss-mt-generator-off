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

import { appliquerModifications, chargerMemoireType, sujetsDelaisDuGabarit } from '../src/generation/memoire_type';

/** Tour 4 (T4N-2) : un délai de GSS publiposté n'est remplacé que par le délai que le DCE impose pour le même sujet. */
describe('adaptation : délai de GSS et sujet du DCE (T4N-2)', () => {
  const mt = chargerMemoireType();
  const dce = DCE('caen');
  it('caen, b4_pti : 45 minutes (PTI) ne devient pas 30 minutes (intervention sur alarme)', () => {
    const r = mt.rubriques.find((x) => x.id === 'b4_pti')!;
    expect(sujetsDelaisDuGabarit(r.texte!)).toEqual(['pti']);
    const texte = String(r.texte).replace(/\{\{#si DELAI_PTI\}\}, en \{\{DELAI_PTI\}\} au maximum\{\{\/si\}\}/, ', en 45 minutes au maximum').replace(/\{\{CLIENT\}\}/g, 'la Ville de Caen');
    const a = appliquerModifications(texte, { remplacements: [{ extrait: 'en 45 minutes au maximum', par: 'en 30 minutes au maximum', motif: 'CCTP' }] }, { dce, reference: texte, sujetsDelais: ['pti'] });
    expect(a.appliquees).toHaveLength(0);
    expect(a.texte).toContain('en 45 minutes au maximum');
  });
  it('caen : le délai de remplacement imposé (1 heure) remplace celui de GSS', () => {
    const t = "Il mobilise l'agent d'astreinte, qui est sur site en 60 minutes maximum.";
    const a = appliquerModifications(t, { remplacements: [{ extrait: 'en 60 minutes maximum', par: 'en 1 heure maximum', motif: 'CCTP' }] }, { dce, reference: t, sujetsDelais: ['remplacement'] });
    expect(a.appliquees).toHaveLength(1);
  });
});
