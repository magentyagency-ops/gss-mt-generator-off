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
import { dessinerSpecs } from './schema_service';

const MOTEUR = path.resolve(__dirname, '../../python/schemas_gss');
const EXCLUS = /covid|hydroalcool|gestes barri|pass sanitaire|magasin|caisse|transport de fonds|antivol|prospection|commercial/i;
const VIDES = new Set(['dans', 'pour', 'avec', 'votre', 'notre', 'leurs', 'cette', 'sont', 'plus', 'tout', 'tous', 'toute', 'toutes', 'selon', 'lors', 'afin', 'ainsi', 'chaque', 'entre', 'depuis', 'aussi', 'site', 'sites', 'agent', 'agents', 'service', 'sécurité', 'securite', 'client', 'prestation', 'prestations']);

const mots = (t: string) => new Set(
  (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z]+/)
    .filter((w) => w.length >= 5 && !VIDES.has(w)).map((w) => w.replace(/s$/, '')),
);

/** Réponse développée du cadre : `svg` est un schéma déjà dessiné pour elle (process de la compréhension du besoin,
 *  spécification du mémoire type de la rubrique reprise), repéré par `svgId` ; `prefere`, le schéma de la bibliothèque
 *  de la rubrique reprise. */
export interface ReponseCadre { cle: string; question: string; texte: string; prefere?: string; svg?: string; svgId?: string }

/** Choisit, pour chaque réponse, le schéma GSS le plus pertinent (ou aucun), dans le thème de style (schéma placé dans
 *  le texte : toile paysage du moteur, couleurs et police du thème ; retour arrière : schéma d'origine). */
export function choisir(reponses: ReponseCadre[], themeDemande?: string, options: { seulementReprise?: boolean; vocabulaire?: Array<[string, string]> } = {}): Array<{ cle: string; id: string; svg: string }> {
  const theme = themeActif(themeDemande);
  let index: any[] = [];
  try { index = JSON.parse(fs.readFileSync(path.join(MOTEUR, 'bibliotheque', 'index.json'), 'utf-8')); } catch { return []; }
  const dispo = index.filter((x) => x.reutilisable && x.section !== 'b_references' && !EXCLUS.test(`${x.titre} ${x.texte}`));
  const utilises = new Set<string>();
  const out: Array<{ cle: string; id: string; svg: string }> = [];
  const dessines = new Set<string>();
  for (const r of reponses) {
    // Schéma déjà dessiné pour cette réponse (même fond que le texte) : il passe avant tout autre.
    if (r.svg && r.svgId && !utilises.has(r.svgId)) {
      utilises.add(r.svgId);
      dessines.add(r.svgId);
      out.push({ cle: r.cle, id: r.svgId, svg: r.svg });
      continue;
    }
    // Encadrement / organisation hiérarchique : l'organigramme GSS.
    if (/composition des [ée]quipes|organisation hi[ée]rarchique|organigramme|encadrement/i.test(r.question) && !utilises.has('organigramme')) {
      // Organigramme dessiné d'après l'organigramme GSS de référence (mêmes personnes que le texte).
      const svg = organigrammeSvg('paysage', theme);
      if (svg) { utilises.add('organigramme'); out.push({ cle: r.cle, id: 'organigramme', svg }); continue; }
    }
    // Réponse reprise du mémoire type : le schéma GSS de la rubrique reprise d'abord (même fond que le texte). Il vient du
    // mémoire type : les exclusions de la recherche par mots (secteurs cités, « grands magasins »…) ne s'y appliquent pas.
    const prefere = r.prefere ? index.find((x) => x.id === r.prefere && !utilises.has(x.id)) : undefined;
    if (prefere) {
      try {
        out.push({ cle: r.cle, id: prefere.id, svg: fs.readFileSync(path.join(MOTEUR, 'bibliotheque', `${prefere.id}.svg`), 'utf-8') });
        utilises.add(prefere.id);
        continue;
      } catch { /* schéma illisible : recherche par mots ci-dessous */ }
    }
    // Mémoire type actif : seul le schéma de la rubrique effectivement reprise est inséré ; une réponse qui n'en reprend
    // aucune reste sans schéma (un schéma choisi par simple recouvrement de mots tombe souvent hors sujet).
    if (options.seulementReprise) continue;
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
    const biblio = out.filter((c) => c.id !== 'organigramme' && !dessines.has(c.id));
    // Vocabulaire du CCTP dans les textes des schémas (« Chefs de poste » au lieu de « Responsables de site », IGN).
    const themes = schemasBibliotheque(biblio.map((c) => c.id), 'paysage', theme, options.vocabulaire || []);
    for (const c of biblio) if (themes.has(c.id)) c.svg = themes.get(c.id)!;
  }
  return out;
}

/**
 * Toile ramenée à son contenu, à 28 unités près (place des ombres portées), exécuté dans la page du navigateur : les
 * gabarits paysage de la bibliothèque centrent leur contenu sur une toile fixe de 1200 × 660, ce qui laissait dans le
 * document des bandes vides (II-ENC-10, « Équipe de contrôle du marché » : environ 20 % en haut et en bas, cadre
 * Citédia). Le fond plein de la toile est ignoré ; rien n'est déplacé ni redimensionné, seul le cadrage change.
 * Renvoie vrai si la toile a été recadrée.
 */
