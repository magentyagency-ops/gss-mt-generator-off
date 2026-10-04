import { describe, it, expect } from 'vitest';
import { preparerMemoireType, donneesBesoin, valeurPropre, textePropre } from '../src/generation/memoire_type';
import { DCE, aCorpus } from './fixtures/corpus';

/** Tour 7 (T7-COH-1) : lot et durée de l'amorce du bloc 1, valeurs réelles relevées dans les générations. */
const amorce = (analyse: any, dce = 'Gardiennage du site de Rouen (76000).') => {
  const ctx: any = { dce, analyse };
  return donneesBesoin(preparerMemoireType(ctx), ctx).amorce;
};

describe('amorce du bloc 1 : lot et durée (T7-COH-1)', () => {
  it('« Marché unique » (ign 14, ifits 171), « Unique » (cstb 551), « Lot unique », « Non alloti », « N/A » : aucun lot', () => {
    for (const num of ['Marché unique', 'Unique', 'unique', 'Lot unique', 'Non alloti', 'N/A']) {
      expect(amorce({ clientName: "l'IGN", projectTitle: 'Gardiennage du site', lots: [{ num }] })).toBe("L'IGN lance le marché « Gardiennage du site ».");
    }
  });
  it('DCE « non alloti » (cstb 221 : « lot 1 » donné par l’analyse) : aucun lot', () => {
    // Intitulé en capitales mis en casse normale (T2-CONS-14).
    expect(amorce({ clientName: 'le CSTB', projectTitle: 'PRESTATIONS DE RONDES', lots: [{ num: '1' }] }, 'Le présent marché est non alloti. Site de Grenoble (38400).')).toBe('Le CSTB lance le marché « Prestations de rondes ».');
  });
  it('« Lot 2 » → « (lot 2) » ; plusieurs lots ; lot déjà dans l’intitulé (caen 475) : pas répété', () => {
    expect(amorce({ clientName: 'la Ville', projectTitle: 'Gardiennage', lots: [{ num: 'Lot 2' }] })).toBe('La Ville lance le marché « Gardiennage » (lot 2).');
    // Plusieurs lots sans pièce propre au lot du mémoire (T10-COH-3) : aucun lot imprimé, la question est posée à GSS.
    expect(amorce({ clientName: 'la Ville', projectTitle: 'Gardiennage', lots: [{ num: 1 }, { num: '2' }] })).toBe('La Ville lance le marché « Gardiennage ».');
    expect(amorce({ clientName: 'la Ville', projectTitle: 'Gardiennage', lots: [{ num: 1 }, { num: '2' }] }, 'Gardiennage du site de Rouen (76000).\n\n--- CADRE DE REPONSE LOT N°2.docx ---\nx')).toBe('La Ville lance le marché « Gardiennage » (lot 2).');
    expect(amorce({ clientName: "l'ACOSS", projectTitle: "Prestation de gardiennage des sites de l’ACOSS — Lot 5, site de Caen", lots: [{ num: '5' }], duration: '3 ans' }))
      .toBe("L'ACOSS lance le marché « Prestation de gardiennage des sites de l’ACOSS — Lot 5, site de Caen », d'une durée de 3 ans.");
  });
  it('durée : une durée seulement ; une période ou une date (s2e 332) n’est jamais écrite « d’une durée de »', () => {
    expect(amorce({ clientName: 'la Ville', projectTitle: 'Gardiennage', duration: '12 mois à compter de la notification' })).toBe('La Ville lance le marché « Gardiennage », d\'une durée de 12 mois à compter de la notification.');
    expect(amorce({ clientName: 'la Ville', projectTitle: 'Gardiennage', duration: 'Un an renouvelable' })).toBe('La Ville lance le marché « Gardiennage », d\'une durée d\'un an renouvelable.');
    expect(amorce({ clientName: 'la Ville', projectTitle: 'Gardiennage', duration: 'Durée initiale de 2 ans' })).toBe('La Ville lance le marché « Gardiennage », d\'une durée de 2 ans.');
    expect(amorce({ clientName: 'la Ville', projectTitle: 'Gardiennage', duration: 'Quatre (4) ans' })).toBe('La Ville lance le marché « Gardiennage », d\'une durée de quatre (4) ans.');
    for (const duration of ["À compter de la notification jusqu’au 31/12/2027, avec une reconduction tacite d’un an", '1er janvier 2027 au 31 décembre 2027', 'Du 01/01/2027 au 31/12/2027', 36]) {
      expect(amorce({ clientName: 'la Ville', projectTitle: 'Gardiennage', duration })).toBe('La Ville lance le marché « Gardiennage ».');
    }
  });
  it('valeurs qui ne sont pas des textes : jamais « [object Object] », ni un nombre pour un nom', () => {
    expect(valeurPropre({ titre: 'x' })).toBe('');
    expect(valeurPropre([{ a: 1 }])).toBe('');
    expect(valeurPropre(['a', 'b'])).toBe('a,b');
    expect(textePropre(42)).toBe('');
    expect(amorce({ clientName: 'la Ville', projectTitle: { titre: 'x' } })).toBe('');
  });
  it.skipIf(!aCorpus('cstb', 'ifits'))('DCE du corpus : cstb « non alloti », ifits « non allotissement »', () => {
    expect(amorce({ clientName: 'le CSTB', projectTitle: 'PRESTATIONS DE RONDES', lots: [{ num: 'Unique' }] }, DCE('cstb'))).toBe('Le CSTB lance le marché « Prestations de rondes ».');
    expect(amorce({ clientName: "l'IFITS", projectTitle: 'Gardiennage', lots: [{ num: '1' }] }, DCE('ifits'))).toBe("L'IFITS lance le marché « Gardiennage ».");
  });
});
