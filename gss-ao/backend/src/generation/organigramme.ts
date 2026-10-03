// ════════════════════════════════════════════════════════════════════════════════════════
// ORGANIGRAMME GSS EN SCHÉMA, D'APRÈS L'ORGANIGRAMME DE RÉFÉRENCE
// ════════════════════════════════════════════════════════════════════════════════════════
// Le schéma de l'organigramme (design validé, moteur python/schemas_gss/organigramme_gss.py) est
// dessiné avec les MÊMES personnes que le texte : annuaire « Personnes » + registre des mémoires
// (organigrammeGss). Sans cela, le schéma figé omettait des responsables cités dans le texte.
// En cas d'échec, le schéma d'origine (organigramme_gss.svg) est conservé.
// Thème de style (themes.ts) : format « page » (1 schéma = 1 page A4 portrait) ou « paysage » (dans le texte, cadre
// imposé, format court), dessiné dans le thème ; « gss-2026-09 » : organigramme d'origine, à l'identique.

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { rolesOrganigramme } from './base_memoires';
import { themeActif, estRetourArriere, envTheme, RETOUR_ARRIERE, FormatSchema, pythonBin, recolorerSvg } from './themes';

const MOTEUR = path.resolve(__dirname, '../../python/schemas_gss');
const STATIQUE = path.join(MOTEUR, 'organigramme_gss.svg');
let courant: string | null = null;
/** Données de l'organigramme de référence (null : organigramme par défaut du moteur). */
let donneesCourantes: any | null = null;

/** Empreinte du moteur et des thèmes : un organigramme déjà dessiné est refait quand elle change. */
let empreinte: string | null = null;
function empreinteMoteur(): string {
  if (!empreinte) {
    const h = crypto.createHash('sha1');
    for (const f of ['themes/themes.json', 'themes_gss.py', 'organigramme_gss.py', 'gss_lib.py', 'gabarits.py', 'moteur_page/organigramme.py', 'moteur_marine/organigramme.py', 'moteur_marine/gss_lib.py', 'moteur_marine/gabarits.py', 'moteur_marine/dessin.py',
      'moteur_page/gss_lib.py', 'moteur_page/gabarits.py', 'moteur_page/theme.py', 'moteur_page/pictos.py']) {
      try { h.update(fs.readFileSync(path.join(MOTEUR, f))); } catch { h.update('-'); }
    }
    empreinte = h.digest('hex').slice(0, 10);
  }
  return empreinte;
}

const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const mots = (t: string) => norm(t).split(/[^a-z]+/).filter((w) => w.length >= 3);
const memePersonne = (a: string, b: string) => mots(a).some((w) => mots(b).includes(w));

/** Données de l'organigramme (tête, responsables, pôles opérationnels et leurs équipes). */
export function donneesOrganigramme(referents: string): any | null {
  const roles = rolesOrganigramme(referents);
  if (!roles.length) return null;
  const personnes: Array<{ nom: string; fonctions: string[] }> = [];
  for (const r of roles) {
    for (const nom of r.noms) {
      const p = personnes.find((x) => memePersonne(x.nom, nom));
      if (p) { if (!p.fonctions.includes(r.libelle)) p.fonctions.push(r.libelle); } else personnes.push({ nom, fonctions: [r.libelle] });
    }
  }
  const aRole = (p: { fonctions: string[] }, re: RegExp) => p.fonctions.some((f) => re.test(norm(f)));
  const tete = personnes.find((p) => aRole(p, /directeur|marche/)) || personnes.find((p) => aRole(p, /dirigeant/));
  if (!tete) return null;
  // Pôles opérationnels, chacun avec son équipe (comme sur l'organigramme validé).
  const POLES: Array<[RegExp, string]> = [[/unite mobile/, 'Agents contrôleurs, rondiers'], [/cynophile/, 'Agents AMC, ADS'], [/incendie/, 'Agents SSIAP']];
  const n3: any[] = [];
  for (const [re, equipe] of POLES) {
    for (const p of personnes.filter((x) => x !== tete && aRole(x, re))) n3.push({ nom: p.nom, fonction: p.fonctions.find((f) => re.test(norm(f))), equipe });
  }
  const ordre = [/rh|ressources humaines/, /administratif/, /exploitation/, /qualite/, /commercial/];
  const rang = (p: { fonctions: string[] }) => { const i = ordre.findIndex((re) => aRole(p, re)); return i < 0 ? ordre.length : i; };
  const n2 = personnes
    .filter((p) => p !== tete && !n3.some((x) => x.nom === p.nom))
    .sort((a, b) => rang(a) - rang(b))
    .map((p) => ({ nom: p.nom, fonctions: p.fonctions.filter((f) => !/dirigeant/i.test(norm(f))), exploitation: aRole(p, /exploitation/) }))
    .filter((p) => p.fonctions.length);
  if (!n2.length || n2.length > 7) return null;
  return { tete: { nom: tete.nom, fonctions: tete.fonctions.filter((f) => !/dirigeant/.test(norm(f))) }, n2, n3 };
}

