// ════════════════════════════════════════════════════════════════════════════════════════
// ORGANIGRAMME GSS EN SCHÉMA, D'APRÈS L'ORGANIGRAMME DE RÉFÉRENCE
// ════════════════════════════════════════════════════════════════════════════════════════
// Le schéma de l'organigramme (design validé, moteur python/schemas_gss/organigramme_gss.py) est
// dessiné avec les MÊMES personnes que le texte : annuaire « Personnes » + registre des mémoires
// (organigrammeGss). Sans cela, le schéma figé omettait des responsables cités dans le texte.
// En cas d'échec, le schéma d'origine (organigramme_gss.svg) est conservé.

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { rolesOrganigramme } from './base_memoires';

const MOTEUR = path.resolve(__dirname, '../../python/schemas_gss');
const STATIQUE = path.join(MOTEUR, 'organigramme_gss.svg');
let courant: string | null = null;

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
    const cle = crypto.createHash('sha1').update(JSON.stringify(d)).digest('hex').slice(0, 12);
    const svg = path.join(os.tmpdir(), `gss-organigramme-${cle}.svg`);
    if (!fs.existsSync(svg) || !fs.statSync(svg).size) {
      const json = path.join(os.tmpdir(), `gss-organigramme-${cle}.json`);
      fs.writeFileSync(json, JSON.stringify(d), 'utf-8');
      const win = process.platform === 'win32';
      const q = (x: string) => (win ? `"${x}"` : x);
      const r = spawnSync(win ? 'py' : 'python3', [q(path.join(MOTEUR, 'organigramme_gss.py')), q(svg), q(json)], { encoding: 'utf-8', timeout: 60_000, shell: win });
      fs.rmSync(json, { force: true });
      if (r.status !== 0 || !fs.existsSync(svg) || !fs.statSync(svg).size) { fs.rmSync(svg, { force: true }); console.warn(`[Organigramme] Schéma non redessiné (${(r.stderr || '').slice(0, 200)}) : organigramme d'origine conservé.`); return; }
    }
    courant = fs.readFileSync(svg, 'utf-8');
  } catch (e: any) {
    console.warn(`[Organigramme] Schéma non redessiné (${e?.message || e}) : organigramme d'origine conservé.`);
  }
}

/** SVG de l'organigramme à insérer (celui de référence s'il a été dessiné, sinon l'original). */
export function organigrammeSvg(): string | null {
  if (courant) return courant;
  try { return fs.readFileSync(STATIQUE, 'utf-8'); } catch { return null; }
}
