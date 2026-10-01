// ════════════════════════════════════════════════════════════════════════════════════════
// THÈMES DE STYLE DU MÉMOIRE (refonte 2026-10 : police, couleurs et forme des schémas et des pages)
// ════════════════════════════════════════════════════════════════════════════════════════
// Un thème habille les pages du mémoire (thème Marp : variables CSS --gss-…, polices libres embarquées), les schémas
// (moteur python/schemas_gss : 1 schéma = 1 page A4 portrait, ou schéma placé dans le texte), l'organigramme, le format
// court et les images des schémas insérées dans les cadres imposés.
//  · Choix : variable d'environnement GSS_THEME ; à défaut, « style_par_defaut » de themes.json (« marine », le style
//    recommandé par l'agent design) ; à défaut, THEME_PAR_DEFAUT. Changer de style = une seule valeur.
//  · « gss-2026-09 » (RETOUR_ARRIERE) : rendu d'avant les thèmes, à l'identique (pages, schémas, organigramme).
//  · Registre unique : python/schemas_gss/themes/themes.json (lu aussi par le moteur Python).
// Forme seulement : aucun texte, aucune consigne, aucune logique de génération ne dépend du thème.

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

export const RETOUR_ARRIERE = 'gss-2026-09';
/** Style recommandé par l'agent design (repli si themes.json est illisible). */
const THEME_PAR_DEFAUT = 'marine';
export type FormatSchema = 'page' | 'paysage';

const MOTEUR = path.resolve(__dirname, '../../python/schemas_gss');
const FICHIER_THEMES = path.join(MOTEUR, 'themes', 'themes.json');
const MARP = path.resolve(__dirname, 'marp');
const SCRIPT_SCHEMAS = path.join(MOTEUR, 'rendu_schemas.py');

let registre: any | null = null;

/** Registre des thèmes (python/schemas_gss/themes/themes.json). */
export function registreThemes(): any {
  if (!registre) {
    try {
      registre = JSON.parse(fs.readFileSync(FICHIER_THEMES, 'utf-8'));
    } catch (e: any) {
      console.warn(`[Thèmes] themes.json illisible (${e?.message || e}) : thème de retour arrière seulement.`);
      registre = { styles: {}, style_par_defaut: RETOUR_ARRIERE };
    }
  }
  return registre;
}

export function themesDisponibles(): string[] {
  return [...Object.keys(registreThemes().styles || {}), RETOUR_ARRIERE];
}

export function themeParDefaut(): string {
  const d = registreThemes().style_par_defaut || THEME_PAR_DEFAUT;
  if (themesDisponibles().includes(d)) return d;
  return registreThemes().styles?.[THEME_PAR_DEFAUT] ? THEME_PAR_DEFAUT : RETOUR_ARRIERE;
}

const avertis = new Set<string>();

/** Thème à appliquer : celui demandé (état d'un mémoire déjà rendu), sinon GSS_THEME, sinon le style par défaut. */
export function themeActif(nom?: string | null): string {
  const demande = String(nom || process.env.GSS_THEME || '').trim();
  if (!demande) return themeParDefaut();
  if (themesDisponibles().includes(demande)) return demande;
  if (!avertis.has(demande)) {
    avertis.add(demande);
    console.warn(`[Thèmes] Thème inconnu « ${demande} » : thème par défaut « ${themeParDefaut()} » (disponibles : ${themesDisponibles().join(', ')}).`);
  }
  return themeParDefaut();
}

export const estRetourArriere = (theme: string): boolean => theme === RETOUR_ARRIERE;

/** Jetons d'un style (null pour le retour arrière). */
export function styleDuTheme(theme: string): any | null {
  return registreThemes().styles?.[theme] || null;
}

/** Environnement d'un sous-processus du moteur de schémas (Python), pour le thème donné. */
export function envTheme(theme?: string | null): NodeJS.ProcessEnv {
  return { ...process.env, GSS_THEME: themeActif(theme) };
}

// ─── Polices libres embarquées (SIL OFL, fichiers du dépôt : aucune dépendance réseau) ────────────────

const cacheFontFace = new Map<string, string>();

/** Familles et fichiers de police d'un thème (titres, texte, chiffres), sans doublon. */
export function policesDuTheme(theme: string): Array<{ famille: string; poids: number; chemin: string }> {
  const st = styleDuTheme(theme);
  if (!st) return [];
  const vus = new Set<string>();
  const out: Array<{ famille: string; poids: number; chemin: string }> = [];
  for (const usage of Object.keys(st.polices || {})) {
    const p = st.polices[usage];
    for (const [poids, fichier] of Object.entries(p.fichiers || {})) {
      const cle = `${p.famille}|${poids}`;
      if (vus.has(cle)) continue;
      vus.add(cle);
      out.push({ famille: p.famille, poids: Number(poids), chemin: path.join(MOTEUR, String(fichier)) });
    }
  }
  return out;
}