export const ROGNER_TOILE = `(() => {
  const svg = document.querySelector('svg');
  const vb = svg && svg.viewBox && svg.viewBox.baseVal;
  if (!svg || !vb || !vb.width || !vb.height) return false;
  const r0 = svg.getBoundingClientRect();
  if (!r0.width || !r0.height) return false;
  const kx = vb.width / r0.width, ky = vb.height / r0.height;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const el of svg.querySelectorAll('rect,circle,ellipse,path,line,polyline,polygon,text,image,use,foreignObject')) {
    if (el.closest('defs,marker,clipPath,mask,pattern,symbol')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    if (r.width * r.height >= 0.9 * r0.width * r0.height) continue;
    x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
  }
  if (!isFinite(x0)) return false;
  const M = 28;
  // Bornes entières : la toile reste alignée sur les pixels (aucun décalage d'anticrénelage).
  const nx = Math.max(vb.x, Math.floor(vb.x + (x0 - r0.left) * kx - M));
  const ny = Math.max(vb.y, Math.floor(vb.y + (y0 - r0.top) * ky - M));
  const nw = Math.min(vb.x + vb.width, Math.ceil(vb.x + (x1 - r0.left) * kx + M)) - nx;
  const nh = Math.min(vb.y + vb.height, Math.ceil(vb.y + (y1 - r0.top) * ky + M)) - ny;
  if (nw <= 0 || nh <= 0 || (nw >= vb.width * 0.97 && nh >= vb.height * 0.97)) return false;
  const lw = r0.width * nw / vb.width, lh = r0.height * nh / vb.height;
  svg.setAttribute('viewBox', nx + ' ' + ny + ' ' + nw + ' ' + nh);
  svg.setAttribute('width', String(lw));
  svg.setAttribute('height', String(lh));
  svg.style.width = lw + 'px';
  svg.style.height = lh + 'px';
  return true;
})()`;

/** Rend des SVG en PNG (navigateur sans interface, une seule instance), avec les polices du thème embarquées. Thèmes de
 *  la refonte : toile recadrée sur son contenu (ROGNER_TOILE) ; retour arrière : rendu d'origine inchangé. */
export async function rendrePng(svgs: string[], theme: string = themeActif()): Promise<string[]> {
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
      if (!estRetourArriere(theme)) await page.evaluate(ROGNER_TOILE);
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
export async function insererSchemasReponses(zip: PizZip, xmlDoc: any, reponses: ReponseCadre[], options: { seulementReprise?: boolean; vocabulaire?: Array<[string, string]> } = {}): Promise<number> {
  const theme = themeActif();
  const choix = choisir(reponses, theme, options);
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

/**
 * Tuiles d'un schéma de la bibliothèque contraires à une exigence du DCE (même règle que les conditions du mémoire
 * type) : « Flotte électrique, à terme 100 % électrique » quand le CCTP impose une motorisation thermique ou indique
 * qu'aucune borne de recharge n'est disponible.
 */
const TUILES_CONTRAIRES: Array<{ ref: string; tuile: RegExp; phrase: RegExp; dce: RegExp }> = [
  { ref: 'I-RSE-02', tuile: /flotte [ée]lectrique/i, phrase: /flotte (?:\d+\s*%\s*)?[ée]lectrique/i, dce: /motorisation thermique|v[ée]hicules? (?:[àa] motorisation )?thermiques?|hybride non rechargeable|ne dispos\w* (?:pas|d.aucune?) (?:de )?bornes? de recharge/i },
];

/**
 * Phrase d'un texte de GSS contraire au DCE, selon les mêmes règles que les tuiles des schémas (« nous budgétons le
 * remplacement, à terme, de notre flotte par une flotte 100 % électrique » quand le CCTP impose une motorisation
 * thermique) : elle n'est pas remise dans une réponse du cadre recalée sur le mémoire type.
 */
export function phraseContraireAuDce(phrase: string, dce: string): boolean {
  return TUILES_CONTRAIRES.some((t) => t.phrase.test(String(phrase || '')) && t.dce.test(String(dce || '')));
}

/**
 * Réponses dont le schéma de bibliothèque porte une tuile contraire au DCE : schéma redessiné sans cette tuile (même
 * forme, mêmes autres tuiles) ; s'il ne peut pas l'être, la réponse reste sans schéma. Modifie `reponses` en place.
 */
export async function schemasSelonDce(reponses: ReponseCadre[], dce: string, themeDemande?: string): Promise<void> {
  const regles = TUILES_CONTRAIRES.filter((t) => t.dce.test(String(dce || '')));
  if (!regles.length) return;
  let specs: any[] = [];
  try { specs = JSON.parse(fs.readFileSync(path.join(MOTEUR, 'bibliotheque', 'specs.json'), 'utf-8')).schemas || []; } catch { /* sans specs */ }
  for (const r of reponses) {
    const regle = regles.find((t) => t.ref === r.prefere);
    if (!regle || r.svg) continue;
    r.prefere = undefined;
    const spec = specs.find((x) => x.id === regle.ref);
    const cartes = (spec?.params_nommes?.items || spec?.params_nommes?.cartes || []).filter((c: any) => !regle.tuile.test(`${c?.titre || ''} ${c?.texte || ''}`));
    if (!spec || cartes.length < 2) continue;
    const id = `${regle.ref}-dce`;
    const d = (await dessinerSpecs([{ id, gabarit: spec.gabarit, params: { cartes }, source: cartes.map((c: any) => `${c.titre} ${c.texte || ''}`).join(' '), titre_section: spec.titre }], 'paysage', themeActif(themeDemande))).get(id);
    if (d?.ok && d.svg) { r.svg = d.svg; r.svgId = id; }
  }
}
