import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { feuilleMarp, styleDuTheme, schemasBibliotheque, pagesMarineV3, imagesTheme, themeParDefaut, variablesPages } from '../src/generation/themes';
import { typoV3, essentielV3, intertitresV3, surEtTitre, sommaireV3, enteteBloc, signes } from '../src/generation/marp_pages_marine';
import { specProcessBesoin } from '../src/generation/reponse_libre_v2';

/**
 * Style « Marine & signal » version 3 (décision D11 : la planche validée par le patron de GSS), intégré comme style
 * « marine » ; la première version reste disponible sous « marine-v1 ». Tests hors ligne (aucun appel OpenAI).
 * Les contrôles complets (180 schémas, identité avec la planche, pages rendues) sont dans _verif/marine_v3.
 */
const MARP = path.resolve(__dirname, '../src/generation/marp');
const MOTEUR = path.resolve(__dirname, '../python/schemas_gss');
const base = fs.readFileSync(path.join(MARP, 'gss-theme.css'), 'utf-8');

describe('jetons de la version 3 validée', () => {
  it('style par défaut « marine » = v3 : marine #0B2545, orange signal #F15A22, rôles assombris, IBM Plex en trois largeurs', () => {
    expect(themeParDefaut()).toBe('marine');
    const st = styleDuTheme('marine');
    expect(st.couleurs.structure).toBe('#0B2545');
    expect(st.couleurs.accent).toBe('#F15A22');
    expect(st.couleurs.chiffre_cle).toBe('#F15A22');
    expect([st.roles.bleu.fonce, st.roles.orange.fonce, st.roles.rouge.fonce, st.roles.vert.fonce]).toEqual(['#3B6286', '#8C3B26', '#B3202E', '#1F6A4C']);
    expect(st.regles_roles.max_par_schema).toBe(2);
    expect(st.polices.titre.famille).toBe('IBM Plex Sans Condensed');
    expect(st.polices.numero.famille).toBe('IBM Plex Mono');
    expect(st.typo.paliers.standard).toMatchObject({ texte: 25.5, carte: 35.5, panneau: 47, chiffre: 118 });
    expect(st.moteur).toBe('moteur_marine');
    for (const f of Object.values(st.polices).flatMap((p: any) => Object.values(p.fichiers))) expect(fs.existsSync(path.join(MOTEUR, String(f)))).toBe(true);
  });
  it('« marine-v1 » garde la première version (accent #E85D15), qui n\'est pas celle validée', () => {
    const v1 = styleDuTheme('marine-v1');
    expect(v1.couleurs.accent).toBe('#E85D15');
    expect(v1.moteur).toBeUndefined();
    expect(pagesMarineV3('marine-v1')).toBe(false);
    expect(pagesMarineV3('marine')).toBe(true);
  });
});

describe('pages Marp de la v3', () => {
  it('feuille du style : gabarits v3, logo monochrome blanc, polices embarquées, aucune ressource réseau', () => {
    const css = feuilleMarp('marine', base);
    expect(css).toContain('.gss-sur');
    expect(css).toContain("url('logogss_blanc.svg')");
    expect(css).toContain("@font-face{font-family:'IBM Plex Sans Condensed'");
    expect(css).toContain("@font-face{font-family:'IBM Plex Mono'");
    expect(css.replace(/url\(data:[^)]*\)/g, '')).not.toMatch(/https?:\/\//);
    expect(css).not.toContain('Mise en page des thèmes de la refonte 2026-10');
    expect(imagesTheme('marine').map((f) => path.basename(f))).toEqual(['logogss_blanc.svg']);
    expect(variablesPages('marine')['--gss-texte-taille']).toBe('10.5pt');
  });
  it('typographie de rendu : apostrophe typographique et ordinaux en exposant, balises intactes', () => {
    expect(typoV3("L'agent du 1er octobre, le 4e pointeau <a href='x'>")).toBe("L’agent du 1<sup>er</sup> octobre, le 4<sup>e</sup> pointeau <a href='x'>");
  });
  it('intertitres en gras → colonne de titrage ; surtitre et titre', () => {
    expect(intertitresV3('**Les transports**\nNous encourageons…')).toBe('### Les transports\n\nNous encourageons…');
    expect(surEtTitre('Notre engagement écologique : des déplacements plus sobres', 'Présentation de GSS')).toEqual(['Notre engagement écologique', 'Des déplacements plus sobres']);
    expect(surEtTitre('Nos valeurs', 'Présentation de GSS')).toEqual(['Présentation de GSS', 'Nos valeurs']);
    expect(enteteBloc(3, 'Nos moyens humains')).toBe('<!-- header: "**03** Nos moyens humains" -->');
  });
  it('« l\'essentiel » cite mot pour mot la première phrase, jamais le début d\'une liste', () => {
    expect(essentielV3('La communication est au cœur des missions : il doit pouvoir alerter. Suite.')).toContain('La communication est au cœur des missions : il doit pouvoir alerter.');
    expect(essentielV3('Nos contrôles donnent lieu à une procédure précise :\n1. **Contrôle inopiné** : validé.')).toBeNull();
    expect(essentielV3('- une liste\n- de points')).toBeNull();
    expect(signes('**Titre** \\(a\\)')).toBe('Titre (a)'.length);
  });
  it('sommaire : une entrée par bloc, légende des schémas sur la dernière page', () => {
    const p = sommaireV3([{ numero: 1, titre: 'Notre compréhension de votre besoin', rubriques: ['Notre compréhension de votre besoin'] },
      { numero: 2, titre: 'Présentation de GSS', rubriques: ['Notre catalogue de prestations', 'Nos valeurs'] }], 'Client', '<div class="legende-roles"></div>');
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('<div class="n">02</div>');
    expect(p[0]).toContain('legende-roles');
  });
});

