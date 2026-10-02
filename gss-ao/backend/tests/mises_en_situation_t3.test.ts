// T3-COH-5 : le dispositif proposé pour les mises en situation ne change plus d'une génération à l'autre (même DCE).
import { describe, it, expect } from 'vitest';
import { reprendreMisesEnSituation } from '../src/generation/dimensionnement';
import { vueEtat } from '../src/generation/completion';

const ms = (forum: number, concert: number): any[] => [
  { libelle: 'Forum des associations', capacite: 10000, fonctions: [{ fonction: 'Agent de sécurité', nombre: forum }], total: forum, pif: 4, detecteurs: 4 },
  { libelle: 'Concert', capacite: 10000, fonctions: [{ fonction: 'Agent de sécurité', nombre: concert }], total: concert, pif: 6, detecteurs: 6 },
];

describe('mises en situation reprises (T3-COH-5)', () => {
  it('même DCE (même empreinte) : la proposition précédente est reprise telle quelle', () => {
    const r = reprendreMisesEnSituation(ms(45, 78), { empreinte: 'abc', misesEnSituation: ms(22, 40) }, 'abc');
    expect(r.reprises).toBe(true);
    expect(r.misesEnSituation.map((m) => m.total)).toEqual([22, 40]);
  });
  it('DCE modifié, autres mises en situation, ou aucun état : nouvelle proposition', () => {
    expect(reprendreMisesEnSituation(ms(45, 78), { empreinte: 'abc', misesEnSituation: ms(22, 40) }, 'def').reprises).toBe(false);
    expect(reprendreMisesEnSituation(ms(45, 78).slice(0, 1), { empreinte: 'abc', misesEnSituation: ms(22, 40) }, 'abc').reprises).toBe(false);
    expect(reprendreMisesEnSituation(ms(45, 78), undefined, 'abc').misesEnSituation.map((m) => m.total)).toEqual([45, 78]);
  });
  it('la vue publique de l’état ne change pas (dimensionnement interne)', () => {
    const v: any = vueEtat({ dossierId: 'x', mode: 'cadre', fichier: '', majLe: '', elements: [], reponsesTraitees: [], dimensionnement: { empreinte: 'a', misesEnSituation: [] } } as any);
    expect(v.dimensionnement).toBeUndefined();
  });
});
