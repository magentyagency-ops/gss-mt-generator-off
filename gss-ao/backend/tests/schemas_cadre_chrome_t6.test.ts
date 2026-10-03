// Tour 6 (T6-COH-3) : Chrome indisponible ou bloqué : les schémas choisis pour le cadre sont déclarés non insérés.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { insererSchemasReponses } from '../src/generation/visuels_cadre';

describe('Schémas du cadre sans Chrome', () => {
  it('lancement de Chrome en échec deux fois : aucun schéma inséré, réponses concernées listées', async () => {
    const puppeteer = createRequire(__filename)('puppeteer');
    const lancer = puppeteer.launch;
    let essais = 0;
    puppeteer.launch = async () => { essais++; throw new Error('Chrome bloqué (simulation)'); };
    try {
      const nonInseres: string[] = [];
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100"/></svg>';
      const n = await insererSchemasReponses({} as any, {} as any, [{ cle: 'GSS_CH_9', question: 'Schéma opérationnel', texte: 'x'.repeat(700), svg, svgId: 'demande_9' }], { nonInseres });
      expect(n).toBe(0);
      expect(essais).toBe(2);
      expect(nonInseres).toEqual(['GSS_CH_9']);
    } finally {
      puppeteer.launch = lancer;
    }
  });
});
