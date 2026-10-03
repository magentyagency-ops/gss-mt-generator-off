import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import {
  RETOUR_ARRIERE, themeActif, themeParDefaut, themesDisponibles, estRetourArriere, feuilleMarp, variablesPages,
  fontFaceTheme, policesDuTheme, schemasBibliotheque, contraste, recolorerSvg,
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
/** Rapport hauteur / largeur de la toile (viewBox) : la toile du format page peut être zoomée, son rapport reste 1270 / 1000. */
const rapportToile = (svg: string): number => {
  const v = /viewBox="([\d.\s-]+)"/.exec(svg)![1].trim().split(/\s+/).map(Number);
  return v[3] / v[2];
};
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
  it('retour arrière : fichiers d\'origine, octet pour octet, au format paysage ; toile portrait d\'origine au format page', () => {
    const m = schemasBibliotheque(['I-RSE-02', 'III-RON-01'], 'paysage', RETOUR_ARRIERE);
    expect(m.get('I-RSE-02')).toBe(fs.readFileSync(path.join(MOTEUR, 'bibliotheque', 'I-RSE-02.svg'), 'utf-8'));
    const p = schemasBibliotheque(['I-RSE-02'], 'page', RETOUR_ARRIERE).get('I-RSE-02')!;
    expect(rapportToile(p)).toBeCloseTo(1270 / 1000, 2);
    expect(p).toContain('data-style="gss-2026-09"');
    expect(p).toContain('#D9D9D9');
    expect(p).toContain("'Lexend'");
  });
  it('format page : toile portrait, couleurs du thème, mêmes textes que l\'original', () => {
    const m = schemasBibliotheque(['I-RSE-02', 'III-RON-01'], 'page', 'marine');
    for (const id of ['I-RSE-02', 'III-RON-01']) {
      const svg = m.get(id)!;
      expect(rapportToile(svg)).toBeCloseTo(1270 / 1000, 2);
      expect(svg).toContain('data-format="page"');
      expect(svg).toContain('data-style="marine"');
      for (const c of ANCIENNE_PALETTE) expect(svg.toUpperCase()).not.toContain(`"${c}"`);
      // Typographie de rendu du style « marine » v3 (planche validée) : apostrophe ’ et ordinaux en exposant (<tspan>) ;
      // les mots sont comparés après normalisation, comme le contrôle de la planche.
      const mots = (s: string) => [...s.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map((x) => x[1].replace(/<[^>]+>/g, '')).join(' ')
        .replace(/\u2019/g, "'").replace(/[\u00a0\u202f]/g, ' ').split(/\s+/).filter(Boolean).sort();
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

describe('repli sans moteur Python', () => {
  it('table correspondance_paysage de themes.json identique à themes_gss.correspondance (à réexporter sinon)', () => {
    const r = spawnSync('python3', ['-c', 'import sys,json;sys.path.insert(0,".");import themes_gss as T;print(json.dumps(T.correspondance_exportee()))'],
      { cwd: MOTEUR, encoding: 'utf-8' });
    const reg = JSON.parse(fs.readFileSync(path.join(MOTEUR, 'themes', 'themes.json'), 'utf-8'));
    expect(reg.correspondance_paysage).toEqual(JSON.parse(r.stdout));
  });
  it('schéma d\'origine aux couleurs du thème, police et géométrie inchangées ; retour arrière inchangé', () => {
    const origine = fs.readFileSync(path.join(MOTEUR, 'bibliotheque', 'III-RON-01.svg'), 'utf-8');
    const svg = recolorerSvg(origine, 'marine');
    for (const c of ANCIENNE_PALETTE) expect(svg.toUpperCase()).not.toContain(`"${c}"`);
    expect(/viewBox="[^"]+"/.exec(svg)![0]).toBe(/viewBox="[^"]+"/.exec(origine)![0]);
    expect(/font-family="[^"]+"/.exec(svg)![0]).toBe(/font-family="[^"]+"/.exec(origine)![0]);
    expect(recolorerSvg(origine, RETOUR_ARRIERE)).toBe(origine);
  });
});

describe('moteur Python', () => {
  it('rendu identique au moteur d\'origine pour le retour arrière (paysage), toile portrait pour le format page', () => {
    const spec = { id: 't', gabarit: 'grille', titre_section: 'Test', source: 'Rondes. Accueil. Filtrage. Contrôle des accès.',
      params: { cartes: [{ titre: 'Rondes', role: 'bleu' }, { titre: 'Accueil', role: 'sable' }, { titre: 'Filtrage', role: 'orange' }] } };
    const appel = (theme: string, format: string) => JSON.parse(spawnSync('python3', [path.join(MOTEUR, 'rendu_schemas.py')], {
      input: JSON.stringify({ mode: 'rendre', format, schemas: [spec] }), encoding: 'utf-8', env: { ...process.env, GSS_THEME: theme },
    }).stdout).resultats[0];
    const r1 = appel(RETOUR_ARRIERE, 'page');
    const r2 = appel(RETOUR_ARRIERE, 'paysage');
    const r3 = appel(RETOUR_ARRIERE, 'inconnu');
    expect(r1.ok && r2.ok && r3.ok).toBe(true);
    expect(r3.svg).toBe(r2.svg);
    expect(r2.svg).toContain('viewBox="0 173 1200 306"');
    expect(r2.svg).toContain('#D9D9D9');
    // Page de schéma du retour arrière : toile portrait, palette et police d'origine.
    expect(rapportToile(r1.svg)).toBeCloseTo(1270 / 1000, 2);
    expect(r1.svg).toContain('#D9D9D9');
    expect(r1.svg).toContain('data-format="page"');
    const p = appel('marine', 'page');
    expect(p.ok).toBe(true);
    expect(rapportToile(p.svg)).toBeCloseTo(1270 / 1000, 2);
    expect(p.svg).toContain('data-format="page"');
  });
});
