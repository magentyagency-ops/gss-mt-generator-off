// T10-COH-6 : sites certainement hors de la zone de GSS (« moitié nord, de Nantes à Lille et jusqu'à Reims ») : question exacte.
import { describe, it, expect } from 'vitest';
import { alerteHorsZone } from '../src/generation/base_memoires';
import { aCorpus, DCE } from './fixtures/corpus';

describe('marché hors de la zone de GSS (T10-COH-6)', () => {
  it('Marseille et Gap : question exacte, procédures d’astreinte signalées', () => {
    const a = alerteHorsZone({}, "Prestations de l'Hôpital Nord, 15 chemin des Bourrely, 13015 Marseille, et du Centre hospitalier de Gap, 1 place Auguste Muret, 05000 Gap.");
    expect(a).toEqual(["Les sites du marché (Marseille et Gap) sont hors de la zone où GSS a ses équipes et son astreinte (moitié nord, de Nantes à Lille et jusqu'à Reims) : GSS répond-elle à ce marché, et avec quelle organisation d'astreinte et de remplacement sur place ? Le mémoire reprend telles quelles vos procédures d'astreinte (protection du travailleur isolé, intervention sur alarme, remplacement d'un agent absent) : à confirmer ou à modifier via l'assistant avant la remise."]);
  });
  it('zone de GSS ou frontière non tranchée : aucune alerte', () => {
    for (const adr of ['12 rue Jeanne d’Arc, 76000 Rouen', '3 rue de Paris, 35000 Rennes', '1 place de la Gare, 59000 Lille', '2 rue Royale, 37000 Tours']) expect([adr, alerteHorsZone({}, `Site : ${adr}.`)]).toEqual([adr, []]);
  });
});

describe.skipIf(!aCorpus('cstb', 'citedia'))('corpus (T10-COH-6)', () => {
  it('cstb (Isère) signalé, citedia (Rennes) non', () => {
    expect(alerteHorsZone({}, DCE('cstb')).length).toBe(1);
    expect(alerteHorsZone({}, DCE('citedia'))).toEqual([]);
  });
});