/** Règles @font-face du thème, polices embarquées en base64 depuis les fichiers du dépôt ('' : retour arrière). */
export function fontFaceTheme(theme: string): string {
  if (estRetourArriere(theme)) return '';
  if (!cacheFontFace.has(theme)) {
    const regles = policesDuTheme(theme).map(({ famille, poids, chemin }) => {
      try {
        const b64 = fs.readFileSync(chemin).toString('base64');
        return `@font-face{font-family:'${famille}';src:url(data:font/ttf;base64,${b64}) format('truetype');font-weight:${poids};font-style:normal;}`;
      } catch (e: any) {
        console.warn(`[Thèmes] Police absente (${chemin}) : ${e?.message || e}`);
        return '';
      }
    });
    cacheFontFace.set(theme, regles.filter(Boolean).join('\n'));
  }
  return cacheFontFace.get(theme)!;
}

/** Famille CSS du texte d'un thème (schémas paysage, format court). */
export function familleTexte(theme: string): string | null {
  const p = styleDuTheme(theme)?.polices?.texte;
  return p ? `'${p.famille}', ${p.repli || 'sans-serif'}` : null;
}

// ─── Pages (thème Marp) ─────────────────────────────────────────────────────────────────────

export const luminance = (hex: string): number => {
  const h = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return 1;
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

/** Rapport de contraste WCAG entre deux couleurs (#RRGGBB). */
export const contraste = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/** Logo sur fond clair (arc et point à l'encre) : variante préparée par l'agent design, utilisée seulement par les
 *  styles dont l'en-tête ou la couverture est clair (« logo »: « encre »). */
export const LOGO_FOND_CLAIR = 'logogss_fond_clair.png';

/** Variables CSS --gss-… du thème (bloc « pages » de themes.json + valeurs dérivées). */
export function variablesPages(theme: string): Record<string, string> {
  const st = styleDuTheme(theme);
  if (!st) return {};
  const v: Record<string, string> = { ...(st.pages || {}) };
  v['--gss-tableau-fond'] = v['--gss-fond-page'] || '#FFFFFF';
  v['--gss-intercalaire-filet'] = luminance(v['--gss-intercalaire-fond'] || '#000000') < 0.2 ? 'rgba(255, 255, 255, 0.16)' : (v['--gss-filet'] || '#D5DDE8');
  if (st.logo === 'encre') {
    v['--gss-logo-entete'] = `url('${LOGO_FOND_CLAIR}')`;
    v['--gss-logo-couverture'] = `url('${LOGO_FOND_CLAIR}')`;
  }
  return v;
}

/**
 * Feuille Marp du thème : gss-theme.css (variables avec, en repli, les valeurs d'origine), puis, pour un thème de la
 * refonte, ses variables, ses polices embarquées et sa mise en page (gss-theme-pages.css). Le retour arrière reçoit
 * gss-theme.css tel quel (rendu identique). Les thèmes de la refonte ne chargent aucune police par le réseau.
 */
export function feuilleMarp(theme: string, base: string): string {
  if (estRetourArriere(theme)) return base;
  const sansReseau = base.replace(/^@import url\('https:\/\/fonts\.googleapis\.com[^\n]*\n/m, '');
  const vars = Object.entries(variablesPages(theme)).map(([k, val]) => `  ${k}: ${val};`).join('\n');
  let pages = '';
  try { pages = fs.readFileSync(path.join(MARP, 'gss-theme-pages.css'), 'utf-8'); } catch (e: any) {
    console.warn(`[Thèmes] gss-theme-pages.css illisible : ${e?.message || e}`);
  }
  return `${sansReseau}\n\n/* ── Thème « ${theme} » (themes.json) ── */\n${fontFaceTheme(theme)}\nsection {\n${vars}\n}\n\n${pages}`;
}

/** Fichiers d'images que la feuille du thème référence (copiés à côté de la feuille Marp). */
export function imagesTheme(theme: string): string[] {
  return styleDuTheme(theme)?.logo === 'encre' ? [path.join(MARP, LOGO_FOND_CLAIR)] : [];
}

// ─── Schémas de la bibliothèque dans le thème ────────────────────────────────────────────────

/** Interpréteur Python du moteur de schémas (variable PYTHON_BIN, sinon « py » sous Windows, « python3 » ailleurs). */
export function pythonBin(): string {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  return process.platform === 'win32' ? 'py' : 'python3';
}

const BALISE_SVG = /<(text|rect|circle|path|line|ellipse|polygon|polyline|g|feDropShadow|svg)\b([^>]*)>/g;

/**
 * Repli sans moteur Python : un schéma d'origine (palette du 25/09/2026) aux couleurs du thème, avec la table
 * « correspondance_paysage » de themes.json (exportée de themes_gss.correspondance : mêmes couleurs que le rendu paysage
 * du moteur). La police et la géométrie ne changent pas (aucun débordement nouveau). Retour arrière, style ou table
 * absents : SVG inchangé.
 */
export function recolorerSvg(svg: string, theme: string): string {
  const table = registreThemes().correspondance_paysage;
  const t = table?.[theme];
  if (estRetourArriere(theme) || !t) return svg;
  const inchangees = new Set<string>((table._inchangees || []).map((c: string) => c.toUpperCase()));
  const hex = (c: string) => {
    const x = c.trim().toUpperCase();
    return /^#[0-9A-F]{3}$/.test(x) ? `#${[...x.slice(1)].map((k) => k + k).join('')}` : x;
  };
  return svg.replace(BALISE_SVG, (_m, tag: string, attrs: string) => {
    let a = attrs.replace(/\b(fill|stroke|flood-color)="(#[0-9A-Fa-f]{3,6})"/g, (m0, nom: string, brut: string) => {
      const val = hex(brut);
      if (inchangees.has(val)) return m0;
      if (nom === 'flood-color') return `${nom}="${t.ombre || brut}"`;
      const usage = nom === 'stroke' ? (tag === 'line' && t.ligne?.[val] ? 'ligne' : 'trait')
        : tag === 'text' ? 'texte' : (tag === 'circle' && t.puce?.[val] ? 'puce' : 'fond');
      return `${nom}="${t[usage]?.[val] || brut}"`;
    });
    if (tag === 'feDropShadow' && !t.ombre) a = a.replace(/flood-opacity="[\d.]+"/, 'flood-opacity="0"');
    return `<${tag}${a}>`;
  });
}

/**
 * SVG (bruts, comme les fichiers de bibliotheque/) des schémas de la bibliothèque GSS dans le thème : format « page »
 * (redessinés depuis specs.json, textes contrôlés identiques à l'original) ou « paysage » (schéma d'origine aux
 * couleurs et à la police du thème). Cache par thème côté Python. Retour arrière au format paysage : les fichiers
 * d'origine ; moteur indisponible : les fichiers d'origine aux couleurs du thème (recolorerSvg).
 */
export function schemasBibliotheque(ids: string[], format: FormatSchema = 'paysage', theme?: string | null): Map<string, string> {
  const t = themeActif(theme);
  const out = new Map<string, string>();
  const uniques = [...new Set(ids.filter((id) => /^[A-Za-z0-9-]+$/.test(id)))];
  if (!uniques.length) return out;
  // Retour arrière : fichiers d'origine au format paysage ; au format page (1 schéma = 1 page), redessin sur toile
  // portrait dans la palette et la police d'origine (moteur Python, « style_page » du retour arrière).
  if (!estRetourArriere(t) || format === 'page') {
    try {
      const win = process.platform === 'win32';
      const r = spawnSync(pythonBin(), [win ? `"${SCRIPT_SCHEMAS}"` : SCRIPT_SCHEMAS], {
        input: JSON.stringify({ mode: 'redessiner', format, ids: uniques }),
        encoding: 'utf-8', timeout: 120_000, shell: win, env: envTheme(t), maxBuffer: 64 * 1024 * 1024,
      });
      if (r.status === 0 && r.stdout) {
        for (const x of JSON.parse(r.stdout).resultats || []) if (x.ok && x.svg) out.set(x.id, x.svg);
      } else {
        console.warn(`[Thèmes] Schémas de la bibliothèque non redessinés (${r.error?.message || (r.stderr || '').slice(0, 300)}) : repli.`);
      }
    } catch (e: any) {
      console.warn(`[Thèmes] Schémas de la bibliothèque non redessinés (${e?.message || e}) : repli.`);
    }
  }
  const replis: string[] = [];
  for (const id of uniques) {
    if (out.has(id)) continue;
    try {
      const origine = fs.readFileSync(path.join(MOTEUR, 'bibliotheque', `${id}.svg`), 'utf-8');
      // Repli : schéma d'origine aux couleurs du thème (toile paysage, police d'origine).
      out.set(id, recolorerSvg(origine, t));
      if (!estRetourArriere(t)) replis.push(id);
    } catch { /* schéma inconnu */ }
  }
  if (replis.length) console.warn(`[Thèmes] ${replis.length} schéma(s) de la bibliothèque en repli (moteur Python indisponible) : schéma d'origine aux couleurs du thème « ${t} » (${replis.join(', ')}).`);
  return out;
}
