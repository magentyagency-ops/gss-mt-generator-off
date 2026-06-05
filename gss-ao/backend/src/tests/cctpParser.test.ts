import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { getSettings } from '../core/config';
import { parseCctp } from '../analysis/cctpParser';
import { CategorieExigence, TypePrestation } from '../schemas/cctp';

const settings = getSettings();
const CORPUS = path.resolve(settings.corpusDceDir);
const CCTP_FILE = path.join(CORPUS, '4-CCTP 2026-08.docx');

const isCorpusAvailable = fs.existsSync(CCTP_FILE);

describe('CCTP Parser Integration Tests (Rouen)', () => {
  if (!isCorpusAvailable) {
    it.skip('Skipping Rouen CCTP tests - corpus unavailable', () => {});
    return;
  }

  const cctp = parseCctp(CCTP_FILE);

  it('should detect market object', () => {
    expect(cctp.objet).not.toBeNull();
    const lowObjet = cctp.objet!.toLowerCase();
    expect(lowObjet.includes('sûreté') || lowObjet.includes('securite')).toBe(true);
    expect(lowObjet).toContain('rouen');
  });

  it('should build hierarchical tree', () => {
    const titles = cctp.arborescence.map(s => s.titre);
    expect(titles.some(t => t.includes('CONTENU GENERAL'))).toBe(true);
    expect(titles.some(t => t.includes('OBLIGATIONS DU TITULAIRE'))).toBe(true);
    expect(titles.some(t => t.toUpperCase().includes('AGENTS'))).toBe(true);

    expect(cctp.arborescence.some(s => s.enfants.length > 0)).toBe(true);
    expect(cctp.arborescence.some(s => s.enfants.some(c => c.enfants.length > 0))).toBe(true);
  });

  it('should detect reprise personnel', () => {
    expect(cctp.reprise_personnel).toBe(true);
  });

  it('should cover three types of prestations', () => {
    const types = new Set(cctp.prestations.map(p => p.type));
    expect(types.has(TypePrestation.BASE)).toBe(true);
    expect(types.has(TypePrestation.SUPPLEMENTAIRE).valueOf()).toBe(true);
    expect(types.has(TypePrestation.TELESECURITE)).toBe(true);

    const hasTelesec = cctp.prestations.some(p => p.type === TypePrestation.TELESECURITE && p.lot === 3);
    expect(hasTelesec).toBe(true);

    const lots = new Set(cctp.prestations.map(p => p.lot));
    expect(lots.has(1)).toBe(true);
    expect(lots.has(2)).toBe(true);
  });

  it('should extract correct requirements for agents', () => {
    const cats = new Set(cctp.exigences_agents.map(e => e.categorie));
    expect(cats.has(CategorieExigence.QUALIFICATION)).toBe(true);
    expect(cats.has(CategorieExigence.TENUE)).toBe(true);
    expect(cats.has(CategorieExigence.EQUIPEMENT)).toBe(true);
    expect(cats.has(CategorieExigence.VEHICULE)).toBe(true);
    expect(cats.has(CategorieExigence.COMPORTEMENT)).toBe(true);

    const values = cctp.exigences_agents.map(e => (e.valeur || '').toUpperCase().replace(/\s+/g, '')).join(' ');
    expect(values).toContain('SSIAP2');
    expect(values).toContain('SSIAP1');
  });

  it('should detect site constraints like ZRR', () => {
    expect(cctp.contraintes_site.some(c => c.includes('ZRR'))).toBe(true);
  });

  it('should generate no warnings for standard document', () => {
    expect(cctp.source.warnings).toEqual([]);
  });
});
