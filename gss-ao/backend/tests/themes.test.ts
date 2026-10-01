import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import {
  RETOUR_ARRIERE, themeActif, themeParDefaut, themesDisponibles, estRetourArriere, feuilleMarp, variablesPages,
  fontFaceTheme, policesDuTheme, schemasBibliotheque, contraste,
} from '../src/generation/themes';

/**
 * Tests HORS LIGNE des thèmes de style (aucun appel OpenAI) : choix du thème, retour arrière identique, feuille Marp
 * (variables, polices embarquées, aucune dépendance réseau), schémas de la bibliothèque dans le thème.
 * Les rendus PDF complets sont contrôlés par _verif/themes_identite.ts et _verif/themes_rendu.ts.
 */

const MARP = path.resolve(__dirname, '../src/generation/marp');
const MOTEUR = path.resolve(__dirname, '../python/schemas_gss');
const base = fs.readFileSync(path.join(MARP, 'gss-theme.css'), 'utf-8');
const ANCIENNE_PALETTE = ['#D9D9D9', '#463A2F', '#FBFAF4', '#484545', '#ECDEC2', '#6298C0', '#B8CCB1', '#E78E83', '#F0D3A3', '#E5CA97', '#7A726F', '#9A928E', '#8A7550'];
const envOrigine = process.env.GSS_THEME;
afterEach(() => { if (envOrigine === undefined) delete process.env.GSS_THEME; else process.env.GSS_THEME = envOrigine; });

describe('choix du thème', () => {
  it('style par défaut = style recommandé par le design (marine), retour arrière disponible', () => {
    delete process.env.GSS_THEME;
    expect(themeParDefaut()).toBe('marine');
    expect(themeActif()).toBe('marine');
    expect(themesDisponibles()).toEqual(expect.arrayContaining(['marine', 'graphite', 'conseil', 'sombre', 'premium', RETOUR_ARRIERE]));
  });
  it('variable GSS_THEME, thème demandé prioritaire, thème inconnu → défaut', () => {
    process.env.GSS_THEME = 'graphite';
    expect(themeActif()).toBe('graphite');
    expect(themeActif('gss-2026-09')).toBe('gss-2026-09');
    process.env.GSS_THEME = 'inexistant';
    expect(themeActif()).toBe('marine');
    expect(estRetourArriere(themeActif(RETOUR_ARRIERE))).toBe(true);
  });
});

describe('feuille Marp', () => {
  it('retour arrière : gss-theme.css tel quel (valeurs de repli = rendu d\'origine)', () => {
    expect(feuilleMarp(RETOUR_ARRIERE, base)).toBe(base);
    // Chaque couleur et police d'origine est la valeur de repli de sa variable.
    for (const v of ['#d9d9d9', '#494545', '#dc2626', '#484545', '#F5F5DE', '#FBFAF4', '#CFC9C5', '#F2F0EA', "'Inter', sans-serif", "'Outfit', sans-serif"]) {
      expect(base).toContain(v);
    }
  });
  it.each(['marine', 'graphite', 'conseil', 'sombre', 'premium'])('%s : variables, polices embarquées, aucune ressource réseau', (t) => {
    const css = feuilleMarp(t, base);
    const vars = variablesPages(t);
    expect(Object.keys(vars).length).toBeGreaterThan(20);
    for (const [k, v] of Object.entries(vars)) expect(css).toContain(`${k}: ${v};`);
    for (const p of policesDuTheme(t)) {
      expect(fs.existsSync(p.chemin)).toBe(true);
      expect(css).toContain(`@font-face{font-family:'${p.famille}'`);
    }
    expect(fontFaceTheme(t).length).toBeGreaterThan(100_000);
    expect(css.replace(/url\(data:[^)]*\)/g, '')).not.toMatch(/https?:\/\//);
    expect(css).toContain('section.schema');
  });
  it('contrastes des couleurs de page du thème par défaut (AA)', () => {
    const v = variablesPages('marine');
    expect(contraste(v['--gss-encre'], v['--gss-fond-page'])).toBeGreaterThanOrEqual(4.5);
    expect(contraste(v['--gss-entete-texte'], v['--gss-entete-fond'])).toBeGreaterThanOrEqual(4.5);
    expect(contraste(v['--gss-tableau-tete-texte'], v['--gss-tableau-tete'])).toBeGreaterThanOrEqual(4.5);
    expect(contraste(v['--gss-titre'], v['--gss-fond-page'])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('schémas de la bibliothèque dans le thème', () => {
  it('retour arrière : fichiers d\'origine, octet pour octet', () => {
    const m = schemasBibliotheque(['I-RSE-02', 'III-RON-01'], 'page', RETOUR_ARRIERE);
    expect(m.get('I-RSE-02')).toBe(fs.readFileSync(path.join(MOTEUR, 'bibliotheque', 'I-RSE-02.svg'), 'utf-8'));
  });
  it('format page : toile portrait, couleurs du thème, mêmes textes que l\'original', () => {
    const m = schemasBibliotheque(['I-RSE-02', 'III-RON-01'], 'page', 'marine');
    for (const id of ['I-RSE-02', 'III-RON-01']) {
      const svg = m.get(id)!;
      expect(svg).toContain('viewBox="0 0 1000 1270"');
      expect(svg).toContain('data-style="marine"');
      for (const c of ANCIENNE_PALETTE) expect(svg.toUpperCase()).not.toContain(`"${c}"`);
      const mots = (s: string) => [...s.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((x) => x[1]).join(' ').replace(/[  ]/g, ' ').split(/\s+/).filter(Boolean).sort();
      expect(mots(svg)).toEqual(mots(fs.readFileSync(path.join(MOTEUR, 'bibliotheque', `${id}.svg`), 'utf-8')));
    }
  });
  it('format paysage : géométrie d\'origine, couleurs et police du thème', () => {
    const svg = schemasBibliotheque(['III-RON-01'], 'paysage', 'marine').get('III-RON-01')!;
    expect(svg).toContain('viewBox="0 0 1200 660"');
    expect(svg).toContain("font-family=\"'IBM Plex Sans', sans-serif\"");
    for (const c of ANCIENNE_PALETTE) expect(svg.toUpperCase()).not.toContain(`"${c}"`);
  });
});

describe('moteur Python', () => {
  it('rendu identique au moteur d\'origine pour le retour arrière, toile portrait pour le format page', () => {
    const spec = { id: 't', gabarit: 'grille', titre_section: 'Test', source: 'Rondes. Accueil. Filtrage. Contrôle des accès.',
      params: { cartes: [{ titre: 'Rondes', role: 'bleu' }, { titre: 'Accueil', role: 'sable' }, { titre: 'Filtrage', role: 'orange' }] } };
    const appel = (theme: string, format: string) => JSON.parse(spawnSync('python3', [path.join(MOTEUR, 'rendu_schemas.py')], {
      input: JSON.stringify({ mode: 'rendre', format, schemas: [spec] }), encoding: 'utf-8', env: { ...process.env, GSS_THEME: theme },
    }).stdout).resultats[0];
    const r1 = appel(RETOUR_ARRIERE, 'page');
    const r2 = appel(RETOUR_ARRIERE, 'paysage');
    expect(r1.ok && r2.ok).toBe(true);
    expect(r1.svg).toBe(r2.svg);
    expect(r1.svg).toContain('#D9D9D9');
    const p = appel('marine', 'page');
    expect(p.ok).toBe(true);
    expect(p.svg).toContain('viewBox="0 0 1000 1270"');
  });
});
