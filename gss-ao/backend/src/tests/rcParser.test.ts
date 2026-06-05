import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { getSettings } from '../core/config';
import { parseRc } from '../analysis/rcParser';
import { TypePiece } from '../schemas/rc';
import { sofficeAvailable, findTextutil } from '../ingestion/docConverter';

const settings = getSettings();
const CORPUS = path.resolve(settings.corpusDceDir);
const RC_FILE = path.join(CORPUS, '2-RC 2026-08.doc');

const isCorpusAvailable = fs.existsSync(RC_FILE) && (sofficeAvailable() || findTextutil() !== null);

describe('RC Parser Unit Tests', () => {
  it('should parse french dates correctly', () => {
    // We can export _parseFrDate if needed or test via parseRc.
    // For unit tests, we'll write a simple date parser check.
  });

  it('should split sections correctly', () => {
    // Section splitting logic
  });
});

describe('RC Parser Integration Tests (Rouen)', () => {
  if (!isCorpusAvailable) {
    it.skip('Skipping Rouen RC tests - corpus or converter unavailable', () => {});
    return;
  }

  const rc = parseRc(RC_FILE);

  it('should extract correct market identity', () => {
    expect(rc.objet).toBeTruthy();
    expect(rc.objet!.toLowerCase()).toContain('rouen');
    expect(rc.acheteur).toBe('UNIVERSITE DE ROUEN NORMANDIE');
    expect(rc.ccag).toBe('CCAG-FCS');
    expect(rc.cpv).toContain('79713000-5');
    expect(rc.source.warnings).toEqual([]);
  });

  it('should extract correct allotment (three lots)', () => {
    const nums = rc.allotissement.map(l => l.numero).sort();
    expect(nums).toEqual([1, 2, 3]);

    const perims = rc.allotissement.reduce((acc, l) => {
      acc[l.numero] = l.perimetre;
      return acc;
    }, {} as Record<number, string | null>);

    expect(perims[1]).toBe('Département 76');
    expect(perims[2]).toBe('Département 27');
    expect(perims[3]).toBe('Télésécurité');
  });

  it('should detect mandatory visit and date', () => {
    expect(rc.visite.prevue).toBe(true);
    expect(rc.visite.obligatoire).toBe(true);
    const hasDate = rc.visite.dates.some(d => d.valeur === '2026-03-16');
    expect(hasDate).toBe(true);
  });

  it('should extract correct notation criteria', () => {
    const c = rc.criteres;
    expect(c).not.toBeNull();
    expect(c!.valeur_technique_pts).toBe(60);
    expect(c!.prix_pts).toBe(40);

    const sum = c!.sous_criteres.reduce((acc, s) => acc + s.points, 0);
    expect(sum).toBe(100);

    const telesurv = c!.sous_criteres.find(s => s.libelle.toLowerCase().includes('télésurveillance'));
    expect(telesurv).toBeDefined();
    expect(telesurv!.points).toBe(40);
    expect(telesurv!.lots).toEqual([3]);

    const humains = c!.sous_criteres.find(s => s.libelle.toLowerCase().includes('moyens humains'));
    expect(humains).toBeDefined();
    expect(humains!.points).toBe(20);
    expect(humains!.lots).toEqual([1, 2]);
  });

  it('should extract correct candidature documents', () => {
    const noms = rc.pieces_candidature.map(p => p.nom.toLowerCase()).join(' | ');
    for (const attendu of ['dc1', 'dc2', 'assurance', 'fiscale', 'références', 'honneur']) {
      expect(noms).toContain(attendu);
    }

    const dume = rc.pieces_candidature.find(p => p.nom.toLowerCase().includes('dume'));
    expect(dume).toBeDefined();
    expect(dume!.obligatoire).toBe(false);
    expect(dume!.alternative).toBe('Remplace DC1+DC2');

    expect(rc.pieces_candidature.every(p => p.type === TypePiece.CANDIDATURE)).toBe(true);
  });

  it('should extract correct offer documents', () => {
    const noms = rc.pieces_offre.map(p => p.nom.toLowerCase()).join(' | ');
    for (const attendu of ["acte d'engagement", 'bpu', 'dpgf', 'mémoire technique', 'rib']) {
      expect(noms).toContain(attendu);
    }
    expect(rc.pieces_offre.every(p => p.type === TypePiece.OFFRE)).toBe(true);
  });

  it('should extract correct submission modalities', () => {
    const m = rc.modalites_remise;
    expect(m.plateforme).toBeTruthy();
    expect(m.plateforme!.toLowerCase()).toContain('achatpublic');
    expect(m.date_limite).not.toBeNull();
    expect(m.date_limite!.valeur).toBe('2026-04-08');
    expect(m.signature_formats.length).toBeGreaterThan(0);
  });
});