describe('schémas de la v3 (moteur_marine)', () => {
  it('bibliothèque au format page : moteur v3, palier typographique, couleurs v3, mêmes mots que l\'original', () => {
    const svg = schemasBibliotheque(['I-RSE-02'], 'page', 'marine').get('I-RSE-02')!;
    expect(svg).toContain('data-style="marine"');
    expect(svg).toMatch(/data-palier="(standard|dense)"/);
    expect(svg).toContain('#0B2545');
    expect(svg.toUpperCase()).not.toContain('#E85D15');
    const mots = (s: string) => [...s.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map((x) => x[1].replace(/<[^>]+>/g, '')).join(' ')
      .replace(/’/g, "'").replace(/[  ]/g, ' ').split(/\s+/).filter(Boolean).sort();
    expect(mots(svg)).toEqual(mots(fs.readFileSync(path.join(MOTEUR, 'bibliotheque', 'I-RSE-02.svg'), 'utf-8')));
  });
  it('process du bloc 1 (5 étapes) : miroir « vous → nous → résultat » en v3, flux dans les autres styles', () => {
    const spec = specProcessBesoin([{ titre: 'PC sécurité', texte: '24 h/24, 7 j/7' }, { titre: "Poste d'accueil", texte: 'De 20 h à 7 h' },
      { titre: 'Remplacement en 2 heures', texte: 'Notre dispositif de remplacement' }, { titre: 'Contrôles de nuit', texte: 'Nos trois niveaux de contrôle' },
      { titre: 'Votre résultat', texte: 'Continuité de service' }])!;
    expect(spec.params.forme).toBe('process_besoin');
    const source = 'PC sécurité 24 h/24, 7 j/7. Poste d\'accueil de 20 h à 7 h. Remplacement en 2 heures : notre dispositif de remplacement. Contrôles de nuit : nos trois niveaux de contrôle. Votre résultat : continuité de service.';
    const appel = (theme: string) => JSON.parse(spawnSync('python3', [path.join(MOTEUR, 'rendu_schemas.py')], {
      input: JSON.stringify({ mode: 'rendre', format: 'page', schemas: [{ id: 'b1', ...spec, source, titre_section: 'Notre compréhension de votre besoin' }] }),
      encoding: 'utf-8', env: { ...process.env, GSS_THEME: theme },
    }).stdout).resultats[0];
    const v3 = appel('marine');
    const v1 = appel('marine-v1');
    expect(v3.ok && v1.ok).toBe(true);
    // Miroir : 4 cartes en deux colonnes reliées par « → » (flèches horizontales), puis le résultat en panneau vert plein.
    expect(v3.svg).toContain('#1F6A4C');
    expect(v3.svg).toContain('data-picto="bouclier"');
    expect(v1.svg).not.toContain('data-picto="bouclier"');
  });
});
