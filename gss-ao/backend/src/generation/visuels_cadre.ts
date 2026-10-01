// ════════════════════════════════════════════════════════════════════════════════════════
// VISUELS GSS DANS LES RÉPONSES DU CADRE IMPOSÉ (retour GSS : « nos schémas ne sont pas réutilisés »)
// ════════════════════════════════════════════════════════════════════════════════════════
// Sous chaque réponse développée du cadre, le schéma GSS VALIDÉ le plus pertinent (bibliothèque de
// la planche, organigramme GSS pour les questions d'encadrement) est inséré en image, dans la
// cellule de la réponse. Un schéma n'est inséré que s'il parle réellement du sujet de la réponse,
// et jamais deux fois le même. Étape non bloquante : en cas d'échec, le document reste sans visuel.

import fs from 'fs';
import os from 'os';
import path from 'path';
import PizZip from 'pizzip';
import { insererPhotoDocx, paragrapheDuChamp } from './docx_images';
import { organigrammeSvg } from './organigramme';
import { themeActif, estRetourArriere, schemasBibliotheque, fontFaceTheme } from './themes';

const MOTEUR = path.resolve(__dirname, '../../python/schemas_gss');
const EXCLUS = /covid|hydroalcool|gestes barri|pass sanitaire|magasin|caisse|transport de fonds|antivol|prospection|commercial/i;
const VIDES = new Set(['dans', 'pour', 'avec', 'votre', 'notre', 'leurs', 'cette', 'sont', 'plus', 'tout', 'tous', 'toute', 'toutes', 'selon', 'lors', 'afin', 'ainsi', 'chaque', 'entre', 'depuis', 'aussi', 'site', 'sites', 'agent', 'agents', 'service', 'sécurité', 'securite', 'client', 'prestation', 'prestations']);

const mots = (t: string) => new Set(
  (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z]+/)
    .filter((w) => w.length >= 5 && !VIDES.has(w)).map((w) => w.replace(/s$/, '')),
);

/** Choisit, pour chaque réponse, le schéma GSS le plus pertinent (ou aucun), dans le thème de style (schéma placé dans
 *  le texte : toile paysage du moteur, couleurs et police du thème ; retour arrière : schéma d'origine). */
export function choisir(reponses: Array<{ cle: string; question: string; texte: string; prefere?: string }>, themeDemande?: string): Array<{ cle: string; id: string; svg: string }> {
  const theme = themeActif(themeDemande);
  let index: any[] = [];
  try { index = JSON.parse(fs.readFileSync(path.join(MOTEUR, 'bibliotheque', 'index.json'), 'utf-8')); } catch { return []; }
  const dispo = index.filter((x) => x.reutilisable && x.section !== 'b_references' && !EXCLUS.test(`${x.titre} ${x.texte}`));
  const utilises = new Set<string>();
  const out: Array<{ cle: string; id: string; svg: string }> = [];
  for (const r of reponses) {
    // Encadrement / organisation hiérarchique : l'organigramme GSS.
    if (/composition des [ée]quipes|organisation hi[ée]rarchique|organigramme|encadrement/i.test(r.question) && !utilises.has('organigramme')) {
      // Organigramme dessiné d'après l'organigramme GSS de référence (mêmes personnes que le texte).
      const svg = organigrammeSvg('paysage', theme);
      if (svg) { utilises.add('organigramme'); out.push({ cle: r.cle, id: 'organigramme', svg }); continue; }
    }
    // Réponse reprise du mémoire type : le schéma GSS de la rubrique reprise d'abord (même fond que le texte).
    const prefere = r.prefere ? dispo.find((x) => x.id === r.prefere && !utilises.has(x.id)) : undefined;
    if (prefere) {
      try {
        out.push({ cle: r.cle, id: prefere.id, svg: fs.readFileSync(path.join(MOTEUR, 'bibliotheque', `${prefere.id}.svg`), 'utf-8') });
        utilises.add(prefere.id);
        continue;
      } catch { /* schéma illisible : recherche par mots ci-dessous */ }
    }
    const m = mots(`${r.question} ${r.question} ${r.texte}`);
    const score = (x: any) => [...mots(`${x.titre} ${x.texte}`)].filter((w) => m.has(w)).length;
    const cands = dispo.filter((x) => !utilises.has(x.id)).map((x) => ({ x, s: score(x) })).filter((c) => c.s >= 4).sort((a, b) => b.s - a.s);
    if (!cands.length) continue;
    const choix = cands[0].x;
    try {
      out.push({ cle: r.cle, id: choix.id, svg: fs.readFileSync(path.join(MOTEUR, 'bibliotheque', `${choix.id}.svg`), 'utf-8') });
      utilises.add(choix.id);
    } catch { /* schéma illisible : ignoré */ }
  }
  if (!estRetourArriere(theme)) {
    const themes = schemasBibliotheque(out.filter((c) => c.id !== 'organigramme').map((c) => c.id), 'paysage', theme);
    for (const c of out) if (c.id !== 'organigramme' && themes.has(c.id)) c.svg = themes.get(c.id)!;
  }
  return out;
}

/** Rend des SVG en PNG (navigateur sans interface, une seule instance), avec les polices du thème embarquées. */
async function rendrePng(svgs: string[], theme: string = themeActif()): Promise<string[]> {
  const polices = fontFaceTheme(theme);
  const puppeteer = require('puppeteer');
  const navigateur = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  const fichiers: string[] = [];
  try {
    const page = await navigateur.newPage();
    await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
    for (const svg of svgs) {
      if (polices) {
        await page.setContent(`<html><head><style>${polices}</style></head><body style="margin:0;background:#fff">${svg}</body></html>`, { waitUntil: 'load' });
        await page.evaluate('document.fonts.ready');
      } else {
        await page.setContent(`<html><body style="margin:0;background:#fff">${svg}</body></html>`, { waitUntil: 'load' });
      }
      const el = await page.$('svg');
      const f = path.join(os.tmpdir(), `gss-schema-${Date.now()}-${fichiers.length}.png`);
      if (el) { await el.screenshot({ path: f }); fichiers.push(f); } else fichiers.push('');
    }
  } finally {
    await navigateur.close();
  }
  return fichiers;
}

/**
 * Insère sous les réponses développées du cadre le schéma GSS le plus pertinent. Renvoie le nombre de
 * schémas insérés. Les signets GSS_CH_n doivent déjà être posés.
 */
export async function insererSchemasReponses(zip: PizZip, xmlDoc: any, reponses: Array<{ cle: string; question: string; texte: string; prefere?: string }>): Promise<number> {
  const theme = themeActif();
  const choix = choisir(reponses, theme);
  if (!choix.length) return 0;
  const pngs = await rendrePng(choix.map((c) => c.svg), theme);
  let n = 0;
  choix.forEach((c, i) => {
    const png = pngs[i];
    const para = png ? paragrapheDuChamp(xmlDoc, c.cle) : null;
    if (!png || !para) return;
    try {
      insererPhotoDocx(zip, xmlDoc, { nom: `Schéma GSS ${c.id}`, chemin: png }, '', para, 500 + i);
      n++;
    } catch { /* image non insérable : ignorée */ }
    fs.rmSync(png, { force: true });
  });
  return n;
}
