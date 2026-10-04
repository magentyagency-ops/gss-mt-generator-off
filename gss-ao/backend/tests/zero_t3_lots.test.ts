// Campagne « zéro défaut », tour 3 : mémoire d'un seul lot (T3G-4, T3G-5).
import { describe, it, expect } from 'vitest';
import { numeroDeLot, lotsDuMemoireDce, perimetreDuLot } from '../src/generation/base_memoires';
import { preparerMemoireType, chargerMemoireType, donneesBesoin } from '../src/generation/memoire_type';

const analyse = { lots: [{ num: 'Lot 1', perimetre: 'Agence de Lyon' }, { num: 'Lot 2', perimetre: 'Agence de Rouen' }], sites: [{ name: 'Agence de Lyon', address: '69003 Lyon' }, { name: 'Agence de Rouen', address: '76000 Rouen' }] };
const commun = "\n\n--- CCTP.pdf ---\nCahier des clauses techniques particulières.\nArticle 1 - Objet\nGardiennage de deux agences.\n";
const formes: Record<string, string> = {
  titres: 'LOT 1\nAgence de Lyon, 69003 Lyon. En cas d\'absence, l\'agent est remplacé dans un délai d\'une heure.\nLOT 2\nAgence de Rouen, 76000 Rouen. En cas d\'absence, l\'agent est remplacé dans un délai de trois heures.\n',
  tableau: '| Lot | Site | Adresse |\n|---|---|---|\n| 1 | Agence de Lyon | 69003 Lyon |\n| 2 | Agence de Rouen | 76000 Rouen |\n',
  phrase: 'Pour le lot 1, le site est l\'Agence de Lyon, 69003 Lyon.\nPour le lot 2, le site est l\'Agence de Rouen, 76000 Rouen.\n',
  zero: 'LOT 01 : Agence de Lyon, 69003 Lyon.\nLOT 02 : Agence de Rouen, 76000 Rouen.\n',
};

describe('lot du mémoire écrit autrement (T3G-4)', () => {
  it('numéros de lot sous une forme unique', () => {
    expect(['02', '2', 'II'].map(numeroDeLot)).toEqual(['2', '2', '2']);
    expect(numeroDeLot('B')).toBe('B');
  });
  for (const [nom, corps] of Object.entries(formes)) {
    it(`forme « ${nom} » : seul le lot 2 reste (Rouen), jamais Lyon`, () => {
      const dce = `${commun}${corps}\n\n--- Cadre de réponse LOT 02.docx ---\nRéponse.\n`;
      expect(lotsDuMemoireDce(analyse, dce).lots).toEqual(['2']);
      const r = perimetreDuLot(analyse, dce)!;
      expect(r).not.toBeNull();
      expect(r.dce).toMatch(/Rouen/);
      expect(r.dce).not.toMatch(/Lyon/);
    });
  }
});

describe('toutes les lectures du DCE réduites au lot du mémoire (T3G-5)', () => {
  it('sites, délais et obligations du bloc 1 : ceux du lot 2', () => {
    const dce = `${commun}${formes.titres}\n\n--- Cadre de réponse Lot 2.docx ---\nRéponse.\n`;
    const ctx: any = { dce, analyse, cover: { client: 'Ville' }, referents: '' };
    const p: any = preparerMemoireType(ctx, { memoireType: chargerMemoireType() });
    expect(JSON.stringify(p.variables.SITE?.valeur || '')).not.toMatch(/Lyon/);
    expect(p.variables.DELAI_ASTREINTE.valeur).toBe('3 heures');
    const b = donneesBesoin(p, ctx);
    expect(JSON.stringify(b)).not.toMatch(/Lyon|une heure/);
  });
});