/** Redessine l'organigramme d'après l'organigramme de référence (appelé en début de rendu). */
export function actualiserOrganigramme(referents: string): void {
  try {
    const d = donneesOrganigramme(referents);
    if (!d) return;
    donneesCourantes = d;
    const cle = crypto.createHash('sha1').update(JSON.stringify(d)).digest('hex').slice(0, 12);
    const svg = path.join(os.tmpdir(), `gss-organigramme-${cle}.svg`);
    if (!fs.existsSync(svg) || !fs.statSync(svg).size) {
      const json = path.join(os.tmpdir(), `gss-organigramme-${cle}.json`);
      fs.writeFileSync(json, JSON.stringify(d), 'utf-8');
      const win = process.platform === 'win32';
      const q = (x: string) => (win ? `"${x}"` : x);
      const r = spawnSync(pythonBin(), [q(path.join(MOTEUR, 'organigramme_gss.py')), q(svg), q(json)], { encoding: 'utf-8', timeout: 60_000, shell: win, env: envTheme(RETOUR_ARRIERE) });
      fs.rmSync(json, { force: true });
      if (r.status !== 0 || !fs.existsSync(svg) || !fs.statSync(svg).size) { fs.rmSync(svg, { force: true }); console.warn(`[Organigramme] Schéma non redessiné (${(r.stderr || '').slice(0, 200)}) : organigramme d'origine conservé.`); return; }
    }
    courant = fs.readFileSync(svg, 'utf-8');
  } catch (e: any) {
    console.warn(`[Organigramme] Schéma non redessiné (${e?.message || e}) : organigramme d'origine conservé.`);
  }
}

/** Organigramme dessiné dans un thème de la refonte (null en cas d'échec). */
function organigrammeTheme(theme: string, format: FormatSchema): string | null {
  try {
    const d = donneesCourantes;
    const cle = crypto.createHash('sha1').update(JSON.stringify([d, theme, format, empreinteMoteur()])).digest('hex').slice(0, 12);
    const svg = path.join(os.tmpdir(), `gss-organigramme-${theme}-${format}-${cle}.svg`);
    if (!fs.existsSync(svg) || !fs.statSync(svg).size) {
      const win = process.platform === 'win32';
      const q = (x: string) => (win ? `"${x}"` : x);
      const args = [q(path.join(MOTEUR, 'organigramme_gss.py')), q(svg)];
      const json = path.join(os.tmpdir(), `gss-organigramme-${theme}-${format}-${cle}.json`);
      if (d) { fs.writeFileSync(json, JSON.stringify(d), 'utf-8'); args.push(q(json)); }
      args.push('--format', format);
      const r = spawnSync(pythonBin(), args, { encoding: 'utf-8', timeout: 60_000, shell: win, env: envTheme(theme) });
      fs.rmSync(json, { force: true });
      if (r.status !== 0 || !fs.existsSync(svg) || !fs.statSync(svg).size) {
        fs.rmSync(svg, { force: true });
        console.warn(`[Organigramme] Organigramme non dessiné dans le thème ${theme} (${(r.stderr || r.error?.message || '').slice(0, 200)}) : repli.`);
        return null;
      }
    }
    return fs.readFileSync(svg, 'utf-8');
  } catch (e: any) {
    console.warn(`[Organigramme] Organigramme non dessiné dans le thème ${theme} (${e?.message || e}) : repli.`);
    return null;
  }
}

/** SVG de l'organigramme à insérer (celui de référence s'il a été dessiné, sinon l'original), dans le thème :
 *  format « page » (pleine page) ou « paysage » (dans le texte). Retour arrière : exactement l'organigramme d'origine
 *  au format paysage, toile portrait dans la palette d'origine au format page. */
export function organigrammeSvg(format: FormatSchema = 'paysage', theme?: string | null): string | null {
  const t = themeActif(theme);
  // Retour arrière au format page (1 schéma = 1 page) : toile portrait dans la palette d'origine.
  if (!estRetourArriere(t) || format === 'page') {
    const svg = organigrammeTheme(t, format);
    if (svg) return svg;
  }
  // Repli (retour arrière, ou moteur indisponible) : organigramme d'origine, aux couleurs du thème hors retour arrière.
  let svg: string | null = courant;
  if (!svg) { try { svg = fs.readFileSync(STATIQUE, 'utf-8'); } catch { return null; } }
  if (!estRetourArriere(t)) {
    console.warn(`[Organigramme] Organigramme en repli : dessin d'origine aux couleurs du thème « ${t} ».`);
    return recolorerSvg(svg, t);
  }
  return svg;
}
