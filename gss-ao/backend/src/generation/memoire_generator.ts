import { MarpGenerator, AssembleChapter, AssembleSection } from './marp_generator';
import { ImageLibraryService } from './image_service';
import { D2Service } from './d2_service';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync, spawn } from 'child_process';
import PizZip from 'pizzip';
import OpenAI from 'openai';
import { Client as PgClient } from 'pg';
import { getSettings } from '../core/config';
import { DB, FichiersDB } from '../core/db';
import { getScopedClient } from '../core/supabase';
import { extractText, loadDocxStructure, loadDocxTemplateAnnotated } from '../ingestion/docConverter';
import { overlaySynthesis, loadTrebuchetFont, measureZonesCapacity, RefReplacement, RefContext } from './pdf_overlay';
import { resolveMissingInfo, classifyFieldsLLM, MissingField } from './missing_info_resolver';
import { uploadTempDocx, downloadTempDocx } from '../core/temp_storage';
import { setProgress } from '../core/progress';
// @ts-ignore
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

// Modèle de génération SELON LE CAS :
//  - SANS template (mémoire GSS maître AO RNE : synthèse + réécriture des surlignages) → qualité
//    rédactionnelle prioritaire → gpt-5.4-mini.
//  - AVEC template client (remplissage d'un cadre imposé : extraction/insertion ciblée) → tâche plus
//    mécanique → gpt-5.4-nano (moins cher, suffisant).
// Le modèle effectif est choisi dans generate() puis porté par this.memoireModel. Surchargeable par env.
const MEMOIRE_MODEL = 'gpt-5.6-luna'; // Modèle luna demandé par l'utilisateur
const MODEL_TEMPLATE = 'gpt-5.6-luna'; // Modèle luna demandé par l'utilisateur

// Modèle de génération d'IMAGES pour remplir les cadres « Zone d'image » du template.
// Désactivable via GENERATE_IMAGES=false (étape coûteuse, non bloquante).
const IMAGE_MODEL = process.env.IMAGE_MODEL || 'gpt-image-1';
const IMAGES_ENABLED = process.env.GENERATE_IMAGES !== 'false';

// Modèle d'EMBEDDINGS pour la recherche sémantique (index Doc GSS + DCE). text-embedding-3-small :
// 1536 dim, peu coûteux, TPM élevée → on peut indexer toute la doc + embedder chaque requête de champ.
const EMBED_MODEL = process.env.EMBEDDING_MODEL_MEMOIRE || 'text-embedding-3-small';

// Bucket privé où sont archivées les pièces des dossiers (cf. routes.ts /dce/upload).
const USER_FILES_BUCKET = 'user-files';

/** Un manque détecté, avec sa criticité (bloquant = éliminatoire, facultatif = bonus, normal). */
type MissingFieldDetected = { id: string; label: string; context: string; criticite: 'bloquant' | 'facultatif' | 'normal' };

/** Normalise la criticité renvoyée par l'IA vers l'un des 3 niveaux attendus. */
function normCriticite(c: any): 'bloquant' | 'facultatif' | 'normal' {
  const s = String(c || '').toLowerCase();
  if (s.includes('bloqu') || s.includes('élimin') || s.includes('elimin') || s.includes('obligat')) return 'bloquant';
  if (s.includes('facult') || s.includes('bonus') || s.includes('option')) return 'facultatif';
  return 'normal';
}

/** Un passage indexable pour la recherche sémantique (Doc GSS ou DCE). */
interface RetrievalChunk { source: 'GSS' | 'DCE'; label: string; text: string; embedding?: number[]; }

/** Similarité cosinus entre deux vecteurs (0 si l'un est nul). */
function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// ─── DOM Helpers ───

function findLocalNameChild(node: any, name: string): any {
  if (!node.childNodes) return null;
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i];
    if (child.nodeType === 1 && child.localName === name) return child;
  }
  return null;
}

function getElementsWithLocalName(node: any, name: string): any[] {
  const results: any[] = [];
  const walk = (n: any) => {
    if (n.nodeType === 1 && n.localName === name) results.push(n);
    if (n.childNodes) {
      for (let i = 0; i < n.childNodes.length; i++) walk(n.childNodes[i]);
    }
  };
  walk(node);
  return results;
}

function getParentWithLocalName(node: any, name: string): any {
  let parent = node.parentNode;
  while (parent) {
    if (parent.nodeType === 1 && parent.localName === name) return parent;
    parent = parent.parentNode;
  }
  return null;
}

function getDirectCells(tr: any): any[] {
  const cells: any[] = [];
  const walk = (node: any) => {
    if (node.nodeType === 1) {
      if (node.localName === 'tc') { cells.push(node); return; }
      if (node.localName === 'tbl' || node.localName === 'tr') return;
    }
    if (node.childNodes) {
      for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
    }
  };
  if (tr.childNodes) {
    for (let i = 0; i < tr.childNodes.length; i++) walk(tr.childNodes[i]);
  }
  return cells;
}

function getElementText(node: any): string {
  let text = '';
  const walk = (n: any) => {
    if (n.nodeType === 1 && n.localName === 't') text += n.textContent || '';
    if (n.childNodes) {
      for (let i = 0; i < n.childNodes.length; i++) walk(n.childNodes[i]);
    }
  };
  walk(node);
  return text;
}

function isHeadingParagraph(p: any): boolean {
  const text = getElementText(p).trim();
  if (!text || text.length > 120) return false;
  const pPr = findLocalNameChild(p, 'pPr');
  if (pPr) {
    const pStyle = findLocalNameChild(pPr, 'pStyle');
    if (pStyle) {
      const val = pStyle.getAttribute('w:val') || '';
      if (/heading|titre|title/i.test(val)) return true;
    }
  }
  if (/^(?:[I|V|X|L|C]+\.|[0-9]+(?:\.[0-9]+)*\.?|[A-Z]\.)\s+[A-ZÀ-ÿ]/i.test(text)) return true;
  if (text.length > 5 && text === text.toUpperCase() && /[A-Z]/.test(text)) return true;
  return false;
}

/** Largeur d'une cellule en colonnes de grille (w:gridSpan, défaut 1). */
function cellGridSpan(cell: any): number {
  const tcPr = findLocalNameChild(cell, 'tcPr');
  const gs = tcPr && findLocalNameChild(tcPr, 'gridSpan');
  const v = gs ? parseInt(gs.getAttribute('w:val') || '1', 10) : 1;
  return v > 0 ? v : 1;
}

/** Index de colonne-grille (0-based) où COMMENCE une cellule dans sa ligne (fusions comprises). */
function cellGridStart(cell: any, tr: any): number {
  let col = 0;
  for (const c of getDirectCells(tr)) {
    if (c === cell) break;
    col += cellGridSpan(c);
  }
  return col;
}

/** Cellule (texte + largeur) couvrant la colonne-grille `gridCol` d'une ligne donnée. */
function cellAtGrid(row: any, gridCol: number): { text: string; span: number } {
  let col = 0;
  for (const c of getDirectCells(row)) {
    const span = cellGridSpan(c);
    if (gridCol >= col && gridCol < col + span) return { text: getElementText(c).trim(), span };
    col += span;
  }
  return { text: '', span: 1 };
}

function getTableCellContext(cell: any, tr: any): string {
  const directCells = getDirectCells(tr);
  // Libellé de ligne : les AUTRES cellules de la ligne (la 1re colonne porte l'intitulé de ligne).
  const rowContext = directCells.filter((c: any) => c !== cell).map((c: any) => getElementText(c).trim()).filter(Boolean).join(' | ');

  const tbl = getParentWithLocalName(tr, 'tbl');
  let colHeader = '';
  if (tbl) {
    const allRows = getElementsWithLocalName(tbl, 'tr');
    const targetIdx = allRows.indexOf(tr);
    if (targetIdx > 0) {
      // On mappe par COLONNE DE GRILLE (et non par index de cellule) pour rester juste malgré les
      // cellules fusionnées horizontalement (w:gridSpan) dans l'en-tête ou dans la ligne.
      const gridCol = cellGridStart(cell, tr);
      const h0 = cellAtGrid(allRows[0], gridCol);
      colHeader = h0.text;
      // En-tête groupé sur 2 lignes (1re ligne = groupe fusionné, 2e = sous-en-tête) ou 1re ligne
      // vide → on complète avec la 2e ligne au même emplacement de grille.
      if ((!h0.text || h0.span > 1) && targetIdx > 1) {
        const h1 = cellAtGrid(allRows[1], gridCol).text;
        if (h1) colHeader = h0.text && h0.text !== h1 ? `${h0.text} / ${h1}` : h1;
      }
    }
  }

  return colHeader
    ? `Colonne: "${colHeader}" | Ligne: "${rowContext}"`
    : `Ligne: "${rowContext}"`;
}

function replaceTextInElement(xmlDoc: any, tEl: any, placeholder: string, value: string) {
  const text = tEl.textContent || '';
  if (!text.includes(placeholder)) return;
  if (!value.includes('\n')) {
    tEl.textContent = text.replace(placeholder, value);
    return;
  }
  const parentRun = tEl.parentNode;
  if (!parentRun || parentRun.localName !== 'r') {
    tEl.textContent = text.replace(placeholder, value.replace(/\r?\n/g, ' '));
    return;
  }
  const parts = text.split(placeholder);
  if (parts.length < 2) return;
  tEl.textContent = '';
  const elementsToInsert: any[] = [];
  if (parts[0]) {
    const tBefore = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:t');
    tBefore.setAttribute('xml:space', 'preserve');
    tBefore.textContent = parts[0];
    elementsToInsert.push(tBefore);
  }
  const lines = value.split(/\r?\n/);
  lines.forEach((line: string, index: number) => {
    if (index > 0) {
      const br = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:br');
      elementsToInsert.push(br);
    }
    const tLine = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:t');
    tLine.setAttribute('xml:space', 'preserve');
    tLine.textContent = line;
    elementsToInsert.push(tLine);
  });
  if (parts[1]) {
    const tAfter = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:t');
    tAfter.setAttribute('xml:space', 'preserve');
    tAfter.textContent = parts[1];
    elementsToInsert.push(tAfter);
  }
  elementsToInsert.forEach((el: any) => parentRun.insertBefore(el, tEl));
  parentRun.removeChild(tEl);
}

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function getParagraphStyle(p: any): string {
  const pPr = findLocalNameChild(p, 'pPr');
  if (!pPr) return '';
  const pStyle = findLocalNameChild(pPr, 'pStyle');
  return pStyle ? (pStyle.getAttribute('w:val') || '') : '';
}

// ─── Préservation du maître AO RNE : duplication de "spreads" (pages conçues) ───
// On NE reconstruit plus le document : on garde AO RNE.docx INTACT (design + 221
// images) et on AJOUTE des pages en DUPLIQUANT des pages existantes. Une page conçue
// ("spread") = une section image+titre (image plein-cadre behindDoc + zone de texte
// de titre) SUIVIE d'une section de corps de texte (paragraphes 2 colonnes). Cloner
// ces sections telles quelles préserve le format/design ; il suffit ensuite de
// renuméroter les ids de dessin (wp:docPr / pic:cNvPr — uniques, sinon Word "répare")
// et de remplacer le titre + le corps par le texte personnalisé.

/** Découpe le corps en sections OOXML : une section = paragraphes consécutifs jusqu'au
 * (et incluant le) paragraphe portant <w:sectPr>. Le sectPr final est au niveau body. */
function splitBodyIntoSections(body: any): { sections: any[][]; finalSectPr: any | null } {
  const sections: any[][] = [];
  let cur: any[] = [];
  let finalSectPr: any = null;
  for (let i = 0; i < body.childNodes.length; i++) {
    const node = body.childNodes[i];
    if (node.nodeType !== 1) continue;
    if (node.localName === 'p') {
      cur.push(node);
      const pPr = findLocalNameChild(node, 'pPr');
      if (pPr && findLocalNameChild(pPr, 'sectPr')) { sections.push(cur); cur = []; }
    } else if (node.localName === 'sectPr') {
      finalSectPr = node;
    }
  }
  if (cur.length) sections.push(cur);
  return { sections, finalSectPr };
}

const sectionHasBackgroundImage = (paras: any[]): boolean =>
  paras.some(p => getElementsWithLocalName(p, 'anchor').some((a: any) => a.getAttribute('behindDoc') === '1'));
const sectionHasTextbox = (paras: any[]): boolean =>
  paras.some(p => getElementsWithLocalName(p, 'txbxContent').length > 0);
const sectionIsPlainText = (paras: any[]): boolean =>
  !paras.some(p => getElementsWithLocalName(p, 'drawing').length > 0 || getElementsWithLocalName(p, 'pict').length > 0);

/** Couleur de l'aplat gris clair pleine page du template (corps des pages). */
const GREY_BG_HEX = 'D9D9D9';

/**
 * Trouve le run contenant le rectangle gris clair (#D9D9D9) pleine page utilisé comme
 * fond sur les pages de corps du template AO RNE. C'est un shape vectoriel (solidFill,
 * SANS image) ancré en behindDoc="1", de taille ~21cm × 29.7cm, positionné à page
 * offset (0,0). Attention : le template contient aussi 6 rectangles gris FONCÉ (#494545)
 * pleine page — on les écarte en exigeant explicitement la couleur #D9D9D9. On saute
 * également les premiers paragraphes pour ignorer la couverture. Renvoie le run à cloner.
 */
function findFullPageBackgroundRun(body: any): any | null {
  if (!body || !body.childNodes) return null;
  // On saute les premiers paragraphes (couverture / sommaire) pour cibler les pages de corps
  const MIN_PARA = 50;  // les pages de corps commencent bien après la couverture
  let paraCount = 0;
  for (let i = 0; i < body.childNodes.length; i++) {
    const node = body.childNodes[i];
    if (node.nodeType !== 1 || node.localName !== 'p') continue;
    paraCount++;
    if (paraCount < MIN_PARA) continue;

    const runs = getElementsWithLocalName(node, 'r');
    for (const r of runs) {
      // On ne veut PAS d'image : uniquement l'aplat gris vectoriel
      if (getElementsWithLocalName(r, 'blip').length > 0) continue;
      const anchors = getElementsWithLocalName(r, 'anchor');
      for (const a of anchors) {
        if (a.getAttribute('behindDoc') !== '1') continue;
        const extent = findLocalNameChild(a, 'extent');
        if (!extent) continue;
        const cx = parseInt(extent.getAttribute('cx') || '0', 10);
        const cy = parseInt(extent.getAttribute('cy') || '0', 10);
        const wCm = cx / 914400 * 2.54;
        const hCm = cy / 914400 * 2.54;
        // Pleine page A4 : >19cm large, >28cm haut
        if (wCm < 19 || hCm < 28) continue;
        // Exiger la couleur gris clair #D9D9D9 (pas le gris foncé #494545)
        const colors = getElementsWithLocalName(a, 'srgbClr')
          .map((c: any) => (c.getAttribute('val') || '').toUpperCase());
        if (colors.includes(GREY_BG_HEX)) return r;
      }
    }
  }
  return null;
}

/**
 * Injecte un clone du rectangle gris clair pleine page dans le premier paragraphe d'un
 * ensemble de paragraphes (section corps d'un spread cloné). Les IDs de dessin sont
 * renumérotés pour éviter les doublons Word.
 */
function injectFullPageBackground(bodyParas: any[], bgRun: any, counter: { v: number }) {
  if (!bgRun || bodyParas.length === 0) return;
  const clone = bgRun.cloneNode(true);
  renumberDrawingIds(clone, counter);
  const firstPara = bodyParas[0];
  firstPara.insertBefore(clone, firstPara.firstChild);
}

/**
 * Trouve le run contenant le bandeau « GSS » (logo œil + GSS, image5.png) qui coiffe
 * le titre de chaque page de corps du template. C'est un groupe autonome (sans texte ni
 * zone de titre) ancré en behindDoc="1", de largeur pleine page (~21cm) mais PEU haut
 * (~3.3cm). On le distingue du fond pleine page (haut) par sa faible hauteur, et des
 * blocs de titre par l'absence de texte. Renvoie le run DOM à cloner, ou null.
 */
function findGssBannerRun(body: any): any | null {
  if (!body || !body.childNodes) return null;
  const MIN_PARA = 50;        // on saute la couverture / le sommaire
  const MAX_H_CM = 6;         // bandeau de titre : court (≠ fond pleine page)
  let paraCount = 0;
  for (let i = 0; i < body.childNodes.length; i++) {
    const node = body.childNodes[i];
    if (node.nodeType !== 1 || node.localName !== 'p') continue;
    paraCount++;
    if (paraCount < MIN_PARA) continue;

    const runs = getElementsWithLocalName(node, 'r');
    for (const r of runs) {
      // bandeau image autonome : une image, pas de texte, pas de zone de titre
      if (getElementsWithLocalName(r, 'blip').length === 0) continue;
      if (getElementsWithLocalName(r, 't').length > 0) continue;
      if (getElementsWithLocalName(r, 'txbxContent').length > 0) continue;
      const anchors = getElementsWithLocalName(r, 'anchor');
      for (const a of anchors) {
        if (a.getAttribute('behindDoc') !== '1') continue;
        const extent = findLocalNameChild(a, 'extent');
        if (!extent) continue;
        const wCm = parseInt(extent.getAttribute('cx') || '0', 10) / 914400 * 2.54;
        const hCm = parseInt(extent.getAttribute('cy') || '0', 10) / 914400 * 2.54;
        // Pleine largeur mais court : c'est le bandeau de titre, pas le fond pleine page
        if (wCm >= 19 && hCm >= 2 && hCm <= MAX_H_CM) return r;
      }
    }
  }
  return null;
}

/**
 * Injecte un clone du bandeau « GSS » dans le premier paragraphe d'en-tête d'une page
 * clonée, afin que chaque titre généré porte le logo GSS comme sur les pages du template.
 */
function injectGssBanner(headingParas: any[], gssRun: any, counter: { v: number }) {
  if (!gssRun || headingParas.length === 0) return;
  const clone = gssRun.cloneNode(true);
  renumberDrawingIds(clone, counter);
  const firstPara = headingParas[0];
  firstPara.insertBefore(clone, firstPara.firstChild);
}

/** Plus grand id de dessin présent (wp:docPr / pic:cNvPr) — base pour la renumérotation. */
function maxDrawingId(xmlDoc: any): number {
  let max = 0;
  ['docPr', 'cNvPr'].forEach(name => {
    getElementsWithLocalName(xmlDoc.documentElement, name).forEach((el: any) => {
      const id = parseInt(el.getAttribute('id') || '0', 10);
      if (id > max) max = id;
    });
  });
  return max;
}

/** Réattribue un id unique à chaque dessin (wp:docPr / pic:cNvPr) d'un sous-arbre cloné. */
function renumberDrawingIds(node: any, counter: { v: number }) {
  ['docPr', 'cNvPr'].forEach(name => {
    getElementsWithLocalName(node, name).forEach((el: any) => { el.setAttribute('id', String(++counter.v)); });
  });
}

/**
 * Remplace le texte de toutes les zones de titre (txbxContent) de la section par `title`.
 * Le titre est mis en MAJUSCULES pour respecter l'écriture des titres du template
 * (ex. « NOS AGENTS CYNOPHILES », « NOS PREVENTEURS »).
 */
function setSectionHeading(paras: any[], title: string) {
  const upper = String(title || '').toUpperCase();
  paras.forEach(p => {
    getElementsWithLocalName(p, 'txbxContent').forEach((tx: any) => {
      const tEls = getElementsWithLocalName(tx, 't');
      if (tEls.length === 0) return;
      tEls[0].textContent = upper;
      for (let i = 1; i < tEls.length; i++) tEls[i].textContent = '';
    });
  });
}

/** Découpe le texte généré en lignes de paragraphe (sans markdown, le mode B n'en produit pas). */
function bodyTextToLines(text: string): string[] {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[*_`#]+/g, '')              // garde-fou : retire un éventuel markdown résiduel
    .split('\n')
    .map(l => l.trim());
}

/**
 * Marqueur des zones éditables « Contexte sur mesure ». Une zone est ENCADRÉE par une balise
 * OUVRANTE (« Contexte sur mesure » ou « … début ») et une balise FERMANTE (« … fin »). Les
 * paragraphes vides entre les deux matérialisent l'espace réservé sur la page : le texte injecté
 * y est borné pour ne PAS casser la mise en forme (déborder sur la page conçue suivante).
 */
// Un marqueur = un paragraphe qui COMMENCE par « Contexte … » (« Contexte sur mesure début »,
// « Contexte Une réponse pour vos sites », « Contexte DES MOYENS CALIBRÉS »…). On ancre au DÉBUT
// (après un éventuel guillemet) pour ne PAS confondre avec les phrases du corps (« Dans le contexte… »).
const CONTEXT_MARKER_RE = /^[\s«»“”"'‹›]*Contexte\b/;   // C MAJUSCULE (≠ corps « Le contexte… », « Dans le contexte… »)
/** Balise FERMANTE d'une zone (un marqueur « Contexte … » qui contient « fin »). */
const CONTEXT_CLOSE_RE = /^[\s«»“”"'‹›]*Contexte\b[\s\S]*\bfin\b/i;
// Largeur de découpe (caractères) garantissant qu'une ligne tient sur UNE seule ligne physique
// (sinon le paragraphe déborde sur 2 lignes → décale tout le reste). On CONSERVE l'indentation native
// des lignes réservées (le cadrage voulu) : la largeur utile est donc réduite. Calé sur la géométrie
// d'AO RNE : colonne 2-col ≈ 5644 twips − indent 1906, texte 1-col ≈ 11485 − 1906, police sz 23.
// À AUGMENTER si l'espace réservé reste trop vide ; à RÉDUIRE si une ligne déborde.
const CHARS_PER_LINE_2COL = 26;
const CHARS_PER_LINE_1COL = 68;

/** Vrai si le nœud est à l'intérieur d'une zone de texte Word (txbxContent). */
function isInsideTextbox(node: any): boolean {
  let n = node ? node.parentNode : null;
  while (n) { if (n.localName === 'txbxContent') return true; n = n.parentNode; }
  return false;
}

/** Texte concaténé des runs d'un paragraphe (le texte peut être éclaté en plusieurs `<w:t>`). */
function paragraphText(p: any): string {
  return getElementsWithLocalName(p, 't').map((t: any) => t.textContent || '').join('');
}

/** Écrit `text` dans un paragraphe : tout dans le 1er run, les autres `<w:t>` vidés (style conservé). */
function setParagraphText(p: any, text: string) {
  const tEls = getElementsWithLocalName(p, 't');
  if (tEls.length === 0) return;
  tEls[0].textContent = text;
  // Préserver les espaces de début/fin si présents (texte justifié).
  if (/^\s|\s$/.test(text)) tEls[0].setAttribute('xml:space', 'preserve');
  for (let i = 1; i < tEls.length; i++) tEls[i].textContent = '';
}

/** Vrai si le paragraphe porte un saut de section (sectPr) — structurel (définit les colonnes), à ne JAMAIS toucher. */
function paragraphHasSectPr(p: any): boolean {
  const pPr = findLocalNameChild(p, 'pPr');
  return !!(pPr && findLocalNameChild(pPr, 'sectPr'));
}

/** Vrai si le paragraphe est « vide » : aucun texte, aucune image/dessin, aucun saut de section (ligne blanche de gabarit). */
function isBlankFillerParagraph(p: any): boolean {
  const hasText = getElementsWithLocalName(p, 't').some((t: any) => (t.textContent || '').trim() !== '');
  const hasDrawing = getElementsWithLocalName(p, 'drawing').length > 0 || getElementsWithLocalName(p, 'pict').length > 0;
  return !hasText && !hasDrawing && !paragraphHasSectPr(p);
}

/**
 * Écrit `text` dans un paragraphe en préservant SA mise en forme et SA section (colonnes). Les
 * lignes vides du gabarit n'ont souvent pas de run/`<w:t>` : on en crée un, en reprenant le `rPr`
 * de la marque de paragraphe (`pPr/rPr`) pour conserver police et taille du gabarit.
 */
function fillParagraphText(p: any, text: string) {
  if (getElementsWithLocalName(p, 't').length > 0) { setParagraphText(p, text); return; }
  const doc = p.ownerDocument;
  const r = doc.createElementNS(W_NS, 'w:r');
  const pPr = findLocalNameChild(p, 'pPr');
  const markRPr = pPr ? findLocalNameChild(pPr, 'rPr') : null;
  if (markRPr) r.appendChild(markRPr.cloneNode(true));   // police/taille de la ligne réservée
  const t = doc.createElementNS(W_NS, 'w:t');
  t.setAttribute('xml:space', 'preserve');
  t.textContent = text;
  r.appendChild(t);
  p.appendChild(r);
}

/**
 * Repère, dans l'ordre du document, les paragraphes-marqueurs « Contexte sur mesure » du corps
 * (hors zones de texte). Travaille au niveau paragraphe car le marqueur peut être éclaté en runs.
 */
function findContextMarkers(body: any): any[] {
  return getElementsWithLocalName(body, 'p').filter((p: any) =>
    !isInsideTextbox(p) && CONTEXT_MARKER_RE.test(paragraphText(p)),
  );
}

/**
 * Une zone éditable. `blanks` = lignes vides réservées AVANT l'ancre (déjà en 2 colonnes) ;
 * `postBlanks` = lignes vides réservées APRÈS l'ancre, jusqu'à la fermante (généralement 1 colonne).
 * On ne remplit QUE ces lignes vides existantes, jamais d'ajout/suppression → le nombre de
 * paragraphes reste constant et rien ne se décale en dessous (titres, sections suivantes).
 */
interface ContextZone { open: any; close: any; anchor: any; blanks: any[]; postBlanks: any[]; }

/** sectPr d'un paragraphe (ou null). */
function paragraphSectPr(p: any): any | null {
  const pPr = findLocalNameChild(p, 'pPr');
  return pPr ? findLocalNameChild(pPr, 'sectPr') : null;
}

/** Vrai si ce sectPr met la section en 2 colonnes (w:cols w:num="2"). */
function sectPrIsTwoCol(sectPr: any): boolean {
  if (!sectPr) return false;
  const cols = findLocalNameChild(sectPr, 'cols');
  return !!cols && (cols.getAttribute('w:num') || '') === '2';
}

/** Découpe `text` en lignes de ≤ `maxChars` caractères sans couper les mots (les mots trop longs sont coupés). */
function wrapToLines(text: string, maxChars: number): string[] {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (let w of words) {
    while (w.length > maxChars) {                       // mot plus long que la ligne → on le coupe
      if (cur) { lines.push(cur); cur = ''; }
      lines.push(w.slice(0, maxChars));
      w = w.slice(maxChars);
    }
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Apparie les balises « Contexte sur mesure » en zones [ouvrante → fermante]. L'ANCRE = 1er paragraphe
 * à sectPr 2 colonnes entre les balises (la section 2 colonnes s'achève sur lui). Les lignes vides
 * AVANT l'ancre (`blanks`) sont donc en 2 colonnes ; celles APRÈS (`postBlanks`) en 1 colonne. Sans
 * sectPr 2 colonnes on se rabat sur la fermante (tout en 1 colonne). Fermantes orphelines ignorées.
 */
function findContextZones(body: any): ContextZone[] {
  const markers = findContextMarkers(body);
  const zones: ContextZone[] = [];
  for (let i = 0; i < markers.length; i++) {
    const open = markers[i];
    if (CONTEXT_CLOSE_RE.test(paragraphText(open))) continue;   // fermante seule → ignorée
    let close: any = null, ci = -1;
    for (let j = i + 1; j < markers.length; j++) {
      if (CONTEXT_CLOSE_RE.test(paragraphText(markers[j]))) { close = markers[j]; ci = j; break; }
    }
    if (!close) break;                                          // plus de fermante → fin du document
    if (open.parentNode !== close.parentNode) { i = ci; continue; }
    let anchor: any = null;
    for (let n = open.nextSibling; n && n !== close; n = n.nextSibling) {
      if (n.nodeType === 1 && n.localName === 'p' && sectPrIsTwoCol(paragraphSectPr(n))) { anchor = n; break; }
    }
    if (!anchor) anchor = close;                                // repli : pas de section 2 colonnes
    const blanks: any[] = [];      // lignes vides 2 colonnes (avant l'ancre)
    for (let n = open.nextSibling; n && n !== anchor; n = n.nextSibling) {
      if (n.nodeType === 1 && n.localName === 'p' && isBlankFillerParagraph(n)) blanks.push(n);
    }
    const postBlanks: any[] = [];  // lignes vides 1 colonne (après l'ancre, jusqu'à la fermante)
    if (anchor !== close) {
      for (let n = anchor.nextSibling; n && n !== close; n = n.nextSibling) {
        if (n.nodeType === 1 && n.localName === 'p' && isBlankFillerParagraph(n)) postBlanks.push(n);
      }
    }
    zones.push({ open, close, anchor, blanks, postBlanks });
    i = ci;                                                     // reprendre après la fermante consommée
  }
  return zones;
}

/**
 * Remplit les zones éditables SANS jamais changer le nombre de paragraphes (donc sans décaler les
 * titres/sections en dessous). Principe : le texte est découpé en lignes calibrées pour tenir sur UNE
 * ligne physique, puis écrit DANS les lignes vides déjà réservées (d'abord les lignes 2 colonnes, puis
 * les lignes 1 colonne). Si le texte dépasse le nombre de lignes réservées → tronqué ; s'il est plus
 * court → les lignes vides restantes conservent l'espace. Répartition ÉQUILIBRÉE entre les zones pour
 * étaler le texte sur toutes les pages. Renvoie un récap pour le log.
 */
function fillContextMarkers(body: any, generatedText: string): { markers: number; pagesUsed: number; truncated: boolean; linesFilled: number } {
  const zones = findContextZones(body);
  if (zones.length === 0) return { markers: 0, pagesUsed: 0, truncated: false, linesFilled: 0 };

  let paras = bodyTextToLines(generatedText).filter((l) => l.length > 0);
  const N = zones.length;
  // Si MOINS de paragraphes que de zones, le remplissage séquentiel sature les 1ères zones et laisse
  // les dernières VIDES (sections « disparues »). On redécoupe alors en PHRASES pour avoir assez de
  // blocs à étaler sur toutes les zones (chaque zone reçoit ainsi du texte).
  if (paras.length < N) {
    const sentences = paras.flatMap((p) =>
      (p.match(/[^.!?…]+[.!?…]+(?:["»)\]]+)?\s*|[^.!?…]+$/g) || [p]).map((s) => s.trim()).filter(Boolean));
    if (sentences.length > paras.length) paras = sentences;
  }
  // Largeur de découpe et capacité (en caractères) par zone : 2 colonnes si la zone a des lignes 2-col.
  const wrapWidth = zones.map((z) => (z.blanks.length > 0 ? CHARS_PER_LINE_2COL : CHARS_PER_LINE_1COL));
  const lineBudget = zones.map((z) => z.blanks.length + z.postBlanks.length);
  const charCap = zones.map((_, i) => lineBudget[i] * wrapWidth[i]);

  // Cible par zone = part équilibrée (total / N), plafonnée par la capacité (espace réservé) de la zone.
  const totalChars = paras.reduce((s, p) => s + p.length + 1, 0);
  const share = Math.max(1, Math.ceil(totalChars / N));
  const targets = charCap.map((c) => Math.min(c, share));

  // Répartition séquentielle des paragraphes : on remplit la zone i jusqu'à sa cible, puis i+1.
  const chunks: string[][] = Array.from({ length: N }, () => []);
  let zi = 0, used = 0, truncated = false;
  for (const para of paras) {
    while (zi < N && chunks[zi].length > 0 && used + para.length > targets[zi]) { zi++; used = 0; }
    if (zi >= N) { truncated = true; break; }
    chunks[zi].push(para);
    used += para.length + 1;
  }

  let pagesUsed = 0, linesFilled = 0;
  zones.forEach((z, idx) => {
    // Vider les balises (placeholders) sans rien ajouter/retirer — elles restent des paragraphes vides.
    setParagraphText(z.open, '');
    setParagraphText(z.close, '');
    if (chunks[idx].length === 0) return;
    pagesUsed++;

    // Découper le texte de la zone en lignes physiques contiguës (pas de ligne vide intercalée, qui
    // créerait de gros trous : l'espacement natif des lignes réservées suffit à aérer le texte).
    const phys: string[] = [];
    chunks[idx].forEach((para) => {
      wrapToLines(para, wrapWidth[idx]).forEach((l) => phys.push(l));
    });

    // Écrire UNE ligne par ligne vide réservée (2 colonnes d'abord, puis 1 colonne), en CONSERVANT
    // intégralement la mise en forme native (indentation/cadrage, police, espacement). Aucun paragraphe
    // n'est ajouté ni supprimé → mise en page en dessous inchangée. Surplus tronqué, manque laissé vide.
    const slots = [...z.blanks, ...z.postBlanks];
    if (phys.length > slots.length) truncated = true;
    for (let i = 0; i < slots.length && i < phys.length; i++) {
      fillParagraphText(slots[i], phys[i]);
      linesFilled++;
    }
  });

  return { markers: N, pagesUsed, truncated, linesFilled };
}

/**
 * Refonte V1 — sur une page DUPLIQUÉE, retire UNIQUEMENT les images de fond
 * PLEINE PAGE (photo de décor, anchor `behindDoc="1"` de taille ~21×29.7cm) afin de
 * laisser apparaître le fond gris uniforme. On préserve :
 *  - les runs porteurs d'une zone de titre (`txbxContent`) ;
 *  - le bandeau de titre « GSS » (image behindDoc large mais PEU haute, ~21×3.3cm),
 *    qui doit rester sur chaque titre.
 * Le critère discriminant est donc la HAUTEUR pleine page (≥ 20cm).
 * Renvoie le nombre de runs-images retirés.
 */
function stripStandaloneBgImages(paras: any[]): number {
  const FULLPAGE_MIN_H_CM = 20; // au-delà : fond pleine page ; en deçà : bandeau de titre, etc.
  let removed = 0;
  paras.forEach((p) => {
    const runs = getElementsWithLocalName(p, 'r');
    runs.forEach((r: any) => {
      const anchors = getElementsWithLocalName(r, 'anchor');
      const isFullPageBg = anchors.some((a: any) => {
        if (a.getAttribute('behindDoc') !== '1') return false;
        const extent = findLocalNameChild(a, 'extent');
        const cy = extent ? parseInt(extent.getAttribute('cy') || '0', 10) : 0;
        return (cy / 914400 * 2.54) >= FULLPAGE_MIN_H_CM;
      });
      const hasBlip = getElementsWithLocalName(r, 'blip').length > 0;
      const hasTitle = getElementsWithLocalName(r, 'txbxContent').length > 0;
      if (isFullPageBg && hasBlip && !hasTitle && r.parentNode) {
        r.parentNode.removeChild(r);
        removed++;
      }
    });
  });
  return removed;
}

/** Force la couleur de tous les runs (texte) d'un sous-arbre — lisibilité sur fond gris. */
function forceTextColor(paras: any[], color: string) {
  paras.forEach((p) => {
    getElementsWithLocalName(p, 'r').forEach((r: any) => {
      // ne pas toucher aux runs purement graphiques (drawing/pict) sans texte
      if (getElementsWithLocalName(r, 't').length === 0) return;
      let rPr = findLocalNameChild(r, 'rPr');
      if (!rPr) {
        rPr = r.ownerDocument.createElementNS(W_NS, 'w:rPr');
        r.insertBefore(rPr, r.firstChild);
      }
      let col = findLocalNameChild(rPr, 'color');
      if (!col) {
        col = r.ownerDocument.createElementNS(W_NS, 'w:color');
        rPr.appendChild(col);
      }
      col.setAttribute('w:val', color);
    });
  });
}

/**
 * Clone un spread (sections [titre+image] + [corps]) en injectant `title`
 * (zone de titre) et `bodyText` (corps), avec ids de dessin renumérotés. Renvoie les
 * nouveaux paragraphes prêts à être insérés. Préserve le sectPr d'origine de chaque
 * section (mise en page identique).
 *
 * Refonte V1 (`refonte=true`) : retire les images de fond pleine page des pages
 * dupliquées (fond gris uniforme à la place) et force le texte en sombre (lisibilité).
 */
function cloneSpread(
  xmlDoc: any, headingParas: any[], bodyParas: any[], counter: { v: number }, title: string, bodyText: string,
  refonte = false, stats?: { imagesRemoved: number },
): any[] {
  const newHeading = headingParas.map(p => p.cloneNode(true));
  newHeading.forEach(p => renumberDrawingIds(p, counter));
  if (title) setSectionHeading(newHeading, title);

  // Refonte V1 : sur la page dupliquée, retire l'image de fond pleine page (le
  // titre/bandeau est conservé) et force le texte en sombre pour rester lisible
  // sur le fond gris uniforme injecté au niveau du document.
  if (refonte) {
    const removed = stripStandaloneBgImages(newHeading);
    if (stats) stats.imagesRemoved += removed;
    forceTextColor(newHeading, DUP_TEXT_COLOR);
  }

  const lastBody = bodyParas[bodyParas.length - 1];
  const origSectPr = lastBody ? findLocalNameChild(findLocalNameChild(lastBody, 'pPr'), 'sectPr') : null;
  const sectPrClone = origSectPr ? origSectPr.cloneNode(true) : null;

  const lines = bodyTextToLines(bodyText);
  const newBody: any[] = [];

  // Pour conserver parfaitement la DA (Art Direction), on clone le premier paragraphe du template
  let templateP = bodyParas.find(p => getElementsWithLocalName(p, 't').length > 0) || bodyParas[0];

  if (!templateP) {
    // Fallback de sécurité (très rare)
    templateP = xmlDoc.createElementNS(W_NS, 'w:p');
  }

  lines.forEach((ln, idx) => {
    const pClone = templateP.cloneNode(true);

    // On retire le sectPr du clone (car sectPr ne doit être que sur le DERNIER paragraphe)
    let pPr = findLocalNameChild(pClone, 'pPr');
    if (pPr) {
      const sectPr = findLocalNameChild(pPr, 'sectPr');
      if (sectPr) pPr.removeChild(sectPr);
    } else {
      pPr = xmlDoc.createElementNS(W_NS, 'w:pPr');
      pClone.insertBefore(pPr, pClone.firstChild);
    }

    // Le user a explicitement demandé de RECENTRER le texte
    let jc = findLocalNameChild(pPr, 'jc');
    if (!jc) {
      jc = xmlDoc.createElementNS(W_NS, 'w:jc');
      pPr.appendChild(jc);
    }
    jc.setAttribute('w:val', 'center');

    // On conserve un bon espacement aéré
    let spacing = findLocalNameChild(pPr, 'spacing');
    if (!spacing) {
      spacing = xmlDoc.createElementNS(W_NS, 'w:spacing');
      pPr.appendChild(spacing);
    }
    spacing.setAttribute('w:after', '280'); // 14pt

    // Remplacement du texte tout en gardant les propriétés de police (rPr)
    const runs = getElementsWithLocalName(pClone, 'r');
    if (runs.length > 0) {
      // On garde uniquement le premier "run" pour éviter la duplication de styles hétérogènes
      for (let i = 1; i < runs.length; i++) {
        pClone.removeChild(runs[i]);
      }
      const tEls = getElementsWithLocalName(runs[0], 't');
      if (tEls.length > 0) {
        tEls[0].textContent = ln;
        tEls[0].setAttribute('xml:space', 'preserve');
        for (let i = 1; i < tEls.length; i++) runs[0].removeChild(tEls[i]);
      } else {
        const t = xmlDoc.createElementNS(W_NS, 'w:t');
        t.textContent = ln;
        t.setAttribute('xml:space', 'preserve');
        runs[0].appendChild(t);
      }
    } else {
      const r = xmlDoc.createElementNS(W_NS, 'w:r');
      const t = xmlDoc.createElementNS(W_NS, 'w:t');
      t.textContent = ln;
      t.setAttribute('xml:space', 'preserve');
      r.appendChild(t);
      pClone.appendChild(r);
    }

    // Le dernier paragraphe doit porter les propriétés de section (colonnes, marges, etc.)
    if (idx === lines.length - 1 && sectPrClone) {
      pPr.appendChild(sectPrClone);
    }

    newBody.push(pClone);
  });

  // Refonte V1 : corps de texte en sombre, lisible sur le fond gris uniforme.
  if (refonte) forceTextColor(newBody, DUP_TEXT_COLOR);

  return [...newHeading, ...newBody];
}

// ─── Construction d'un mémoire PROPRE (XML en chaîne, zéro DOM) ───
// On ne touche plus jamais au DOM d'AO RNE (le re-sérialiser dégrade sa maquette).
// À la place, on génère un document.xml NEUF, dont le rendu reprend l'identité
// visuelle d'AO RNE : fond anthracite, texte crème, titres clairs, accent vert GSS.

// Palette extraite d'AO RNE.docx (couleurs dominantes du design).
const COL_BG = '494545';       // fond de page anthracite
const COL_TITLE = 'FFFFFF';    // titres (blanc)
const COL_BODY = 'EFE7D3';     // corps de texte (crème, lisible sur fond sombre)
const COL_ACCENT = 'C81E1E';   // rouge GSS (filets / labels)
const COL_MUTED = 'D9D9D9';    // gris clair (sous-texte)

// ─── Refonte V1 : fond gris uniforme sur les pages dupliquées ───
// Couleur de fond de page (Word: <w:background>). Gris clair lisible, configurable.
// Repli possible sur 'FFFFFF' si le rendu Word pose problème (cf. garde-fou).
const BACKGROUND_COLOR = 'E5E5E5';
// Couleur de texte forcée sur les pages dupliquées (lisible sur fond gris clair).
const DUP_TEXT_COLOR = '1A1A1A';

// Tailles en demi-points (22 = 11 pt) ; espacements en twips (240 = 12 pt).
const SZ_BODY = 22;
const SZ_SECTION = 30;     // titre de section 15 pt
const SZ_SUBHEAD = 26;
const SZ_SUBHEAD2 = 24;
const SZ_CHAPTER = 40;     // titre de chapitre 20 pt
const LINE_AUTO = 276;     // interligne 1,15
const FONT = 'Trebuchet MS';

function escXml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface RunOpts { bold?: boolean; italic?: boolean; size?: number; color?: string; }
interface ParaOpts {
  align?: 'left' | 'center' | 'right' | 'both';
  before?: number; after?: number; line?: number;
  indent?: number; bullet?: boolean;
  accentRule?: boolean;   // filet vert sous le paragraphe (titres de chapitre)
  pageBreak?: boolean;    // saut de page avant
}

/** Run <w:r> en chaîne, police Trebuchet par défaut. */
function runX(text: string, o: RunOpts = {}): string {
  let rpr = `<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>`;
  if (o.bold) rpr += '<w:b/>';
  if (o.italic) rpr += '<w:i/>';
  if (o.color) rpr += `<w:color w:val="${o.color}"/>`;
  if (o.size) rpr += `<w:sz w:val="${o.size}"/><w:szCs w:val="${o.size}"/>`;
  return `<w:r><w:rPr>${rpr}</w:rPr><w:t xml:space="preserve">${escXml(text)}</w:t></w:r>`;
}

/** Paragraphe <w:p> en chaîne à partir de runs déjà sérialisés. */
function paraX(innerRuns: string, o: ParaOpts = {}): string {
  const { align, before = 0, after = 120, line = LINE_AUTO, indent = 0, bullet = false } = o;
  let ppr = '';
  if (o.pageBreak) ppr += '<w:pageBreakBefore/>';
  const left = bullet ? Math.max(indent, 360) : indent;
  if (left) ppr += `<w:ind w:left="${left}"${bullet ? ' w:hanging="240"' : ''}/>`;
  if (o.accentRule) ppr += `<w:pBdr><w:bottom w:val="single" w:sz="14" w:space="6" w:color="${COL_ACCENT}"/></w:pBdr>`;
  ppr += `<w:spacing w:before="${before}" w:after="${after}" w:line="${line}" w:lineRule="auto"/>`;
  if (align) ppr += `<w:jc w:val="${align}"/>`;
  return `<w:p><w:pPr>${ppr}</w:pPr>${innerRuns}</w:p>`;
}

/** Découpe un texte selon le markdown inline (**gras**, __gras__, *italique*). */
function parseInlineMarkdown(text: string): Array<{ text: string; bold?: boolean; italic?: boolean }> {
  const segs: Array<{ text: string; bold?: boolean; italic?: boolean }> = [];
  const re = /\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segs.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) segs.push({ text: m[1], bold: true });
    else if (m[2] !== undefined) segs.push({ text: m[2], bold: true });
    else if (m[3] !== undefined) segs.push({ text: m[3], italic: true });
    last = re.lastIndex;
  }
  if (last < text.length) segs.push({ text: text.slice(last) });
  return segs.filter((s) => s.text && s.text.length > 0);
}

/** Runs d'une ligne, markdown inline rendu, sur une base de style (couleur/taille). */
function inlineX(text: string, base: RunOpts): string {
  const segs = parseInlineMarkdown(text);
  if (segs.length === 0) return runX(text, base);
  return segs.map((s) => runX(s.text, { ...base, bold: base.bold || s.bold, italic: s.italic })).join('');
}

/** Normalise un titre pour comparer (minuscules, sans accents ni ponctuation). */
function normTitle(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Convertit un bloc markdown en paragraphes <w:p> (chaîne), couleur crème par défaut.
 * `skipTitle` : omet la 1re ligne si c'est un titre quasi identique au titre de section
 * (l'IA répète souvent le titre en tête de réponse).
 */
function markdownToParagraphsX(raw: string, skipTitle?: string): string {
  const out: string[] = [];
  const skipNorm = skipTitle ? normTitle(skipTitle) : '';
  let firstContent = true;
  const isDup = (t: string) => {
    if (!skipNorm) return false;
    const n = normTitle(t);
    return n === skipNorm || (n.length > 6 && (skipNorm.includes(n) || n.includes(skipNorm)));
  };

  for (const rawLine of String(raw || '').replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.replace(/\t/g, ' ').replace(/`+/g, '').trimEnd();
    const t = line.trim();
    if (t === '' || /^[-*_]{3,}$/.test(t)) continue;

    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      if (firstContent && isDup(h[2])) { firstContent = false; continue; }
      firstContent = false;
      const sz = h[1].length <= 1 ? SZ_SUBHEAD : SZ_SUBHEAD2;
      out.push(paraX(inlineX(h[2], { bold: true, size: sz, color: COL_TITLE }), { before: 200, after: 100 }));
      continue;
    }
    const bo = t.match(/^\*\*(.+?)\*\*:?\.?$/);
    if (bo) {
      if (firstContent && isDup(bo[1])) { firstContent = false; continue; }
      firstContent = false;
      out.push(paraX(inlineX(bo[1], { bold: true, size: SZ_SUBHEAD2, color: COL_TITLE }), { before: 160, after: 80 }));
      continue;
    }
    firstContent = false;

    const bullet = t.match(/^[-*+•]\s+(.*)$/);
    if (bullet) {
      out.push(paraX(runX('•\t', { size: SZ_BODY, color: COL_ACCENT, bold: true }) + inlineX(bullet[1], { size: SZ_BODY, color: COL_BODY }), { bullet: true, after: 80 }));
      continue;
    }
    const num = t.match(/^(\d+)[.)]\s+(.*)$/);
    if (num) {
      out.push(paraX(runX(`${num[1]}.\t`, { size: SZ_BODY, color: COL_ACCENT, bold: true }) + inlineX(num[2], { size: SZ_BODY, color: COL_BODY }), { indent: 360, after: 80 }));
      continue;
    }
    out.push(paraX(inlineX(t, { size: SZ_BODY, color: COL_BODY }), { align: 'both', after: 140 }));
  }
  return out.join('');
}


// ─── Mode B (réponse libre / sans cadre imposé) ───
// Mapping miroir de frontend/lib/ai/sections-b.ts : permet de regrouper la map
// plate {id_section: texte} renvoyée par l'export front en chapitres I..IV.
const CHAPTER_TITLES_B: Record<string, string> = {
  I: 'Présentation de notre structure',
  II: 'Les moyens humains',
  III: 'Les moyens opérationnels',
  IV: 'Les moyens organisationnels',
};

const AI_SECTIONS_B: Array<{ id: string; chapter: string; title: string }> = [
  // I — Présentation de notre structure
  { id: 'b_presentation', chapter: 'I', title: 'Présentation de la société GSS' },
  { id: 'b_implantation', chapter: 'I', title: 'Implantation régionale et agences de proximité' },
  { id: 'b_agrements', chapter: 'I', title: 'Autorisations, agréments CNAPS et conformité légale' },
  { id: 'b_engagement_rse', chapter: 'I', title: 'Engagement RSE et écologique' },
  // II — Les moyens humains
  { id: 'b_moyens_humains', chapter: 'II', title: 'Qualifications et profils des agents (CQP APS, SSIAP)' },
  { id: 'b_encadrement', chapter: 'II', title: 'Encadrement et organigramme opérationnel' },
  { id: 'b_reprise_personnel', chapter: 'II', title: 'Reprise du personnel en place (article L1224-1)' },
  { id: 'b_recrutement_formation', chapter: 'II', title: 'Recrutement, formation et montée en compétences' },
  { id: 'b_dispositif_absence', chapter: 'II', title: "Dispositif palliatif d'absence et remplacement" },
  { id: 'b_tenues_epi', chapter: 'II', title: 'Tenues et équipements de protection des agents' },
  // III — Les moyens opérationnels
  { id: 'b_moyens_materiels', chapter: 'III', title: 'Moyens matériels et équipements' },
  { id: 'b_rondes', chapter: 'III', title: 'Rondes, pointeaux et main courante électronique' },
  { id: 'b_controle_acces', chapter: 'III', title: 'Gestion des accès et contrôle des flux' },
  { id: 'b_telesurveillance', chapter: 'III', title: 'Télésurveillance et levée de doute' },
  { id: 'b_gestion_alarmes', chapter: 'III', title: "Gestion des alarmes et procédures d'intervention" },
  // IV — Les moyens organisationnels
  { id: 'b_organisation', chapter: 'IV', title: 'Organisation et démarrage de la prestation' },
  { id: 'b_planning', chapter: 'IV', title: 'Plannings et continuité de service' },
  { id: 'b_suivi_qualite', chapter: 'IV', title: 'Suivi qualité, contrôles inopinés et reporting' },
  { id: 'b_procedures', chapter: 'IV', title: 'Procédures opérationnelles et gestion des incidents' },
  { id: 'b_amelioration', chapter: 'IV', title: 'Amélioration continue et bilan de prestation' },
];

const CHAPTER_ORDER_B = ['I', 'II', 'III', 'IV'];

// ─── Mapping Documentation GSS → sections du mémoire ───
// Associe chaque catégorie de la Documentation GSS (21 dossiers PDF) aux mots-clés
// des spreads d'AO RNE.docx pour sélectionner automatiquement les sources pertinentes.
const GSS_DOC_KEYWORDS: Record<string, string[]> = {
  'ABSENCE ET RETARD': ['absence', 'retard', 'remplacement', 'palliatif', 'indisponibilite'],
  'EFFECTIFS ET ORGANIGRAMME': ['effectif', 'organigramme', 'encadrement', 'equipe', 'structure', 'moyens humains'],
  'ENGAGEMENT ECOLOGIQUE': ['ecologique', 'rse', 'environnement', 'durable', 'responsabilite'],
  'FORMATION': ['formation', 'competence', 'qualification', 'cqp', 'ssiap', 'mac'],
  'FORMATION INTERNE': ['formation interne', 'parcours', 'montee en competence', 'habilitation'],
  'INTERLOCUTEUR UNIQUE': ['interlocuteur', 'contact unique', 'referent', 'proximite'],
  'LMC': ['main courante electronique', 'lmc', 'logiciel'],
  'MAIN COURANTE': ['main courante', 'rapport', 'evenement', 'ronde', 'pointeau'],
  'MANAGEMENT': ['management', 'direction', 'presentation', 'societe', 'pilotage', 'qui sommes'],
  'MATERIEL': ['materiel', 'equipement', 'moyen technique', 'outil', 'vehicule', 'radio', 'pti', 'dati', 'communication'],
  'MISE EN PLACE': ['mise en place', 'demarrage', 'lancement', 'deploiement', 'phase preparatoire'],
  "MOYENS D'ACCES": ['acces', 'cle', 'badge', 'controle acces', 'securisation', 'flux'],
  'NOUVEAU MARCHE': ['nouveau marche', 'reprise', 'transition', 'personnel en place', 'l1224', 'prise de poste'],
  'NOUVEL AGENT': ['integration', 'nouvel agent', 'accueil'],
  'PARTENAIRES': ['partenaire', 'sous-traitant', 'prestataire'],
  'PLANNIFICATION': ['planning', 'planification', 'vacation', 'horaire', 'continuite', 'service'],
  'PROCEDURE': ['procedure', 'incident', 'alarme', 'intrusion', 'incendie', 'intervention', 'suspect', 'victime', 'perturbateur', 'consigne'],
  'RECRUTEMENT': ['recrutement', 'embauche', 'selection', 'candidat', 'profil'],
  'SUIVI QUALITE ET CONTROLES': ['qualite', 'controle', 'inopine', 'audit', 'suivi', 'reporting', 'indicateur', 'amelioration'],
  'TENUES': ['tenue', 'vestiaire', 'uniforme', 'epi', 'equipement de protection', 'habillement'],
  'VALEURS': ['valeur', 'engagement', 'ethique', 'mission', 'vision'],
};

// ─── Solutions GSS spécifiques par section × type de marché (public / privé) ───
// Pour chaque thématique du mémoire, liste les arguments stratégiques GSS différenciants
// selon que le client est un acheteur public (Code de la commande publique) ou privé.
// `common` = applicable quel que soit le cadre. Utilisé pour enrichir les prompts IA.

interface GssSolutionSet { public: string[]; prive: string[]; common: string[]; }
const GSS_SOLUTIONS_BY_CONTEXT: Record<string, GssSolutionSet> = {
  // ── I — Présentation de notre structure ──
  'presentation': {
    public: [
      `Conformité au Code de la commande publique (art. L2141-1 et suivants) et transparence des procédures`,
      `Référencement sur plateformes de dématérialisation (PLACE, AWS, profils acheteurs)`,
      `Expérience avérée auprès de collectivités territoriales, EPCI, universités et établissements publics`,
      `Capacité à produire les attestations fiscales et sociales exigées (DC1/DC2, NOTI1/NOTI2)`,
    ],
    prive: [
      `Souplesse contractuelle et adaptation rapide aux besoins évolutifs du client`,
      `Interlocuteur unique dédié avec engagement de réactivité < 1h`,
      `SLA personnalisés avec indicateurs de performance et bonus/malus`,
      `Confidentialité renforcée (NDA, habilitations spécifiques au secteur)`,
    ],
    common: [
      `Agréments CNAPS et autorisations préfectorales à jour sur toute la zone géographique`,
      `Assurance responsabilité civile professionnelle couvrant l'intégralité du périmètre`,
      `Certifications qualité (ISO 9001, Qualiopi pour la formation)`,
    ],
  },
  'implantation': {
    public: [
      `Maillage territorial permettant une couverture multi-sites (agences de proximité en région)`,
      `Connaissance des spécificités des ERP (Établissements Recevant du Public) et des campus`,
    ],
    prive: [
      `Implantation locale garantissant un temps d'intervention réduit (< 30 min)`,
      `Bureau opérationnel dédié sur site pour les contrats importants`,
    ],
    common: [
      `Réseau national d'agences GSS avec encadrement régional`,
      `Centre opérationnel 24/7 pour coordination et pilotage à distance`,
    ],
  },
  'agrements': {
    public: [
      `Production systématique de l'extrait K-bis, attestations URSSAF/impôts, casiers judiciaires des dirigeants`,
      `Renouvellement proactif des agréments CNAPS avant échéance (anticipation de 6 mois)`,
      `Conformité aux critères d'exclusion de la commande publique (art. L2141-1 à L2141-11)`,
    ],
    prive: [
      `Audit de conformité réglementaire inclus dans la prestation (veille CNAPS)`,
      `Garantie contractuelle de mise à jour permanente des autorisations`,
    ],
    common: [
      `Autorisation d'exercice CNAPS pour chaque agence du périmètre`,
      `Agréments dirigeants et cartes professionnelles de tous les agents vérifiées`,
    ],
  },
  'engagement_rse': {
    public: [
      `Réponse aux critères environnementaux et sociaux des marchés publics (art. L2112-2 du CCP)`,
      `Clause d'insertion professionnelle et engagement en faveur de l'emploi local`,
      `Bilan carbone annuel et plan de réduction des émissions`,
    ],
    prive: [
      `Labellisation RSE et reporting extra-financier adapté au secteur du client`,
      `Politique de mobilité durable (véhicules électriques/hybrides pour les rondes)`,
    ],
    common: [
      `Flotte de véhicules à faibles émissions pour les interventions`,
      `Dématérialisation complète (main courante électronique, reporting en ligne)`,
      `Politique zéro papier et tri sélectif sur les postes`,
    ],
  },
  // ── II — Les moyens humains ──
  'moyens_humains': {
    public: [
      `Transparence sur les qualifications : CV anonymisés et fiches de poste conformes au CCTP`,
      `Respect des grilles salariales conventionnelles et engagement anti-dumping social`,
      `Taux d'encadrement supérieur aux minimums réglementaires (1 chef d'équipe / 15 agents)`,
    ],
    prive: [
      `Sélection sur mesure des profils en fonction du secteur d'activité du client`,
      `Possibilité de validation préalable des agents par le client (entretien conjoint)`,
      `Programme de fidélisation (prime de site, avantages, parcours de carrière)`,
    ],
    common: [
      `Agents titulaires CQP APS, SSIAP 1/2/3, SST selon les postes`,
      `Vérification systématique carte CNAPS + casier judiciaire à l'embauche`,
      `Formation continue obligatoire (MAC APS, recyclage SSIAP, exercices incendie)`,
    ],
  },
  'encadrement': {
    public: [
      `Organigramme opérationnel dédié au marché, transmis à l'acheteur avec CVs`,
      `Réunions de suivi périodiques (trimestrielles) avec compte-rendu formalisé`,
      `Chef de site SSIAP 2/3 coordinateur sûreté-sécurité selon exigences du CCTP`,
    ],
    prive: [
      `Directeur de compte unique avec disponibilité 7j/7`,
      `Reporting personnalisé selon les KPIs définis conjointement`,
      `Comité de pilotage mensuel avec tableaux de bord opérationnels`,
    ],
    common: [
      `Management de proximité : responsable d'exploitation basé en région`,
      `Chaîne d'astreinte 24/7 (agent → chef d'équipe → responsable exploitation → direction)`,
    ],
  },
  'reprise_personnel': {
    public: [
      `Application stricte de l'article L1224-1 du Code du travail (obligation légale de reprise)`,
      `Transparence totale : entretiens individuels, maintien des droits acquis, information du CSE`,
      `Délai de transition structuré (J-45 à J+15) avec plan de reprise détaillé`,
    ],
    prive: [
      `Reprise volontaire du personnel en place pour garantir la continuité de service`,
      `Audit social préalable (ancienneté, qualifications, souhaits de mobilité)`,
      `Programme d'intégration accéléré aux process et à la culture GSS`,
    ],
    common: [
      `Maintien des conditions salariales et avantages acquis du personnel repris`,
      `Plan de formation passerelle pour mise à niveau aux standards GSS`,
      `Accompagnement RH personnalisé pendant la période de transition (3 mois)`,
    ],
  },
  'recrutement_formation': {
    public: [
      `Plan de formation annuel transmis à l'acheteur (obligation du CCTP)`,
      `Habilitations spécifiques aux sites publics (ERP, ICPE, ZRR, zones sensibles)`,
      `Partenariats avec les CFA et organismes de formation certifiés Qualiopi`,
    ],
    prive: [
      `Formation aux risques spécifiques du secteur client (industriel, logistique, tertiaire)`,
      `E-learning GSS Academy : modules accessibles 24/7 pour montée en compétences continue`,
    ],
    common: [
      `Processus de recrutement rigoureux en 5 étapes (sourcing, entretien, vérifications, formation, intégration)`,
      `Formation initiale renforcée (consignes de poste, procédures GSS, culture client)`,
      `Recyclages MAC APS / SSIAP dans les délais réglementaires`,
    ],
  },
  'dispositif_absence': {
    public: [
      `Engagement contractuel de remplacement en < 2h (pénalité applicable en cas de manquement)`,
      `Volant de réserve régional dimensionné selon les effectifs du marché (ratio 1 réserviste / 8 titulaires)`,
    ],
    prive: [
      `Remplacement garanti en < 1h grâce au vivier de proximité`,
      `Application mobile d'alerte pour mobilisation instantanée des agents disponibles`,
    ],
    common: [
      `Planning prévisionnel avec gestion anticipée des congés, formations et absences prévisibles`,
      `Agents remplaçants formés et habilités sur les consignes spécifiques du site`,
      `Système de binômage : chaque titulaire a un remplaçant attitré connaissant le site`,
    ],
  },
  'tenues_epi': {
    public: [
      `Tenues conformes au CCTP (logo, couleur, identification visible selon arrêté préfectoral)`,
      `Dotation individuelle complète fournie à la prise de poste (pas de partage d'EPI)`,
    ],
    prive: [
      `Personnalisation des tenues aux couleurs et au logo du client (co-branding)`,
      `Adaptation des EPI aux risques spécifiques du site (ATEX, froid, chaleur, chimique)`,
    ],
    common: [
      `Tenue professionnelle complète : veste, pantalon, polo, chaussures de sécurité, badge nominatif`,
      `EPI selon poste : gilet haute visibilité, lampe torche, PTI/DATI, radio`,
      `Renouvellement annuel et suivi de l'état des équipements`,
    ],
  },
  // ── III — Les moyens opérationnels ──
  'moyens_materiels': {
    public: [
      `Inventaire détaillé des équipements affectés au marché (annexe au mémoire)`,
      `Véhicules sérigraphiés conformes aux exigences du CCTP (éco-conduite, géolocalisation)`,
    ],
    prive: [
      `Dotation matérielle évolutive selon les besoins du client (scalabilité)`,
      `Intégration aux systèmes existants du client (vidéosurveillance, contrôle d'accès, GTC)`,
    ],
    common: [
      `Système de contrôle de rondes NFC/QR code avec horodatage et géolocalisation`,
      `PTI/DATI pour protection du travailleur isolé sur chaque agent`,
      `Radios numériques pour communication inter-agents et avec le PC sécurité`,
      `Véhicules d'intervention équipés (gyrophare, premier secours, extincteur)`,
    ],
  },
  'rondes': {
    public: [
      `Points de contrôle (pointeaux NFC) positionnés selon le plan de prévention du CCTP`,
      `Rapports de rondes horodatés consultables par l'acheteur via l'extranet GSS`,
    ],
    prive: [
      `Parcours de rondes personnalisés et modifiables en temps réel via l'application GSS`,
      `Rondes aléatoires programmables pour effet dissuasif renforcé`,
    ],
    common: [
      `Main courante électronique (TrackForce/LMC) : saisie terrain, photos, alertes en temps réel`,
      `Reporting automatique : synthèse quotidienne, hebdomadaire et mensuelle`,
      `Traçabilité complète : chaque ronde, chaque événement est horodaté et géolocalisé`,
    ],
  },
  'controle_acces': {
    public: [
      `Gestion des accès conforme aux exigences ZRR/zone sensible (contrôle visuel + badge)`,
      `Registre des entrées/sorties dématérialisé et consultable par l'administration`,
    ],
    prive: [
      `Interfaçage avec les systèmes de contrôle d'accès existants (NEDAP, TIL, Honeywell)`,
      `Gestion des visiteurs avec pré-enregistrement et QR code d'accès temporaire`,
    ],
    common: [
      `Procédure d'accueil et de filtrage : vérification d'identité, orientation, enregistrement`,
      `Gestion sécurisée des clés et badges (armoire à clés sécurisée, traçabilité)`,
      `Contrôle des livraisons et des prestataires extérieurs`,
    ],
  },
  'telesurveillance': {
    public: [
      `Station de télésurveillance certifiée APSAD P3/P5 (exigence fréquente des marchés publics)`,
      `Délais d'intervention contractuels conformes au CCTP (engagements chiffrés par site)`,
      `Intervenants véhiculés basés à moins de 20 km de chaque site (obligation APSAD)`,
    ],
    prive: [
      `Offre modulable : télésurveillance seule, levée de doute, ou intervention complète`,
      `Vidéosurveillance intelligente avec analyse comportementale (option)`,
    ],
    common: [
      `Centre de télésurveillance opéré 24/7 par des opérateurs qualifiés`,
      `Levée de doute vidéo et/ou physique selon protocole convenu`,
      `Report des alarmes intrusion, technique et incendie avec gestion des priorités`,
    ],
  },
  'gestion_alarmes': {
    public: [
      `Procédures d'intervention formalisées et validées par l'acheteur (annexe au marché)`,
      `Rapport d'intervention transmis sous 24h avec analyse causes/conséquences`,
    ],
    prive: [
      `Procédures d'escalade personnalisées selon la criticité (niveaux 1/2/3)`,
      `Intégration des protocoles d'alerte du client (astreinte direction, cellule de crise)`,
    ],
    common: [
      `Gestion des alarmes selon procédure graduée : vérification → alerte → intervention → rapport`,
      `Coordination avec les forces de l'ordre et services de secours`,
      `Retour d'expérience systématique après chaque incident significatif`,
    ],
  },
  // ── IV — Les moyens organisationnels ──
  'organisation': {
    public: [
      `Phase de transition structurée : visite des sites, rencontre du personnel, validation des consignes`,
      `Plan de démarrage formalisé (J-30 à J+30) présenté à l'acheteur avant la prise d'effet`,
      `Période de tuilage avec le prestataire sortant (si applicable)`,
    ],
    prive: [
      `Audit sécurité gratuit préalable au démarrage (diagnostic des vulnérabilités)`,
      `Mise en place progressive (montée en charge) pour les sites complexes`,
    ],
    common: [
      `Réunion de lancement avec l'ensemble des parties prenantes`,
      `Livret d'accueil et consignes de poste spécifiques au site`,
      `Test opérationnel avant démarrage effectif (simulation d'incident)`,
    ],
  },
  'planning': {
    public: [
      `Plannings mensuels transmis à l'acheteur pour validation avant exécution`,
      `Respect strict des amplitudes horaires et repos réglementaires (Convention collective)`,
      `Gestion des prestations supplémentaires sur devis préalable (bon de commande)`,
    ],
    prive: [
      `Plannings flexibles ajustables en temps réel via l'application GSS`,
      `Adaptation aux pics d'activité et événements exceptionnels du client`,
    ],
    common: [
      `Logiciel de planification Comète/SILAE : optimisation des roulements et continuité`,
      `Couverture 24/7 garantie avec chevauchements de vacation pour le passage de consignes`,
      `Anticipation des congés et formations : planning prévisionnel à 3 mois`,
    ],
  },
  'suivi_qualite': {
    public: [
      `Contrôles inopinés mensuels avec rapport transmis à l'acheteur`,
      `Réunions de suivi trimestrielles avec indicateurs de performance (taux de couverture, incidents, remplacements)`,
      `Extranet client : accès temps réel aux mains courantes, plannings et rapports`,
    ],
    prive: [
      `Dashboard personnalisé avec KPIs définis conjointement (SLA, satisfaction, incidents)`,
      `Enquête de satisfaction semestrielle auprès des utilisateurs du site`,
    ],
    common: [
      `Plan d'assurance qualité (PAQ) formalisé et mis à jour annuellement`,
      `Audit interne semestriel par la direction qualité GSS`,
      `Traçabilité complète de toutes les actions (rondes, incidents, remplacements)`,
    ],
  },
  'procedures': {
    public: [
      `Consignes de poste validées conjointement et mises à jour annuellement`,
      `Procédures d'urgence conformes au plan de sécurité de l'établissement (PPMS, POI)`,
      `Exercices d'évacuation et de mise en sûreté selon calendrier de l'acheteur`,
    ],
    prive: [
      `Procédures adaptées aux risques spécifiques du secteur (vol, intrusion, incendie, social)`,
      `Plan de continuité d'activité (PCA) intégré à celui du client`,
    ],
    common: [
      `Procédures opérationnelles : accueil, filtrage, ronde, incident, alarme, évacuation`,
      `Fiche réflexe par type d'événement (intrusion, incendie, accident, personne suspecte)`,
      `Mise à jour continue des procédures selon retours d'expérience`,
    ],
  },
  'amelioration': {
    public: [
      `Bilan annuel de prestation avec analyse des écarts et plan d'amélioration`,
      `Propositions d'optimisation formalisées à chaque reconduction du marché`,
    ],
    prive: [
      `Revue de performance trimestrielle avec propositions d'optimisation`,
      `Benchmark sectoriel et veille technologique au service du client`,
    ],
    common: [
      `Démarche d'amélioration continue (PDCA) intégrée au management GSS`,
      `Analyse des incidents avec actions correctives et préventives tracées`,
      `Veille réglementaire permanente (évolutions CNAPS, normes APSAD, droit du travail)`,
    ],
  },
};

// ─── Helpers stratégiques (type de marché, secteur, contexte réglementaire) ───

/** Détecte si le marché est public ou privé d'après les données d'analyse du DCE. */
function detectMarketType(analysisData: any): 'public' | 'prive' {
  if (!analysisData) return 'public'; // défaut conservateur (plus exigeant)
  const haystack = JSON.stringify(analysisData).toLowerCase();
  const publicIndicators = [
    'marche public', 'marché public', 'commande publique', 'code de la commande',
    'ccag', 'pouvoir adjudicateur', 'collectivite', 'collectivité',
    'universite', 'université', 'etablissement public', 'établissement public',
    'commune ', 'mairie', 'departement', 'département', 'region ', 'région ',
    'ministere', 'ministère', 'etat', 'état', 'hopital', 'hôpital', 'chu ',
    'prefecture', 'préfecture', 'tribunal', 'conseil general', 'conseil général',
    'conseil regional', 'conseil régional', 'communaute', 'communauté',
    'syndicat mixte', 'office public', 'opac', 'oph', 'epci', 'sivom', 'sivu',
    'dc1', 'dc2', 'noti1', 'noti2', 'dume', 'ae ', 'acte engagement',
    'reglement de consultation', 'règlement de consultation',
    'critere d\'attribution', 'critère d\'attribution',
    'offre economiquement', 'offre économiquement',
    'bulletin officiel des annonces', 'boamp', 'joue', 'ted ',
    'procedure ouverte', 'procédure ouverte', 'procedure restreinte', 'procédure restreinte',
    'accord-cadre', 'accord cadre', 'marche a procedure', 'marché à procédure',
  ];
  const privateIndicators = [
    'appel d\'offres prive', 'appel d\'offres privé', 'consultation privee', 'consultation privée',
    'societe ', 'société ', 'entreprise privee', 'entreprise privée',
    'groupe ', 'holding', 'filiale', 'sas ', 'sarl ', 'sa ', 'sasu ',
    'contrat de prestations', 'cahier des charges', 'rfp', 'rfi',
  ];

  let publicScore = 0, privateScore = 0;
  for (const p of publicIndicators) if (haystack.includes(p)) publicScore++;
  for (const p of privateIndicators) if (haystack.includes(p)) privateScore++;

  return publicScore >= privateScore ? 'public' : 'prive';
}

/** Détecte le secteur d'activité du client d'après les données d'analyse. */
function detectClientSector(analysisData: any): string {
  if (!analysisData) return 'tertiaire';
  const haystack = JSON.stringify(analysisData).toLowerCase();
  const sectors: Array<{ name: string; keywords: string[] }> = [
    { name: 'éducation / enseignement supérieur', keywords: ['universite', 'université', 'campus', 'faculte', 'faculté', 'ecole', 'école', 'lycee', 'lycée', 'college', 'collège', 'crous', 'rectorat', 'enseignement'] },
    { name: 'santé / hospitalier', keywords: ['hopital', 'hôpital', 'chu', 'clinique', 'ehpad', 'centre hospitalier', 'ars ', 'sante', 'santé', 'medico', 'médico'] },
    { name: 'industrie / logistique', keywords: ['usine', 'entrepot', 'entrepôt', 'plateforme logistique', 'zone industrielle', 'icpe', 'seveso', 'atex', 'industri'] },
    { name: 'distribution / commerce', keywords: ['centre commercial', 'magasin', 'hypermarche', 'hypermarchée', 'supermarche', 'galerie marchande', 'retail', 'enseigne'] },
    { name: 'événementiel / culture', keywords: ['parc des expositions', 'salle de spectacle', 'musee', 'musée', 'theatre', 'théâtre', 'stade', 'arena', 'festival', 'salon', 'congres', 'congrès', 'foire'] },
    { name: 'transport / infrastructure', keywords: ['gare', 'aeroport', 'aéroport', 'port ', 'tramway', 'metro', 'métro', 'autoroute', 'parking', 'transport'] },
    { name: 'tertiaire / bureaux', keywords: ['siege social', 'siège social', 'immeuble de bureaux', 'tour ', 'campus entreprise', 'coworking', 'tertiaire'] },
    { name: 'collectivité territoriale', keywords: ['mairie', 'hotel de ville', 'hôtel de ville', 'conseil departemental', 'conseil départemental', 'conseil regional', 'conseil régional', 'commune ', 'communaute de communes', 'communauté de communes'] },
    { name: 'résidentiel / habitat social', keywords: ['hlm', 'office public', 'bailleur', 'residence', 'résidence', 'copropriete', 'copropriété', 'habitat social'] },
  ];
  let best = 'tertiaire';
  let bestScore = 0;
  for (const s of sectors) {
    const score = s.keywords.filter(kw => haystack.includes(kw)).length;
    if (score > bestScore) { bestScore = score; best = s.name; }
  }
  return best;
}

/** Construit le cadre réglementaire applicable d'après le type de marché et le secteur. */
function buildRegulatoryFramework(marketType: 'public' | 'prive', sector: string, analysisData: any): string {
  const parts: string[] = [];
  // Obligations communes
  parts.push('Livre VI du Code de la sécurité intérieure (activités privées de sécurité)');
  parts.push('Autorisation CNAPS obligatoire (entreprise + dirigeants + agents)');

  if (marketType === 'public') {
    parts.push('Code de la commande publique (ordonnance n°2018-1074 et décret n°2018-1075)');
    parts.push('CCAG-FCS (Cahier des clauses administratives générales — Fournitures courantes et services)');
    parts.push('Obligation de publicité et mise en concurrence');
  } else {
    parts.push('Droit commercial et Code civil (obligations contractuelles)');
    parts.push('Convention collective nationale des entreprises de prévention et de sécurité');
  }

  // Obligations sectorielles
  const haystack = JSON.stringify(analysisData || {}).toLowerCase();
  if (haystack.includes('ssiap') || haystack.includes('incendie')) parts.push('Arrêté du 2 mai 2005 (SSIAP) — qualification incendie');
  if (haystack.includes('apsad') || haystack.includes('telesurveillance') || haystack.includes('télésurveillance')) parts.push('Certification APSAD R31 (télésurveillance)');
  if (haystack.includes('zrr') || haystack.includes('zone a regime restrictif') || haystack.includes('zone à régime restrictif')) parts.push('Habilitation ZRR (Zones à Régime Restrictif)');
  if (haystack.includes('icpe') || haystack.includes('seveso')) parts.push('Réglementation ICPE / Seveso (sites industriels classés)');
  if (haystack.includes('erp') || haystack.includes('etablissement recevant du public') || haystack.includes('établissement recevant du public')) parts.push('Réglementation ERP (sécurité incendie, accessibilité)');
  if (haystack.includes('l1224') || haystack.includes('reprise')) parts.push('Article L1224-1 du Code du travail (reprise du personnel)');

  return parts.join(' ; ');
}

/**
 * Construit le bloc de contexte stratégique à injecter dans les prompts IA pour une section donnée.
 * Sélectionne les solutions GSS pertinentes au type de marché (public/privé) et au thème de la section.
 */
function buildStrategicContext(sectionId: string, analysisData: any): string {
  const marketType = detectMarketType(analysisData);
  const sector = detectClientSector(analysisData);
  const regulatory = buildRegulatoryFramework(marketType, sector, analysisData);

  // Trouver la clé de solution la plus proche du sectionId
  const sectionKey = sectionId.replace(/^b_/, '').replace(/^(i+|iv)_/, '');
  const solutions = GSS_SOLUTIONS_BY_CONTEXT[sectionKey];

  let solutionsBlock = '';
  if (solutions) {
    const relevant = [
      ...solutions.common,
      ...(marketType === 'public' ? solutions.public : solutions.prive),
    ];
    solutionsBlock = relevant.map((s, i) => `${i + 1}. ${s}`).join('\n');
  }

  const parts: string[] = [];
  parts.push(`TYPE DE MARCHÉ : ${marketType === 'public' ? 'Marché public (Code de la commande publique)' : 'Marché privé (contrat de prestations de services)'}`);
  parts.push(`SECTEUR CLIENT : ${sector}`);
  parts.push(`CADRE RÉGLEMENTAIRE : ${regulatory}`);
  if (solutionsBlock) {
    parts.push(`SOLUTIONS GSS DIFFÉRENCIANTES POUR CETTE SECTION :\n${solutionsBlock}`);
  }
  // Problématiques anticipées du DCE
  const issues = analysisData?.anticipatedIssues || [];
  if (issues.length > 0) {
    parts.push(`PROBLÉMATIQUES ANTICIPÉES (non formulées par l'acheteur) :\n${issues.map((i: string, idx: number) => `${idx + 1}. ${i}`).join('\n')}`);
  }
  // Arguments différenciants
  const strengths = analysisData?.proposalStrengths || [];
  if (strengths.length > 0) {
    parts.push(`ARGUMENTS DIFFÉRENCIANTS GSS :\n${strengths.map((s: string, idx: number) => `${idx + 1}. ${s}`).join('\n')}`);
  }

  return parts.join('\n\n');
}

// ─── Stratégie sur-mesure : déclinaison page par page ───

/**
 * « Beats » stratégiques de la synthèse sur-mesure (pages « Contexte sur mesure »), dans l'ordre de
 * lecture. Chaque page reçoit un angle DISTINCT pour raconter une histoire cohérente plutôt que des
 * paragraphes interchangeables. Sont distribués sur le nombre réel de zones via `assignBeats`.
 */
const STRATEGY_BEATS: string[] = [
  "Compréhension du client et de son contexte : type d'organisation, usagers/parties prenantes, sites, rythme d'exploitation, et enjeux de sûreté PROPRES à ce profil. Termine en nommant les RISQUES concrets à couvrir dans ce type de lieu (ce qui amène les mesures décrites ensuite).",
  "Les MESURES CONCRÈTES que GSS met en place dans ce type de lieu : décris précisément le dispositif terrain (postes et rondes, filtrage et contrôle d'accès, gestion des flux/usagers, vidéosurveillance et levée de doute, ouverture/fermeture, gestion des incidents et alarmes…) et, pour chaque mesure, l'enjeu client précis auquel elle répond.",
  "Les moyens au service de ces mesures : agents qualifiés (CQP APS, SSIAP… selon le site), encadrement de proximité et interlocuteur unique, matériel et technologies déployés sur les sites — en montrant en quoi chaque moyen sert concrètement CE client.",
  "Pilotage, démarche qualité, réactivité et gestion des imprévus, continuité de service — avec les engagements concrets pris envers ce client (sans conclusion générique).",
];

/** Assigne un beat à chacune des `n` zones (réutilise/condense la liste si n ≠ STRATEGY_BEATS.length). */
function assignBeats(n: number): string[] {
  if (n <= 0) return [];
  if (n === STRATEGY_BEATS.length) return [...STRATEGY_BEATS];
  // Mappage proportionnel : la zone i prend le beat le plus proche dans la liste de référence.
  return Array.from({ length: n }, (_, i) =>
    STRATEGY_BEATS[Math.min(STRATEGY_BEATS.length - 1, Math.floor((i * STRATEGY_BEATS.length) / n))]);
}

/** Détermine si un spread doit être personnalisé (on garde intactes les pages partenaires/références). */
function shouldPersonalizeSpread(title: string): boolean {
  const n = normTitle(title);
  const skipPatterns = ['confiance', 'partenaire', 'reference client', 'nos clients', 'sommaire', 'table des matieres'];
  return n.length > 0 && !skipPatterns.some(p => n.includes(p));
}

// ─── Field Type Inference ───

function inferFieldHint(context: string): string {
  const n = context.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  if (/case (a|à) cocher|checkbox/.test(n)) return '[CASE A COCHER]';

  const shortPatterns = [
    'denomination', 'raison sociale', 'nom du candidat', 'nom de l\'entreprise',
    'siret', 'siren', 'cnaps', 'n° ', 'numero', 'reference', 'lot ',
    'adresse', 'code postal', 'ville', 'departement', 'siege', 'agence',
    'telephone', 'tel.', 'fax', 'email', 'mail', 'site web',
    'dirigeant', 'contact', 'interlocuteur', 'responsable', 'signataire',
    'statut', 'pme', 'forme juridique', 'capital social',
    'effectif', 'etp', 'nb agent', "nombre d'agent", 'nombre agents',
    'date ', 'annee', 'duree', 'delai',
    'montant', "chiffre d'affaire", 'ca ', 'code naf', 'code ape',
    'agrement', 'autorisation', 'station', 'siege social',
    // Cellules de tableau numériques (délais d'intervention par site, nb d'intervenants)
    'minute', 'intervenant', 'nombre d\'intervenant', 'taux de reprise', 'numero de certification',
  ];
  if (shortPatterns.some(p => n.includes(p))) return '[VALEUR COURTE]';

  const listPatterns = [
    'certification', 'diplome', 'qualification', 'habilitation',
    'materiel', 'equipement', 'tenue', 'vestiaire',
    'partenaire', 'reference client', 'sous-traitant',
    'logiciel', 'outil', 'systeme', 'moyen technique',
  ];
  if (listPatterns.some(p => n.includes(p))) return '[LISTE]';

  const paraPatterns = [
    'methodologie', 'methode', 'organisation', 'procedure',
    'description', 'presentation', 'demarche', 'engagement',
    'politique', 'gestion', 'management', 'encadrement',
    'suivi', 'controle qualite', 'surveillance', 'securite',
    'recrutement', 'integration', 'planning', 'remplacement',
    'absence', 'retard', 'amelioration', 'bilan', 'rapport',
    'intervention', 'alarme', 'incident', 'intrusion',
    'ecologique', 'environnement', 'developpement durable',
    'valeur', 'ethique', 'rse', 'formation continue',
  ];
  if (paraPatterns.some(p => n.includes(p))) return '[PARAGRAPHE]';

  return '[VALEUR COURTE]';
}

// ─── Identité légale du CANDIDAT (GSS) ───
// AUCUNE valeur légale n'est codée en dur : le N° CNAPS et la date d'autorisation ne sont remplis
// QUE s'ils sont fournis (et donc VÉRIFIÉS) via variables d'environnement. Sinon → vide → le champ
// part en « [À COMPLÉTER] » plutôt que de poser un numéro non sourcé (exigence « 0 inventé »).
// Historique : un n° CNAPS placeholder (« AUT-076-2122-12-15-20230456789 ») figurait en dur dans
// frontend/lib/gss-config.ts (commit cda45a2) sans aucune source documentaire → retiré.
// La dénomination (raison commerciale, non sensible) reste par défaut, surchargeable par env.
export const GSS_IDENTITE = {
  denomination: process.env.GSS_DENOMINATION || 'GSS — Sécurité privée',
  numCnaps: process.env.GSS_CNAPS || '',
  dateAutorisation: process.env.GSS_DATE_AUTORISATION || '',
  siret: process.env.GSS_SIRET || '905 274 635 00010',
  siren: process.env.GSS_SIREN || '905 274 635',
  adresse: process.env.GSS_ADRESSE || '31 boulevard Gambetta, 76000 Rouen',
  adresseAgence: process.env.GSS_ADRESSE_AGENCE || '31 boulevard Gambetta, 76000 Rouen',
};

/**
 * Renvoie la valeur d'identité connue de GSS (le candidat) si le LIBELLÉ du champ désigne la
 * dénomination, le N° CNAPS d'autorisation d'exercer ou la date d'autorisation — sinon ''.
 * On s'abstient explicitement si le libellé vise l'ACHETEUR (et non le candidat) pour ne jamais
 * écrire l'identité GSS dans une case « dénomination du pouvoir adjudicateur ». Fonction pure
 * (testable) : la liste d'identité est injectable.
 */
export function identiteCandidatForLabel(label: string, identite = GSS_IDENTITE): string {
  const n = (label || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!n.trim()) return '';
  // Le champ vise l'acheteur / le client / le maître d'ouvrage → PAS l'identité du candidat GSS.
  if (/acheteur|adjudicateur|donneur d.ordre|ma[ii]tre d.ouvrage|pouvoir adjudic|\bclient\b/.test(n)) return '';
  // Le champ vise le DIRIGEANT (nom + N° agrément dirigeant CNAPS) : c'est l'identité d'une PERSONNE,
  // DISTINCTE de l'autorisation d'exercer de l'établissement. Inconnue ici → on laisse [À COMPLÉTER]
  // (NE JAMAIS y recopier le n° d'autorisation de l'entreprise). Testé avant date/CNAPS.
  if (/dirigeant|g[ée]rant|repr[ée]sentant l[ée]gal|signataire/.test(n)) return '';
  // Date d'autorisation / d'agrément (on évite les dates de validité / d'expiration, inconnues).
  // Testé AVANT le CNAPS : « Date d'autorisation d'exercer » contient « autorisation d'exercer ».
  if (/\bdate\b/.test(n) && /(autorisation|agrement)/.test(n) && !/(validit|expir|\bfin\b|echeance)/.test(n))
    return identite.dateAutorisation;
  // N° SIRET / SIREN
  if (/\bsiret\b/.test(n)) return identite.siret;
  if (/\bsiren\b/.test(n)) return identite.siren;
  // Adresse du siège / de l'entreprise / de l'agence (pour GSS)
  if (/\badresse\b/.test(n) && (/\bsiege\b|\bentreprise\b|\bsociete\b|\bagence\b|\bgss\b/.test(n)))
    return identite.adresse;
  // N° CNAPS d'autorisation d'exercer de l'ÉTABLISSEMENT. On EXIGE le contexte « autorisation /
  // exercer » (pas le simple mot « cnaps », qui apparaît aussi pour l'agrément dirigeant, déjà écarté).
  if (/autorisation d.exercer|num[ée]ro d.autorisation|(?=.*cnaps)(?=.*autoris)/.test(n)) return identite.numCnaps;
  // Dénomination / raison sociale / nom du candidat / soumissionnaire / titulaire.
  if (/denomination|raison sociale|nom (du |de la |d.)? ?(candidat|soumissionnaire|entreprise|societe|titulaire)/.test(n))
    return identite.denomination;
  return '';
}

/**
 * Rend un tableau (lignes×colonnes) sous forme ÉTIQUETÉE : pour chaque ligne de données, on associe
 * chaque cellule à l'en-tête de SA colonne (1re ligne) → « <libellé ligne> — <en-tête>: <valeur> ; … ».
 * Permet à l'IA de retrouver la valeur d'une cellule par (ligne, colonne) même quand l'extraction
 * en texte plat a désaligné le tableau. Renvoie '' s'il n'y a pas au moins un en-tête + une ligne.
 */
function renderTablePaired(rows: string[][]): string {
  const data = rows.filter((r) => r.some((c) => (c || '').trim()));
  if (data.length < 2) return '';
  // La première case (ligne et colonne) doit être vide pour un tableau à double entrée valide
  if ((data[0][0] || '').trim() !== '') return '';
  const headers = data[0].map((h) => (h || '').trim());
  const out: string[] = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const label = (r[0] || '').trim();
    const pairs: string[] = [];
    for (let c = 1; c < r.length; c++) {
      const v = (r[c] || '').trim();
      if (!v) continue;
      const h = (headers[c] || '').trim();
      pairs.push(h ? `${h}: ${v}` : v);
    }
    if (pairs.length) out.push(label ? `${label} — ${pairs.join(' ; ')}` : pairs.join(' ; '));
  }
  return out.join('\n');
}

/** Mots significatifs d'un en-tête de colonne (pour matcher « Campus Pasteur (UFR DESP) » ↔ « Pasteur »). */
function headerTokens(header: string): string[] {
  const STOP = new Set(['campus', 'site', 'sites', 'ufr', 'principal', 'rouen', 'detail', 'fonction', 'des', 'lot', 'le', 'la', 'du', 'de']);
  return Array.from(new Set(
    header.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').split(' ')
      .filter((w) => w.length >= 4 && !STOP.has(w))));
}

/**
 * Rend un tableau PAR COLONNE : pour chaque colonne de données (un site), un bloc listant ses lignes
 * « <libellé ligne>: <valeur> ». Permet d'injecter, pour une cellule, UNIQUEMENT la colonne du site
 * concerné → le modèle ne peut pas mélanger les sites. Renvoie [{header, tokens, block}].
 */
interface SiteColumn { header: string; tokens: string[]; block: string; rows: Array<{ label: string; value: string }>; }
function renderTableByColumn(rows: string[][]): SiteColumn[] {
  const data = rows.filter((r) => r.some((c) => (c || '').trim()));
  if (data.length < 2) return [];
  // La première case (ligne et colonne) doit être vide pour un tableau à double entrée valide
  if ((data[0][0] || '').trim() !== '') return [];
  const headers = data[0].map((h) => (h || '').replace(/\s+/g, ' ').trim());
  const cols: SiteColumn[] = [];
  const nbCols = Math.max(...data.map((r) => r.length));
  for (let c = 1; c < nbCols; c++) {
    const header = headers[c] || '';
    const tokens = headerTokens(header);
    if (!tokens.length) continue;                       // colonne sans en-tête exploitable (ex. colonne vide)
    const rowsCol: Array<{ label: string; value: string }> = [];
    for (let i = 1; i < data.length; i++) {
      const label = (data[i][0] || '').replace(/\s+/g, ' ').trim();
      const value = (data[i][c] || '').replace(/\s+/g, ' ').trim();
      if (label && value) rowsCol.push({ label, value });
    }
    if (rowsCol.length) cols.push({ header, tokens, block: rowsCol.map((r) => `${r.label}: ${deglue(r.value)}`).join('\n'), rows: rowsCol });
  }
  return cols;
}

/** Dé-colle légèrement un texte source extrait (« 1agentle matin » → « 1 agent le matin ») sans rien réécrire. */
function deglue(s: string): string {
  return s
    .replace(/(\d)([a-zA-Zà-ÿ])/g, '$1 $2')        // « 1agent » → « 1 agent »
    .replace(/([a-zà-ÿ])([A-ZÀ-Ÿ])/g, '$1 $2')      // « journéeLundi » → « journée Lundi »
    .replace(/\s{2,}/g, ' ').trim();
}

/**
 * Remplissage DÉTERMINISTE d'une cellule de tableau à partir de la colonne SOURCE du site : on
 * sélectionne, dans les lignes de la colonne, celle(s) qui correspond(ent) au libellé de la ligne du
 * cadre, et on renvoie leur valeur VERBATIM (légèrement dé-collée). 0 IA, 0 invention. '' si rien.
 */
function siteCellVerbatim(rowLabel: string, col: SiteColumn): string {
  const n = (rowLabel || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const find = (kw: RegExp) => col.rows.filter((r) => kw.test(r.label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')));
  let picked: Array<{ label: string; value: string }> = [];
  if (/moyen|humain|effectif|nombre|agent|chef|poste|profil/.test(n)) {
    // « moyens humains / nombre d'agents » → chef d'équipe (si présent) + nombre d'agents, VERBATIM.
    picked = [...find(/chef|maitrise|encadr/), ...find(/nombre|agent/)];
  } else if (/horaire|amplitude|plage/.test(n)) {
    picked = find(/horaire/);
  } else if (/d[ée]lai|minute|intervention/.test(n)) {
    picked = find(/d[ée]lai|minute|intervention/);
  } else if (/volume|heure/.test(n)) {
    picked = find(/volume|heure/);
  } else if (/fermeture|periode/.test(n)) {
    picked = find(/fermeture|periode/);
  }
  // dédoublonnage par valeur, concat verbatim
  const seen = new Set<string>();
  const parts = picked.map((r) => deglue(r.value)).filter((v) => { const k = v.toLowerCase(); if (!v || seen.has(k)) return false; seen.add(k); return true; });
  return parts.join(' + ');
}

// ─── Main Class ───

export class MemoireGenerator {
  private openai: OpenAI;
  private responseDir: string;
  private templateDir: string;
  // Tableaux du DCE rendus ÉTIQUETÉS (ligne — en-tête: valeur), capturés pendant getDceContext et
  // réinjectés tels quels dans les cellules de tableau (remplissage fiable, indépendant du RAG).
  private lastDceTables = '';
  // Tableaux du DCE vus PAR COLONNE (par site) : pour une cellule, on n'injecte QUE la colonne du
  // site concerné → le modèle ne peut PAS piocher les données d'un autre site (anti-mélange colonnes).
  private lastDceSiteCols: SiteColumn[] = [];
  // Modèle de rédaction effectif : gpt-5.4-mini par défaut (cas SANS template), basculé sur
  // gpt-5.4-nano dans generate() quand un cadre client imposé est détecté (cas AVEC template).
  private memoireModel: string = MEMOIRE_MODEL;

  constructor(apiKey?: string) {
    const settings = getSettings();
    // BYO-key : la clé peut venir de la requête (front, localStorage) ou de l'env OPENAI_API_KEY.
    // Le SDK OpenAI lève une erreur cryptique (« Missing credentials ») si la clé est vide → on
    // émet ici un message clair et actionnable plutôt que de laisser remonter celui du SDK.
    const key = (apiKey || settings.openaiApiKey || '').trim();
    if (!key) {
      throw new Error(
        "Clé OpenAI manquante : renseigne OPENAI_API_KEY dans gss-ao/.env, ou transmets « api_key » " +
        "dans la requête. La génération du mémoire nécessite l'accès à l'API OpenAI.",
      );
    }
    this.openai = new OpenAI({ apiKey: key });
    const baseDir = path.resolve(__dirname, '../../');
    this.responseDir = path.resolve(baseDir, 'response');
    this.templateDir = path.resolve(baseDir, 'Template');
    if (!fs.existsSync(this.responseDir)) fs.mkdirSync(this.responseDir, { recursive: true });
  }

  private findDceTemplate(dceDir: string): string | null {
    if (!fs.existsSync(dceDir)) return null;
    const files = fs.readdirSync(dceDir);
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    // Les noms uploadés sont parfois en MOJIBAKE (nom UTF-8 lu en latin1 par multer :
    // « 5-Mémoire Technique… » écrit « 5-MÃ©moire Technique… » sur le disque). On teste donc
    // le nom brut ET sa réparation latin1→utf8, sinon « memoire » n'est jamais reconnu → repli
    // sur le mémoire GSS maître (génération « hors cadre ») au lieu de remplir le cadre imposé.
    const repaired = (s: string) => { try { return Buffer.from(s, 'latin1').toString('utf8'); } catch { return s; } };
    // Un cadre de réponse imposé s'appelle « …mémoire… », mais AUSSI « Cadre de réponse »,
    // « Cadre de mémoire technique », « Trame mémoire technique »… On reconnaît donc memoire | cadre | trame
    // (nom brut ET réparé latin1→utf8, à cause du mojibake multer).
    const TEMPLATE_NAME_RE = /memoire|cadre|trame/;
    const isMemoire = (f: string) =>
      /\.docx?$/i.test(f) && (TEMPLATE_NAME_RE.test(norm(f)) || TEMPLATE_NAME_RE.test(norm(repaired(f))));
    const memoireFile = files.find(isMemoire);
    return memoireFile ? path.join(dceDir, memoireFile) : null;
  }

  /**
   * Lit dans l'ordre les LIBELLÉS des marqueurs « Contexte … » d'OUVERTURE d'AO RNE.docx (texte propre,
   * contrairement au PDF où les items sont éclatés « ap proc he »). Le libellé = l'ANGLE/le sujet voulu
   * de la zone (« Une réponse pour vos sites », « approche cousue-main », « DES MOYENS CALIBRÉS »…),
   * « Contexte / début / sur mesure / fin » retirés. Renvoie [] si illisible.
   */
  private getContextZoneLabels(): string[] {
    try {
      const docxPath = path.join(this.templateDir, 'Mémoire technique', 'AO RNE.docx');
      if (!fs.existsSync(docxPath)) return [];
      const xml = new PizZip(fs.readFileSync(docxPath)).file('word/document.xml')!.asText();
      const paras = xml.split(/<w:p[ >]/).slice(1).map((p) => {
        const t = (p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || []).map((m) => m.replace(/<[^>]+>/g, '')).join('');
        return t.replace(/&amp;/g, '&').trim();
      });
      return paras
        .filter((t) => CONTEXT_MARKER_RE.test(t) && !CONTEXT_CLOSE_RE.test(t))   // marqueurs d'OUVERTURE
        .map((t) => t.replace(/[«»“”"'‹›]/g, ' ').replace(/\bContexte\b/i, ' ')
          .replace(/\b(d[ée]but|sur\s+mesure|fin)\b/ig, ' ').replace(/\s+/g, ' ').trim());
    } catch { return []; }
  }

  /**
   * Charge les fichiers du DCE (DOC/DOCX/PDF), priorisés par pertinence pour un mémoire technique,
   * puis tronqués pour tenir dans la fenêtre de contexte du modèle (gpt-4o ≈ 128k tokens).
   * Sans ce plafond, le seul CCTP+annexes (~733k caractères) dépasse la limite → l'appel échoue
   * et le document ressort vierge.
   */
  /**
   * Matérialise les pièces DCE du dossier depuis Supabase Storage dans un dossier temporaire.
   * L'extraction (LibreOffice pour .doc, tableaux .docx) exige des fichiers réels sur disque :
   * on télécharge donc les octets le temps du traitement, puis l'appelant supprime le dossier.
   * Renvoie le chemin temporaire, ou null si aucune pièce en base → l'appelant retombe alors sur
   * l'ancien emplacement disque (data/output/dce_<id>), pour les dossiers créés avant la migration.
   */
  private async materializeDceFromStorage(dossierId: string): Promise<string> {
    let fichiers;
    try {
      fichiers = await FichiersDB.listByDossier(dossierId);
    } catch (e: any) {
      throw new Error(`[MemoireGenerator] Impossible de lire la table fichiers : ${e?.message || e}`);
    }
    const dce = fichiers.filter((f) => f.storage_path && /\/dce\//.test(f.storage_path));
    if (!dce.length) {
      throw new Error(`[MemoireGenerator] Aucun fichier DCE trouvé en base pour le dossier ${dossierId}.`);
    }

    const supabase = getScopedClient();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `dce_${dossierId}_`));
    let got = 0;
    for (const f of dce) {
      try {
        const { data, error } = await supabase.storage.from(USER_FILES_BUCKET).download(f.storage_path!);
        if (error || !data) { console.warn(`[MemoireGenerator] DCE Storage: ${f.nom} illisible (${error?.message || 'vide'})`); continue; }
        // `nom` peut porter un CHEMIN RELATIF (sous-dossiers) → on recrée l'arborescence dans le tmp.
        // Garde anti-traversée : on résout et on vérifie que la cible reste DANS tmpDir.
        const dest = path.resolve(tmpDir, f.nom);
        if (dest !== tmpDir && !dest.startsWith(tmpDir + path.sep)) {
          console.warn(`[MemoireGenerator] DCE Storage: chemin hors périmètre ignoré (${f.nom})`);
          continue;
        }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, Buffer.from(await data.arrayBuffer()));
        got++;
      } catch (e: any) {
        console.warn(`[MemoireGenerator] DCE Storage: échec téléchargement ${f.nom} — ${e?.message || e}`);
      }
    }
    }
    if (!got) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
      throw new Error(`[MemoireGenerator] Échec du téléchargement de tous les fichiers DCE depuis le Storage pour le dossier ${dossierId}.`);
    }
    console.log(`[MemoireGenerator] ${got} pièce(s) DCE téléchargée(s) depuis Storage (dossier temporaire, nettoyé après).`);
    return tmpDir;
  }

  private async getDceContext(dossierId: string): Promise<string> {
    const baseDir = path.resolve(__dirname, '../../');
    this.lastDceTables = '';   // réinitialisé à chaque analyse de DCE
    this.lastDceSiteCols = [];

    // Source des pièces DCE : Supabase Storage (via table fichiers) matérialisé en /tmp transitoire.
    // Plus de repli sur l'ancien emplacement disque.
    const materializedDir = await this.materializeDceFromStorage(dossierId);

    // Budget global et plafond par fichier (en caractères ; ~4 car/token)
    const TOTAL_BUDGET = 240_000;
    const PER_FILE_CAP = 130_000;

    // Score de priorité d'après le nom de fichier (le mémoire porte d'abord sur le CCTP et les effectifs)
    const priorityOf = (n: string): number => {
      if (n.includes('cctp')) return 100;
      if (n.includes('rc ') || n.includes('reglement') || /\brc\b/.test(n)) return 90;
      if (n.includes('annexe 1') || n.includes('effectif') || n.includes('horaire')) return 85;
      if (n.includes('annexe 2') || n.includes('profil')) return 80;
      if (n.includes('ccap') || n.includes('cahier des clauses administ')) return 55;
      if (n.includes('acte') && n.includes('engagement')) return 45;
      if (n.includes('annexe')) return 35;
      return 25;
    };

    type DcePiece = { label: string; text: string; priority: number };
    const pieces: DcePiece[] = [];

    // 1. Sorties JSON pré-analysées (synthèses concises, très utiles) — priorité maximale
    const rcPath = path.resolve(baseDir, `../data/output/rc_${dossierId}.json`);
    const cctpPath = path.resolve(baseDir, `../data/output/cctp_${dossierId}.json`);
    if (fs.existsSync(cctpPath)) pieces.push({ label: 'CCTP (analysé)', text: fs.readFileSync(cctpPath, 'utf8'), priority: 120 });
    if (fs.existsSync(rcPath)) pieces.push({ label: 'RC (analysé)', text: fs.readFileSync(rcPath, 'utf8'), priority: 115 });

    // 2. Fichiers bruts (récursif), dédoublonnés.
    // On ne scanne QUE le dossier réellement uploadé pour CE dossier : scanner en plus des corpus
    // de référence (Rouen…) ralentissait fortement le démarrage (chaque .doc = conversion LibreOffice)
    // ET polluait le contexte avec les données d'un autre client → faux pour « n'importe quel client ».
    // On ne scanne QUE le dossier téléchargé depuis la base.
    const dceDirs = [materializedDir];
    // Nettoyage du dossier temporaire (rien ne reste sur le disque de l'app après la génération).
    const cleanupTmp = () => {
      if (materializedDir) { try { fs.rmSync(materializedDir, { recursive: true, force: true }); } catch { /* ignore */ } }
    };

    const loadedFiles = new Set<string>();
    const scanDir = async (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) { await scanDir(fullPath); continue; }

        const normalized = entry.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        const ext = path.extname(entry.name).toLowerCase();
        if (!['.doc', '.docx', '.pdf'].includes(ext)) continue;
        if (normalized.includes('bpu') || normalized.includes('dpgf')) continue;
        if (normalized.includes('memoire') && (normalized.includes('technique') || normalized.includes('gss'))) continue;
        if (loadedFiles.has(normalized)) continue;
        loadedFiles.add(normalized);

        let text = '';
        try {
          text = await extractText(fullPath);
        } catch (e: any) {
          console.warn(`[MemoireGenerator] Impossible de lire: ${entry.name} — ${e.message}`);
          continue;
        }
        // Pour un .docx, le texte plat APLATIT les tableaux (en-têtes et valeurs sur des lignes
        // séparées → colonnes désalignées) : impossible de mapper « Campus Pasteur » à sa valeur.
        // On ajoute donc un rendu des tableaux ÉTIQUETÉ par en-tête de colonne :
        //   « <libellé de ligne> — <en-tête colonne>: <valeur> ; <en-tête colonne>: <valeur> … »
        // → chaque cellule devient retrouvable par (ligne, colonne), ce qui fiabilise le remplissage
        // des tableaux du cadre (effectifs/horaires par site, etc.) sans inventer.
        if (ext === '.docx') {
          try {
            const structTables = loadDocxStructure(fullPath).tables;
            // Vue PAR COLONNE (par site) → pour n'injecter que la colonne du site d'une cellule donnée.
            for (const t of structTables) {
              for (const col of renderTableByColumn(t.rows)) {
                if (this.lastDceSiteCols.length < 60) this.lastDceSiteCols.push(col);
              }
            }
            const tbls = structTables.map((t) => renderTablePaired(t.rows)).filter(Boolean);
            if (tbls.length) {
              const block = tbls.join('\n\n');
              text += '\n\n=== TABLEAUX (cellules étiquetées par en-tête de colonne) ===\n' + block;
              // Capture séparée (budgétée) pour réinjection directe dans les cellules de tableau.
              if (this.lastDceTables.length < 12_000) {
                this.lastDceTables += `\n--- ${entry.name.replace(/\.(docx?)$/i, '')} ---\n${block}\n`;
              }
            }
          } catch { /* table non exploitable → on garde le texte plat */ }
        }

        if (text.length > 100) {
          pieces.push({ label: entry.name.replace(/\.(doc|docx|pdf)$/i, ''), text, priority: priorityOf(normalized) });
          console.log(`[MemoireGenerator] DCE chargé: ${entry.name} (${text.length} chars, prio ${priorityOf(normalized)})`);
        }
      }
    };
    for (const dceDir of dceDirs) await scanDir(dceDir);

    if (pieces.length === 0) {
      cleanupTmp();
      throw new Error('[MemoireGenerator] Aucun contenu DCE trouvé. Vérifiez que les fichiers du DCE sont bien présents.');
    }

    // 3. Assemblage par priorité décroissante, dans le budget total
    pieces.sort((a, b) => b.priority - a.priority);
    let context = '';
    let used = 0;
    for (const p of pieces) {
      if (used >= TOTAL_BUDGET) {
        console.log(`[MemoireGenerator] DCE budget atteint — fichier ignoré: ${p.label}`);
        continue;
      }
      const remaining = TOTAL_BUDGET - used;
      let body = p.text;
      const cap = Math.min(PER_FILE_CAP, remaining);
      if (body.length > cap) body = body.slice(0, cap) + `\n[… document tronqué (${p.text.length - cap} caractères omis) …]`;
      const block = `\n\n--- ${p.label} ---\n${body}`;
      context += block;
      used += block.length;
    }

    console.log(`[MemoireGenerator] Contexte DCE assemblé: ${context.length} chars (budget ${TOTAL_BUDGET}), ${pieces.length} fichiers candidats`);
    cleanupTmp();
    return context;
  }

  private sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

  /**
   * Appel gpt-4o avec retry/backoff sur 429 (la limite TPM du compte oblige à espacer les requêtes).
   * Renvoie le contenu texte, ou null si échec définitif.
   */
  private async callOpenAI(messages: any[], temperature: number, label: string, jsonMode: boolean): Promise<string | null> {
    // Garde-fou : le mode JSON d'OpenAI EXIGE que le mot « json » figure dans les messages, sinon
    // l'appel renvoie 400. On l'ajoute si absent (évite les échecs silencieux → 0 résultat).
    if (jsonMode && !messages.some((m) => typeof m?.content === 'string' && /json/i.test(m.content))) {
      messages = [...messages, { role: 'system', content: 'Réponds uniquement par un objet JSON valide.' }];
    }
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const completion = await this.openai.chat.completions.create({
          model: this.memoireModel,
          ...(jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
          messages,
          ...(/luna|o1/i.test(this.memoireModel) ? {} : { temperature }),
        });
        return completion.choices[0].message.content || '';
      } catch (e: any) {
        const status = e?.status || e?.code || '';
        const msg = (e?.message || String(e)).toString();
        if (status === 429 && attempt < maxAttempts) {
          const wait = 15000 * attempt; // 15s, 30s, 45s, 60s
          console.warn(`[MemoireGenerator] ${label}: 429 (TPM) — attente ${wait / 1000}s puis réessai (${attempt}/${maxAttempts - 1})`);
          await this.sleep(wait);
          continue;
        }
        console.error(`[MemoireGenerator] ${label}: appel API échoué (status=${status}): ${msg.slice(0, 240)}`);
        return null;
      }
    }
    return null;
  }

  // ─── Recherche sémantique (embeddings) : index Doc GSS + DCE, récupération par champ ───

  /**
   * Découpe la Documentation GSS (par catégorie) et le DCE (par pièce) en chunks indexables.
   * Le DCE est assemblé en blocs « \n\n--- label ---\n<corps> » (cf. getDceContext) : on le
   * redécoupe sur ces frontières pour étiqueter chaque chunk (CCTP, RC, annexe…).
   */
  private buildRetrievalChunks(gssDocs: Record<string, string>, dceContext: string): RetrievalChunk[] {
    const chunks: RetrievalChunk[] = [];
    const CHUNK = 1200, STEP = 1050;   // ~300 tokens/chunk, léger chevauchement
    const pushChunks = (source: 'GSS' | 'DCE', label: string, text: string) => {
      const clean = (text || '').replace(/\r\n/g, '\n');
      for (let i = 0; i < clean.length; i += STEP) {
        const slice = clean.slice(i, i + CHUNK);
        if (slice.trim().length < 80) continue;
        chunks.push({ source, label, text: slice });
      }
    };
    for (const [cat, text] of Object.entries(gssDocs)) pushChunks('GSS', cat, text);
    const re = /\n\n--- (.+?) ---\n/g;
    let m: RegExpExecArray | null, lastIdx = 0, lastLabel = 'DCE';
    while ((m = re.exec(dceContext)) !== null) {
      if (m.index > lastIdx) pushChunks('DCE', lastLabel, dceContext.slice(lastIdx, m.index));
      lastLabel = m[1]; lastIdx = re.lastIndex;
    }
    pushChunks('DCE', lastLabel, dceContext.slice(lastIdx));
    return chunks;
  }

  /** Embeddings OpenAI par lots (retry/backoff sur 429). Renvoie un vecteur par texte d'entrée. */
  private async embedTexts(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    const BATCH = 96;
    for (let i = 0; i < texts.length; i += BATCH) {
      const batch = texts.slice(i, i + BATCH).map(t => (t && t.trim() ? t.slice(0, 8000) : ' '));
      for (let attempt = 1; ; attempt++) {
        try {
          const resp = await this.openai.embeddings.create({ model: EMBED_MODEL, input: batch });
          for (const d of resp.data) out.push(d.embedding as number[]);
          break;
        } catch (e: any) {
          const status = e?.status || e?.code || '';
          if (status === 429 && attempt < 5) {
            const wait = 10000 * attempt;
            console.warn(`[MemoireGenerator] Embeddings: 429 (TPM) — attente ${wait / 1000}s puis réessai (${attempt}/4)`);
            await this.sleep(wait);
            continue;
          }
          throw e;
        }
      }
    }
    return out;
  }

  /** Calcule et stocke l'embedding de chaque chunk de l'index. */
  private async embedChunks(chunks: RetrievalChunk[]): Promise<void> {
    const embs = await this.embedTexts(chunks.map(c => c.text));
    chunks.forEach((c, i) => { c.embedding = embs[i]; });
  }

  /**
   * Charge les chunks Doc GSS DÉJÀ EMBEDDÉS depuis la table public.rag_chunk (Supabase),
   * au lieu de relire les 118 PDF et de rappeler OpenAI à chaque génération.
   *
   * → PERFORMANCE : les ~146 embeddings GSS ne sont plus recalculés (ni le risque de 429).
   * → PERTINENCE : identique — mêmes textes, mêmes vecteurs (text-embedding-3-small, 1536 dim) ;
   *   la recherche hybride retrieve() reste inchangée en aval.
   *
   * Activation : MEMOIRE_RAG_FROM_DB=true. Source : RAG_DATABASE_URL (sinon DATABASE_URL).
   * Robustesse : toute erreur (flag off, table vide, base injoignable) renvoie null → l'appelant
   * retombe sur le comportement historique (embeddings à la volée). Jamais bloquant.
   */
  private async loadGssChunksFromDb(): Promise<RetrievalChunk[] | null> {
    const client = this.ragDbClient();
    if (!client) return null;
    try {
      await client.connect();
      const res = await client.query(
        `select source, categorie, text, embedding::text as embedding
           from public.rag_chunk
          where source in ('GSS', 'WEB', 'SOLLICITATION') and actif and embedding is not null`
      );
      const chunks: RetrievalChunk[] = [];
      for (const r of res.rows) {
        // pgvector renvoyé en texte '[0.1,0.2,…]' → tableau de nombres (JSON valide).
        let emb: number[] | undefined;
        try { emb = JSON.parse(r.embedding); } catch { emb = undefined; }
        if (!emb || !emb.length) continue;
        const isRagSrc = r.source === 'WEB' || r.source === 'SOLLICITATION';
        const label = isRagSrc ? 'RECHERCHES ET SOLLICITATIONS (RAG)' : (r.categorie || 'GSS');
        chunks.push({ source: r.source || 'GSS', label, text: r.text, embedding: emb });
      }
      return chunks.length ? chunks : null;
    } catch (e: any) {
      console.warn(`[MemoireGenerator] RAG depuis bdd indisponible (${e?.message || e}) — repli sur embeddings à la volée.`);
      return null;
    } finally {
      try { await client.end(); } catch { /* ignore */ }
    }
  }

  /**
   * Client Postgres vers la base RAG, ou null si le mode bdd est désactivé / non configuré.
   * Source : MEMOIRE_RAG_FROM_DB=true + RAG_DATABASE_URL (sinon DATABASE_URL). SSL auto pour Supabase.
   */
  private ragDbClient(): PgClient | null {
    if (process.env.MEMOIRE_RAG_FROM_DB !== 'true') return null;
    const raw = process.env.RAG_DATABASE_URL || getSettings().databaseUrl || '';
    const url = raw.replace(/^postgresql\+psycopg:\/\//, 'postgresql://');
    if (!url) return null;
    const needsSsl = /supabase\.(co|com)/.test(url) || process.env.RAG_DB_SSL === 'true';
    return new PgClient({ connectionString: url, ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}) });
  }

  /**
   * Reconstitue la Documentation GSS (texte complet par catégorie) DEPUIS la bdd rag_chunk, au lieu
   * de relire les PDF du dossier Template. Concatène les chunks par catégorie, dans l'ordre du fichier.
   * Renvoie null si mode bdd off / base vide / injoignable → l'appelant relit alors les fichiers.
   */
  private async getGssDocsTextFromDb(): Promise<Record<string, string> | null> {
    const client = this.ragDbClient();
    if (!client) return null;
    const PER_CAT_CAP = 15_000;   // même plafond que la lecture fichier
    try {
      await client.connect();
      const res = await client.query(
        `select categorie, source_file, text
           from public.rag_chunk
          where source in ('GSS', 'WEB', 'SOLLICITATION') and actif
          order by categorie, source_file, chunk_index`
      );
      const cats: Record<string, string> = {};
      let lastKey = '';
      for (const r of res.rows) {
        // Regrouper WEB et SOLLICITATION dans une catégorie prioritaire bien identifiée
        const isRagSrc = r.source === 'WEB' || r.source === 'SOLLICITATION';
        const cat = isRagSrc ? 'RECHERCHES ET SOLLICITATIONS (RAG)' : (r.categorie || 'GSS');
        const key = `${cat}|${r.source_file}`;
        if (!cats[cat]) cats[cat] = '';
        if (key !== lastKey) { cats[cat] += `\n--- ${r.source_file} ---\n`; lastKey = key; }
        cats[cat] += r.text + '\n';
      }
      // On enrichit avec TOUTES les recherches web (même en attente) et questions internes en base,
      // pour que l'analyse IA comparant au template ou CCTP voie bien toutes les infos disponibles en BDD.
      try {
        const webRes = await client.query(
          `select query, answer, valeur_retenue, statut
             from public.recherche_web
            where statut in ('validee', 'injectee', 'en_attente_validation') and (answer is not null or valeur_retenue is not null)`
        );
        if (webRes.rows.length > 0) {
          cats['RECHERCHES WEB BDD'] = webRes.rows.map(r => `--- Recherche Web : ${r.query} ---\nQuestion : ${r.query}\nRéponse BDD (${r.statut}) : ${r.valeur_retenue || r.answer}`).join('\n\n');
        }
        const qRes = await client.query(
          `select question, reponse
             from public.question_interne
            where reponse is not null and reponse != ''`
        );
        if (qRes.rows.length > 0) {
          cats['QUESTIONS INTERNES BDD'] = qRes.rows.map(r => `--- Question Équipe : ${r.question} ---\nQuestion : ${r.question}\nRéponse Équipe : ${r.reponse}`).join('\n\n');
        }
      } catch (eWeb: any) {
        console.warn(`[MemoireGenerator] Lecture recherche_web/question_interne depuis BDD ignorée : ${eWeb?.message || eWeb}`);
      }
      for (const k of Object.keys(cats)) {
        if (cats[k].length > PER_CAT_CAP) cats[k] = cats[k].slice(0, PER_CAT_CAP) + '\n[… tronqué …]';
      }
      return Object.keys(cats).length ? cats : null;
    } catch (e: any) {
      console.warn(`[MemoireGenerator] Doc GSS depuis bdd indisponible (${e?.message || e}) — repli sur les fichiers.`);
      return null;
    } finally {
      try { await client.end(); } catch { /* ignore */ }
    }
  }

  /** Texte de « EFFECTIFS MOYENS.pdf » depuis la bdd (pour le calcul d'effectif), ou null. */
  private async getEffectifTextFromDb(): Promise<string | null> {
    const client = this.ragDbClient();
    if (!client) return null;
    try {
      await client.connect();
      const res = await client.query(
        `select text from public.rag_chunk
          where source = 'GSS' and actif and source_file ilike 'EFFECTIFS MOYENS%'
          order by chunk_index`
      );
      if (!res.rows.length) return null;
      return res.rows.map((r) => r.text).join('\n');
    } catch {
      return null;
    } finally {
      try { await client.end(); } catch { /* ignore */ }
    }
  }

  /**
   * Top-K chunks pour une requête, en récupération HYBRIDE : similarité cosinus (sémantique) +
   * bonus LEXICAL sur les termes exacts de la question. L'embedding seul rate parfois la donnée
   * factuelle précise (un effectif, un nom de certification, une catégorie) qui vit dans un PDF
   * donné → le bonus lexical fait remonter les chunks contenant littéralement les mots de la
   * question, ce qui améliore le RAPPEL (remplir quand l'info existe) sans rien inventer (on ne
   * fait que mieux SURFACER les sources réelles ; la vérification anti-invention reste en aval).
   */
  private retrieve(queryEmb: number[], chunks: RetrievalChunk[], k: number, queryText = ''): RetrievalChunk[] {
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const STOP = new Set(['pour', 'dans', 'avec', 'cette', 'votre', 'notre', 'leur', 'des', 'les', 'une', 'aux', 'sur', 'par', 'que', 'qui', 'sont', 'est', 'marche', 'entreprise', 'candidat', 'section', 'question']);
    const terms = Array.from(new Set(norm(queryText).split(/[^a-z0-9]+/).filter(t => t.length >= 4 && !STOP.has(t))));
    const lexical = (text: string): number => {
      if (!terms.length) return 0;
      const t = norm(text);
      let hit = 0;
      for (const w of terms) if (t.includes(w)) hit++;
      return hit / terms.length;   // fraction des termes de la question présents littéralement
    };
    return chunks
      .filter(c => c.embedding && c.embedding.length > 0)
      .map(c => ({ c, score: cosine(queryEmb, c.embedding!) + 0.15 * lexical(c.text) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(x => x.c);
  }

  /**
   * Requête de recherche d'un champ. La QUESTION propre du champ est le signal PRINCIPAL : on
   * l'accentue (doublée) et on ÉCARTE le « Contexte proche » (= libellés des champs VOISINS), qui
   * faisait dériver la recherche/réponse vers un sujet adjacent (ex. moyens d'accès au lieu du
   * report des alarmes). À défaut de question (cellule de tableau), on prend l'intitulé Tableau.
   */
  private buildFieldQuery(f: { context: string }): string {
    const grab = (re: RegExp) => (f.context.match(re) || [])[1] || '';
    const question = grab(/Question:\s*"([^"]*)"/);
    const section = grab(/Section:\s*"([^"]*)"/);
    // Cellule de tableau : on combine la LIGNE (ce qui est demandé : délai, nb d'agents, horaire…)
    // ET la COLONNE (à quel site / département / lot), pour chercher l'info propre à CETTE intersection.
    const colonne = grab(/Colonne:\s*"([^"]*)"/);
    const ligne = grab(/Ligne:\s*"([^"]*)"/);
    const tableCore = (ligne || colonne) ? `${ligne} ${colonne}`.trim() : '';
    // Case à cocher : on cherche sur l'OPTION propre à la case + l'intitulé commun.
    const cbOption = grab(/option:\s*"([^"]*)"/);
    const cbIntitule = grab(/Intitul[ée]:\s*"([^"]*)"/);
    const cbCore = [cbOption, cbIntitule].filter(Boolean).join(' ').trim();
    // Zone « …… » sans question propre (« : ») : on prend le LIBELLÉ qui la PRÉCÈDE (dernier segment
    // du « Contexte proche »), pour comprendre/rechercher sur ce qui est réellement demandé juste avant.
    const near = grab(/Contexte(?: proche)?:\s*"([^"]*)"/);
    const nearLast = near.split('/').map(s => s.trim()).filter(Boolean).pop() || '';
    const qReal = question.replace(/[\s.:;,…\-—–/|()]+/g, '').length ? question : '';
    const core = (qReal || tableCore || cbCore || nearLast).replace(/\[CHAMP_\d+\]/g, '').trim();
    const base = core
      ? `${core} ${core} ${section}`
      : f.context.replace(/\[CHAMP_\d+\]/g, '').replace(/Contexte(?: proche)?:[^|]*/gi, ' ');
    return base.replace(/["|]/g, ' ').replace(/\s{2,}/g, ' ').trim();
  }

  /**
   * Phase d'ANALYSE structurée (inspirée de l'app de référence gss-app, personas Sacha / Mme Vaché).
   * À partir du DCE (CCTP, RC, rapport de visite terrain, annexes), produit un JSON `analysisData`
   * compact et exploitable, qui sert ensuite de contexte unique au remplissage (au lieu du DCE brut).
   * En plus des faits, le modèle propose des arguments différenciants et des problématiques
   * anticipées — ce qui fait gagner un appel d'offres.
   */
  private async analyzeDce(dceContext: string): Promise<any> {
    const systemPrompt = `Tu es un expert en marchés publics de sécurité privée pour l'entreprise GSS (Global Security Service, ex-GIS).
Ton process s'appuie sur deux rôles : Sacha (amont : analyse du DCE, vérification de l'obligation de visite, comptes-rendus de visite terrain — 60% contiennent des contraintes du terrain absentes du CCTP) et Mme Vaché (rédaction du mémoire technique avec une personnalisation forte : anticiper des problématiques opérationnelles non formulées par l'acheteur).

Ta mission : analyser le CCTP, le RC, le rapport de visite terrain et les annexes pour en extraire, de façon structurée et exhaustive :
1. Le donneur d'ordre, la durée du marché, les sites concernés.
2. Le TYPE DE MARCHÉ : "public" (collectivité, université, hôpital, établissement public, CCAG, code de la commande publique) ou "privé" (entreprise, SAS, SARL, contrat de prestations) — IMPORTANT pour adapter le ton et les obligations légales.
3. Le SECTEUR D'ACTIVITÉ du client (éducation, santé, industrie, distribution, événementiel, tertiaire, collectivité territoriale, etc.).
4. Les besoins en agents (effectifs en ETP, profils : CQP APS, SSIAP 1/2/3, encadrement) et le taux de reprise du personnel en place (annexes).
5. Les contraintes matérielles (contrôle de rondes, pointeaux, PTI/DATI, tenues, véhicules).
6. L'obligation de visite (RC) croisée avec le rapport de visite.
7. Des "Arguments Différenciants" (forces de GSS) et des "Problématiques Anticipées" (risques techniques/humains non formulés par l'acheteur + la solution GSS associée).
8. Des "Recommandations stratégiques GSS" : pour chaque grand thème du mémoire (présentation, moyens humains, moyens opérationnels, moyens organisationnels), propose 2 à 3 arguments SPÉCIFIQUES à ce client que GSS devrait mettre en avant, en tenant compte du cadre public/privé.

Tu renvoies un objet JSON valide et exhaustif.`;

    const userPrompt = `Voici les documents du DCE (CCTP, RC, rapport de visite, annexes) :
${dceContext.slice(0, 120_000)}

Génère une réponse JSON valide respectant EXACTEMENT cette structure :
{
  "clientName": "Nom exact du donneur d'ordre, raison sociale complète telle qu'elle figure dans le DCE",
  "projectTitle": "Intitulé complet du marché",
  "marketRef": "Référence du marché (ex: MP n°AAAA-NN)",
  "marketType": "public ou privé — déterminé d'après le DCE (CCAG, commande publique, collectivité → public ; SAS/SARL, contrat privé → privé)",
  "clientSector": "Secteur d'activité du client (éducation, santé, industrie, distribution, événementiel, tertiaire, collectivité, résidentiel…)",
  "duration": "Durée exacte (ex: 1 an renouvelable 3 fois)",
  "lots": [ { "num": "1", "perimetre": "..." } ],
  "visitMandatory": true,
  "visitDetails": "Observations clés du terrain (rapport de visite). Vide si absent.",
  "sites": [ { "name": "Nom exact du site/campus", "requirements": "Effectifs ETP et qualifications" } ],
  "operationalSummary": {
    "agentProfiles": "Profils requis, taux de reprise du personnel, encadrement",
    "uniforms": "Tenues/équipements spécifiques",
    "equipment": "Rondes, pointeaux par site, PTI, véhicules",
    "qualityControls": "Contrôles inopinés, réunions de suivi, extranet"
  },
  "telesurveillance": "Télésurveillance/levée de doute (le cas échéant) : délais d'intervention max par site, nb d'intervenants, certifications APSAD demandées (vide si non concerné)",
  "legalRequirements": "Exigences d'autorisation (CNAPS, agréments dirigeants, agrément établissement local)",
  "keyRisks": [ "Risque/contrainte opérationnelle identifié" ],
  "proposalStrengths": [ "Argument différenciant technique de GSS pour ce marché" ],
  "anticipatedIssues": [ "Problématique non formulée par l'acheteur + solution concrète GSS" ],
  "gssStrategicRecommendations": {
    "presentation": "2-3 arguments spécifiques pour la présentation de GSS adaptés à CE client et CE cadre (public/privé)",
    "moyensHumains": "2-3 arguments spécifiques sur les moyens humains adaptés aux besoins du client",
    "moyensOperationnels": "2-3 arguments spécifiques sur les moyens opérationnels adaptés au secteur/sites",
    "moyensOrganisationnels": "2-3 arguments spécifiques sur l'organisation adaptés au cadre contractuel (public/privé)"
  }
}`;

    const content = await this.callOpenAI(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      0.2, 'Analyse DCE', true,
    );
    try {
      const data = JSON.parse(content || '{}');
      // Post-traitement : enrichir / valider les champs stratégiques via détection locale
      // (le modèle peut se tromper sur public/privé ; la détection par mots-clés est plus fiable)
      const detectedType = detectMarketType(data);
      const detectedSector = detectClientSector(data);
      data.marketType = data.marketType || detectedType;
      data.clientSector = data.clientSector || detectedSector;
      data.regulatoryFramework = buildRegulatoryFramework(
        data.marketType === 'privé' || data.marketType === 'prive' ? 'prive' : 'public',
        data.clientSector,
        data,
      );
      console.log(`[MemoireGenerator] Analyse DCE: client="${data.clientName || '?'}", type=${data.marketType}, secteur="${data.clientSector}", ${(data.sites || []).length} site(s), ${(data.anticipatedIssues || []).length} problématique(s) anticipée(s), cadre réglementaire: ${(data.regulatoryFramework || '').slice(0, 80)}…`);
      return data;
    } catch (e) {
      console.error('[MemoireGenerator] Analyse DCE: parse JSON échoué, repli sur extrait brut.');
      return { rawExcerpt: dceContext.slice(0, 20_000) };
    }
  }

  /**
   * Analyse comparative « exigences du DCE ↔ ce que GSS a / fait ». Extrait les exigences du CCTP/RC
   * comme une CHECK-LIST (ce qui est écrit et demandé), puis confronte CHAQUE exigence à la
   * Documentation GSS (moyens, formations, procédures réels). Le résultat — une matrice
   * besoin → réponse GSS → écart — est INTERNE : il nourrit les prompts de rédaction pour que le
   * mémoire réponde point par point aux exigences, sans rien inventer.
   */
  private async analyzeRequirements(
    dceContext: string,
    gssContext: string,
  ): Promise<Array<{ theme: string; exigence: string; reponseGss: string; couverture: string; criticite?: string }>> {
    const systemPrompt = `Tu es responsable de l'analyse des appels d'offres de sécurité privée chez GSS.
Mission : dépouiller le DCE — le CCTP EN PRIORITÉ — pour en extraire une CHECK-LIST des GRANDES EXIGENCES du donneur d'ordre, puis confronter chacune à ce que GSS a / fait d'après la Documentation GSS fournie.
RÈGLES :
- NIVEAU DE DÉTAIL : reste au niveau des GRANDES THÉMATIQUES (ex: "Dispositif humain et qualifications", "Moyens matériels et technologiques", "Gestion des alarmes et interventions", "Politique RSE"). Ne descends PAS au niveau des sous-détails par site, par poste ou par modèle d'équipement. Regroupe les exigences similaires.
- Vise 15 à 25 exigences GLOBALES maximum, pas une liste de 50+ micro-détails.
- Cite l'exigence de façon synthétique ; n'invente rien côté DCE.
- La réponse GSS s'appuie UNIQUEMENT sur la Documentation GSS ; n'invente AUCUN moyen absent.
- CLASSE la couverture STRICTEMENT ainsi :
    • "couvert"  = GSS a le moyen/la capacité ET c'est présent dans la Doc GSS.
    • "partiel"  = GSS a bien un moyen approchant, mais un DÉTAIL précis manque. NE PAS classer "écart" dans ce cas.
    • "écart"    = GSS N'A PAS ce moyen / ne fournit PAS cette prestation / RIEN dans la Doc GSS ne s'en approche.
  Dans le doute entre "partiel" et "écart", choisis "partiel". Réserve "écart" aux manques FRANCS.`;

    const userPrompt = `=== EXIGENCES DU MARCHÉ (CCTP EN PRIORITÉ, puis RC / annexes) ===
${dceContext.slice(0, 120_000)}

=== CE QUE GSS A / FAIT (Documentation GSS) ===
${gssContext.slice(0, 120_000)}

Renvoie un JSON valide :
{
  "requirements": [
    {
      "theme": "I | II | III | IV  (I=présentation société & conformité légale ; II=moyens humains ; III=moyens opérationnels & matériels ; IV=organisation, qualité, continuité)",
      "exigence": "Ce que demande le DCE, précis (avec chiffre / délai / qualification si présent)",
      "reponseGss": "Ce que GSS propose concrètement en réponse (moyen / méthode / chiffre tiré de la Doc GSS)",
      "couverture": "couvert | partiel | écart",
      "criticite": "bloquant | facultatif | normal  (bloquant = éliminatoire/obligatoire, sans quoi l'offre est irrecevable ou fortement pénalisée ; facultatif = confort/bonus ; normal = attendu mais non éliminatoire)"
    }
  ]
}`;

    const content = await this.callOpenAI(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      0.2, 'Analyse exigences ↔ GSS', true,
    );
    try {
      const data = JSON.parse(content || '{}');
      const reqs = Array.isArray(data.requirements) ? data.requirements : [];
      const by = (c: string) => reqs.filter((r: any) => (r.couverture || '').toLowerCase().includes(c)).length;
      console.log(`[MemoireGenerator] Matrice de conformité: ${reqs.length} exigence(s) (couvert=${by('couvert')}, partiel=${by('partiel')}, écart=${by('écart')}).`);
      return reqs;
    } catch {
      console.warn('[MemoireGenerator] Matrice de conformité: parse JSON échoué → non injectée.');
      return [];
    }
  }

  /**
   * Élimine de la liste des manques tout champ dont le sujet fait déjà l'objet d'une recherche web
   * ou d'une question interne en BDD (recherche_web / question_interne), même en attente de validation.
   */
  private async filterAlreadyKnownInDb(fields: MissingFieldDetected[], dossierId: string): Promise<MissingFieldDetected[]> {
    // We bypass this filter because it hides missing information from the user interface.
    // If an info is missing for THIS dossier, it must be displayed, even if a similar question
    // was asked in the past or for another dossier.
    return fields;
  }

  /**
   * Extrait la LISTE des besoins à couvrir (SANS juger la couverture) :
   *  - cadre imposé → les CHAMPS du formulaire ;
   *  - sans cadre   → les EXIGENCES du CCTP.
   */
  private async extractRequirementsList(
    templateText: string | null,
    dceContext: string,
  ): Promise<Array<{ label: string; theme?: string; kind?: 'champ' | 'case' | 'tableau'; criticite: 'bloquant' | 'facultatif' | 'normal' }>> {
    const parse = (content: string | null) => {
      if (content === null) console.warn('[MemoireGenerator] extractRequirements DIAG : callOpenAI a renvoyé NULL (échec IA/rate-limit).');
      try {
        const d = JSON.parse(content || '{}');
        const normKind = (t: any): 'champ' | 'case' | 'tableau' | undefined => {
          const s = String(t ?? '').toLowerCase();
          return s === 'case' || s === 'tableau' || s === 'champ' ? s as any : undefined;
        };
        const items = (Array.isArray(d.items) ? d.items : [])
          .map((c: any) => ({ label: String(c?.label ?? '').trim(), theme: c?.theme, kind: normKind(c?.type), criticite: normCriticite(c?.criticite), context: String(c?.context ?? '').trim() }))
          .filter((x: any) => x.label !== '');
        if (items.length === 0) console.warn(`[MemoireGenerator] extractRequirements DIAG : 0 item extrait. Réponse IA (200c) = ${(content || '').slice(0, 200)}`);
        return items;
      } catch { console.warn('[MemoireGenerator] extractRequirements DIAG : JSON illisible.'); return []; }
    };
    if (templateText) {
      const content = await this.callOpenAI(
        [
          {
            role: 'system',
            content:
              "Tu extrais la LISTE EXHAUSTIVE de TOUT ce qui reste À RENSEIGNER dans un cadre de réponse imposé (formulaire d'un acheteur public) pour GSS (sécurité privée). " +
              "Le texte est ANNOTÉ :\n" +
              "  • « [CHAMP À REMPLIR] … » = zone de saisie texte à compléter ;\n" +
              "  • « [CASE ☐ vide] libellé » = case à cocher NON cochée (choix/option à trancher) ; « [CASE ☒ cochée] » = déjà cochée ;\n" +
              "  • « [TABLEAU] … [/TABLEAU] » = tableau ; « ⬚ (à remplir — colonne: « X », ligne: « Y ») » marque une CELLULE VIDE, avec son en-tête de colonne et son libellé de ligne.\n" +
              "RÈGLES :\n" +
              "- Relève CHAQUE champ texte à compléter, CHAQUE case à cocher à trancher, et CHAQUE cellule de tableau à renseigner (⬚).\n" +
              "- Pour une cellule de tableau, REPRENDS dans le libellé la colonne ET la ligne indiquées (ex. « Tableau moyens humains — ligne « Chef de poste », colonne « Effectif » à compléter »). Regroupe si toute une colonne est vide.\n" +
              "- Un libellé court et clair par élément ; indique son type dans `type` : \"champ\" | \"case\" | \"tableau\". Ne recopie pas le formulaire entier.\n" +
              "- Fournis aussi dans `context` une ou deux phrases courtes expliquant la section ou l'intitulé parent pour donner du sens à l'élément.\n" +
              "- Ignore les cases DÉJÀ cochées et les zones déjà renseignées.",
          },
          { role: 'user', content: `=== CADRE (annoté) ===\n${templateText.slice(0, 80_000)}\n\nRenvoie un JSON : {"items":[{"label":"...","type":"champ|case|tableau","criticite":"bloquant|facultatif|normal","context":"..."}]}` },
        ],
        0.1, 'Extraction champs template', true,
      );
      return parse(content);
    }
    const content = await this.callOpenAI(
      [
        { role: 'system', content: "Tu extrais la CHECK-LIST des GRANDES EXIGENCES d'un DCE (CCTP en priorité) pour un marché de sécurité privée. ATTENTION: Reste UNIQUEMENT au niveau des grandes thématiques (ex: Dispositif humain global, Matériel et technologies, Astreinte, Politique RSE, Démarche qualité) et ne liste SURTOUT PAS les sous-détails précis (ne liste pas les modèles de radio, les types d'EPI, les plannings précis, etc.). Limite-toi à une quinzaine d'exigences globales maximum. Le but est d'avoir une vue d'ensemble, sois très général et concis. N'invente rien." },
        { role: 'user', content: `=== DCE ===\n${dceContext.slice(0, 120_000)}\n\nRenvoie un JSON : {"items":[{"label":"...","theme":"I|II|III|IV","criticite":"bloquant|facultatif|normal"}]}` },
      ],
      0.2, 'Extraction exigences CCTP', true,
    );
    return parse(content);
  }

  /**
   * Détection FONDÉE SUR LA RAG : pour CHAQUE exigence/champ, recherche sémantique dans la base de
   * connaissance (rag_chunk) → passages GSS les plus proches → l'IA juge COUVERT vs MANQUANT.
   * Renvoie null si la RAG n'est pas disponible (→ l'appelant retombe sur l'ancienne méthode).
   */
  private async detectMissingViaRag(
    requirements: Array<{ label: string; theme?: string; kind?: 'champ' | 'case' | 'tableau'; criticite: 'bloquant' | 'facultatif' | 'normal'; context?: string }>,
  ): Promise<{ fields: MissingFieldDetected[]; total: number; exigences: any[] } | null> {
    if (requirements.length === 0) return null;
    const gss = await this.loadGssChunksFromDb();
    if (!gss || gss.length === 0) return null;   // pas de RAG → repli sur l'ancienne méthode

    const embs = await this.embedTexts(requirements.map((r) => r.label));
    const withCtx = requirements.map((r, i) => {
      const top = this.retrieve(embs[i] || [], gss, 5, r.label);
      return {
        i, label: r.label, criticite: r.criticite, theme: r.theme, kind: r.kind, reqContext: r.context,
        ctx: top.map((c) => `- [${c.label}] ${c.text.replace(/\s+/g, ' ').slice(0, 350)}`).join('\n'),
      };
    });

    const missing: MissingFieldDetected[] = [];
    const exigences: any[] = [];
    const BATCH = 12;
    for (let b = 0; b < withCtx.length; b += BATCH) {
      const batch = withCtx.slice(b, b + BATCH);
      const payload = batch.map((x) => ({ index: x.i, exigence: x.label, passages_gss: x.ctx || '(aucun passage proche)' }));
      const content = await this.callOpenAI(
        [
          { role: 'system', content: "Pour CHAQUE exigence, on te donne les passages de la Documentation GSS les PLUS PROCHES (recherche sémantique dans la base de connaissance). Décide si GSS COUVRE l'exigence (le moyen/l'information est réellement présent dans ces passages) ou si elle MANQUE (rien de pertinent → à demander en interne ou à rechercher). N'invente RIEN : si les passages ne le prouvent pas, c'est MANQUANT." },
          { role: 'user', content: `Exigences + passages GSS (JSON) :\n${JSON.stringify(payload)}\n\nRenvoie un JSON : {"resultats":[{"index":<n>,"statut":"couvert|manquant"}]}` },
        ],
        0.1, 'Jugement couverture RAG', true,
      );
      const map = new Map<number, string>();
      try {
        const d = JSON.parse(content || '{}');
        for (const r of (Array.isArray(d.resultats) ? d.resultats : [])) {
          if (typeof r?.index === 'number') map.set(r.index, String(r?.statut ?? '').toLowerCase());
        }
      } catch { /* batch illisible → tout considéré manquant par prudence */ }
      for (const x of batch) {
        const statut = map.get(x.i);
        const manquant = statut ? statut.includes('manqu') : true;   // défaut prudent : manquant
        const kindLabel = x.kind === 'case' ? 'Case à cocher' : x.kind === 'tableau' ? 'Tableau' : x.kind === 'champ' ? 'Champ' : null;
        exigences.push({ id: `ex-${x.i}`, theme: x.theme || '', exigence: x.label, couverture: manquant ? 'écart' : 'couvert', criticite: x.criticite, ...(x.kind ? { kind: x.kind } : {}) });
        if (manquant) {
          const suffix = "(Absent de la base de connaissance GSS)";
          const ctxText = x.reqContext ? `${x.reqContext} ${suffix}` : `${kindLabel ? kindLabel + ' du cadre. ' : ''}${suffix}`;
          missing.push({
            id: `req-${x.i}`,
            label: x.label,
            context: ctxText,
            criticite: x.criticite,
          });
        }
      }
    }
    console.log(`[MemoireGenerator] Détection RAG : ${requirements.length} exigence(s) → ${missing.length} manque(s).`);
    return { fields: missing, total: requirements.length, exigences };
  }

  /**
   * Détecte les INFORMATIONS MANQUANTES d'un dossier APRÈS l'analyse du DCE. Compare chaque exigence
   * (CCTP) ou champ (cadre imposé) à la BASE DE CONNAISSANCE RAG (recherche sémantique) pour savoir
   * si l'information existe déjà chez GSS, ou doit être demandée / recherchée. Résultat PERSISTÉ dans
   * dossier.memoire_cadre_state.missingFields (consommé par « Demander à l'équipe » / recherche web).
   */
  public async detectMissingInfo(
    dossierId: string,
    opts: { force?: boolean } = {},
  ): Promise<{ missingFields: Array<{ id: string; label: string; context: string; criticite: 'bloquant' | 'facultatif' | 'normal'; demande: 'web' | 'equipe' }>; completude?: number | null; contradictions?: Array<{ sujet: string; detail: string }>; cached?: boolean }> {
    // Idempotence : la détection ne se fait QU'UNE FOIS. Si elle a déjà tourné pour ce dossier
    // (missingDetectedAt présent), on renvoie la liste en cache — sûr d'appeler depuis plusieurs
    // endroits (upload + repli fiche dossier). `force:true` permet de la relancer explicitement.
    if (!opts.force) {
      const existing = await DB.getDossier(dossierId);
      const st: any = existing?.memoire_cadre_state;
      if (st && st.missingDetectedAt && Array.isArray(st.missingFields)) {
        console.log(`[MemoireGenerator] Détection déjà faite (${st.missingFields.length}) — cache renvoyé.`);
        return { missingFields: st.missingFields, completude: st.completude ?? null, contradictions: st.contradictions ?? [], cached: true };
      }
    }

    const dceContext = await this.getDceContext(dossierId);
    const gssDocs = await this.getGssDocumentation();
    // Contexte GSS LARGE (≈120k car au lieu de 24k) : sinon l'IA ne voit qu'une tranche de la Doc
    // GSS et sur-signale des « écarts » sur des points en réalité couverts.
    const gssContext = this.buildFullGssContext(gssDocs, 12_000, 120_000);

    // Deux systèmes de détection, tous deux APRÈS l'upload :
    //  • CADRE IMPOSÉ (« Mémoire (cadre) ») → basé sur le TEMPLATE : champs du formulaire non
    //    renseignables depuis le DCE + la Doc GSS.
    //  • SANS CADRE (AO RNE)               → basé sur les EXIGENCES : écarts DCE ↔ Doc GSS.
    const templateText = await this.getClientTemplateText(dossierId);
    // 1) Extraire la LISTE des besoins (champs du template OU exigences du CCTP).
    // 2) Comparer CHACUN à la base de connaissance RAG (recherche sémantique) → couvert / manquant.
    // Repli sur l'ancienne méthode (contexte GSS complet) si la RAG n'est pas disponible.
    const requirements = await this.extractRequirementsList(templateText, dceContext);
    console.log(`[MemoireGenerator] detectMissing DIAG : template=${templateText ? `${templateText.length} car` : 'NON TROUVÉ'}, dceContext=${dceContext.length} car, exigences extraites=${requirements.length}`);
    const viaRag = await this.detectMissingViaRag(requirements);
    console.log(`[MemoireGenerator] detectMissing DIAG : RAG=${viaRag ? `${viaRag.fields.length} manque(s)/${viaRag.total} exigence(s)` : 'INDISPONIBLE → repli ancienne méthode'}`);
    const detected =
      viaRag ??
      (templateText
        ? await this.detectMissingFromTemplate(templateText, dceContext, gssContext)
        : await this.detectMissingFromRequirements(dceContext, gssContext));
    const rawFields = detected.fields;
    const filteredIdentite = rawFields.filter((m) => {
      if (identiteCandidatForLabel(m.label) !== '') {
        console.log(`[MemoireGenerator] Manque ignoré (identité légale GSS connue) : "${m.label}"`);
        return false;
      }
      const n = m.label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (/signature|cachet|fait [aà]|le \d{2}|date (de signature|du jour)|nom et qualite du signataire/.test(n)) {
        console.log(`[MemoireGenerator] Manque ignoré (signature/formalité) : "${m.label}"`);
        return false;
      }
      return true;
    });
    const baseFields = await this.filterAlreadyKnownInDb(filteredIdentite, dossierId);
    const total = detected.total;
    const exigences = (detected as any).exigences || null;   // matrice complète (cas sans cadre)

    // Score de complétude : part des besoins/champs déjà couverts (0..100). Le dénominateur est le
    // TOTAL (exigences pour le cas sans cadre, champs du template pour le cadre imposé).
    const completude = total > 0 ? Math.round(((total - baseFields.length) / total) * 100) : null;

    // Contradictions / ambiguïtés relevées dans le DCE (traçabilité, alerte à l'utilisateur).
    const contradictions = await this.detectContradictions(dceContext);

    // Moteur de décision : pour CHAQUE manque, vers quel canal aller le chercher —
    // 'web' (public, cherchable sur internet) vs 'equipe' (interne, à demander à un référent GSS).
    const kinds = await classifyFieldsLLM(baseFields.map(({ criticite, ...f }) => f));
    const missingFields = baseFields.map((m) => ({
      ...m,   // id, label, context, criticite
      demande: (kinds.get(m.id) === 'public' ? 'web' : 'equipe') as 'web' | 'equipe',
    }));

    // Persistance : on fusionne avec l'éventuel memoire_cadre_state existant (sans l'écraser).
    const dossier = await DB.getDossier(dossierId);
    const prevState = (dossier?.memoire_cadre_state && typeof dossier.memoire_cadre_state === 'object')
      ? dossier.memoire_cadre_state : {};
    await DB.saveDossier(dossierId, {
      memoire_cadre_state: {
        ...prevState,
        missingFields,
        completude,
        contradictions,
        ...(exigences ? { exigences } : {}),
        missingDetectedAt: new Date().toISOString(),
      },
    });

    const nbBloq = missingFields.filter((m) => m.criticite === 'bloquant').length;
    console.log(`[MemoireGenerator] Détection (${templateText ? 'cadre imposé' : 'sans cadre'}): ${missingFields.length} manque(s) dont ${nbBloq} bloquant(s), complétude ${completude ?? '?'}%, ${contradictions.length} contradiction(s).`);
    return { missingFields, completude, contradictions };
  }

  /**
   * Repère les CONTRADICTIONS / AMBIGUÏTÉS internes du DCE (chiffres qui se contredisent, exigences
   * incompatibles, informations manquantes structurantes). Une seule passe IA. Best-effort : en cas
   * d'échec, renvoie une liste vide (non bloquant).
   */
  private async detectContradictions(dceContext: string): Promise<Array<{ sujet: string; detail: string }>> {
    const content = await this.callOpenAI(
      [
        { role: 'system', content: "Tu relis un DCE (dossier de consultation) de marché de sécurité privée pour GSS. Repère uniquement les VRAIES contradictions ou ambiguïtés INTERNES au dossier : chiffres/dates/horaires qui se contredisent entre pièces, exigences incompatibles, renvois à des annexes absentes, formulations réellement ambiguës qui empêchent de répondre. N'invente rien ; si tout est cohérent, renvoie une liste vide." },
        { role: 'user', content: `=== DCE ===\n${dceContext.slice(0, 120_000)}\n\nRenvoie un JSON valide : { "contradictions": [ { "sujet": "de quoi il s'agit (court)", "detail": "la contradiction/ambiguïté constatée (1-2 phrases, cite les valeurs en conflit si possible)" } ] }` },
      ],
      0.1, 'Détection contradictions DCE', true,
    );
    try {
      const data = JSON.parse(content || '{}');
      const items = Array.isArray(data.contradictions) ? data.contradictions : [];
      return items
        .map((it: any) => ({ sujet: String(it?.sujet ?? '').trim(), detail: String(it?.detail ?? '').trim() }))
        .filter((c: any) => c.detail !== '');
    } catch {
      return [];
    }
  }

  /** Détection SANS cadre : écarts DCE ↔ Doc GSS (via analyzeRequirements). Renvoie aussi la
   *  matrice complète des exigences (à persister) et le total (pour le score de complétude). */
  private async detectMissingFromRequirements(
    dceContext: string,
    gssContext: string,
  ): Promise<{ fields: MissingFieldDetected[]; total: number; exigences: any[] }> {
    const reqs = await this.analyzeRequirements(dceContext, gssContext);
    const norm = (c: string) => (c || '').toLowerCase();
    const gaps = reqs.filter((r) => norm(r.couverture).includes('écart') || norm(r.couverture).includes('ecart'));
    const fields = gaps.map((r, i) => ({
      id: `req-${i}`,
      label: r.exigence || '',
      context: `[${r.couverture || 'écart'}] ${r.theme ? `Chapitre ${r.theme} — ` : ''}${r.reponseGss ? `Réponse GSS actuelle : ${r.reponseGss}` : 'Non couvert par la Documentation GSS'
        }`,
      criticite: normCriticite(r.criticite),
    })).filter((m) => m.label.trim() !== '');
    // Exigences persistées (fiches réutilisables) : toute la matrice, avec un id + statut.
    const exigences = reqs
      .filter((r: any) => (r.exigence || '').trim() !== '')
      .map((r: any, i: number) => ({
        id: `ex-${i}`,
        theme: r.theme || '',
        exigence: r.exigence,
        reponseGss: r.reponseGss || '',
        couverture: norm(r.couverture).includes('écart') || norm(r.couverture).includes('ecart')
          ? 'écart' : norm(r.couverture).includes('partiel') ? 'partiel' : 'couvert',
        criticite: normCriticite(r.criticite),
      }));
    return { fields, total: exigences.length, exigences };
  }

  /**
   * Texte du CADRE IMPOSÉ (« Mémoire (cadre) ») uploadé avec le DCE, ou null si le dossier n'a pas
   * de cadre client. Sert à détecter les champs du formulaire non renseignables, sans lancer la
   * génération. Matérialise le DCE depuis Storage (ou repli disque), extrait le texte, nettoie.
   */
  private async getClientTemplateText(dossierId: string): Promise<string | null> {
    const searchDir = await this.materializeDceFromStorage(dossierId);
    let tmpDir: string | null = searchDir;
    try {
      const tpl = this.findDceTemplate(searchDir);
      if (!tpl) return null;
      let text = '';
      try {
        // Extraction ANNOTÉE pour les .docx : préserve cases à cocher et cellules de tableau vides
        // (balises [CASE ☐], [CHAMP À REMPLIR], ⬚) — indispensable pour repérer TOUT ce qui reste à
        // renseigner. Repli sur extractText (aplati) pour les .doc ou en cas d'échec.
        text = tpl.toLowerCase().endsWith('.docx')
          ? loadDocxTemplateAnnotated(tpl)
          : await extractText(tpl);
      } catch {
        if (tpl.toLowerCase().endsWith('.docx')) {
          const xml = new PizZip(fs.readFileSync(tpl)).file('word/document.xml')?.asText() || '';
          text = xml.split(/<w:p[ >]/).slice(1)
            .map((p) => (p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || []).map((m) => m.replace(/<[^>]+>/g, '')).join(''))
            .map((t) => t.replace(/&amp;/g, '&').trim()).filter(Boolean).join('\n');
        }
      }
      return text && text.trim() ? text : null;
    } finally {
      if (tmpDir) { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ } }
    }
  }

  /**
   * Détection AVEC cadre imposé : une seule passe IA qui, vu le TEXTE DU TEMPLATE + le DCE + la Doc
   * GSS, liste les CHAMPS du formulaire qu'on ne peut PAS renseigner à partir des sources.
   * Abordable (1 appel) et sans toucher au moteur de génération (qui, lui, remplit champ par champ).
   */
  private async detectMissingFromTemplate(
    templateText: string,
    dceContext: string,
    gssContext: string,
  ): Promise<{ fields: MissingFieldDetected[]; total: number }> {
    const systemPrompt = `Tu analyses un CADRE DE RÉPONSE imposé par un acheteur public (formulaire de mémoire technique à remplir) pour GSS (sécurité privée).
Le texte est ANNOTÉ :
  • « [CHAMP À REMPLIR] … » = zone de saisie texte à compléter
  • « [CASE ☐ vide] libellé » = case à cocher NON cochée (choix à trancher)
  • « [TABLEAU] … [/TABLEAU] » avec cellules vides marquées par « ⬚ (à remplir — colonne: « X », ligne: « Y ») »
Mission : repérer TOUS LES ÉLÉMENTS À RENSEIGNER du cadre (champs textes, cases à cocher vides, cellules de tableaux vides) et déterminer, pour chacun, s'il est renseignable À PARTIR des sources fournies (le DCE et la Documentation GSS).
RÈGLES :
- Compte le NOMBRE TOTAL d'éléments à renseigner du cadre (total_champs) incluant les cases vides.
- Ne liste QUE les éléments qui NE PEUVENT PAS être renseignés depuis les sources (information réellement absente du DCE ET de la Doc GSS). Ignore ce qui est déjà renseignable.
- Sois exhaustif et rigoureux : si une information demandée par le cadre n'est pas clairement et explicitement écrite dans le DCE ou la Documentation GSS, liste-la comme champ manquant.
- Formule un libellé court et clair de l'information manquante (pas de recopie du formulaire entier).
- Indique la criticité de chaque champ manquant : "bloquant" (champ obligatoire/éliminatoire), "facultatif" (bonus/confort) ou "normal".`;

    const userPrompt = `=== CADRE DE RÉPONSE À REMPLIR (template acheteur) ===
${templateText.slice(0, 80_000)}

=== SOURCES DISPONIBLES : DCE ===
${dceContext.slice(0, 80_000)}

=== SOURCES DISPONIBLES : DOCUMENTATION GSS ===
${gssContext.slice(0, 80_000)}

Renvoie un JSON valide :
{
  "total_champs": 0,
  "manquants": [
    { "champ": "libellé court du champ / information non renseignable", "raison": "pourquoi c'est absent des sources (1 phrase)", "criticite": "bloquant | facultatif | normal" }
  ]
}`;

    const content = await this.callOpenAI(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      0.2, 'Détection champs manquants (template)', true,
    );
    try {
      const data = JSON.parse(content || '{}');
      const items = Array.isArray(data.manquants) ? data.manquants : [];
      const fields: MissingFieldDetected[] = items
        .map((it: any, i: number) => ({
          id: `champ-${i}`,
          label: String(it?.champ ?? '').trim(),
          context: String(it?.raison ?? '').trim() || 'Champ du cadre non renseignable depuis le DCE et la Documentation GSS.',
          criticite: normCriticite(it?.criticite),
        }))
        .filter((m: any) => m.label !== '');
      const declared = Number(data.total_champs);
      const total = Number.isFinite(declared) && declared >= fields.length ? declared : fields.length;
      return { fields, total };
    } catch {
      console.warn('[MemoireGenerator] Détection template: parse JSON échoué → liste vide.');
      return { fields: [], total: 0 };
    }
  }

  /**
   * Personnalise le texte statique du maître AO RNE.docx (rédigé pour le marché « Parc des
   * Expositions de Rouen ») en remplaçant SON nom de client par celui du DCE. Le nom figure sur
   * la couverture / le sommaire et est découpé en plusieurs runs (« PARC » / « DES » /
   * « EXPOSITIONS DE ROUEN ») : on travaille donc au niveau du paragraphe (texte concaténé),
   * puis on réinjecte le résultat dans le 1er run (les autres sont vidés). On NE touche PAS au
   * « Rouen » isolé (villes d'agence GSS et références clients « ILS NOUS ONT FAIT CONFIANCE »
   * = preuves sociales à conserver) ni à l'identité GSS.
   */
  private adaptStaticText(xmlDoc: any, analysisData: any) {
    const clientName: string = (analysisData?.clientName || '').trim();
    if (!clientName) return;

    // Phrases complètes du client du maître uniquement (jamais le « Rouen » nu).
    const OLD_CLIENT =
      /PARC\s+DES\s+EXPOSITIONS\s+DE\s+ROUEN|Parc\s+des\s+[Ee]xpositions\s+de\s+Rouen|Parc\s+des\s+[Ee]xpositions|Parc\s+Expo/g;
    const replaceClient = (s: string) =>
      s.replace(OLD_CLIENT, (m) => (m === m.toUpperCase() ? clientName.toUpperCase() : clientName));

    let count = 0;
    getElementsWithLocalName(xmlDoc, 'p').forEach((p: any) => {
      const tEls = getElementsWithLocalName(p, 't');
      if (tEls.length === 0) return;
      const concat = tEls.map((t: any) => t.textContent || '').join('');
      if (!OLD_CLIENT.test(concat)) return;
      OLD_CLIENT.lastIndex = 0; // regex globale → réinitialiser après .test()
      const replaced = replaceClient(concat);
      if (replaced === concat) return;
      tEls[0].textContent = replaced;          // tout le texte dans le 1er run (style du titre conservé)
      for (let i = 1; i < tEls.length; i++) tEls[i].textContent = '';
      count++;
    });
    console.log(`[MemoireGenerator] Personnalisation client: ${count} paragraphe(s) mis à jour → "${clientName}".`);
  }

  public async generate(
    dossierId: string,
    onProgress?: (progress: number, message: string) => void
  ): Promise<{
    status?: 'completed' | 'incomplete';
    filePath?: string;
    generatedData?: Record<string, string>;
    missingFields?: any[];
    consultations?: string[];
  }> {
    const settings = getSettings();
    const baseDir = path.resolve(__dirname, '../../');

    // 1. Find template. isClientTemplate=true → cadre imposé par l'acheteur (on remplit tel quel).
    // isClientTemplate=false → mémoire GSS maître réutilisé (on adapte d'abord client/sites).
    let templatePath: string | null = null;
    let isClientTemplate = true;

    // Un cadre imposé (« Mémoire (cadre) ») n'est valable que s'il provient des fichiers
    // RÉELLEMENT uploadés pour CE dossier. On ne cherche donc que dans uploadedDceDir et
    // jamais dans les corpus de référence (Cas-Univ-Rouen, corpusDce…), sinon chaque dossier
    // hériterait à tort du mémoire de référence comme « cadre client » → faux « cas template ».
    const dossier = await DB.getDossier(dossierId);
    // Nouveaux dossiers : les pièces vivent dans Storage. On matérialise
    // pour y chercher un éventuel cadre imposé, puis on nettoie dès le template chargé en mémoire.
    let templateTmpDir: string | null = await this.materializeDceFromStorage(dossierId);
    let templateSearchDir = templateTmpDir;
    if (dossier && dossier.dce_files) {
      const templateFile = dossier.dce_files.find((f: any) => f.type === 'Mémoire (cadre)');
      if (templateFile && templateFile.nom) {
        const p = path.join(templateSearchDir, path.basename(templateFile.nom));
        if (fs.existsSync(p)) { templatePath = p; }
      }
    }

    if (!templatePath) {
      templatePath = this.findDceTemplate(templateSearchDir);
    }

    if (!templatePath) {
      templatePath = path.join(this.templateDir, 'Mémoire technique', 'AO RNE.docx');
      isClientTemplate = false; // mémoire GSS maître, pas un cadre acheteur
      if (!fs.existsSync(templatePath)) {
        const fallbackPath = path.resolve(__dirname, '../../../AO RNE.docx');
        if (fs.existsSync(fallbackPath)) {
          templatePath = fallbackPath;
        } else {
          console.warn(`[MemoireGenerator] Aucun template trouvé ni dans le DCE ni dans ${templatePath} (ou fallback). On continue sans template (Marp)`);
        }
      }
    }

    console.log(`[MemoireGenerator] Using template: ${templatePath} (${isClientTemplate ? 'cadre client' : 'mémoire GSS maître'})`);

    // Choix du modèle selon le cas : cadre client imposé → gpt-5.4-nano (tâche mécanique, moins cher) ;
    // mémoire GSS maître (sans template) → gpt-5.4-mini (qualité rédactionnelle). Porté par callOpenAI.
    this.memoireModel = isClientTemplate ? MODEL_TEMPLATE : MEMOIRE_MODEL;
    console.log(`[MemoireGenerator] Modèle de rédaction : ${this.memoireModel} (${isClientTemplate ? 'cas template' : 'cas sans template'}).`);

    // ── Sans cadre imposé : synthèse IA superposée sur AO RNE.pdf (overlay, design figé) ──
    // On TRANSMET onProgress : sinon la barre de progression du front reste figée sur le dernier
    // état connu (5 %, « Démarrage ») pendant toute la génération Marp.
    if (!isClientTemplate) {
      return this.generateFullMarpPdf(dossierId, onProgress);
    }

    // 2. Analyse structurée du DCE (contexte unique de rédaction), avant toute manipulation du Word
    const dceContext = await this.getDceContext(dossierId);
    const analysisData = await this.analyzeDce(dceContext);
    const analysisJson = JSON.stringify(analysisData, null, 2);
    if (onProgress) onProgress(12, 'Analyse du DCE terminée');

    // 2 bis. Connaissances GSS pour répondre au cadre client : on explore TOUS les sous-dossiers de
    // la Documentation GSS (moyens, procédures, organisation…) + le dossier « Personnes » (référents).
    // Le DCE reste le contexte primaire (les exigences) ; la Documentation GSS fournit la matière
    // pour y répondre. Toute info absente de ces sources → champ laissé « [À COMPLÉTER] ».
    const gssDocs = await this.getGssDocumentation();
    const gssDocContext = this.buildFullGssContext(gssDocs);
    const referentsContext = await this.getGssReferents();
    if (onProgress) onProgress(18, 'Chargement de la documentation GSS…');
    console.log(`[MemoireGenerator] Contexte cadre client: ${Object.keys(gssDocs).length} catégorie(s) Doc GSS (${gssDocContext.length} chars) + référents (${referentsContext.length} chars).`);

    // Effectif TOTAL de l'entreprise = somme DÉTERMINISTE des effectifs par catégorie d'EFFECTIFS
    // MOYENS.pdf (agrégation de chiffres réels, pas une invention). Sert à remplir « effectif total
    // de l'entreprise / en France » sans laisser le modèle prendre une seule catégorie pour le total.
    const effectifTotal = await this.getGssTotalEffectif();
    if (effectifTotal) console.log(`[MemoireGenerator] Effectif total GSS (somme): ${effectifTotal.total} (${effectifTotal.breakdown}).`);

    // 3. Load DOCX and parse XML DOM
    const content = fs.readFileSync(templatePath);
    // Template chargé en mémoire → le dossier temporaire de recherche n'est plus utile.
    if (templateTmpDir) { try { fs.rmSync(templateTmpDir, { recursive: true, force: true }); } catch { /* ignore */ } }
    const zip = new PizZip(content);
    const documentXml = zip.file('word/document.xml');
    if (!documentXml) throw new Error('word/document.xml introuvable dans le template');

    const docXmlStr = documentXml.asText();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(docXmlStr, 'text/xml');

    // Si c'est un mémoire GSS maître (et non un cadre acheteur), on adapte d'abord les textes
    // statiques (ancien client / référence marché / noms de sites) au nouveau marché.
    if (!isClientTemplate) {
      this.adaptStaticText(xmlDoc, analysisData);
      const hfSerializer = new XMLSerializer();
      Object.keys(zip.files).forEach(name => {
        if (name.startsWith('word/header') || name.startsWith('word/footer')) {
          const fd = zip.file(name);
          if (!fd) return;
          const hfDoc = parser.parseFromString(fd.asText(), 'text/xml');
          this.adaptStaticText(hfDoc, analysisData);
          zip.file(name, hfSerializer.serializeToString(hfDoc));
        }
      });
    }

    // 3. Walk the DOM to detect fillable fields
    const WNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    // Seuil ≥5 : les vraies lignes à remplir du formulaire sont longues. Un trait d'union isolé
    // ("sous-traitance") ou des points de suspension "..." en pleine phrase ne comptent PAS.
    const DOT_RUN = /(?:[_.\-…]\s*){5,}/;
    const DOT_RUN_G = /(?:[_.\-…]\s*){5,}/g;
    const isDottedOnly = (s: string) => s.trim().length >= 5 && /^[_.\-…\s]+$/.test(s);
    const hasDottedRun = (s: string) => DOT_RUN.test(s);
    const stripDots = (s: string) => s.replace(DOT_RUN_G, ' ').trim();
    const normCtx = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const isIdentityCtx = (ctx: string) =>
      /adresse|denomination|raison sociale|candidat|cnaps|siret|siren|agrement|certification|station|\bdate\b|n°|numero|delai|minute|intervenant|taux|effectif|\betp\b|telephone|email|mail|coordonnees/.test(normCtx(ctx));

    interface FieldDesc {
      id: number;
      type: 'text' | 'legacy_checkbox' | 'sym_checkbox' | 'w14_checkbox';
      element?: any;
      context: string;
      kind: 'answer' | 'table' | 'checkbox';
      lineCount?: number;
    }

    let fieldCounter = 1;
    const descriptors: FieldDesc[] = [];
    const filledCells = new Set<any>();
    let currentHeading = 'Introduction / Généralités';
    const recentParagraphs: string[] = [];
    let lastQuestionText = '';          // dernier paragraphe-question purement textuel
    let openAnswerField: FieldDesc | null = null; // zone de réponse en cours de coalescence

    const addField = (f: Omit<FieldDesc, 'id'>): FieldDesc => {
      const fd: FieldDesc = { id: fieldCounter++, ...f };
      descriptors.push(fd);
      return fd;
    };

    /** Pose [CHAMP_id] dans le 1er run pointillé (id != null) puis vide les autres runs pointillés. */
    const placeOrClearDotted = (pNode: any, placeId: number | null) => {
      let placed = false;
      getElementsWithLocalName(pNode, 't').forEach((tEl: any) => {
        const text = tEl.textContent || '';
        if (!isDottedOnly(text) && !hasDottedRun(text)) return;
        if (placeId !== null && !placed) {
          tEl.textContent = isDottedOnly(text)
            ? `[CHAMP_${placeId}]`
            : text.replace(DOT_RUN, `[CHAMP_${placeId}]`).replace(DOT_RUN_G, '');
          placed = true;
        } else {
          tEl.textContent = isDottedOnly(text) ? '' : text.replace(DOT_RUN_G, '');
        }
      });
      return placed;
    };

    const walkDOM = (node: any, inDrawing: boolean) => {
      if (node.nodeType !== 1) return;
      const localName = node.localName;
      // Ne pas détecter de champs dans les cartouches graphiques / zones de texte (titre)
      const nowInDrawing = inDrawing || localName === 'drawing' || localName === 'pict' || localName === 'txbxContent';

      if (!nowInDrawing) {
        // ── Suivi des titres / questions (paragraphes purement textuels) ──
        if (localName === 'p') {
          const pText = getElementText(node).trim();
          if (isHeadingParagraph(node)) {
            currentHeading = pText;
            recentParagraphs.length = 0;
            lastQuestionText = '';
            openAnswerField = null;
          } else if (pText && !isDottedOnly(pText) && !hasDottedRun(pText)) {
            // paragraphe purement textuel → libellé/question, ferme toute zone ouverte
            const cleaned = pText.replace(/\[CHAMP_\d+\]/g, '').trim();
            if (cleaned) {
              recentParagraphs.push(cleaned);
              if (recentParagraphs.length > 3) recentParagraphs.shift();
              if (cleaned.length < 300) lastQuestionText = cleaned;
              openAnswerField = null;
            }
          }
        }

        // ── A. Cellules de tableau : cellules vides dans une ligne à contenu mixte ──
        if (localName === 'tr') {
          openAnswerField = null;
          const directCells = getDirectCells(node);
          const cellInfos = directCells.map((cell: any) => ({ cell, isEmpty: getElementText(cell).trim() === '' }));
          const hasText = cellInfos.some((c: any) => !c.isEmpty);
          const hasEmpty = cellInfos.some((c: any) => c.isEmpty);
          if (hasText && hasEmpty) {
            cellInfos.forEach((cInfo: any, cellIdx: number) => {
              // La 1re cellule d'une ligne est la colonne LIBELLÉ (intitulé de la ligne) : on ne la
              // remplit jamais, même vide, pour ne pas écraser/inventer un en-tête de ligne.
              if (cellIdx === 0) return;
              if (cInfo.isEmpty && !filledCells.has(cInfo.cell)) {
                filledCells.add(cInfo.cell);
                const cellContext = getTableCellContext(cInfo.cell, node);
                const nearbyCtx = recentParagraphs.length > 0 ? ` | Contexte proche: "${recentParagraphs.slice(-2).join(' / ')}"` : '';
                const fd = addField({ type: 'text', kind: 'table', context: `Section: "${currentHeading}" | Tableau: ${cellContext}${nearbyCtx}` });
                let p = findLocalNameChild(cInfo.cell, 'p') || getElementsWithLocalName(cInfo.cell, 'p')[0];
                if (!p) { p = xmlDoc.createElementNS(WNS, 'w:p'); cInfo.cell.appendChild(p); }
                const r = xmlDoc.createElementNS(WNS, 'w:r');
                const t = xmlDoc.createElementNS(WNS, 'w:t');
                t.textContent = `[CHAMP_${fd.id}]`;
                r.appendChild(t); p.appendChild(r);
              }
            });
          }
        }

        // ── B. Paragraphes ──
        if (localName === 'p') {
          const parentCell = getParentWithLocalName(node, 'tc');
          if (!(parentCell && filledCells.has(parentCell))) {
            const fullText = getElementText(node).trim();

            // Cases à cocher de FORMULAIRE (legacy w:checkBox / Wingdings sym / w14) — détection
            // ORDONNÉE avec libellé PROPRE à chaque case : le texte qui SUIT la case (jusqu'à la
            // suivante) = SON option ; le texte avant la 1re case = l'intitulé commun. Sans ça, toutes
            // les cases d'une ligne (« ☐ Oui ☐ Non ») partageaient le même contexte → coche au hasard.
            {
              const isFormBox = (n: any): FieldDesc['type'] | null => {
                const ln = n.localName;
                if (ln === 'checkBox') return 'legacy_checkbox';
                if (ln === 'checkbox' && (n.namespaceURI === 'http://schemas.microsoft.com/office/word/2010/wordml' || n.prefix === 'w14')) return 'w14_checkbox';
                if (ln === 'sym') {
                  const font = n.getAttribute('w:font') || n.getAttributeNS('*', 'font');
                  const char = n.getAttribute('w:char') || n.getAttributeNS('*', 'char');
                  if (font === 'Wingdings' && (char === 'F0A8' || char === 'F0FE')) return 'sym_checkbox';
                }
                return null;
              };
              const boxes: Array<{ type: FieldDesc['type']; element: any }> = [];
              const cbLabels: string[] = [];
              let cbPre = '';
              let cbCur = -1;
              const walkCb = (n: any) => {
                if (n.nodeType === 1) {
                  const t = isFormBox(n);
                  if (t) { cbCur++; cbLabels[cbCur] = ''; boxes.push({ type: t, element: n }); return; }
                  if (n.localName === 't') {
                    const txt = n.textContent || '';
                    if (cbCur < 0) cbPre += txt; else cbLabels[cbCur] += txt;
                    return;
                  }
                }
                if (n.childNodes) for (let i = 0; i < n.childNodes.length; i++) walkCb(n.childNodes[i]);
              };
              walkCb(node);
              const pre = cbPre.trim();
              boxes.forEach((b, i) => {
                const label = (cbLabels[i] || '').trim();
                addField({
                  type: b.type, element: b.element, kind: 'checkbox',
                  context: `Section: "${currentHeading}" | Case à cocher — option: "${label}"${pre ? ` | Intitulé: "${pre}"` : ''}`
                });
              });
            }
            if (/☐|\[\s*\]|\(\s*\)/.test(fullText)) {
              // Libellé PROPRE à chaque case : on découpe le paragraphe sur les marqueurs de case.
              // Le texte AVANT la 1re case = l'intitulé commun ; le texte APRÈS chaque case (jusqu'à
              // la suivante) = SON option. Sans ça, toutes les cases d'une ligne (« ☐ Oui ☐ Non »)
              // partageaient le même contexte → le modèle cochait au hasard.
              const boxSplit = fullText.split(/☐|\[\s*\]|\(\s*\)/);
              const cbPreamble = (boxSplit[0] || '').trim();
              const cbOptions = boxSplit.slice(1).map((s: string) => s.replace(/\[CHAMP_\d+\]/g, '').trim());
              let boxSeq = 0;
              getElementsWithLocalName(node, 't').forEach((tEl: any) => {
                const text = tEl.textContent || '';
                const regex = /☐|\[\s*\]|\(\s*\)/g;
                let match; let out = text; let replaced = false;
                while ((match = regex.exec(text)) !== null) {
                  const label = cbOptions[boxSeq] || '';
                  boxSeq++;
                  const ctx = `Section: "${currentHeading}" | Case à cocher — option: "${label}"${cbPreamble ? ` | Intitulé: "${cbPreamble}"` : ''}`;
                  const fd = addField({ type: 'text', kind: 'checkbox', context: ctx });
                  out = out.replace(match[0], `[CHAMP_${fd.id}]`); replaced = true;
                }
                if (replaced) tEl.textContent = out;
              });
            }

            // Zones de réponse : pointillés ou paragraphe vide → coalescence
            const dotted = hasDottedRun(fullText) || getElementsWithLocalName(node, 't').some((t: any) => isDottedOnly(t.textContent || ''));
            if (dotted) {
              const inlineLabel = stripDots(fullText);
              if (openAnswerField && inlineLabel === '') {
                // ligne de pointillés qui prolonge la zone ouverte
                placeOrClearDotted(node, null);
                openAnswerField.lineCount = (openAnswerField.lineCount || 1) + 1;
              } else {
                const ctxLabel = inlineLabel || lastQuestionText || recentParagraphs.slice(-1)[0] || '';
                const nearby = recentParagraphs.length ? ` | Contexte: "${recentParagraphs.slice(-2).join(' / ')}"` : '';
                const fd = addField({ type: 'text', kind: 'answer', lineCount: 1, context: `Section: "${currentHeading}" | Question: "${ctxLabel}"${nearby}` });
                placeOrClearDotted(node, fd.id);
                openAnswerField = fd;
                if (!inlineLabel) lastQuestionText = ''; // question consommée
              }
            } else if (fullText === '') {
              if (openAnswerField) {
                // ligne blanche au sein d'une zone de réponse en cours
                openAnswerField.lineCount = (openAnswerField.lineCount || 1) + 1;
              } else if (lastQuestionText && lastQuestionText.trimEnd().endsWith(':')) {
                // paragraphe vide juste après un libellé "… :"
                const fd = addField({ type: 'text', kind: 'answer', lineCount: 1, context: `Section: "${currentHeading}" | Question: "${lastQuestionText}"` });
                const r = xmlDoc.createElementNS(WNS, 'w:r');
                const t = xmlDoc.createElementNS(WNS, 'w:t');
                t.textContent = `[CHAMP_${fd.id}]`;
                r.appendChild(t); node.appendChild(r);
                openAnswerField = fd;
                lastQuestionText = '';
              }
            }
          }
        }
      }

      // Recurse
      if (node.childNodes) {
        for (let i = 0; i < node.childNodes.length; i++) walkDOM(node.childNodes[i], nowInDrawing);
      }
    };

    walkDOM(xmlDoc.documentElement, false);

    // Construit le libellé de prompt de chaque champ (hint de format + contexte)
    const buildPrompt = (f: FieldDesc): string => {
      // Les mots-codes de champs de formulaire Word ne doivent pas polluer l'inférence ni le prompt
      const cleanCtx = f.context.replace(/FORM(CHECKBOX|TEXT|DROPDOWN)/gi, ' ').replace(/\s{2,}/g, ' ').trim();
      let hint = inferFieldHint(cleanCtx);
      if (f.kind === 'checkbox') hint = '[CASE A COCHER]';
      // Une zone de réponse étalée sur plusieurs lignes appelle un paragraphe développé,
      // sauf s'il s'agit clairement d'un champ d'identité court.
      if (f.kind === 'answer' && (f.lineCount || 1) >= 3 && !isIdentityCtx(cleanCtx)) hint = '[PARAGRAPHE]';
      const extent = f.kind === 'answer' && (f.lineCount || 1) > 1
        ? ` (zone de ${f.lineCount} lignes — réponse développée attendue)` : '';
      return `Champ [CHAMP_${f.id}] ${hint} : ${cleanCtx}${extent}`;
    };
    const prompts: string[] = descriptors.map(buildPrompt);

    console.log(`[MemoireGenerator] Detected ${prompts.length} fillable fields in document.`);
    if (prompts.length === 0) throw new Error("Aucun champ à remplir détecté dans le template Word.");

    const systemPrompt = `Tu es un rédacteur chevronné de mémoires techniques pour l'entreprise GSS (Global Security Service, ex-GIS), expert des marchés publics de sécurité privée.
On te fournit (1) l'ANALYSE stratégique et opérationnelle du marché issue du DCE (client, sites, exigences, rapport de visite de Sacha, arguments différenciants de GSS, problématiques terrain anticipées), (2) la DOCUMENTATION GSS (moyens, procédures, organisation, formations… — connaissances internes), (3) les RÉFÉRENTS GSS (dossier « Personnes ») et (4) une liste de champs [CHAMP_X] repérés dans le cadre de réponse de l'acheteur. Tu rédiges la valeur à insérer dans chacun.

SOURCES À EXPLOITER (impératif) : pour CHAQUE champ, appuie-toi sur le DCE (ce que l'acheteur exige) ET sur la Documentation GSS (ce que GSS sait/fait pour y répondre). Pour un champ demandant un interlocuteur/référent/encadrant/contact, utilise les RÉFÉRENTS GSS (« Personnes »). AVANT de répondre, cherche réellement l'information dans CHAQUE bloc source fourni ci-dessous (EXTRAIT DU DCE PERTINENT, DOCUMENTATION GSS PERTINENTE *et* la liste « Autres catégories Doc GSS », RÉFÉRENTS GSS) : l'information y est souvent enfouie plus loin. N'écris EXACTEMENT "[À COMPLÉTER]" (plutôt que d'inventer) QUE si — et seulement si — après cette recherche l'information n'est présente NI dans le DCE, NI dans la Documentation GSS, NI dans les Référents.

══════════════════════════════════════
RÈGLE N°0 — QUI EST QUI (NE JAMAIS CONFONDRE)
══════════════════════════════════════
- LE CANDIDAT / SOUMISSIONNAIRE / "l'entreprise qui exécutera le marché" = GSS (Global Security Service). C'est TOI.
- L'ACHETEUR / CLIENT = l'organisme qui passe le marché (le clientName de l'analyse). Ce N'EST PAS le candidat.
- "Dénomination du candidat" = "GSS - Global Security Service" (JAMAIS le nom de l'acheteur).

══════════════════════════════════════
RÈGLE N°1 — FORMAT DE RÉPONSE (selon le tag de chaque champ)
══════════════════════════════════════
[VALEUR COURTE]   → 1 à 6 mots, valeur brute factuelle (ex: "93 ETP", "Site principal", "Oui"). Pas de phrase d'intro.
[LISTE]           → items séparés par "- " et un saut de ligne (ex: "- CQP APS\n- SSIAP 1").
[PARAGRAPHE]      → paragraphe dense, technique et engageant (5 à 9 phrases développées) qui VEND GSS. Jamais de réponse paresseuse ("Conforme", "Disponible", "Oui"), jamais de généralité interchangeable. Chaque paragraphe doit suivre une logique STRATÉGIQUE : (1) nomme l'enjeu/risque PRÉCIS du client (issu de l'analyse, du CCTP ou de la visite terrain), (2) propose la réponse GSS DIFFÉRENCIANTE qui y répond (un moyen, une méthode, un engagement concret — pas un slogan), (3) explicite le BÉNÉFICE mesurable pour le client. Le lecteur doit sentir que GSS a compris SON enjeu, pas récité un argumentaire générique.
[CASE A COCHER]   → UNIQUEMENT "☑" (GSS se conforme à 100%) ou "☐".
JAMAIS de markdown (pas de **gras**, pas de #). Sauts de ligne et tirets simples uniquement.

══════════════════════════════════════
RÈGLE N°2 — PERSONNALISATION (ce qui fait gagner)
══════════════════════════════════════
- Utilise le nom exact du client, des sites et le contexte de l'analyse pour un texte totalement sur-mesure.
- Exploite les observations de la visite terrain (visitDetails) pour prouver notre connaissance du site.
- Intègre les "proposalStrengths" et les "anticipatedIssues" (avec leur solution GSS) au cœur des [PARAGRAPHE], pour montrer que GSS anticipe des risques non formulés dans le CCTP.
- Décris concrètement : organisation, contrôle CNAPS, gestion des plannings, rondes/pointeaux NFC, PTI/DATI, gestion des alarmes, remplacement d'agents.
- VRAI AVANTAGE : ne te contente pas de "nous assurons X" — formule à chaque fois en quoi la manière GSS de faire X est SUPÉRIEURE (délai chiffré, taux de couverture, redondance, anticipation d'un risque que le concurrent ignore) et ce que le client y gagne concrètement.

══════════════════════════════════════
RÈGLE N°3 — DONNÉES LÉGALES : NE JAMAIS INVENTER
══════════════════════════════════════
Pour tout champ d'identité légale (SIRET, N° CNAPS, NOM du dirigeant, n° d'agrément dirigeant, dates
d'obtention/validité, n° de certification, adresses, coordonnées/téléphone/email) ou tout nom de référent :
n'utilise QUE des valeurs présentes dans l'analyse/DCE, la Documentation GSS ou les Référents GSS
(« Personnes »). Sinon écris EXACTEMENT "[À COMPLÉTER]" (rien d'autre, pas de nom inventé type
"Jean Dupont"). N'invente JAMAIS un nom, un numéro, une date, une adresse ou un contact.
ATTENTION SPÉCIFIQUE AUX COORDONNÉES : les RÉFÉRENTS GSS (« Personnes ») ne contiennent QUE des noms
et des rôles — AUCUN téléphone, AUCUN email, AUCUNE adresse. Donc pour tout numéro de téléphone, email
ou adresse postale qui n'est pas EXPLICITEMENT écrit dans les sources : écris "[À COMPLÉTER]". N'invente
JAMAIS "01 23 45 67 89", "prenom.nom@gss.fr" ni une adresse type "123 Rue de la Sécurité, 75000 Paris".
Pour un champ « coordonnées de l'interlocuteur », réponds le nom + rôle réel du référent puis
"[À COMPLÉTER]" pour le téléphone/email (ex : "MARCHANI Adil, Directeur d'agence — tél/email : [À COMPLÉTER]").

══════════════════════════════════════
RÈGLE N°4 — CADRE RÉGLEMENTAIRE ET SOLUTIONS GSS SPÉCIFIQUES
══════════════════════════════════════
${(() => {
        const mt = detectMarketType(analysisData);
        const sec = detectClientSector(analysisData);
        if (mt === 'public') return `Ce marché est un MARCHÉ PUBLIC (secteur : ${sec}).
- Respecte le vocabulaire du Code de la commande publique : pouvoir adjudicateur, acheteur, titulaire, sous-critères.
- Cite les articles pertinents du CCP et du CCAG-FCS quand approprié.
- Mets en avant les garanties de conformité, les mécanismes de contrôle (pénalités contractuelles, réunions périodiques, rapports de suivi formalisés).
- Souligne l'expérience de GSS auprès d'établissements publics similaires.
- Intègre les obligations de transparence (plannings transmis, CVs anonymisés, extranet).`;
        return `Ce marché est un MARCHÉ PRIVÉ (secteur : ${sec}).
- Adopte un ton commercial plus direct et orienté résultats.
- Mets en avant la flexibilité, la réactivité et les SLA sur mesure.
- Souligne l'adaptation aux process internes et à la culture du client.
- Propose des engagements chiffrés (délais de remplacement, taux de couverture, KPIs personnalisés).
- Mentionne la possibilité de co-construction du dispositif avec le client.`;
      })()}

FORMAT DE RÉPONSE : JSON valide uniquement → {"replacements": [ {"id": 1, "value": "..."} ]}`;

    // Valeurs renvoyées par l'IA (une par champ [CHAMP_n]).
    const replacements: Array<{ id: number; value: string }> = [];

    /** Exécute des tâches avec une concurrence limitée (protège la limite TPM). */
    const runPool = async (jobs: Array<() => Promise<void>>, limit: number): Promise<void> => {
      let idx = 0;
      const worker = async () => { while (idx < jobs.length) { const j = jobs[idx++]; await j(); } };
      await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
    };

    // ── Remplissage QUESTION PAR QUESTION (recherche sémantique + 1 appel IA par champ) ──
    // Chaque champ [CHAMP_n] est traité INDIVIDUELLEMENT : on recherche dans la Documentation GSS
    // et le DCE (index d'embeddings) les passages réellement pertinents pour CE champ, puis on fait
    // UN appel IA dédié pour rédiger sa valeur. Plus de blob générique partagé par 20 champs :
    // chaque réponse est ancrée dans les bonnes sources (« fouiller là où il faut »).
    const retrievalChunks = this.buildRetrievalChunks(gssDocs, dceContext);
    // Chunks Doc GSS pré-embeddés en base (si MEMOIRE_RAG_FROM_DB=true) : on évite de recalculer
    // leurs embeddings à chaque génération. Le DCE (propre au marché) reste embeddé à la volée.
    const dbGss = await this.loadGssChunksFromDb();
    if (dbGss && dbGss.length) {
      const dceChunks = retrievalChunks.filter(c => c.source === 'DCE');
      await this.embedChunks(dceChunks);              // seul le DCE est embeddé en direct
      retrievalChunks.length = 0;
      retrievalChunks.push(...dbGss, ...dceChunks);    // GSS depuis la bdd + DCE frais
      console.log(`[MemoireGenerator] Doc GSS chargée depuis la bdd (${dbGss.length} chunks pré-embeddés).`);
    } else {
      await this.embedChunks(retrievalChunks);         // comportement historique (repli)
    }
    const gssN = retrievalChunks.filter(c => ['GSS', 'WEB', 'SOLLICITATION'].includes(c.source) && c.embedding).length;
    const dceN = retrievalChunks.filter(c => c.source === 'DCE' && c.embedding).length;
    console.log(`[MemoireGenerator] Index sémantique : ${gssN} chunks Doc GSS + ${dceN} chunks DCE.`);
    setProgress(dossierId, { phase: 'preparation', pct: 24, label: 'Indexation des sources (DCE + Doc GSS)…' });
    if (onProgress) onProgress(24, 'Indexation des sources (DCE + Doc GSS)…');

    // Embeddings de TOUTES les requêtes de champ en un lot → la récupération devient du calcul local.
    const queryEmbs = await this.embedTexts(descriptors.map(d => this.buildFieldQuery(d)));
    const queryEmbById = new Map<number, number[]>();
    descriptors.forEach((d, i) => queryEmbById.set(d.id, queryEmbs[i]));

    const strategicCtx = buildStrategicContext('', analysisData);

    // ── Référents par RÔLE (fichier « Personnes » : « NOM Prénom — Rôle1 / Rôle2 ») ──
    // Demande utilisateur : dès qu'un libellé nomme un RÔLE connu (« responsable qualité » →
    // VATTIER Marie, « directeur d'agence » → MARCHANI Adil…), on place LE bon référent de façon
    // DÉTERMINISTE (sans laisser le modèle choisir / inventer).
    const referentRoles: Array<{ name: string; role: string; roleNorm: string }> = [];
    for (const line of referentsContext.split(/\r?\n/)) {
      const m = line.match(/^\s*(.+?)\s+[—–-]\s+(.+?)\s*$/);
      if (!m) continue;
      for (const role of m[2].split('/')) {
        const r = role.trim();
        const rn = normCtx(r);
        if (rn.length >= 8) referentRoles.push({ name: m[1].trim(), role: r, roleNorm: rn });
      }
    }
    referentRoles.sort((a, b) => b.roleNorm.length - a.roleNorm.length);  // rôle le plus spécifique d'abord
    /** Si le libellé mentionne un RÔLE connu d'un référent → « NOM — Rôle », sinon ''. */
    const referentForLabel = (label: string): string => {
      const n = normCtx(label);
      for (const { name, role, roleNorm } of referentRoles) if (n.includes(roleNorm)) return `${name} — ${role}`;
      return '';
    };

    /** Traite UN champ : recherche ciblée des passages pertinents + 1 appel IA dédié. */
    const answerField = async (f: FieldDesc): Promise<void> => {
      const qEmb = queryEmbById.get(f.id);
      const top = qEmb ? this.retrieve(qEmb, retrievalChunks, 12, this.buildFieldQuery(f)) : [];
      const gssPassages = top.filter(c => ['GSS', 'WEB', 'SOLLICITATION'].includes(c.source));
      const dcePassages = top.filter(c => c.source === 'DCE');
      const fmtBlock = (title: string, cs: RetrievalChunk[]) => cs.length
        ? `\n--- ${title} ---\n` + cs.map((c, i) => `[${c.label} #${i + 1}]\n${c.text}`).join('\n\n') + '\n' : '';
      // Champ qui demande EXPLICITEMENT une personne/contact. On se base sur la QUESTION du champ,
      // pas sur tout le contexte : sinon le simple mot « responsable » d'un titre de section
      // (« Plan qualité interne – responsable qualité ») fait recopier le nom du référent dans TOUS
      // les champs de la section. Les référents ne sont injectés que pour ces champs-là.
      const qRaw = (f.context.match(/Question:\s*"([^"]*)"/) || [])[1] || '';
      const ctxNear = (f.context.match(/Contexte(?: proche)?:\s*"([^"]*)"/) || [])[1] || '';
      const qEmpty = qRaw.replace(/[\s.:;,…\-—–/|()]+/g, '').length === 0;
      // Zone « …… » sans question propre : pour COMPRENDRE ce qu'il faut écrire, on lit le LIBELLÉ qui
      // la précède dans le document (dernier segment du contexte proche). C'est ce libellé qu'on cherche
      // à remplir.
      const precedingLabel = ctxNear.split('/').map(s => s.trim()).filter(Boolean).pop() || '';
      const fieldAsk = ((qEmpty ? precedingLabel : qRaw) || qRaw || precedingLabel).trim();
      // isReferent reste basé sur la VRAIE question (qRaw) — PAS sur le libellé précédent : sinon le
      // nom du référent (« VATTIER Marie ») se réinjecterait dans toutes les lignes « …… » d'une
      // section « responsable qualité » (le flood qu'on a corrigé). On l'injecte là où une personne
      // est explicitement demandée par le libellé propre du champ.
      // On n'injecte un RÉFÉRENT que si le champ DEMANDE EXPLICITEMENT une personne (nom, coordonnées,
      // interlocuteur, contact…). Le simple mot « responsable/directeur » dans un libellé de PROCESS
      // (« responsable qualité », « contrôles par le responsable… ») ne suffit PAS — sinon le nom du
      // référent se retrouve injecté dans des lignes qui n'ont rien à voir (ex. « Certification ISO »).
      const isReferent = /\b(nom|noms|coordonn[ée]es|interlocuteur|personne[s]?\s*(?:à|a)?\s*contacter|courriel|t[ée]l[ée]phone|\bmail\b|\bcontact\b|r[ée]f[ée]rent)\b/i.test(qRaw);
      const hint = buildPrompt(f);
      const isParagraph = hint.includes('[PARAGRAPHE]');

      // CASE À COCHER : on lit l'OPTION propre à la case (texte qui la suit) + l'intitulé commun, pour
      // décider case par case — et ne JAMAIS cocher au hasard.
      const isCheckbox = f.kind === 'checkbox';
      const cbOpt = (f.context.match(/option:\s*"([^"]*)"/) || [])[1] || '';
      const cbInt = (f.context.match(/Intitul[ée]:\s*"([^"]*)"/) || [])[1] || '';

      // Cellule de TABLEAU : on lit la COLONNE (à quel site/département/lot se rapporte la cellule)
      // ET la LIGNE (la nature de l'info demandée) pour répondre à l'INTERSECTION précise — une cellule
      // à la fois, sans recopier la valeur d'une autre colonne.
      const colCell = (f.context.match(/Colonne:\s*"([^"]*)"/) || [])[1] || '';
      const rowCell = (f.context.match(/Ligne:\s*"([^"]*)"/) || [])[1] || '';
      const isTableCell = f.kind === 'table' || /\|\s*Tableau:/.test(f.context);
      // Colonne SITE correspondante dans le DCE : on n'injectera QUE ses données (anti-mélange de colonnes).
      const colTokens = headerTokens(colCell);
      const matchedSiteCol = colTokens.length
        ? this.lastDceSiteCols.find((sc) => sc.tokens.some((t) => colTokens.includes(t)))
        : undefined;

      // Mode B : on NE court-circuite PAS l'IA — elle reformate la cellule pour la lisibilité, mais
      // UNIQUEMENT à partir de la colonne source du site (injectée dans tableGuidance) → pas de mélange
      // de colonnes ; l'invention reste bloquée par les garde-fous (nombres ≥3 non sourcés, nature de
      // ligne, déduplication). (Le remplissage verbatim déterministe reste dispo via siteCellVerbatim.)
      const tableGuidance = (isTableCell && (colCell || rowCell))
        ? `Tu remplis UNE seule cellule de tableau, à l'INTERSECTION de la colonne « ${colCell || '(sans en-tête)'} » et de la ligne « ${rowCell || '(sans libellé)'} ».
(1) Identifie ce que demande la LIGNE (nombre d'agents, horaire, délai, taux…). (2) Repère le site / département / lot de la COLONNE — MÊME s'il est nommé un peu différemment dans les sources : « Campus Pasteur (UFR DESP) » ↔ « Pasteur », « Campus Evreux Tilly-Navarre » ↔ « Evreux » / « lot 2 », « Mont-Saint-Aignan + INSPE » ↔ « Mont Saint Aignan ». (3) Cherche dans les extraits (DCE — surtout l'annexe effectifs/horaires des postes — et Doc GSS) l'information PROPRE À CE SITE pour cette ligne.
RESPECTE LA NATURE DE LA LIGNE (impératif) : réponds UNIQUEMENT avec le TYPE d'information que demande la ligne « ${rowCell || ''} ». Le tableau source a PLUSIEURS lignes par site (nombre d'agents, horaires, volume horaire, période de fermeture…) : ne prends QUE la ligne correspondante. Si la ligne porte sur les MOYENS / EFFECTIFS humains (« moyens humains dédiés », « nombre d'agents »), donne SEULEMENT le nombre et le type d'agents (ex. « 1 chef de poste + 1 agent le matin + 1 agent l'après-midi ») et N'INCLUS PAS les horaires/plages ni les jours (« 09h00-12h30 », « du lundi au vendredi ») — ils appartiennent à la ligne « HORAIRES », pas ici. Inversement, une ligne « horaires » ne reçoit QUE des horaires. NE MÉLANGE JAMAIS les lignes du tableau source.
REMPLIS dès qu'une information existe pour ce site, même formulée autrement ou seulement PARTIELLE (ex. juste le nombre d'agents, ou juste l'horaire) : une réponse partielle FONDÉE sur la source vaut mieux qu'une case vide.
FIDÉLITÉ LITTÉRALE (impératif — QUE du vrai, vérifié) : reprends la formulation de la source TELLE QUELLE (ex. « 1 agent le matin, 1 agent l'après-midi »). N'ADDITIONNE pas et ne convertis pas en « X agents » (si la source dit « 1 agent le matin, 1 agent l'après-midi », n'écris PAS « 2 agents »). N'ARRONDIS pas, ne déduis pas un total. N'AJOUTE AUCUN créneau, horaire ni jour (samedi, soir, renfort, nuit, « 9h00-12h30 », « lundi au samedi »…) qui n'est PAS explicitement écrit dans la cellule source de ce site.
NE COMBLE JAMAIS UN BLANC DE LA SOURCE : si une mention est laissée VIDE dans le DCE (ex. « indice minimum : » suivi de RIEN), n'invente AUCUNE valeur (pas de « 170 », « 160 », ni aucun chiffre/indice/horaire non écrit) — omets la mention ou écris-la sans valeur. Tout nombre que tu écris (indice, horaire, effectif) doit figurer LITTÉRALEMENT dans la source de CE site ; sinon ne l'écris pas.
INTERDITS : recopier la valeur d'une AUTRE colonne/site ; inventer une donnée factice ; réutiliser un nombre qui parle d'autre chose (ex. la pénalité « retard d'ouverture 15 min », le « 12 heures » des agents supplémentaires) pour un délai d'intervention. N'écris "[À COMPLÉTER]" QUE si AUCUNE information sur CE site pour cette ligne n'existe dans les sources.${matchedSiteCol ? `\n\nDONNÉES DU SITE « ${colCell} » UNIQUEMENT (extrait du DCE — n'utilise QUE ces lignes, et SEULEMENT celle qui correspond à la ligne demandée) :\n${matchedSiteCol.block.slice(0, 2500)}` : (this.lastDceTables.trim() ? `\n\nTABLEAUX DU DCE (chaque cellule est étiquetée « ligne — en-tête de colonne: valeur » ; CHERCHE ICI en priorité la valeur propre à ce site) :\n${this.lastDceTables.slice(0, 6000)}` : '')}`
        : '';

      // RÔLE NOMMÉ → RÉFÉRENT déterministe : UNIQUEMENT si le champ demande explicitement une personne
      // (isReferent) ET que sa PROPRE question (qRaw, pas un libellé voisin) nomme un rôle connu
      // (« coordonnées du responsable qualité » → VATTIER). On NE déclenche PAS sur un « responsable »
      // d'un libellé de process voisin (évite « VATTIER » sous « Certification ISO/APSAD »).
      const refMatch = isReferent ? referentForLabel(qRaw) : '';
      if (refMatch && !isParagraph) { replacements.push({ id: f.id, value: refMatch }); return; }

      // IDENTITÉ CANDIDAT connue → valeur DÉTERMINISTE : dénomination, N° CNAPS, date d'autorisation
      // sont des données stables de GSS (cf. GSS_IDENTITE) ; on les place sans appel IA ni risque
      // d'inventer/de répondre « [À COMPLÉTER] ». (Pas pour un [PARAGRAPHE] : on laisse rédiger.)
      const idMatch = identiteCandidatForLabel(fieldAsk);
      if (idMatch && !isParagraph) { replacements.push({ id: f.id, value: idMatch }); return; }

      // Identité d'une PERSONNE DIRIGEANTE (nom du dirigeant + n° d'agrément dirigeant CNAPS) :
      // ABSENTE de nos sources (le fichier « Personnes » liste des RÔLES d'exploitation, pas le
      // dirigeant légal ; et l'agrément dirigeant ≠ l'autorisation de l'entreprise). → [À COMPLÉTER]
      // DÉTERMINISTE : on empêche le modèle d'y coller un référent + le n° d'autorisation entreprise
      // (= invention que les garde-fous ne rattrapent pas, ce n° étant par ailleurs « sourcé »).
      if (!isParagraph && /\b(dirigeant|g[ée]rant|repr[ée]sentant l[ée]gal)\b/.test(normCtx(fieldAsk))) {
        replacements.push({ id: f.id, value: '[À COMPLÉTER]' }); return;
      }


      // EFFECTIF TOTAL de l'entreprise / en France → somme DÉTERMINISTE de toutes les catégories
      // (EFFECTIFS MOYENS.pdf). On EXCLUT les variantes par département / par site / dédiées au
      // marché (inconnues → [À COMPLÉTER]), pour ne pas y coller le total entreprise.
      const nqEff = normCtx(fieldAsk);
      if (!isParagraph && effectifTotal) {
        const isTotalFrance = /effectif/.test(nqEff) && /total/.test(nqEff)
          && /(entreprise|france|national)/.test(nqEff)
          && !/(departement|\b76\b|\b27\b|\bsite\b|dedie|au marche|par poste)/.test(nqEff);
        if (isTotalFrance) { replacements.push({ id: f.id, value: `${effectifTotal.total} agents` }); return; }
      }
      // Effectif / agents / ETP DÉDIÉS au marché : le dimensionnement propre à CE marché n'est PAS
      // déterminable de façon fiable (l'Annexe 1 du DCE donne des postes/horaires non agrégeables
      // proprement) → [À COMPLÉTER] DÉTERMINISTE, plutôt que d'y coller l'effectif ENTREPRISE (ex. 93)
      // ou un ETP deviné. (Le vrai dédié relève du chiffrage de l'offre → validation humaine.)
      if (!isParagraph && /(effectif|agents?|\betp\b)/.test(nqEff) && /(dedie|au marche|affecte au marche)/.test(nqEff)) {
        replacements.push({ id: f.id, value: '[À COMPLÉTER]' }); return;
      }

      // Champ d'IDENTITÉ / LÉGAL / CONTACT : valeur qui ne peut PAS se déduire, elle doit exister
      // telle quelle dans les sources (nom de personne, SIRET/SIREN, CNAPS, agrément, certification,
      // date, adresse, siège, téléphone, email). On y applique la règle stricte « verbatim ou rien ».
      const isStrictId = /siret|siren|\bcnaps\b|agr[ée]ment|autorisation|certification|kbis|\bdate\b|adresse|si[èe]ge|d[ée]nomination|raison sociale|t[ée]l[ée]phone|\btel\b|email|\bmail\b|courriel|coordonn[ée]es/i.test(f.context)
        || isReferent;

      // Consigne adaptée au TYPE de champ — 3 niveaux :
      //  1) [PARAGRAPHE] → argumentaire sur-mesure qui vend GSS (ce qui marche déjà bien) ;
      //  2) champ COURT FACTUEL non-identité (effectif, taux, qualification, conformité, délai…) →
      //     réponse BRÈVE, synthétisée À PARTIR des sources (on autorise le calcul/synthèse) ;
      //  3) champ d'IDENTITÉ/LÉGAL/CONTACT → « verbatim ou [À COMPLÉTER] » : PAS DE DONNÉE INVENTÉE.
      const instruction = isCheckbox
        ? `Cette CASE À COCHER correspond à l'option « ${cbOpt || '(option non identifiée)'} »${cbInt ? ` (intitulé : « ${cbInt} »)` : ''}.
LIS bien le libellé de CETTE option et décide pour ELLE SEULE. Principe : COCHE CE QUE TU SAIS, ne coche PAS ce que tu ignores.
- Réponds "☑" si les extraits (DCE ou Documentation GSS) montrent que CETTE option est VRAIE / que GSS la fait, la propose ou la détient — autrement dit si tu SAIS qu'elle s'applique (ex. un engagement, un moyen, une procédure que la Doc GSS décrit). Si tu connais/fournis le contenu de cette option, alors COCHE-la : ne rédige pas le contenu en laissant la case vide.
- Réponds "☐" si l'option est FAUSSE pour GSS, ou si tu ne SAIS pas (information absente/incertaine, donnée que GSS ne maîtrise pas comme un statut PME, un lot non décidé…). Ne coche jamais au hasard ni « parce que ça paraît logique ».
Réponds STRICTEMENT "☑" ou "☐", rien d'autre.`
        : isParagraph
          ? `Rédige un paragraphe dense, technique et personnalisé qui répond à l'attente de l'acheteur et met en avant la valeur de GSS, en t'appuyant UNIQUEMENT sur les extraits ci-dessus.
STRATÉGIE & ATTRACTIVITÉ : le paragraphe doit faire comprendre CE QUE GSS APPORTE au client — sa valeur ajoutée et son engagement. Structure-le : (1) l'enjeu/risque concret du marché, (2) la réponse GSS DIFFÉRENCIANTE (un moyen, une méthode ou un engagement précis tiré des extraits — pas un slogan), (3) le bénéfice tangible pour le client (fiabilité, réactivité, continuité, expertise, accompagnement). Ton commercial, affirmé et rassurant : on doit avoir envie de choisir GSS. Évite le descriptif plat « nous faisons X » → montre EN QUOI la manière GSS est supérieure et ce que le client y gagne.
PERSONNALISATION & STRATÉGIE (priorité) : ancre le propos dans le CONTEXTE RÉEL du marché (type d'organisation, usagers, sites/campus concernés, départements, calendrier d'activité, fréquentation, contraintes et RISQUES propres) et METS EN AVANT UN AVANTAGE concret de GSS adapté à CE contexte — ce que le client GAGNE (fiabilité, réactivité, continuité de service, expertise, anticipation d'un risque). Choisis l'angle le plus PERTINENT pour le sujet du champ ; le texte doit être impossible à recycler pour un autre client.
NOM DU CLIENT — ANTI-REDONDANCE (impératif) : cite le nom complet de l'acheteur AU PLUS UNE FOIS dans le paragraphe (souvent inutile de le citer du tout). Pour toute autre référence, VARIE avec des substituts (« l'établissement », « vos campus », « le site concerné », « votre organisation », « ce marché »). NE répète JAMAIS « Université de Rouen Normandie » plusieurs fois dans le même paragraphe et ne le colle pas en fin de paragraphe. La personnalisation passe par le CONTEXTE et les ENJEUX, pas par la répétition du nom.
INTERDICTION D'INVENTER (PRIORITAIRE) : n'affirme AUCUN fait, chiffre ou détail précis absent des extraits. Proscrits s'ils ne figurent pas littéralement dans les sources : un délai chiffré (« 60 minutes », « moins d'une heure »), un effectif, un taux, une distance, un équipement précis (ex. « gilets pare-lame », « gants anti-feu »), un lieu précis (ex. véhicule stationné à tel campus), un nom, une date, un numéro. Décris la MÉTHODE et l'organisation de GSS de façon qualitative et reste VAGUE là où la source l'est (ex. « un agent d'astreinte est mobilisé » sans inventer de durée). Mieux vaut une formulation générale EXACTE qu'un détail précis INVENTÉ. Tu peux réutiliser les chiffres réellement présents dans les extraits (ex. recyclage SSIAP tous les 3 ans, préavis d'absence de 24h).
ANTI-ÉCHO DE LA QUESTION : si la QUESTION de l'acheteur mentionne un équipement, une certification, un moyen ou une prestation (ex. « gilets pare-lame / pare-balle », un logiciel, une norme), NE confirme PAS que GSS le fournit/le détient au seul motif que la question le cite — ne l'affirme QUE si un extrait de la Documentation GSS l'atteste explicitement. Sinon, n'en parle pas (ou reste sur ce que GSS documente réellement). Ne transforme jamais la demande de l'acheteur en capacité GSS non sourcée.`
          : isStrictId
            ? `Ce champ attend une donnée d'IDENTITÉ/LÉGALE/CONTACT précise. Donne UNIQUEMENT la valeur — aucune phrase, aucun argumentaire.
RÈGLE ABSOLUE — AUCUNE DONNÉE INVENTÉE : la valeur (nom de personne, date, n° SIRET/SIREN, n° CNAPS, agrément, certification, adresse, téléphone, email) doit figurer EXPLICITEMENT dans les extraits ci-dessus (DCE, Documentation GSS ou Référents). Sinon écris EXACTEMENT "[À COMPLÉTER]" et RIEN d'autre. N'invente JAMAIS, ne déduis JAMAIS et n'utilise JAMAIS d'exemple générique (proscrits : "Jean Dupont", "01/01/2020", "01 23 45 67 89", "prenom.nom@gss.fr", un SIRET au hasard). En cas de doute → "[À COMPLÉTER]".`
            : `Ce champ attend une réponse COURTE et FACTUELLE (quelques mots, une valeur, une liste, ou Oui/Non). Donne UNIQUEMENT la réponse — aucune phrase, aucun argumentaire.
RÈGLE DE FIABILITÉ (PRIORITAIRE) — deux faces indissociables :
1) Si l'information figure dans les extraits ci-dessus, tu DOIS la donner : ne réponds JAMAIS "[À COMPLÉTER]" par excès de prudence quand la donnée EST présente (lis bien CHAQUE extrait, l'info y est parfois enfouie : un effectif, une qualification, un délai, un nom de certification, un outil…).
2) Si l'information n'y figure PAS, écris EXACTEMENT "[À COMPLÉTER]". Mieux vaut une case vide qu'une donnée non fiable.
- N'invente, ne déduis, ne calcule ni n'extrapole AUCUNE donnée chiffrée, nominative ou légale (effectif, ETP, taux, délai, nom, date, SIRET, CNAPS, adresse, téléphone, email, montant) absente des sources.
- NE DÉTOURNE PAS une donnée GÉNÉRALE / D'ENTREPRISE pour répondre à une question SPÉCIFIQUE : un effectif TOTAL de l'entreprise (ou national) ne répond PAS à « effectif/agents DÉDIÉS à ce marché », ni « par département », ni « par site ». Si la valeur PROPRE à la question (dédiée au marché, à ce département, à ce site) n'est pas explicitement dans les extraits → "[À COMPLÉTER]".
- NE RECOPIE PAS l'intitulé de la question, ni les libellés des cases à cocher, ni les options proposées, comme si c'était une réponse.
En cas de doute → "[À COMPLÉTER]".`;

      const userPrompt = `Analyse du marché (contexte de rédaction) :
${analysisJson}

--- CONTEXTE STRATÉGIQUE GSS ---
${strategicCtx}
${fmtBlock("EXTRAITS PERTINENTS DU DCE (exigences de l'acheteur)", dcePassages)}${fmtBlock('DOCUMENTATION GSS PERTINENTE (sources internes — appuie ta réponse dessus)', gssPassages)}${isReferent && referentsContext ? `\n--- RÉFÉRENTS GSS (« Personnes ») ---\n${referentsContext}\nLIS BIEN LE LIBELLÉ : s'il demande UNE personne (singulier : « la personne », « l'interlocuteur », « le contact ») → donne EXACTEMENT UN référent, le plus pertinent au regard du libellé (le rôle nommé s'il y en a un ; sinon l'interlocuteur principal du marché). NE recopie PAS toute la liste. Il ne faut PLUSIEURS personnes QUE si le libellé le demande explicitement (« les personnes », « liste », « organigramme »).\n` : ''}
CHAMP UNIQUE À RÉDIGER :
${hint}

${instruction}
${tableGuidance ? tableGuidance + '\n' : ''}${fieldAsk && fieldAsk !== f.context ? `${qEmpty ? `Cette zone à remplir (les pointillés « … ») fait suite, dans le document, au libellé qui la PRÉCÈDE : « ${fieldAsk} ». LIS ce libellé pour comprendre ce qui est attendu et remplis la zone en conséquence.` : `RESTE SUR LE SUJET DE CETTE QUESTION : « ${fieldAsk} ».`} Ne réponds pas sur un thème VOISIN (ex. ne parle pas des moyens d'accès/clés si le sujet est le report des alarmes). Si les extraits apportent une information MÊME PARTIELLE sur CE sujet, donne une réponse (au moins partielle) fondée dessus plutôt que de laisser vide — sans rien inventer. N'écris "[À COMPLÉTER]" QUE si rien d'utile sur ce sujet n'est disponible.\n` : ''}Renvoie UNIQUEMENT un objet JSON : {"id": ${f.id}, "value": "..."}`;

      // Températures basses = fidélité aux sources (priorité « 0 inventé ») : on baisse la rédaction
      // de paragraphe de 0.4 → 0.2 pour limiter les détails « brodés » non sourcés.
      // Cellule de tableau → 0.1 (fidélité littérale max à la source, pas de reformulation/recompte).
      const temperature = isTableCell ? 0.1 : isParagraph ? 0.2 : isStrictId ? 0.1 : 0.2;
      const label = `Champ ${f.id}`;
      const aiResponse = await this.callOpenAI(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        temperature, label, true,
      );
      if (aiResponse === null) return;
      try {
        const data = JSON.parse(aiResponse || '{}');
        const value = data.value ?? (Array.isArray(data.replacements) ? data.replacements[0]?.value : undefined);
        if (value !== undefined && value !== null) replacements.push({ id: f.id, value: String(value) });
      } catch (e) {
        console.error(`[MemoireGenerator] ${label}: parse JSON échoué:`, (aiResponse || '').slice(0, 160));
      }
    };

    // ── Regroupement en ZONES de réponse ──
    // Une QUESTION/libellé ouvre une zone ; les lignes « …… » SANS question propre qui suivent en
    // font partie JUSQU'À la prochaine question (ou une case/un tableau, qui cassent la zone). Pour
    // une zone de PLUSIEURS lignes, on génère en UN SEUL appel N éléments DISTINCTS (un par ligne)
    // plutôt que N réponses indépendantes qui se répètent. (Doc order = ordre des id.)
    const qRealOf = (d: FieldDesc): string => {
      const q = (d.context.match(/Question:\s*"([^"]*)"/) || [])[1] || '';
      return q.replace(/[\s.:;,…\-—–/|()]+/g, '').length ? q.trim() : '';
    };
    const precedingLabelOf = (d: FieldDesc): string =>
      ((d.context.match(/Contexte(?: proche)?:\s*"([^"]*)"/) || [])[1] || '')
        .split('/').map(s => s.trim()).filter(Boolean).pop() || '';
    interface AnswerZone { label: string; fields: FieldDesc[]; }
    const zones: AnswerZone[] = [];
    let curZone: AnswerZone | null = null;
    for (const d of descriptors) {
      if (d.kind !== 'answer') { curZone = null; continue; }   // case/tableau → casse la zone
      const qReal = qRealOf(d);
      if (qReal) { curZone = { label: qReal, fields: [d] }; zones.push(curZone); }
      else if (curZone) { curZone.fields.push(d); }            // ligne « …… » → suite de la zone
      else { curZone = { label: precedingLabelOf(d), fields: [d] }; zones.push(curZone); }
    }

    /** Rédige une zone MULTI-lignes en 1 appel : N éléments distincts (un par ligne), lus du libellé. */
    const answerZone = async (zone: AnswerZone): Promise<void> => {
      const primary = zone.fields[0];
      const qEmb = queryEmbById.get(primary.id);
      const top = qEmb ? this.retrieve(qEmb, retrievalChunks, 12, this.buildFieldQuery(primary)) : [];
      const fmtBlock = (title: string, cs: RetrievalChunk[]) => cs.length
        ? `\n--- ${title} ---\n` + cs.map((c, i) => `[${c.label} #${i + 1}]\n${c.text}`).join('\n\n') + '\n' : '';
      const N = zone.fields.length;
      // Référents injectés UNIQUEMENT si la zone demande explicitement une personne (pas un simple
      // « responsable » de libellé de process → évite le flood du nom de référent hors-sujet).
      const isRef = /\b(nom|noms|coordonn[ée]es|interlocuteur|personne[s]?\s*(?:à|a)?\s*contacter|courriel|t[ée]l[ée]phone|\bmail\b|\bcontact\b|r[ée]f[ée]rent)\b/i.test(zone.label);
      const userPrompt = `Analyse du marché (contexte de rédaction) :
${analysisJson}

--- CONTEXTE STRATÉGIQUE GSS ---
${strategicCtx}
${fmtBlock("EXTRAITS PERTINENTS DU DCE (exigences de l'acheteur)", top.filter(c => c.source === 'DCE'))}${fmtBlock('DOCUMENTATION GSS PERTINENTE (sources internes — appuie ta réponse dessus)', top.filter(c => ['GSS', 'WEB', 'SOLLICITATION'].includes(c.source)))}${isRef && referentsContext ? `\n--- RÉFÉRENTS GSS (« Personnes ») ---\n${referentsContext}\n` : ''}
LIBELLÉ / QUESTION À TRAITER : « ${zone.label} »
Sous ce libellé, il y a ${N} ligne(s) à remplir. Donne jusqu'à ${N} éléments de réponse COURTS, DISTINCTS et COMPLÉMENTAIRES (un par ligne), du plus important au moins important, fondés UNIQUEMENT sur les extraits ci-dessus, en restant sur le sujet du libellé. AUCUNE répétition entre les éléments.
RÈGLE DE FIABILITÉ (PRIORITAIRE) : donne TOUS les éléments que les extraits justifient DIRECTEMENT (ne laisse pas de côté une info réellement présente) ; mais ne donne un élément QUE s'il est fondé sur les extraits. N'invente, ne déduis ni n'extrapole aucune donnée (nom, date, SIRET/SIREN, CNAPS, agrément, adresse, téléphone, email, effectif, taux, montant) absente des sources. NE DÉTOURNE PAS une donnée d'entreprise/générale pour une question spécifique (dédié au marché / par site / par département). NE RECOPIE PAS l'intitulé ni les options des cases. Si tu n'as de quoi remplir que k < ${N} lignes (voire 0), ne donne QUE k éléments — ne meuble JAMAIS, mieux vaut vide que non fiable.
Renvoie UNIQUEMENT un objet JSON : {"items": ["ligne 1", "ligne 2", ...]} (au plus ${N} éléments, dans l'ordre).`;
      const aiResponse = await this.callOpenAI(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        0.15, `Zone "${zone.label.slice(0, 30)}" (${N}l)`, true,
      );
      if (aiResponse === null) return;
      try {
        const data = JSON.parse(aiResponse || '{}');
        const items: any[] = Array.isArray(data.items) ? data.items : [];
        zone.fields.forEach((f, i) => {
          const v = items[i];
          if (v !== undefined && v !== null && String(v).trim()) replacements.push({ id: f.id, value: String(v) });
        });
      } catch (e) {
        console.error(`[MemoireGenerator] Zone "${zone.label.slice(0, 30)}": parse JSON échoué:`, (aiResponse || '').slice(0, 160));
      }
    };

    // Aiguillage : zone multi-lignes → answerZone (1 appel, N éléments distincts) ; zone d'1 ligne →
    // answerField (logique 3 niveaux) ; cases/tableaux (hors zones) → answerField individuellement.
    const inZone = new Set(zones.flatMap(z => z.fields.map(f => f.id)));
    const others = descriptors.filter(d => !inZone.has(d.id));
    const jobs: Array<() => Promise<void>> = [
      ...zones.map(z => z.fields.length > 1 ? () => answerZone(z) : () => answerField(z.fields[0])),
      ...others.map(d => () => answerField(d)),
    ];
    console.log(`[MemoireGenerator] Rédaction : ${zones.filter(z => z.fields.length > 1).length} zone(s) multi-lignes + ${jobs.length - zones.filter(z => z.fields.length > 1).length} champ(s) simples...`);
    // Progression CHAMP PAR CHAMP : on emballe chaque job pour faire avancer la barre à mesure que les
    // réponses tombent (la plage 30–90 % couvre tout le remplissage du cadre).
    const totalJobs = jobs.length;
    let doneJobs = 0;
    setProgress(dossierId, { phase: 'redaction', pct: 30, done: 0, total: totalJobs, label: `Remplissage du cadre — 0/${totalJobs} champ(s)…` });
    if (onProgress) onProgress(30, `Remplissage du cadre — 0/${totalJobs} champ(s)…`);
    const tracked = jobs.map((job) => async () => {
      await job();
      doneJobs++;
      const pct = 30 + Math.round(60 * doneJobs / Math.max(1, totalJobs));
      const label = `Remplissage du cadre — ${doneJobs}/${totalJobs} champ(s)…`;
      setProgress(dossierId, { phase: 'redaction', done: doneJobs, total: totalJobs, pct, label });
      if (onProgress) onProgress(pct, label);
    });
    await runPool(tracked, 2);

    // Passe de complétion : rattrape les champs sans valeur (appel ayant échoué).
    const answeredIds = new Set(replacements.map(r => r.id));
    const missing = descriptors.filter(d => !answeredIds.has(d.id));
    if (missing.length > 0) {
      console.log(`[MemoireGenerator] Passe de complétion : ${missing.length} champ(s) manquant(s).`);
      await runPool(missing.map(d => () => answerField(d)), 2);
    }

    console.log(`[MemoireGenerator] GPT a renvoyé ${replacements.length} valeurs au total.`);
    setProgress(dossierId, { phase: 'finalisation', pct: 94, label: 'Application des réponses au cadre…' });
    if (onProgress) onProgress(94, 'Application des réponses au cadre…');

    // ── Garde-fou anti-invention de DONNÉES FACTUELLES (le cœur du « pas de données inventées ») ──
    // Le LLM fabrique volontiers adresses, téléphones, emails, dates, n° SIRET/CNAPS plausibles.
    // On vérifie TOUTE donnée factuelle contre les sources réelles (DCE + Doc GSS + « Personnes ») :
    //  • champ d'IDENTITÉ stricte (SIRET, CNAPS, agrément, date, adresse, certification) → si un
    //    chiffre ou un email n'est pas dans les sources, la valeur entière devient [À COMPLÉTER] ;
    //  • champ de CONTACT (coordonnées, téléphone, email, interlocuteur) → on retire UNIQUEMENT le
    //    téléphone/email inventé (en gardant le nom réel du référent), le reste passe par guardNames.
    // L'identité connue de GSS (dénomination/CNAPS/date) fait partie des sources « réelles » :
    // sans cela, le garde-fou identité retirerait le N° CNAPS (chiffres « non sourcés ») qu'on
    // vient pourtant de poser de façon déterministe.
    const identiteText = `${GSS_IDENTITE.denomination} ${GSS_IDENTITE.numCnaps} ${GSS_IDENTITE.dateAutorisation}`;
    // Le total d'effectif calculé (somme de chiffres réels) est une donnée « sourcée » → on l'ajoute
    // aux sources pour que les garde-fous ne le considèrent pas comme un chiffre inventé.
    const effectifText = effectifTotal ? ` ${effectifTotal.total} ` : '';
    const sourceTextNorm = normCtx(identiteText + effectifText + ' ' + analysisJson + ' ' + dceContext + ' ' + gssDocContext + ' ' + referentsContext);
    const sourceDigits = sourceTextNorm.replace(/\D/g, '');
    const EMAIL_RE = /[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g;
    const PHONE_RE = /\+?\d(?:[\d ().\-]{7,})\d/g;     // n° téléphone (≥9 chiffres espacés/groupés)
    const digitsKnown = (s: string) => { const d = s.replace(/\D/g, ''); return d.length < 3 || sourceDigits.includes(d); };
    const isStrictIdentity = (ctx: string) => /siret|siren|\bcnaps\b|autorisation|agrement|certification|\bdate\b|adresse|siege|kbis/.test(normCtx(ctx));
    const isContactField = (ctx: string) => /coordonnees|telephone|\btel\b|\bemail\b|\bmail\b|courriel|interlocuteur|contact|renseignements/.test(normCtx(ctx));
    const guardFactual = (val: string, ctx: string): string => {
      const nctx = normCtx(ctx);
      // Champ d'identité stricte : toute valeur contenant un chiffre/email non sourcé → [À COMPLÉTER].
      if (isStrictIdentity(nctx)) {
        const emails = val.match(EMAIL_RE) || [];
        const digitRuns = val.match(/\d{3,}/g) || [];
        const invented = emails.some(e => !sourceTextNorm.includes(normCtx(e))) || digitRuns.some(d => !sourceDigits.includes(d));
        if (invented) {
          console.log(`[MemoireGenerator] Garde-fou identité: valeur non sourcée → [À COMPLÉTER] (ctx: ${ctx.slice(0, 60)})`);
          return '[À COMPLÉTER]';
        }
        return val;
      }
      // Champ de contact : on neutralise seulement les téléphones/emails inventés (on garde le nom).
      if (isContactField(nctx)) {
        return val
          .replace(EMAIL_RE, e => sourceTextNorm.includes(normCtx(e)) ? e : '[À COMPLÉTER]')
          .replace(PHONE_RE, p => digitsKnown(p) ? p : '[À COMPLÉTER]');
      }
      return val;
    };

    // ── Garde-fou CERTIFICATIONS DE SERVICE (ISO 9001/14001/45001, APSAD, R31) ──
    // Une certification de SERVICE de l'entreprise ne peut être affirmée que si la DOCUMENTATION GSS
    // l'atteste. Une EXIGENCE du DCE/CCTP (« APSAD R31 attendu », « surveillance certifiée APSAD P2/P3 »)
    // n'est PAS une preuve que GSS la détient → on ne se fie donc PAS aux sources DCE pour ces champs,
    // seulement à la Doc GSS. Si la certification citée n'y figure pas → [À COMPLÉTER] (anti-invention).
    // (Les qualifications d'AGENTS — CQP, SSIAP, SST, HOBO — ne sont pas concernées par ce filtre.)
    const gssDocCompact = normCtx(gssDocContext).replace(/\s+/g, '');
    const SERVICE_CERT_RE = /ISO\s*\d{4,5}|APSAD(?:\s*R?\s*\d+)?|\bR\s?31\b/gi;
    const guardServiceCert = (val: string, _ctx: string): string => {
      // On scanne la VALEUR (pas le contexte) : si elle CITE une certification de service et que la
      // Doc GSS ne l'atteste pas → non prouvée. Champ court → [À COMPLÉTER]. Paragraphe → on RETIRE
      // la mention inventée du texte (on ne laisse plus passer).
      const cited = val.match(SERVICE_CERT_RE) || [];
      if (!cited.length) return val;
      const unproven = cited.filter(c => !gssDocCompact.includes(normCtx(c).replace(/\s+/g, '')));
      if (!unproven.length) return val;
      // Champ court : tout remplacer
      if (val.length <= 200) {
        console.log(`[MemoireGenerator] Garde-fou certif: certification non attestée par la Doc GSS → [À COMPLÉTER] ("${val.slice(0, 60)}")`);
        return '[À COMPLÉTER]';
      }
      // Paragraphe : retirer les phrases contenant la certification inventée
      let cleaned = val;
      for (const cert of unproven) {
        const certEsc = cert.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const sentenceRe = new RegExp(`[^.;\n]*${certEsc}[^.;\n]*[.;]?\\s*`, 'gi');
        cleaned = cleaned.replace(sentenceRe, '');
      }
      console.log(`[MemoireGenerator] Garde-fou certif: ${unproven.length} certification(s) non attestée(s) retirée(s) du paragraphe.`);
      return cleaned.trim() || '[À COMPLÉTER]';
    };

    // ── Garde-fou ANTI-INVENTION de POLITIQUES/MESURES NON SOURCÉES ──
    // L'IA invente régulièrement des politiques sociales (primes, avances sur salaire), des mesures RH,
    // ou présente les pénalités CCAP du client comme une politique qualité de GSS.
    // On vérifie que chaque CLAIM technique figure dans la Doc GSS ; sinon on la retire.
    const INVENTED_CLAIMS_RE = /\b(prime[s]?(?:\s+de\s+fin\s+d.ann[ée]e)?|avance[s]?\s+sur\s+salaire|p[ée]nalit[ée][s]?\s+(?:CCAP|contractuelles?)|heures?\s+suppl[ée]mentaires?\s+mensualis[ée]es?|CCAP)\b/gi;
    const guardInventedClaims = (val: string, _ctx: string): string => {
      const claims = val.match(INVENTED_CLAIMS_RE) || [];
      if (!claims.length) return val;
      // Vérifier chaque claim dans la documentation GSS
      const inventedClaims = claims.filter(c => !gssDocCompact.includes(normCtx(c).replace(/\s+/g, '')));
      if (!inventedClaims.length) return val;
      // Champ court → [À COMPLÉTER]
      if (val.length <= 200) {
        console.log(`[MemoireGenerator] Garde-fou invention: claim non sourcée → [À COMPLÉTER] ("${val.slice(0, 60)}")`);
        return '[À COMPLÉTER]';
      }
      // Paragraphe : retirer les phrases contenant le claim inventé
      let cleaned = val;
      for (const claim of inventedClaims) {
        const claimEsc = claim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const sentenceRe = new RegExp(`[^.;\n]*${claimEsc}[^.;\n]*[.;]?\\s*`, 'gi');
        cleaned = cleaned.replace(sentenceRe, '');
      }
      console.log(`[MemoireGenerator] Garde-fou invention: ${inventedClaims.length} claim(s) non sourcée(s) retirée(s).`);
      return cleaned.trim() || '[À COMPLÉTER]';
    };

    // ── Garde-fou DÉTERMINISTE des CELLULES DE TABLEAU : « 0 inventé » garanti ──
    // Tout nombre de ≥3 chiffres (indice « 170/160 », montant, n°…) présent dans une cellule mais
    // ABSENT du texte source réel (DCE — annexes incluses — + Doc GSS) est RETIRÉ. On vise les ≥3
    // chiffres pour ne pas toucher aux horaires/effectifs courts (« 1 agent », « 07H », « 16h15 »).
    const guardTableNumbers = (val: string): string => {
      if (!/\d{3,}/.test(val)) return val;
      const MARK = ' ';
      let out = val.replace(/\d{3,}/g, (run) => sourceTextNorm.includes(run) ? run : MARK);
      if (!out.includes(MARK)) return val;
      out = out
        .replace(/[,;]?\s*indice\s*(?:minimum|min\.?)?\s*:?\s* /gi, '')  // « indice minimum 170 » → retiré en entier
        .replace(/ /g, '')
        .replace(/\(\s*[,;]*\s*\)/g, '').replace(/\[\s*[,;]*\s*\]/g, '')      // parenthèses/crochets devenus vides
        .replace(/\s+([,.;)\]])/g, '$1').replace(/([(\[])\s+/g, '$1')
        .replace(/[,;]\s*([)\]])/g, '$1').replace(/\s{2,}/g, ' ').trim();
      console.log('[MemoireGenerator] Garde-fou tableau: nombre(s) non sourcé(s) retiré(s).');
      return out;
    };

    // ── Anti-redondance du NOM DU CLIENT (demande utilisateur : pas plusieurs fois sur la même page) ──
    // Dans une même valeur, on garde la 1re occurrence du nom de l'acheteur et on remplace les
    // suivantes par un substitut neutre — la personnalisation passe par le contexte, pas la répétition.
    const clientNameDedup = (analysisData?.clientName || '').trim();
    const clientNameRe = clientNameDedup.length >= 6
      ? new RegExp(clientNameDedup.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g') : null;
    const dedupeClientName = (val: string): string => {
      if (!clientNameRe) return val;
      let n = 0;
      return val.replace(clientNameRe, (m) => (++n === 1 ? m : 'l’établissement'));
    };

    // Garde-fou anti-invention de NOMS de personnes ("c'est qui Jean Dupont ?") : tout nom propre
    // de personne présent dans une valeur générée mais ABSENT des sources réelles (DCE + Doc GSS +
    // fichier « Personnes ») est remplacé par [À COMPLÉTER]. On ne se fie donc PAS au LLM pour les
    // noms : seuls les référents/contacts effectivement présents dans tes données peuvent ressortir.
    const sourceNamesNorm = sourceTextNorm;
    // Sigles/organisations en capitales : ne JAMAIS traiter comme des personnes (sinon faux positifs).
    const NAME_STOPLIST = new Set(['gss', 'gis', 'cctp', 'ccap', 'ccag', 'fcs', 'cnaps', 'apsad', 'ssiap',
      'cqp', 'aps', 'sst', 'dati', 'pti', 'erp', 'icpe', 'zrr', 'rgpd', 'tva', 'siret', 'siren', 'kbis',
      'place', 'aws', 'dc1', 'dc2', 'noti1', 'noti2', 'pca', 'ppms', 'poi', 'rse', 'iso', 'mac', 'nfc',
      'qr', 'sla', 'kpi', 'etp', 'pc', 'gtc']);
    // Mots-indices d'une personne : permettent de repérer un nom même en casse normale ("Pierre Martin").
    const CUE = `(?:M\\.|Mme|Mr\\.?|Monsieur|Madame|Dr\\.?|interlocuteur|responsable|directeur|directrice|contact|r[ée]f[ée]rent|dirigeant|g[ée]rant|pr[ée]sident|pr[ée]sidente|chef|encadrant|nomm[ée]|assur[ée])`;
    // Un nom = 2 mots Capitalisés (l'un peut être en CAPITALES : convention NOM Prénom).
    const NAME = `[A-ZÀ-Ÿ][\\wÀ-ÿ'’-]+\\s+[A-ZÀ-Ÿ][\\wÀ-ÿ'’-]+`;
    // Détecte un nom SOIT précédé d'un indice (cas casse normale), SOIT en convention CAPITALES/Capitale.
    const PERSON_NAME_RE = new RegExp(
      `(?:${CUE}[\\s,’'-]+)(${NAME})` +                                       // indice + Prénom Nom
      `|\\b([A-ZÀ-Ÿ]{2,}(?:[-'’][A-ZÀ-Ÿ]+)*\\s+[A-ZÀ-Ÿ][a-zà-ÿ][\\wà-ÿ'’-]*)` + // NOM Prénom
      `|\\b([A-ZÀ-Ÿ][a-zà-ÿ][\\wà-ÿ'’-]*\\s+[A-ZÀ-Ÿ]{2,}(?:[-'’][A-ZÀ-Ÿ]+)*)\\b`, // Prénom NOM
      'g');
    /** Vrai si CHAQUE composant du nom (≥3 lettres) est présent dans les sources (ordre indifférent). */
    const nameInSources = (name: string): boolean => {
      const tokens = normCtx(name).split(/[\s,’'-]+/).filter((t) => t.length >= 3 && !NAME_STOPLIST.has(t));
      if (tokens.length === 0) return true;                       // que des sigles/initiales → on laisse
      return tokens.every((t) => sourceNamesNorm.includes(t));
    };
    const guardNames = (val: string): string =>
      val.replace(PERSON_NAME_RE, (full, cued, nomFirst, nomLast) => {
        const name = (cued || nomFirst || nomLast || '').trim();   // partie « nom » réellement capturée
        if (!name || nameInSources(name)) return full;             // nom présent dans tes données → OK
        console.log(`[MemoireGenerator] Garde-fou noms: "${name}" absent des sources → [À COMPLÉTER]`);
        // On ne remplace QUE le nom, en préservant l'éventuel mot-indice qui le précède.
        return full.replace(name, '[À COMPLÉTER]');
      });

    // Garde-fou « placeholders » : (1) normalise un "[À COMPLÉTER]" mal formé (ex. "À COMPLÉTER"
    // sans crochets, renvoyé par le modèle) ; (2) neutralise les EXEMPLES-TYPES que le LLM glisse
    // parfois malgré la consigne — faux noms/dates/numéros que guardNames/guardFactual ne couvrent
    // pas toujours (ex. "Jean Dupont" en Titlecase sans mot-indice). → [À COMPLÉTER].
    // Inclut les exemples factices du CADRE CLIENT lui-même (le template contient des valeurs de
    // démonstration — faux nom, fausse date, faux n° séquentiel — que le modèle recopie comme si
    // elles étaient sourcées, puisqu'elles figurent dans le DCE). On les neutralise explicitement.
    const FAKE_VALUE_RE = /\bjean\s+dupont\b|\bjohn\s+doe\b|prenom\.nom@|\b01\s?23\s?45\s?67\s?89\b|\b01\/01\/2020\b|\b123\s?456\s?789\b|\b987\s?654\s?321\b/gi;
    const guardPlaceholders = (val: string, ctx = ''): string => {
      let v = val.trim();
      if (!v) return '';   // valeur volontairement vidée (ligne parasite) → reste VIDE, pas « [À COMPLÉTER] »
      if (/^\[?\s*[àa]\s*compl[ée]ter\s*\]?\.?$/i.test(v)) return '[À COMPLÉTER]';
      v = v.replace(FAKE_VALUE_RE, '[À COMPLÉTER]');
      // Canonicalise les placeholders bracketés (le modèle templatise parfois plusieurs emplacements :
      // « Nom, N° agrément — Nom / N° » → « [À COMPLÉTER], [À COMPLÉTER] — [À COMPLÉTER] / [À COMPLÉTER] »).
      v = v.replace(/\[\s*[àa]\s*compl[ée]ter\s*\]/gi, '[À COMPLÉTER]');
      // Si, une fois retirés les placeholders et les séparateurs, il ne reste RIEN d'utile → un seul.
      const meaningful = v.replace(/\[À COMPLÉTER\]/g, '').replace(/[\s,;:/|.\-—–()]+/g, '');
      if (!meaningful) return '[À COMPLÉTER]';
      // Fusionne les séquences de placeholders séparés par de la simple ponctuation.
      v = v.replace(/\[À COMPLÉTER\](?:\s*[,;/|—–-]+\s*\[À COMPLÉTER\])+/g, '[À COMPLÉTER]');
      // Il reste ≥2 placeholders → le modèle a recopié la STRUCTURE de la question avec des libellés
      // intermédiaires (« [À COMPLÉTER] / Date d'obtention de l'autorisation : [À COMPLÉTER] »). On
      // n'en garde qu'UN SEUL : on ne conserve que le texte qui n'est PAS un libellé déjà dans la
      // question (ex. un vrai nom de référent), et on termine par un unique [À COMPLÉTER].
      if ((v.match(/\[À COMPLÉTER\]/g) || []).length >= 2) {
        // Comparaison robuste : on ignore ponctuation/apostrophes/espaces (le libellé recopié et la
        // question ont parfois des apostrophes différentes) → "d'obtention" ≡ "d obtention".
        const alnum = (s: string) => normCtx(s).replace(/[^a-z0-9]+/g, '');
        const qn = alnum(ctx);
        const realParts = v.split(/\[À COMPLÉTER\]/)
          .map(s => s.replace(/^[\s,;:/|.\-—–()]+|[\s,;:/|.\-—–()]+$/g, '').trim())
          .filter(s => { const ns = alnum(s); return ns.length >= 3 && !qn.includes(ns); });
        return realParts.length ? `${realParts.join(' ')} [À COMPLÉTER]` : '[À COMPLÉTER]';
      }
      return v;
    };

    // ── Lignes-réponse PARASITES (sur-découpage du cadre client) ──
    // Sous un libellé, le gabarit a souvent PLUSIEURS lignes pointillées : seule la 1re porte le
    // libellé comme « Question: » ; les suivantes sont détectées comme des champs-réponse SANS
    // question propre (« Question: \":\" » ou vide). On ne les vide PAS systématiquement (ça
    // supprimait du contenu pertinent — « Réunions de suivi mensuelles », « Primes… »). On ne vide
    // QUE celles qui n'apportent AUCUNE info réelle : un placeholder seul, ou un simple LIBELLÉ déjà
    // présent dans le contexte (recopié par le modèle). Le contenu distinct est CONSERVÉ. On ne
    // touche ni aux cellules de tableau ni aux cases.
    {
      const valById = new Map<number, string>(replacements.map(r => [r.id, String(r.value)]));
      const alnum = (s: string) => normCtx(s).replace(/[^a-z0-9]+/g, '');
      let cleared = 0;
      for (const d of descriptors) {
        if (d.kind !== 'answer') continue;
        const q = (d.context.match(/Question:\s*"([^"]*)"/) || [])[1] || '';
        const qClean = q.replace(/[\s.:;,…\-—–/|()]+/g, '');
        if (qClean.length !== 0) continue;                       // a une vraie question → on GARDE
        const v = (valById.get(d.id) ?? '').trim();
        if (!v) continue;
        // Résidu = valeur sans les placeholders. Rien, ou un libellé déjà dans le contexte → on vide.
        const residual = alnum(v.replace(/\[?\s*[àa]\s*compl[ée]ter\s*\]?/gi, ''));
        const noRealInfo = residual.length < 3 || alnum(d.context).includes(residual);
        if (noRealInfo) { valById.set(d.id, ''); cleared++; }    // sinon : contenu distinct → CONSERVÉ
      }
      if (cleared) console.log(`[MemoireGenerator] Lignes parasites vidées (placeholder/libellé recopié): ${cleared}`);
      replacements.forEach(r => { if (valById.has(r.id)) r.value = valById.get(r.id)!; });
    }

    // ── Déduplication des zones SUR-DÉCOUPÉES ──
    // Certaines zones de réponse (lignes pointillées consécutives sous un même libellé, ou plusieurs
    // cellules vides d'une même ligne de tableau) sont détectées comme PLUSIEURS champs → elles
    // reçoivent la même valeur, qui se répète en cascade dans le document. Deux dédoublonnages :
    //  • VALEURS RÉDIGÉES identiques au contexte identique → on garde la 1re, on vide les suivantes ;
    //  • « [À COMPLÉTER] » purs → une seule fois par LIGNE/zone (même ligne de tableau ou même
    //    question) : inutile d'écrire « [À COMPLÉTER] » dans chaque case vide d'une même ligne.
    {
      const dedupSig = (ctx: string) => normCtx(ctx.replace(/\[CHAMP_\d+\]/g, ''));
      // Signature « ligne/zone » (plus grossière) pour regrouper les [À COMPLÉTER] d'une même ligne.
      const lineSig = (ctx: string) => {
        const section = (ctx.match(/Section:\s*"([^"]*)"/) || [])[1] || '';
        const ligne = (ctx.match(/Ligne:\s*"([^"]*)"/) || [])[1];      // cellules d'une même ligne de tableau
        const question = (ctx.match(/Question:\s*"([^"]*)"/) || [])[1]; // lignes d'une même zone de réponse
        return normCtx(section + '||' + (ligne ?? question ?? ''));
      };
      const isPureBlank = (v: string) => /^\[?\s*[àa]\s*compl[ée]ter\s*\]?\.?$/i.test(v.trim());
      const valById = new Map<number, string>(replacements.map(r => [r.id, String(r.value)]));
      const seenVal = new Map<string, Set<string>>();   // valeurs rédigées déjà vues (par contexte complet)
      const blankLines = new Set<string>();             // lignes/zones portant déjà un [À COMPLÉTER]
      // ── Anti QUASI-doublons (même zone) : empêche de répéter « Prime fin d'année … » sur 3-4 lignes ──
      // On compare les VALEURS d'une même zone/ligne (lineSig) par recouvrement de mots significatifs ;
      // au-delà de ~78 %, c'est une redite → on vide (on garde la 1re formulation).
      const DUP_STOP = new Set(['avec', 'pour', 'dans', 'des', 'les', 'une', 'aux', 'sur', 'par', 'que', 'qui', 'sont', 'plus', 'leur', 'nos', 'notre']);
      const sigWords = (v: string) => new Set(
        normCtx(v).replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length >= 4 && !DUP_STOP.has(w)));
      const overlap = (a: Set<string>, b: Set<string>) => {
        if (!a.size || !b.size) return 0;
        let n = 0; for (const w of a) if (b.has(w)) n++;
        return n / Math.min(a.size, b.size);
      };
      const zoneWordSets = new Map<string, Array<Set<string>>>();   // mots déjà vus par zone (lineSig)
      for (const d of descriptors.slice().sort((a, b) => a.id - b.id)) {
        if (d.kind === 'checkbox') continue;
        const v = (valById.get(d.id) ?? '').trim();
        if (!v) continue;
        if (isPureBlank(v)) {
          if (d.kind === 'table') {
            valById.set(d.id, '');
            console.log(`[MemoireGenerator] [À COMPLÉTER] retiré pour cellule de tableau (CHAMP_${d.id})`);
            continue;
          }
          const ls = lineSig(d.context);
          if (blankLines.has(ls)) { valById.set(d.id, ''); console.log(`[MemoireGenerator] [À COMPLÉTER] en trop vidé: CHAMP_${d.id} (même ligne)`); }
          else blankLines.add(ls);
          continue;
        }
        const sig = dedupSig(d.context);
        const set = seenVal.get(sig) ?? seenVal.set(sig, new Set()).get(sig)!;
        const nv = normCtx(v);
        if (set.has(nv)) { valById.set(d.id, ''); console.log(`[MemoireGenerator] Doublon vidé: CHAMP_${d.id} (même contexte/valeur)`); continue; }
        set.add(nv);
        // Quasi-doublon dans la MÊME zone (lignes d'une même question/zone) → vidé.
        const ws = sigWords(v);
        const ls = lineSig(d.context);
        const arr = zoneWordSets.get(ls) ?? zoneWordSets.set(ls, []).get(ls)!;
        if (ws.size >= 3 && arr.some((prev) => overlap(ws, prev) >= 0.78)) {
          valById.set(d.id, '');
          console.log(`[MemoireGenerator] Quasi-doublon vidé: CHAMP_${d.id} (redite dans la même zone)`);
        } else {
          arr.push(ws);
        }
      }
      replacements.forEach(r => { if (valById.has(r.id)) r.value = valById.get(r.id)!; });
    }

    // ── (Brief §3) Résolution des infos manquantes — PISTE D'AMÉLIORATION, désactivée par défaut ──
    // Pour chaque champ resté « [À COMPLÉTER] », l'outil pourra (futur) chercher l'info publique sur
    // Internet (identité du client) ou la demander à l'équipe par email (info interne, ex. dirigeant),
    // puis réintégrer la réponse — au lieu de laisser un blanc. Stub non bloquant (no-op tant que les
    // voies web/email ne sont pas implémentées). Activable via RESOLVE_MISSING_INFO=true.

    const missingInfo = replacements
      .filter((r: any) => /\[À COMPLÉTER\]/.test(String(r.value)))
      .map((r: any) => {
        const d = descriptors.find((x: any) => x.id === r.id);
        const label = (d?.context.match(/Question:\s*"([^"]*)"|option:\s*"([^"]*)"|Tableau:\s*(.+?)(?:\s*\|\s*Contexte proche:|$)/) || [])
          .slice(1).find(Boolean) || d?.context || '';
        return { id: r.id, label: String(label).trim(), context: d?.context || '' };
      });

    if (missingInfo.length > 0) {
      // Persistance de l'état « cadre » pour la reprise avec réponses utilisateur (fonctionnalité
      // désactivée : le `return incomplete` ci-dessous est commenté). NON ESSENTIEL → ne doit JAMAIS
      // faire échouer la génération. En particulier, si la ligne `dossiers` appartient à un autre
      // user_id, l'upsert est bloqué par la RLS Supabase : on log et on continue sans planter.
      try {
        const tempPath = require('path').join(this.responseDir, `temp_${dossierId}.docx`);
        const tempSerializer = new XMLSerializer();
        zip.file('word/document.xml', tempSerializer.serializeToString(xmlDoc));
        const tempBuf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
        require('fs').writeFileSync(tempPath, tempBuf);

        // Persistance CROSS-POSTE : le temp local est lié à CETTE machine (injoignable ailleurs) →
        // on le pousse aussi dans un bucket privé et on stocke sa clé. L'upload a lieu ICI, à la
        // génération, donc AVANT toute suppression locale (finalizeMemoire) → temp récupérable après.
        let storageKey: string | null = null;
        try {
          storageKey = await uploadTempDocx(dossierId, tempBuf);
        } catch (e: any) {
          console.warn(`[MemoireGenerator] Upload temp Storage échoué (on garde le fallback local): ${e?.message || e}`);
        }

        const curDossier = await DB.getDossier(dossierId);
        const prevSt = (curDossier?.memoire_cadre_state && typeof curDossier.memoire_cadre_state === 'object')
          ? curDossier.memoire_cadre_state : {};
        await DB.saveDossier(dossierId, {
          memoire_cadre_state: { ...prevSt, tempPath, storageKey, missingFields: prevSt.missingFields || missingInfo }
        });
        console.log(`[MemoireGenerator] État cadre sauvegardé (${missingInfo.length} champ(s) manquant(s))${storageKey ? ` — temp uploadé (${storageKey})` : ''}.`);
      } catch (e: any) {
        console.warn(`[MemoireGenerator] Sauvegarde de l'état cadre ignorée (non bloquant) : ${e?.message || e}`);
      }

      // ── Ticket #4 phase 2b — déclencheur GATÉ par RESOLVE_MISSING_INFO (OFF par défaut). ──
      // Réutilise missingInfo ({id,label,context}) déjà calculée ci-dessus — AUCUN re-parse du .docx.
      // FLAG OFF → aucun appel, génération STRICTEMENT inchangée (mémoire + missingFields identiques).
      // FLAG ON → fire-and-forget : recherche web en fond des champs 'public' → recherche_web
      // (statut « en_attente_validation », anti-doublon déjà en place). AUCUNE injection : le .docx
      // n'est PAS modifié ici. Le .catch() garantit qu'un échec ne casse jamais la génération.
      if (getSettings().resolveMissingInfoEnabled) {
        resolveMissingInfo(missingInfo as MissingField[], dossierId).catch((e: any) =>
          console.warn('[MemoireGenerator] resolveMissingInfo (fond) échec non bloquant:', e?.message));
      }
      // return { status: 'incomplete', missingFields: missingInfo };
    }

    // 6. Apply replacements in the DOM
    let applied = 0;
    replacements.forEach((rep: any) => {
      const desc = descriptors.find(d => d.id === rep.id);
      if (!desc) return;
      let value = dedupeClientName(guardPlaceholders(guardNames(guardInventedClaims(guardServiceCert(guardFactual(String(rep.value), desc.context), desc.context), desc.context)), desc.context));
      // Cellule de tableau → garde-fou déterministe : retire tout nombre ≥3 chiffres non sourcé (« 170 »…).
      if (desc.kind === 'table') value = guardTableNumbers(value);
      // Contact SINGULIER : si le LIBELLÉ demande UNE personne (« la personne », « l'interlocuteur »…)
      // et que la valeur en liste plusieurs (plusieurs lignes), on ne garde QUE la 1re. Dynamique :
      // on lit le libellé, on ne présuppose AUCUN nom (≠ valeur en dur).
      {
        const q = normCtx((desc.context.match(/Question:\s*"([^"]*)"/) || [])[1] || '')
          .replace(/['’]/g, ' ');
        const askOne = /\b(la personne|l ?interlocuteur|le contact|de la personne|du contact)\b/.test(q)
          && !/\b(personnes|interlocuteurs|liste|organigramme)\b/.test(q);
        if (askOne) {
          const lines = value.split(/\n+/).map((s) => s.trim()).filter(Boolean);
          if (lines.length > 1) { value = lines[0]; console.log(`[MemoireGenerator] Contact singulier: liste réduite à 1 personne (CHAMP_${rep.id}).`); }
        }
      }
      // Pour une CASE À COCHER : on ne coche QUE si le modèle a explicitement renvoyé ☑/☒ — jamais
      // parce qu'il a recopié un libellé « Oui » (sinon une option « Oui » serait cochée à tort).
      const isChecked = desc.kind === 'checkbox'
        ? /[☑☒]/.test(value)
        : (value.includes('☑') || value.toLowerCase() === 'oui' || value.toLowerCase() === 'yes' || value === '1' || value === 'true');
      // Récap fidèle au document : pour une case, on affiche son état réel (☑/☐), pas le texte brut.
      rep.value = desc.kind === 'checkbox' ? (isChecked ? '☑' : '☐') : value;

      if (desc.type === 'text') {
        // Case à cocher « texte » (☐ du gabarit) : on N'écrit JAMAIS la valeur brute du modèle
        // (qui pourrait être un libellé ou « [À COMPLÉTER] ») — uniquement ☑ (si prouvée) ou ☐.
        const writeVal = desc.kind === 'checkbox' ? (isChecked ? '☑' : '☐') : value;
        const tEls = getElementsWithLocalName(xmlDoc, 't');
        tEls.forEach((tEl: any) => replaceTextInElement(xmlDoc, tEl, `[CHAMP_${rep.id}]`, writeVal));
        applied++;
      } else if (desc.type === 'legacy_checkbox') {
        let checkedEl = findLocalNameChild(desc.element, 'checked');
        if (!checkedEl) {
          checkedEl = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:checked');
          desc.element.appendChild(checkedEl);
        }
        checkedEl.setAttribute('w:val', isChecked ? '1' : '0');
        applied++;
      } else if (desc.type === 'sym_checkbox') {
        desc.element.setAttribute('w:char', isChecked ? 'F0FE' : 'F0A8');
        applied++;
      } else if (desc.type === 'w14_checkbox') {
        let checkedEl = findLocalNameChild(desc.element, 'checked');
        if (!checkedEl) {
          checkedEl = xmlDoc.createElementNS('http://schemas.microsoft.com/office/word/2010/wordml', 'w14:checked');
          desc.element.appendChild(checkedEl);
        }
        checkedEl.setAttribute('w14:val', isChecked ? '1' : '0');
        let sdt = getParentWithLocalName(desc.element, 'sdt');
        if (sdt) {
          getElementsWithLocalName(sdt, 't').forEach((t: any) => { t.textContent = isChecked ? '☒' : '☐'; });
        }
        applied++;
      }
    });

    // 7. Clean up remaining placeholders
    getElementsWithLocalName(xmlDoc, 't').forEach((tEl: any) => {
      const text = tEl.textContent || '';
      if (/\[CHAMP_\d+\]/.test(text)) tEl.textContent = text.replace(/\[CHAMP_\d+\]/g, '');
    });

    console.log(`[MemoireGenerator] Applied ${applied}/${replacements.length} replacements.`);

    // 7 bis. Liste des champs restés « [À COMPLÉTER] » APRÈS garde-fous (fidèle au document remis)
    // → transformés en QUESTIONS à compléter, remontées comme notification (comme le no-template).
    const aCompleter: string[] = replacements
      .filter((r: any) => /\[À COMPLÉTER\]/.test(String(r.value)))
      .map((r: any) => {
        const d = descriptors.find((x: any) => x.id === r.id);
        const ctx = d?.context || '';
        // Pour un champ de tableau, on garde COLONNE + LIGNE (pas seulement la ligne) afin que la
        // question soit sans ambiguïté. Sinon on prend la Question / l'option de case à cocher.
        const m = ctx.match(/Question:\s*"([^"]*)"|option:\s*"([^"]*)"|Tableau:\s*(.+?)(?:\s*\|\s*Contexte proche:|$)/);
        const label = (m ? m.slice(1).find(Boolean) : '') || ctx.replace(/\s*\|\s*Contexte proche:.*$/, '').trim();
        return (label || `Champ ${r.id}`).trim();
      })
      .filter((s: string, i: number, arr: string[]) => Boolean(s) && arr.indexOf(s) === i);
    if (aCompleter.length) {
      console.warn(`[MemoireGenerator] ⚠ ${aCompleter.length} champ(s) « [À COMPLÉTER] » à faire remplir :\n- ${aCompleter.join('\n- ')}`);
    }

    // 8. Serialize and save
    if (onProgress) onProgress(98, 'Génération du document Word…');
    const serializer = new XMLSerializer();
    zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
    const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    const outputFileName = `Mémoire technique GSS_${Date.now()}.docx`;
    const outputPath = path.join(this.responseDir, outputFileName);
    fs.writeFileSync(outputPath, buf);

    console.log(`[MemoireGenerator] Successfully generated ${outputPath}`);

    return {
      status: 'completed',
      filePath: outputPath,
      generatedData: {
        modele: this.memoireModel,
        total_suggestions: String(prompts.length),
        modifications_reussies: String(applied),
        details: JSON.stringify(replacements.map(r => ({
          recherche: `[CHAMP_${r.id}]`,
          remplacement: r.value
        })))
      },
      consultations: aCompleter,
    };
  }

  /**
   * Cas "sans cadre imposé" (mode B / réponse libre) — approche PRÉSERVATION : on garde le
   * maître AO RNE.docx INTACT (design + 221 images) et on AJOUTE des pages en DUPLIQUANT des
   * pages existantes (`cloneSpread`) pour y injecter le texte personnalisé (généré côté front
   * à partir du DCE + Documentation GSS). Le nom du client du maître (« Parc des Expositions de
   * Rouen ») est remplacé par celui du DCE (`adaptStaticText`). Le round-trip DOM (xmldom)
   * préserve la maquette à l'identique (vérifié : embeds/drawings/textboxes/sections inchangés).
   */
  public async assembleFromSections(
    dossierId: string,
    chapters: AssembleChapter[],
    options: { refonte?: boolean } = {},
  ): Promise<{ filePath: string; generatedData: Record<string, string> }> {
    // Refonte V1 activée par défaut : fond gris uniforme + retrait des images de fond
    // pleine page sur les pages dupliquées (bandeau/titre conservé).
    const refonte = options.refonte !== false;
    // 0. Client (base DCE puis analyse) pour personnaliser la couverture / le sommaire.
    const cover = await this.getCoverInfo(dossierId);
    const clientName = cover.client && !/global security|^gss\b/i.test(cover.client) ? cover.client : '';

    // 1. Charger le maître AO RNE.docx et parser document.xml (médias/thème/styles conservés).
    const templatePath = path.join(this.templateDir, 'Mémoire technique', 'AO RNE.docx');
    if (!fs.existsSync(templatePath)) throw new Error(`Template de référence introuvable : ${templatePath}`);
    const zip = new PizZip(fs.readFileSync(templatePath));
    const documentXmlFile = zip.file('word/document.xml');
    if (!documentXmlFile) throw new Error('word/document.xml introuvable dans AO RNE.docx');

    const parser = new DOMParser();
    const serializer = new XMLSerializer();
    const xmlDoc = parser.parseFromString(documentXmlFile.asText(), 'text/xml');

    // Refonte V1 — fond gris uniforme : <w:background> en 1er enfant du document +
    // activation du rendu via <w:displayBackgroundShape/> dans settings.xml.
    if (refonte) {
      const docEl = xmlDoc.documentElement;
      if (docEl && !findLocalNameChild(docEl, 'background')) {
        const bg = xmlDoc.createElementNS(W_NS, 'w:background');
        bg.setAttribute('w:color', BACKGROUND_COLOR);
        docEl.insertBefore(bg, docEl.firstChild);
      }
      const settingsFile = zip.file('word/settings.xml');
      if (settingsFile) {
        let s = settingsFile.asText();
        if (!/displayBackgroundShape/.test(s)) {
          s = s.replace(/(<w:settings[^>]*>)/, '$1<w:displayBackgroundShape/>');
          zip.file('word/settings.xml', s);
        }
      }
    }

    // 2. Personnalisation du client (couverture/sommaire) sur le document + en-têtes/pieds.
    if (clientName) {
      this.adaptStaticText(xmlDoc, { clientName });
      Object.keys(zip.files).forEach((name) => {
        if (name.startsWith('word/header') || name.startsWith('word/footer')) {
          const fd = zip.file(name);
          if (!fd) return;
          const hf = parser.parseFromString(fd.asText(), 'text/xml');
          this.adaptStaticText(hf, { clientName });
          zip.file(name, serializer.serializeToString(hf));
        }
      });
    }

    // 3. Découper le corps en sections OOXML puis repérer les "spreads" (page image+titre + corps).
    const body = findLocalNameChild(xmlDoc.documentElement, 'body');
    if (!body) throw new Error('<w:body> introuvable dans AO RNE.docx');
    const { sections } = splitBodyIntoSections(body);

    interface Spread { headingParas: any[]; bodyParas: any[]; headingText: string; }
    const spreads: Spread[] = [];
    for (let i = 0; i < sections.length - 1; i++) {
      if (sectionHasBackgroundImage(sections[i]) && sectionHasTextbox(sections[i]) && sectionIsPlainText(sections[i + 1])) {
        const headingText = sections[i]
          .flatMap((p: any) => getElementsWithLocalName(p, 'txbxContent'))
          .flatMap((tx: any) => getElementsWithLocalName(tx, 't'))
          .map((t: any) => t.textContent || '')
          .join(' ');
        spreads.push({ headingParas: sections[i], bodyParas: sections[i + 1], headingText });
      }
    }
    if (spreads.length === 0) throw new Error('Aucune page-modèle (spread image+titre+corps) repérée dans AO RNE.docx.');

    // 4. Aplatir les sections générées ; pour chacune, dupliquer la page-modèle du bon thème
    //    et y injecter titre + texte. Insertion juste après la page-modèle correspondante.
    const flat: Array<{ title: string; text: string }> = [];
    chapters.forEach((ch) =>
      (ch?.sections || []).forEach((s) => { if (s?.text?.trim()) flat.push({ title: (s.title || '').trim(), text: s.text }); }),
    );
    if (flat.length === 0) throw new Error('Aucune section générée à insérer (sections vides).');

    const scoreMatch = (title: string, heading: string): number => {
      const want = new Set(normTitle(title).split(' ').filter((w) => w.length > 3));
      let s = 0;
      normTitle(heading).split(' ').forEach((w) => { if (w.length > 3 && want.has(w)) s++; });
      return s;
    };

    const counter = { v: maxDrawingId(xmlDoc) };
    const stats = { imagesRemoved: 0 };
    const lastInsertedByBody = new Map<any, any>(); // empile plusieurs ajouts après une même page-modèle
    // Récupérer le fond gris clair (#D9D9D9) pleine page pour l'injecter dans les corps dupliqués
    const bgRun = findFullPageBackgroundRun(body);
    if (bgRun) {
      console.log('[MemoireGenerator] Fond gris clair (#D9D9D9) pleine page trouvé — injection dans les pages dupliquées.');
    }
    // Récupérer le bandeau « GSS » de titre pour le poser sur chaque page générée
    const gssRun = findGssBannerRun(body);
    if (gssRun) {
      console.log('[MemoireGenerator] Bandeau « GSS » de titre trouvé — injection sur chaque titre généré.');
    } else {
      console.warn('[MemoireGenerator] Bandeau « GSS » de titre NON trouvé.');
    }
    let inserted = 0;
    flat.forEach((sec, idx) => {
      // Dernière page : utiliser le dernier spread du template (image pleine page étendue)
      const isLastPage = idx === flat.length - 1;
      let best = isLastPage ? spreads[spreads.length - 1] : spreads[idx % spreads.length];
      if (!isLastPage) {
        let bestScore = 0;
        spreads.forEach((sp) => { const sc = scoreMatch(sec.title, sp.headingText); if (sc > bestScore) { bestScore = sc; best = sp; } });
      }

      const useRefonte = refonte && !isLastPage;
      const newNodes = cloneSpread(xmlDoc, best.headingParas, best.bodyParas, counter, sec.title, sec.text, useRefonte, stats);

      const headingCount = best.headingParas.length;

      // La dernière page utilise le spread de clôture (image pleine page) : on retire son
      // image de fond pour laisser apparaître le fond gris, comme sur les autres pages.
      if (isLastPage) {
        stats.imagesRemoved += stripStandaloneBgImages(newNodes.slice(0, headingCount));
      }

      // Injecter le fond gris clair pleine page dans la section corps de TOUTES les pages
      // générées (y compris la dernière) — le client veut le fond gris partout.
      if (bgRun) {
        const bodyNodes = newNodes.slice(headingCount);
        if (bodyNodes.length > 0) {
          injectFullPageBackground(bodyNodes, bgRun, counter);
        }
      }

      // Poser le bandeau « GSS » sur le titre de chaque page générée (certains en-têtes
      // du template ne le portent pas) — garantit un titre cohérent partout.
      if (gssRun) {
        injectGssBanner(newNodes.slice(0, headingCount), gssRun, counter);
      }

      const anchorBody = best.bodyParas[best.bodyParas.length - 1];
      const ref = (lastInsertedByBody.get(anchorBody) || anchorBody).nextSibling;
      let last: any = null;
      newNodes.forEach((n) => { body.insertBefore(n, ref); last = n; });
      lastInsertedByBody.set(anchorBody, last);
      inserted++;
    });

    // 5. Sérialiser document.xml (médias conservés) et sauvegarder.
    zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
    const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    const outputFileName = `Mémoire technique GSS_${Date.now()}.docx`;
    const outputPath = path.join(this.responseDir, outputFileName);
    fs.writeFileSync(outputPath, buf);

    console.log(`[MemoireGenerator] AO RNE personnalisé : ${inserted} page(s) ajoutée(s), ${spreads.length} page(s)-modèle, refonte=${refonte} (fond gris ${refonte ? BACKGROUND_COLOR : 'off'}, ${stats.imagesRemoved} image(s) de fond retirée(s)), client="${clientName || '(non personnalisé)'}" → ${outputPath}`);

    return {
      filePath: outputPath,
      generatedData: {
        mode: refonte
          ? `Refonte V1 : fond gris uniforme #${BACKGROUND_COLOR} + bandeau conservé + images de fond retirées des pages dupliquées`
          : 'AO RNE préservé (design intact) + pages dupliquées',
        client: clientName || '(non personnalisé)',
        pages_ajoutees: String(inserted),
        pages_modeles: String(spreads.length),
        images_fond_retirees: String(stats.imagesRemoved),
      },
    };
  }

  /**
   * Construit un DOCX NU (sans cadre, sans le maître AO RNE) : styles Word par défaut,
   * aucun fond de page, aucun en-tête/pied, aucune page de garde. Sert de point de
   * comparaison « génération sans template » face au template refondu.
   */
  public async assembleNoTemplate(
    chapters: AssembleChapter[],
  ): Promise<{ filePath: string; generatedData: Record<string, string> }> {
    const esc = (s: string) => escXml(s);
    const plainRun = (t: string, bold = false, sz?: number) =>
      `<w:r><w:rPr>${bold ? '<w:b/>' : ''}${sz ? `<w:sz w:val="${sz}"/>` : ''}</w:rPr>` +
      `<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
    const plainPara = (inner: string) => `<w:p>${inner}</w:p>`;

    const body: string[] = [];
    let chaptersOut = 0;
    let sectionsOut = 0;
    chapters.forEach((chapter, idx) => {
      if (!chapter || !chapter.sections || chapter.sections.length === 0) return;
      const roman = chapter.key || ['I', 'II', 'III', 'IV', 'V', 'VI'][idx] || String(idx + 1);
      body.push(plainPara(plainRun(`${roman}. ${chapter.title || ''}`.trim(), true, 32)));
      for (const sec of chapter.sections) {
        const title = sec.title?.trim();
        if (title) body.push(plainPara(plainRun(title, true, 26)));
        for (const rawLine of String(sec.text || '').replace(/\r\n/g, '\n').split('\n')) {
          const line = rawLine.replace(/[`#*_>-]/g, '').trim();
          if (line) body.push(plainPara(plainRun(line)));
        }
        sectionsOut++;
      }
      chaptersOut++;
    });

    if (chaptersOut === 0) throw new Error('Aucun chapitre généré à exporter (sections vides).');

    const sectPr = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';
    const documentXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<w:document xmlns:w="${W_NS}"><w:body>${body.join('')}${sectPr}</w:body></w:document>`;

    const zip = new PizZip();
    zip.file('[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>');
    zip.file('_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>');
    zip.file('word/document.xml', documentXml);
    zip.file('word/_rels/document.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');

    const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    const outputFileName = `Mémoire technique GSS (sans template)_${Date.now()}.docx`;
    const outputPath = path.join(this.responseDir, outputFileName);
    fs.writeFileSync(outputPath, buf);

    console.log(`[MemoireGenerator] Mémoire NU (sans template) généré : ${chaptersOut} chapitre(s), ${sectionsOut} section(s) → ${outputPath}`);

    return {
      filePath: outputPath,
      generatedData: {
        mode: 'Document nu (sans template, styles Word par défaut)',
        chapitres: String(chaptersOut),
        sections: String(sectionsOut),
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // GÉNÉRATION COMPLÈTE DU MÉMOIRE (sans cadre imposé dans le DCE)
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Charge la Documentation GSS (Template/Documentation GSS/) — 21 catégories de PDFs
   * (ABSENCE ET RETARD, FORMATION, PROCEDURE, TENUES, etc.). Renvoie un dictionnaire
   * { catégorie: texte } budgétisé par catégorie.
   */
  private async getGssDocumentation(): Promise<Record<string, string>> {
    // Priorité à la bdd (si MEMOIRE_RAG_FROM_DB=true) : le dossier Template n'est plus lu.
    const fromDb = await this.getGssDocsTextFromDb();
    if (fromDb) {
      console.log(`[MemoireGenerator] Documentation GSS chargée depuis la bdd : ${Object.keys(fromDb).length} catégories (dossier Template non lu).`);
      return fromDb;
    }

    const gssDir = path.join(this.templateDir, 'Documentation GSS');
    if (!fs.existsSync(gssDir)) {
      console.warn('[MemoireGenerator] Documentation GSS introuvable:', gssDir);
      return {};
    }

    const PER_CAT_CAP = 15_000; // plafond par catégorie en caractères
    const categories: Record<string, string> = {};

    for (const entry of fs.readdirSync(gssDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      // Le dossier « Personnes » (référents GSS) est chargé à part via getGssReferents().
      if (entry.name.toLowerCase() === 'personnes') continue;
      const catDir = path.join(gssDir, entry.name);
      let catText = '';

      const files = fs.readdirSync(catDir).filter(f => f.toLowerCase().endsWith('.pdf'));
      for (const file of files) {
        try {
          const text = await extractText(path.join(catDir, file));
          if (text.length > 50) catText += `\n--- ${file} ---\n${text}`;
        } catch (e: any) {
          console.warn(`[MemoireGenerator] GSS doc: impossible de lire ${entry.name}/${file}: ${e.message}`);
        }
      }

      if (catText.trim()) {
        categories[entry.name] = catText.length > PER_CAT_CAP
          ? catText.slice(0, PER_CAT_CAP) + '\n[… tronqué …]'
          : catText;
        console.log(`[MemoireGenerator] GSS doc chargée: ${entry.name} — ${catText.length} chars (${files.length} fichiers)`);
      }
    }

    console.log(`[MemoireGenerator] Documentation GSS: ${Object.keys(categories).length} catégories chargées.`);
    return categories;
  }

  /**
   * Calcule l'effectif TOTAL de GSS = somme des effectifs par catégorie listés dans
   * « EFFECTIFS ET ORGANIGRAMME/EFFECTIFS MOYENS.pdf » (agrégation DÉTERMINISTE de chiffres réels).
   * Piège : « SSIAP 1/2/3 » contiennent un NIVEAU (pas un effectif) → on ignore tout nombre
   * précédé du mot « SSIAP ». Renvoie le total + le détail (pour traçabilité/log), ou null si la
   * source est absente/illisible (le champ restera alors « [À COMPLÉTER] »).
   */
  private async getGssTotalEffectif(): Promise<{ total: number; breakdown: string } | null> {
    // Priorité à la bdd (mode MEMOIRE_RAG_FROM_DB) ; repli sur le PDF du dossier Template.
    let text: string | null = await this.getEffectifTextFromDb();
    if (!text) {
      const p = path.join(this.templateDir, 'Documentation GSS', 'EFFECTIFS ET ORGANIGRAMME', 'EFFECTIFS MOYENS.pdf');
      if (!fs.existsSync(p)) return null;
      try { text = await extractText(p); } catch { return null; }
    }
    const tokens = text.replace(/\s+/g, ' ').trim().split(/\s+/);
    let total = 0;
    const parts: number[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const n = parseInt(tokens[i], 10);
      if (!Number.isInteger(n) || String(n) !== tokens[i].replace(/[^\d]/g, '') || n <= 0 || n > 100_000) continue;
      const prev = (tokens[i - 1] || '').toUpperCase().replace(/[^A-Z]/g, '');
      if (prev === 'SSIAP') continue;          // « SSIAP 1/2/3 » = niveau, pas un effectif
      total += n; parts.push(n);
    }
    return total > 0 ? { total, breakdown: parts.join('+') } : null;
  }

  /**
   * Concatène TOUTE la Documentation GSS (toutes les catégories/sous-dossiers) en un seul
   * contexte de connaissances budgétisé, pour le remplissage d'un cadre client : chaque champ
   * du formulaire doit pouvoir être renseigné à partir de ce que GSS sait faire. Plafonné par
   * catégorie ET globalement pour rester sous la limite TPM.
   */
  private buildFullGssContext(gssDocs: Record<string, string>, perCatCap = 2500, totalCap = 24_000): string {
    let ctx = '';
    
    // Toujours inclure les recherches web et sollicitations en priorité absolue
    if (gssDocs['RECHERCHES ET SOLLICITATIONS (RAG)']) {
      ctx += `\n\n=== Doc GSS : RECHERCHES ET SOLLICITATIONS (RAG) ===\n${gssDocs['RECHERCHES ET SOLLICITATIONS (RAG)'].slice(0, Math.min(perCatCap * 2, totalCap))}`;
    }
    if (gssDocs['RECHERCHES WEB BDD']) {
      ctx += `\n\n=== Doc GSS : RECHERCHES WEB BDD ===\n${gssDocs['RECHERCHES WEB BDD'].slice(0, Math.min(perCatCap * 2, totalCap))}`;
    }
    if (gssDocs['QUESTIONS INTERNES BDD']) {
      ctx += `\n\n=== Doc GSS : QUESTIONS INTERNES BDD ===\n${gssDocs['QUESTIONS INTERNES BDD'].slice(0, Math.min(perCatCap * 2, totalCap))}`;
    }

    for (const [cat, text] of Object.entries(gssDocs)) {
      if (cat === 'RECHERCHES ET SOLLICITATIONS (RAG)' || cat === 'RECHERCHES WEB BDD' || cat === 'QUESTIONS INTERNES BDD') continue;
      if (ctx.length >= totalCap) break;
      ctx += `\n\n=== Doc GSS : ${cat} ===\n${text.slice(0, perCatCap)}`;
    }
    return ctx.length > totalCap ? ctx.slice(0, totalCap) + '\n[… tronqué …]' : ctx;
  }

  /**
   * Charge la liste des RÉFÉRENTS GSS depuis « Template/Documentation GSS/Personnes » (interlocuteurs
   * uniques, encadrants, contacts, dirigeants). « Personnes » peut être SOIT un fichier texte simple
   * (un référent par ligne, sans extension), SOIT un dossier de fiches (pdf/docx/doc/txt) : les deux
   * cas sont gérés. Renvoie le texte concaténé (budgétisé) ou '' si absent/vide — dans ce dernier cas
   * les champs « référent » resteront « [À COMPLÉTER] » plutôt qu'inventés.
   */
  private async getGssReferents(): Promise<string> {
    const target = path.join(this.templateDir, 'Documentation GSS', 'Personnes');
    if (!fs.existsSync(target)) {
      console.warn('[MemoireGenerator] « Personnes » (référents GSS) introuvable:', target);
      return '';
    }

    const CAP = 12_000;
    /** Lit un fichier : texte brut s'il n'a pas d'extension exploitable, sinon via extractText. */
    const readOne = async (filePath: string): Promise<string> => {
      try {
        if (/\.(pdf|docx?)$/i.test(filePath)) return await extractText(filePath);
        return fs.readFileSync(filePath, 'utf8'); // .txt ou fichier sans extension (liste texte)
      } catch (e: any) {
        console.warn(`[MemoireGenerator] Référents: impossible de lire ${path.basename(filePath)}: ${e.message}`);
        return '';
      }
    };

    let out = '';
    if (fs.statSync(target).isDirectory()) {
      for (const file of fs.readdirSync(target)) {
        const text = (await readOne(path.join(target, file))).trim();
        if (text.length > 30) out += `\n--- ${file} ---\n${text}`;
      }
    } else {
      out = (await readOne(target)).trim();
    }

    out = out.trim();
    if (out.length > CAP) out = out.slice(0, CAP) + '\n[… tronqué …]';
    console.log(`[MemoireGenerator] Référents GSS (Personnes): ${out.length} chars chargés.`);
    return out;
  }

  /**
   * Trouve les catégories de Documentation GSS pertinentes pour un titre de spread donné,
   * par correspondance de mots-clés dans GSS_DOC_KEYWORDS. Si `analysisData` est fourni,
   * les catégories sont pondérées par pertinence au secteur du client (ex : FORMATION
   * prioritaire pour l'éducation, PROCEDURE pour l'industrie).
   */
  private matchGssCategories(spreadTitle: string, availableCategories: string[], analysisData?: any): string[] {
    const n = normTitle(spreadTitle);

    // Score de base : correspondance titre ↔ mots-clés de la catégorie
    const scored: Array<{ cat: string; score: number }> = [];

    for (const [cat, keywords] of Object.entries(GSS_DOC_KEYWORDS)) {
      if (!availableCategories.includes(cat)) continue;
      let score = 0;
      for (const kw of keywords) {
        if (n.includes(kw)) score += 2;
      }
      if (score > 0) scored.push({ cat, score });
    }

    // Fallback : correspondance par mots du titre dans les noms de catégories
    if (scored.length === 0) {
      const words = n.split(' ').filter(w => w.length > 3);
      for (const cat of availableCategories) {
        const catNorm = normTitle(cat);
        if (words.some(w => catNorm.includes(w))) scored.push({ cat, score: 1 });
      }
    }

    // Bonus sectoriel : prioriser les catégories pertinentes au secteur du client
    if (analysisData) {
      const sector = detectClientSector(analysisData).toLowerCase();
      const sectorBoosts: Record<string, string[]> = {
        'education': ['FORMATION', 'FORMATION INTERNE', 'SUIVI QUALITE ET CONTROLES', 'PROCEDURE'],
        'enseignement': ['FORMATION', 'FORMATION INTERNE', 'SUIVI QUALITE ET CONTROLES', 'PROCEDURE'],
        'sante': ['PROCEDURE', 'FORMATION', 'TENUES', 'SUIVI QUALITE ET CONTROLES'],
        'hospitalier': ['PROCEDURE', 'FORMATION', 'TENUES', 'SUIVI QUALITE ET CONTROLES'],
        'industrie': ['PROCEDURE', 'MATERIEL', 'TENUES', 'FORMATION'],
        'logistique': ['PROCEDURE', 'MATERIEL', "MOYENS D'ACCES", 'PLANNIFICATION'],
        'distribution': ["MOYENS D'ACCES", 'PROCEDURE', 'TENUES', 'MATERIEL'],
        'commerce': ["MOYENS D'ACCES", 'PROCEDURE', 'TENUES', 'MATERIEL'],
        'evenementiel': ['PLANNIFICATION', 'PROCEDURE', 'MATERIEL', 'EFFECTIFS ET ORGANIGRAMME'],
        'culture': ['PLANNIFICATION', 'PROCEDURE', 'MATERIEL', 'EFFECTIFS ET ORGANIGRAMME'],
        'transport': ['PROCEDURE', 'MATERIEL', "MOYENS D'ACCES", 'SUIVI QUALITE ET CONTROLES'],
        'collectivite': ['MANAGEMENT', 'SUIVI QUALITE ET CONTROLES', 'ENGAGEMENT ECOLOGIQUE', 'VALEURS'],
        'residentiel': ['PROCEDURE', 'INTERLOCUTEUR UNIQUE', 'PLANNIFICATION', "MOYENS D'ACCES"],
      };
      for (const [sectorKey, boostedCats] of Object.entries(sectorBoosts)) {
        if (sector.includes(sectorKey)) {
          for (const s of scored) {
            if (boostedCats.includes(s.cat)) s.score += 1;
          }
          break;
        }
      }

      // Bonus marché public : prioriser MANAGEMENT et SUIVI QUALITE
      const marketType = detectMarketType(analysisData);
      if (marketType === 'public') {
        for (const s of scored) {
          if (['MANAGEMENT', 'SUIVI QUALITE ET CONTROLES', 'ENGAGEMENT ECOLOGIQUE', 'VALEURS'].includes(s.cat)) {
            s.score += 1;
          }
        }
      }
    }

    // Tri par score décroissant, 4 catégories max
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 4).map(s => s.cat);
  }

  /**
   * Génération COMPLÈTE du mémoire technique quand AUCUN cadre de réponse n'est dans le DCE.
   *
   * Approche en 3 temps :
   * A) MODIFIER les 119 pages existantes d'AO RNE.docx : pour chaque spread (page image+titre
   *    + page corps de texte), on génère un texte personnalisé via IA en se basant UNIQUEMENT
   *    sur le DCE + Documentation GSS, et on remplace le corps de texte en conservant le design.
   * B) AJOUTER des pages supplémentaires pour les thématiques du DCE non couvertes, en dupliquant
   *    des pages-modèles existantes (cloneSpread) pour préserver le design complexe.
   * C) Personnaliser le nom du client sur la couverture, en-têtes et pieds de page.
   *
   * Sources de données : DCE (CCTP, RC, annexes) + Documentation GSS (21 catégories de PDFs).
   */
  public async generateFullMemoire(dossierId: string): Promise<{ filePath: string, generatedData: Record<string, string> }> {
    console.log(`[MemoireGenerator] ═══ Génération ciblée du mémoire (AO RNE intact + synthèse personnalisée) ═══`);

    // ── 1. Analyse structurée du DCE ──
    const dceContext = await this.getDceContext(dossierId);
    const analysisData = await this.analyzeDce(dceContext);
    const analysisJson = JSON.stringify(analysisData, null, 2);
    const clientName = analysisData?.clientName || 'le client';
    console.log(`[MemoireGenerator] Analyse DCE terminée: client="${clientName}"`);

    // ── 2. Chargement de la Documentation GSS (Limité pour la synthèse) ──
    const gssDocs = await this.getGssDocumentation();
    let gssContext = '';
    const priorityCats = ['RECHERCHES ET SOLLICITATIONS (RAG)', 'MANAGEMENT', 'INTERLOCUTEUR UNIQUE', 'MISE EN PLACE', 'VALEURS', 'SUIVI QUALITE ET CONTROLES'];
    for (const cat of priorityCats) {
      if (gssDocs[cat]) {
        gssContext += `\n\n=== Doc GSS : ${cat} ===\n${gssDocs[cat].slice(0, 5000)}`;
      }
    }

    // ── 3. Charger et parser AO RNE.docx ──
    const templatePath = path.join(this.templateDir, 'Mémoire technique', 'AO RNE.docx');
    if (!fs.existsSync(templatePath)) throw new Error(`Template AO RNE introuvable: ${templatePath}`);
    const zip = new PizZip(fs.readFileSync(templatePath));
    const documentXmlFile = zip.file('word/document.xml');
    if (!documentXmlFile) throw new Error('word/document.xml introuvable dans AO RNE.docx');

    const parser = new DOMParser();
    const serializer = new XMLSerializer();
    const xmlDoc = parser.parseFromString(documentXmlFile.asText(), 'text/xml');

    // ── 4. Personnaliser le nom du client (couverture + en-têtes/pieds) ──
    this.adaptStaticText(xmlDoc, analysisData);
    Object.keys(zip.files).forEach(name => {
      if (name.startsWith('word/header') || name.startsWith('word/footer')) {
        const fd = zip.file(name);
        if (!fd) return;
        const hfDoc = parser.parseFromString(fd.asText(), 'text/xml');
        this.adaptStaticText(hfDoc, analysisData);
        zip.file(name, serializer.serializeToString(hfDoc));
      }
    });

    // ── 5. Récupérer le corps du document ──
    const body = findLocalNameChild(xmlDoc.documentElement, 'body');
    if (!body) throw new Error('<w:body> introuvable dans AO RNE.docx');

    const zones = findContextZones(body);
    if (zones.length === 0) {
      throw new Error('Aucune zone « Contexte sur mesure » (balise début/fin) trouvée dans AO RNE.docx — impossible d\'insérer la synthèse.');
    }

    // ── 6. Génération IA de la synthèse personnalisée (1 seule génération ciblée) ──
    // Capacité = nombre de lignes vides réservées (entre début/fin) × largeur de ligne ; on vise de
    // quoi remplir l'espace réservé sans déborder (le surplus serait tronqué pour ne rien décaler).
    const totalLines = zones.reduce((s, z) => s + z.blanks.length + z.postBlanks.length, 0);
    const totalCapacity = totalLines * CHARS_PER_LINE_2COL;
    console.log(`[MemoireGenerator] ${zones.length} zone(s) « Contexte sur mesure » (début/fin), ${totalLines} ligne(s) réservée(s), capacité ~${totalCapacity} caractères. Génération IA de la synthèse...`);
    const targetWords = Math.max(400, Math.round(totalCapacity / 6.5)); // ~6.5 car/mot
    const marketType = detectMarketType(analysisData);
    const clientSector = detectClientSector(analysisData);
    const strategicCtx = buildStrategicContext('presentation', analysisData);
    const systemPrompt = `Tu es un expert en sécurité privée chez GSS. Rédige une "Synthèse de l'offre" complète (environ ${targetWords} mots) qui sera ajoutée en introduction du mémoire technique.
- Basé UNIQUEMENT sur l'analyse du DCE et les atouts GSS.
- Personnalise par le CONTEXTE et la STRATÉGIE : type d'établissement, usagers, sites/campus, départements, enjeux/risques RÉELS (issus de l'analyse), et METS EN AVANT pour chacun un AVANTAGE concret de GSS (ce que le client gagne). Le texte ne doit pas être recyclable pour un autre client.
- ANTI-REDONDANCE DU NOM : ne répète PAS le nom du client (acheteur) plusieurs fois sur une même page/paragraphe ; cite-le au plus une fois puis utilise des substituts (« l'établissement », « vos sites », « le site concerné »). La personnalisation vient du contexte et des enjeux, pas de la répétition du nom.
- STRATÉGIE & VALEUR : chaque paragraphe doit faire comprendre ce que GSS APPORTE — sa valeur ajoutée et son engagement (fiabilité, réactivité, continuité de service, expertise, accompagnement). Ton commercial et affirmé : donner envie de choisir GSS.
- Mets en avant l'accompagnement GSS (interlocuteur unique, qualité, réactivité).
- CADRE DU MARCHÉ : Ce marché est un marché ${marketType === 'public' ? 'PUBLIC — utilise le vocabulaire de la commande publique (pouvoir adjudicateur, titulaire, sous-critères), cite les obligations du CCP et mets en avant les garanties de conformité et la transparence' : 'PRIVÉ — adopte un ton commercial direct, mets en avant la flexibilité, les SLA sur mesure et l\'adaptation aux process internes du client'}. Secteur : ${clientSector}.
- STRATÉGIE : chaque paragraphe doit démontrer que GSS a COMPRIS L'ENJEU du client. Structure-le ainsi : (1) l'enjeu/risque concret de CE client (issu de l'analyse), (2) la réponse GSS DIFFÉRENCIANTE qui y répond (un moyen, une méthode ou engagement précis, pas un slogan), (3) le bénéfice tangible pour le client. Propose un VRAI AVANTAGE, pas une promesse interchangeable.
- INTÈGRE les solutions GSS spécifiques fournies dans le contexte stratégique ci-dessous. Ce sont des arguments concrets et vérifiés que tu dois reformuler naturellement dans le texte.
- Rédige plusieurs paragraphes bien développés (un paragraphe par idée, séparés par un saut de ligne).
- IMPORTANT : N'utilise AUCUNE liste à puces (aucun tiret, aucun bullet point, aucun symbole). Rédige UNIQUEMENT sous forme de texte continu en paragraphes complets. Pas de markdown.
- Le ton doit être professionnel, rassurant et très commercial (vendre l'offre).`;

    const userPrompt = `ANALYSE DU MARCHÉ (DCE) :\n${analysisJson}\n\n--- CONTEXTE STRATÉGIQUE GSS (solutions spécifiques à ce client ${marketType}) ---\n${strategicCtx}\n\nATOUTS GSS (Extrait doc) :\n${gssContext}\n\nRédige le texte de la synthèse de notre offre sur mesure pour ce client.`;

    const generatedText = await this.callOpenAI(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      0.5, 'Génération Synthèse', false
    );

    if (!generatedText) throw new Error('Échec de la génération IA de la synthèse.');

    // ── 7. Remplir les zones « Contexte sur mesure » (texte en continuité, sur place) ──
    // On ne reconstruit plus la DA : les pages sont déjà designées (titre, fond, bandeau, colonnes).
    // On écrit le texte dans les lignes vides réservées (entre début et fin), sans déborder, en
    // préservant la section de chaque ligne → les zones prévues en 2 colonnes coulent gauche→droite.
    const fillResult = fillContextMarkers(body, generatedText);
    console.log(`[MemoireGenerator] Synthèse insérée : ${generatedText.length} caractères sur ${fillResult.pagesUsed}/${fillResult.markers} zone(s), ${fillResult.linesFilled} ligne(s) réservée(s) remplie(s)${fillResult.truncated ? ', texte tronqué pour ne pas déborder' : ''}.`);

    // ── 8. Sérialiser et sauvegarder (structure AO RNE 100% intacte + 1 section ajoutée) ──
    zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
    const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    const outputFileName = `Mémoire technique GSS_${Date.now()}.docx`;
    const outputPath = path.join(this.responseDir, outputFileName);
    fs.writeFileSync(outputPath, buf);

    console.log(`[MemoireGenerator] ═══ Mémoire généré : AO RNE intact + page synthèse ajoutée → ${outputPath} ═══`);

    return {
      filePath: outputPath,
      generatedData: {
        mode: 'AO RNE intact + Synthèse personnalisée insérée (DCE + GSS)',
        client: clientName,
        texte_ajoute: String(generatedText.length) + ' caractères',
      },
    };
  }

  /**
   * Construit, en UN appel IA, une stratégie de sûreté propre au client puis le texte de CHAQUE page
   * de synthèse (un angle distinct par page, cf. STRATEGY_BEATS). L'entrée est `analysisData` (compact),
   * PAS le DCE brut → prompt léger (évite la limite TPM). Réutilise les helpers de profilage existants
   * (type marché, secteur, cadre réglementaire, solutions GSS) et active enfin keyRisks /
   * gssStrategicRecommendations. Renvoie { profile, stakes[], axes[], pages[] } avec pages.length == nZones.
   */
  private async buildClientStrategy(
    analysisData: any, nZones: number, gssContext: string, perZoneCapWords: number[],
    retrievalChunks: RetrievalChunk[] = [], zoneLabels: string[] = [],
  ): Promise<{ profile: string; stakes: string[]; axes: string[]; pages: string[] }> {
    const clientName = analysisData?.clientName || 'le client';
    const sites: string[] = (analysisData?.sites || []).map((s: any) => (s?.name || '').trim()).filter(Boolean);
    const marketType = detectMarketType(analysisData);
    const sector = detectClientSector(analysisData);
    const regulatory = buildRegulatoryFramework(marketType, sector, analysisData);
    const strategicCtx = buildStrategicContext('presentation', analysisData);
    // ANGLE de chaque zone : le LIBELLÉ écrit après « Contexte … » (ex. « Une réponse pour vos sites »,
    // « approche cousue-main », « DES MOYENS CALIBRÉS ») PRIME sur l'angle générique. C'est le SUJET
    // imposé de la zone → le texte de la page doit traiter ce sujet.
    const genericBeats = assignBeats(nZones);
    const beats = genericBeats.map((b, i) => {
      const lbl = (zoneLabels[i] || '').trim();
      return lbl.length >= 3 ? lbl : b;
    });

    // RECHERCHE PAR PAGE dans le DCE + Documentation GSS : pour CHAQUE angle de page, on récupère les
    // exigences réelles de l'acheteur (CCTP : missions attendues, sites, contraintes) et les atouts GSS
    // qui y répondent. C'est ce qui rend la page argumentée et ancrée dans CE marché (pas un résumé).
    const fmtChunks = (cs: RetrievalChunk[]) =>
      cs.map((c, i) => `[${c.source} · ${c.label} #${i + 1}]\n${c.text.slice(0, 700).trim()}`).join('\n\n');
    let beatExtracts: string[] = beats.map(() => '');
    if (retrievalChunks.length) {
      const beatQueries = beats.map((b) =>
        `${clientName} ${sector} ${sites.slice(0, 6).join(' ')} ${b} exigences missions sûreté sécurité incendie prestations attendues`);
      try {
        const beatEmbs = await this.embedTexts(beatQueries);
        beatExtracts = beats.map((_, i) => {
          const top = this.retrieve(beatEmbs[i], retrievalChunks, 7);
          const dce = fmtChunks(top.filter((c) => c.source === 'DCE').slice(0, 5));
          const gss = fmtChunks(top.filter((c) => ['GSS', 'WEB', 'SOLLICITATION'].includes(c.source)).slice(0, 3));
          return `${dce ? `EXIGENCES DU DCE À TRAITER ICI :\n${dce}\n` : ''}${gss ? `ATOUTS GSS MOBILISABLES :\n${gss}\n` : ''}`;
        });
      } catch (e) {
        console.warn('[MemoireGenerator] Recherche par page (synthèse) échouée → génération sur résumé seul:', (e as Error).message);
      }
    }

    const pagesSpec = beats.map((b, i) =>
      `Page ${i + 1} (~${perZoneCapWords[i] ?? 180} mots) — TITRE/ANGLE IMPOSÉ : « ${b} » → traite EXACTEMENT ce sujet (c'est le titre de la section), sans déborder sur les autres pages.\n${beatExtracts[i] || ''}`).join('\n\n');

    const systemPrompt = `Tu es un expert en sûreté/sécurité privée chez GSS (Global Security Service). Tu prépares la "Synthèse de notre offre sur mesure" d'un mémoire technique, à partir de l'analyse d'un DCE.

DÉMARCHE OBLIGATOIRE :
0) EXPLOITE LE DCE : chaque page est accompagnée d'« EXIGENCES DU DCE À TRAITER ICI » (extraits réels du CCTP/RC : missions attendues, sites, horaires, contraintes, critères de l'acheteur). RÉPONDS À CES EXIGENCES PRÉCISES — reprends-les, cite ce que l'acheteur demande, et montre comment GSS y répond. C'est la base de l'argumentation : une page qui n'exploite pas ces exigences est à refaire. N'invente aucune donnée chiffrée absente des extraits.
1) COMPRENDS le client : déduis son TYPE d'organisation, sa mission, ses USAGERS et parties prenantes (ex. université publique → étudiants, enseignants, personnels, visiteurs, campus multi-sites, calendrier universitaire, vie nocturne ; hôpital → patients, soignants, urgences 24/7 ; site industriel → ouvriers, ICPE, flux logistiques…), et les caractéristiques de ses sites.
2) DÉDUIS les ENJEUX de sûreté SPÉCIFIQUES à ce profil (pas génériques), en partant des exigences du DCE ci-dessus.
3) POSE 3 à 4 AXES STRATÉGIQUES différenciants GSS qui répondent précisément à ces enjeux.
4) RÉDIGE le texte de CHAQUE page selon l'angle imposé ci-dessous, en t'appuyant sur le profil et les axes. Le but central : EXPLIQUER CONCRÈTEMENT CE QUE GSS FAIT POUR CE CLIENT dans SON cas précis — quelles mesures de sûreté GSS déploie dans CE type de lieu (ex. campus → contrôle d'accès des amphis/bibliothèques, rondes nocturnes, gestion des événements étudiants et de la vie nocturne, filtrage des visiteurs ; hôpital → maîtrise des accès urgences/maternité, gestion de l'agressivité, présence 24/7 ; site industriel → filtrage poids lourds, rondes ICPE, levée de doute…). Appuie-toi sur la DOCUMENTATION GSS (procédures, matériel, contrôle d'accès, mise en place) fournie pour citer des mesures RÉELLES, pas inventées.
5) ADAPTE au caractère ${marketType === 'public' ? 'PUBLIC' : 'PRIVÉ'} du marché, concrètement (pas seulement le vocabulaire) : ${marketType === 'public' ? "exigences du CCTP, conformité et transparence (traçabilité, reporting à l'acheteur, respect des grilles conventionnelles, gestion des ERP/campus, continuité de service public et pénalités)." : "réactivité et souplesse (interlocuteur unique, SLA sur mesure, adaptation aux process internes et horaires du client, confidentialité)."}
6) VÉRIFIE, avant de valider chaque page, sa PERTINENCE STRATÉGIQUE ET COMMERCIALE pour CE client : chaque idée doit (a) viser un enjeu RÉEL et propre à ce client/secteur (pas un lieu commun), et (b) donner une raison COMMERCIALE concrète de choisir GSS (avantage différenciant, gain mesurable, réduction de risque/coût, engagement). Si une phrase resterait vraie pour n'importe quel autre marché, RÉÉCRIS-LA ou supprime-la.

RÈGLES DE RÉDACTION (champ "pages") :
- Marché ${marketType === 'public' ? 'PUBLIC : vocabulaire de la commande publique, obligations du CCP, conformité, transparence, pénalités' : 'PRIVÉ : ton commercial, flexibilité, SLA sur mesure, adaptation aux process internes'}. Secteur : ${sector}.
- PERSONNALISE : cite le nom du client (${clientName})${sites.length ? ` et ses sites (${sites.slice(0, 6).join(', ')})` : ''}, ses enjeux réels.
- CONCRÉTUDE : nomme des mesures, dispositifs et moyens PRÉCIS (postes, rondes, contrôle d'accès, vidéosurveillance/levée de doute, filtrage, gestion des flux, procédures d'incident, qualifications d'agents) plutôt que des intentions vagues. Le lecteur doit visualiser ce que GSS fait sur SON site.
- ANCRAGE DCE : reprends explicitement au moins une exigence/mission/contrainte tirée des « EXIGENCES DU DCE À TRAITER ICI » de la page, et réponds-y. Ne te contente pas de généralités sur le secteur.
- Chaque paragraphe = (1) enjeu PRÉCIS du client → (2) réponse GSS différenciante (un moyen, une méthode, un engagement chiffré) → (3) bénéfice concret et ARGUMENT COMMERCIAL (pourquoi GSS plutôt qu'un autre). Jamais de slogan vague ni de texte recyclable pour un autre marché.
- Reste COHÉRENT avec les axes posés. Respecte l'angle de chaque page (pas de redite d'une page à l'autre).
- MISE EN FORME : structure chaque page en 2 ou 3 PARAGRAPHES distincts (une idée par paragraphe), SÉPARÉS par une LIGNE VIDE (deux sauts de ligne « \\n\\n »). Reviens à la ligne entre les idées : il faut un texte AÉRÉ et agréable à lire, pas un seul bloc compact. AUCUN markdown, puce, symbole ni titre. Pas de conclusion générique.
- Vise le nombre de mots indiqué par page (remplir le cadre sans le dépasser largement).

Réponds en JSON valide : { "profile": string, "stakes": string[], "axes": string[], "pages": string[] } où pages a EXACTEMENT ${nZones} éléments (1 par page, dans l'ordre).`;

    const userPrompt = `ANALYSE DU MARCHÉ (DCE) :
${JSON.stringify(analysisData, null, 2).slice(0, 20_000)}

--- CONTEXTE STRATÉGIQUE GSS (cadre ${marketType}) ---
${strategicCtx}

CADRE RÉGLEMENTAIRE : ${regulatory}

DOCUMENTATION GSS — CE QUE GSS FAIT CONCRÈTEMENT (général ; des extraits ciblés sont aussi fournis page par page) :
${(gssContext || '').slice(0, 10_000)}

PLAN DES PAGES — chaque page porte un angle distinct ET ses extraits DCE/GSS à exploiter :
${pagesSpec}

Rends le JSON décrit (profile, stakes, axes, pages[${nZones}]).`;

    const content = await this.callOpenAI(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      0.5, 'Stratégie client + texte par page', true,
    );
    let parsed: any = {};
    try { parsed = JSON.parse(content || '{}'); } catch { parsed = {}; }
    let pages: string[] = Array.isArray(parsed.pages) ? parsed.pages.map((p: any) => String(p || '').trim()) : [];
    // Garantir EXACTEMENT nZones entrées (le remplissage par zone l'exige).
    if (pages.length > nZones) pages = pages.slice(0, nZones);
    while (pages.length < nZones) pages.push('');
    return {
      profile: String(parsed.profile || '').trim(),
      stakes: Array.isArray(parsed.stakes) ? parsed.stakes.map((s: any) => String(s || '').trim()).filter(Boolean) : [],
      axes: Array.isArray(parsed.axes) ? parsed.axes.map((s: any) => String(s || '').trim()).filter(Boolean) : [],
      pages,
    };
  }

  /**
   * Génère le mémoire en SUPERPOSANT la synthèse IA sur AO RNE.pdf (design figé) : le texte est
   * dessiné dans le cadre délimité par les balises « Contexte sur mesure début/fin » (pages 5–8),
   * en 2 colonnes, sans déborder. Aucun reflux possible → la mise en page reste intacte. Sortie PDF.
   */
  public async generateFullMarpPdf(
    dossierId: string,
    onProgress?: (progress: number, message: string, status?: string) => void
  ): Promise<{ filePath: string, generatedData: Record<string, string>, consultations: string[] }> {
    console.log('[MemoireGenerator] ═══ Génération PDF (Marp Complet) ═══');

    if (onProgress) onProgress(10, 'Analyse du DCE et lecture du contexte...');

    const dceContext = await this.getDceContext(dossierId);
    const analysisData = await this.analyzeDce(dceContext);
    const analysisJson = JSON.stringify(analysisData, null, 2);
    const clientName = analysisData?.clientName || 'le client';

    const gssDocs = await this.getGssDocumentation();
    const availableCategories = Object.keys(gssDocs);

    // Matrice de conformité INTERNE : exigences du CCTP/RC ↔ ce que GSS a / fait. On la calcule une
    // seule fois, puis on injecte dans chaque section les exigences de SON chapitre pour que la
    // rédaction réponde point par point aux besoins du DCE (sans rien inventer).
    if (onProgress) onProgress(13, 'Analyse des exigences du CCTP et comparaison aux capacités GSS…');
    const gssFullContext = this.buildFullGssContext(gssDocs, 3000, 60_000);
    const requirementsMatrix = await this.analyzeRequirements(dceContext, gssFullContext);
    const reqsByTheme: Record<string, typeof requirementsMatrix> = {};
    for (const r of requirementsMatrix) {
      const t = (r.theme || '').toString().toUpperCase().replace(/[^IV]/g, '').trim();
      (reqsByTheme[t] ||= []).push(r);
    }

    const sectionsMap: Record<string, string> = {};
    const totalSections = AI_SECTIONS_B.length;
    let completed = 0;

    for (let i = 0; i < totalSections; i++) {
      const section = AI_SECTIONS_B[i];
      if (onProgress) {
        onProgress(15 + Math.round((completed / totalSections) * 70), `Génération section ${i + 1}/${totalSections}: ${section.title}...`);
      }

      const matchedCats = this.matchGssCategories(section.title, availableCategories);
      if (availableCategories.includes('RECHERCHES ET SOLLICITATIONS (RAG)') && !matchedCats.includes('RECHERCHES ET SOLLICITATIONS (RAG)')) {
        matchedCats.unshift('RECHERCHES ET SOLLICITATIONS (RAG)');
      }
      if (availableCategories.includes('RECHERCHES WEB BDD') && !matchedCats.includes('RECHERCHES WEB BDD')) {
        matchedCats.unshift('RECHERCHES WEB BDD');
      }
      if (availableCategories.includes('QUESTIONS INTERNES BDD') && !matchedCats.includes('QUESTIONS INTERNES BDD')) {
        matchedCats.unshift('QUESTIONS INTERNES BDD');
      }
      let gssContext = '';
      for (const cat of matchedCats) {
        gssContext += `\n\n=== Doc GSS : ${cat} ===\n${gssDocs[cat].slice(0, 4000)}`;
      }
      if (!gssContext) {
        // Fallback si pas de correspondance
        for (const cat of ['MANAGEMENT', 'INTERLOCUTEUR UNIQUE', 'MISE EN PLACE', 'VALEURS', 'SUIVI QUALITE ET CONTROLES']) {
          if (gssDocs[cat]) gssContext += `\n\n=== Doc GSS : ${cat} ===\n${gssDocs[cat].slice(0, 3000)}`;
        }
      }

      const systemPrompt = `Tu es un expert en sécurité privée chez GSS qui rédige un mémoire technique GAGNANT pour répondre à l'appel d'offres du client ${clientName}. Tu rédiges la partie intitulée "${section.title}".

OBJECTIF : un contenu SUR-MESURE, directement branché sur les exigences réelles du marché — surtout pas un texte générique interchangeable.

RÈGLES DE PERTINENCE (le plus important) :
- Reprends explicitement les exigences, contraintes et enjeux identifiés dans l'analyse du DCE (sites, horaires, risques, prestations attendues, contraintes réglementaires) et montre CONCRÈTEMENT comment GSS y répond.
- Chaque affirmation doit être adossée à une preuve tirée des atouts GSS fournis : un moyen, un chiffre, une méthode, une certification ou un engagement concret. Bannis les formules creuses ("leader du secteur", "qualité irréprochable") sans preuve.
- Personnalise FORTEMENT pour ${clientName} et son secteur d'activité : ancre le propos dans le contexte réel du marché, pas dans des généralités.
- N'invente JAMAIS une information absente à la fois du DCE et des atouts GSS ; reste factuel.

RÈGLES DE FORME (rendu Marp) :
- NE répète PAS le titre principal "${section.title}" (il est ajouté automatiquement).
- Structure le texte avec des sous-titres en Markdown : "## Sous-titre" (et "### " pour un niveau plus fin). Ces titres seront affichés en rouge et en grande police, utilise-les pour rythmer la lecture.
- Sépare TOUJOURS un sous-titre du paragraphe qui suit par une ligne vide.
- Alterne paragraphes courts et listes à puces ("- …") pour aérer.
- Mets en gras (**…**) les mots-clés, chiffres et engagements forts.
- Ne rédige QUE le contenu de cette section : SANS introduction globale, SANS conclusion générale, SANS salutations.
- Développe la section EN PROFONDEUR : vise 600 à 800 mots, répartis en 3 à 5 sous-parties (chacune introduite par un "## Sous-titre"), pour couvrir le sujet de façon complète et convaincante.
- Traite EXPLICITEMENT chaque exigence du CCTP listée ci-dessous en montrant la réponse concrète de GSS. Si — et SEULEMENT si — GSS n'a aucune réponse spécifique à une exigence (aucun élément dans les atouts GSS), n'invente RIEN : insère à cet endroit, sur sa propre ligne, exactement \`[CONSULTATION REQUISE : <information précise à obtenir auprès de GSS>]\` en décrivant l'information manquante.`;

      const chapterReqs = reqsByTheme[section.chapter] || [];
      const reqBlock = chapterReqs.length
        ? '\n\nEXIGENCES DU CCTP À TRAITER DANS CETTE SECTION (réponds à chacune avec ce que fait GSS ; signale les écarts via [CONSULTATION REQUISE : …]) :\n' +
        chapterReqs
          .map((r) => `- Le CCTP demande : ${r.exigence}\n  Réponse GSS connue : ${r.reponseGss || '(non documentée)'}${r.couverture && r.couverture.toLowerCase() !== 'couvert' ? `  → couverture : ${r.couverture}` : ''}`)
          .join('\n')
        : '';

      const userPrompt = `ANALYSE DU MARCHÉ (DCE) :\n${analysisJson}\n\nATOUTS GSS (Extrait doc) :\n${gssContext}${reqBlock}\n\nRédige le contenu de cette partie de manière experte.`;

      const text = await this.callOpenAI(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        0.5, `Génération ${section.id}`, false
      );
      sectionsMap[section.id] = text || 'Contenu non généré.';
      completed++;
    }

    // ── Consultations requises : exigences que GSS ne couvre pas et qui doivent être précisées ──
    // Deux sources : (1) les écarts détectés par la matrice de conformité ; (2) les marqueurs
    // [CONSULTATION REQUISE : …] que le rédacteur a insérés faute de réponse spécifique dans la Doc GSS.
    const consultations = new Set<string>();
    for (const r of requirementsMatrix) {
      if ((r.couverture || '').toLowerCase().includes('écart') && r.exigence) {
        consultations.add(r.exigence.trim());
      }
    }
    const markerRe = /\[CONSULTATION REQUISE\s*:\s*([^\]]+)\]/gi;
    for (const txt of Object.values(sectionsMap)) {
      let m: RegExpExecArray | null;
      while ((m = markerRe.exec(txt)) !== null) consultations.add(m[1].trim());
    }
    const consultationList = [...consultations].filter(Boolean);

    // Les marqueurs sont des flags INTERNES (pour GSS) : on les retire du texte pour qu'ils
    // n'apparaissent pas dans le PDF remis au client.
    for (const id of Object.keys(sectionsMap)) {
      sectionsMap[id] = sectionsMap[id].replace(markerRe, '').replace(/\n{3,}/g, '\n\n').trim();
    }

    if (consultationList.length) {
      console.warn(`[MemoireGenerator] ⚠ ${consultationList.length} consultation(s) GSS requise(s) :\n- ${consultationList.join('\n- ')}`);
      if (onProgress) {
        onProgress(
          89,
          `⚠ ${consultationList.length} information(s) à obtenir auprès de GSS : ${consultationList.slice(0, 3).join(' ; ')}${consultationList.length > 3 ? '…' : ''}`,
        );
      }
    }

    if (onProgress) onProgress(90, 'Assemblage final de la présentation Marp...');
    const result = await this.exportFromSectionsMap(sectionsMap, dossierId, onProgress);

    // On remonte les consultations dans generatedData (→ « data_generee_par_ia » côté API/front) pour
    // que l'utilisateur voie précisément quelles informations restent à obtenir auprès de GSS.
    const generatedData: Record<string, string> = { ...result.generatedData };
    consultationList.forEach((c, i) => {
      generatedData[`⚠ Consultation requise #${i + 1}`] = c;
    });

    return { ...result, generatedData, consultations: consultationList };
  }

  /**
   * Remplacement DÉTERMINISTE des balises <entreprise> (et synonymes : <client>, <société>…) par le
   * nom du client du DCE, via le script Python, en conservant POLICE, TAILLE et COULEUR d'origine et en
   * retirant le surlignage. Opère SUR PLACE (via un fichier temporaire). Étape non bloquante : en cas
   * d'échec, le PDF d'origine est conservé (balises intactes).
   */
  private replacePlaceholdersPython(pdfPath: string, analysisData: any): { replaced: number } {
    const baseDir = path.resolve(__dirname, '../../');
    const scriptPath = path.resolve(baseDir, 'python/replace_placeholders.py');
    if (!fs.existsSync(scriptPath)) {
      console.warn(`[MemoireGenerator] Script Python introuvable: ${scriptPath} → balises non remplacées.`);
      return { replaced: 0 };
    }

    const ctx = { clientName: analysisData?.clientName || '' };
    const ctxPath = path.join(this.responseDir, `_phctx_${Date.now()}.json`);
    fs.writeFileSync(ctxPath, JSON.stringify(ctx), 'utf8');
    const tmpOut = pdfPath.replace(/\.pdf$/, '.ph.pdf');

    const pythonBin = process.env.PYTHON_BIN || 'py';
    const proc = spawnSync(
      pythonBin,
      [scriptPath, '--input', pdfPath, '--output', tmpOut, '--context', ctxPath],
      { env: { ...process.env }, encoding: 'utf8', timeout: 120000 },
    );
    try { fs.unlinkSync(ctxPath); } catch { /* ignore */ }

    if (proc.stderr) proc.stderr.split('\n').filter(Boolean).forEach((l) => console.log(`[py-ph] ${l}`));
    if (proc.status !== 0 || !fs.existsSync(tmpOut)) {
      console.warn(`[MemoireGenerator] Script balises échec (status=${proc.status}, err=${proc.error?.message || ''}) → balises conservées.`);
      try { fs.unlinkSync(tmpOut); } catch { /* ignore */ }
      return { replaced: 0 };
    }
    try { fs.renameSync(tmpOut, pdfPath); } catch { try { fs.copyFileSync(tmpOut, pdfPath); fs.unlinkSync(tmpOut); } catch { /* ignore */ } }

    try {
      const line = (proc.stdout || '').trim().split('\n').filter(Boolean).pop() || '{}';
      return { replaced: Number(JSON.parse(line).replaced) || 0 };
    } catch {
      return { replaced: 0 };
    }
  }

  /**
   * Réécriture des passages SURLIGNÉS via le script Python (PyMuPDF → GPT → PyMuPDF). PyMuPDF détecte
   * les surlignages jaunes posés par l'utilisateur DANS le PDF et extrait le texte, GPT réécrit chaque
   * passage adapté au client du DCE, puis PyMuPDF supprime l'ancien texte et insère le nouveau à la
   * même taille. Le contexte client (analyse DCE + atouts GSS) est passé en JSON ; la clé OpenAI et le
   * modèle via l'environnement. En cas d'échec, on recopie le PDF intermédiaire (génération non bloquée).
   */
  private rewriteHighlightsPython(
    inputPdf: string, outputPdf: string, analysisData: any, gssContext: string, sites: string[],
  ): { regions: number; filled: number } {
    const baseDir = path.resolve(__dirname, '../../');
    const scriptPath = path.resolve(baseDir, 'python/rewrite_highlights.py');
    const fallback = () => { try { fs.copyFileSync(inputPdf, outputPdf); } catch { /* ignore */ } return { regions: 0, filled: 0 }; };
    if (!fs.existsSync(scriptPath)) {
      console.warn(`[MemoireGenerator] Script Python introuvable: ${scriptPath} → surlignages non traités.`);
      return fallback();
    }

    // Contexte transmis au script (le client/secteur/enjeux servent à personnaliser la réécriture).
    const ctx = {
      clientName: analysisData?.clientName || 'le client',
      sites: (sites || []).filter(Boolean),
      analysis: analysisData ?? {},
      gssContext: (gssContext || '').slice(0, 8000),
    };
    const ctxPath = path.join(this.responseDir, `_hlctx_${Date.now()}.json`);
    fs.writeFileSync(ctxPath, JSON.stringify(ctx), 'utf8');

    const pythonBin = process.env.PYTHON_BIN || 'py';
    const proc = spawnSync(
      pythonBin,
      [scriptPath, '--input', inputPdf, '--output', outputPdf, '--context', ctxPath],
      {
        env: { ...process.env, OPENAI_API_KEY: getSettings().openaiApiKey, MEMOIRE_MODEL: MEMOIRE_MODEL },
        encoding: 'utf8',
        // 600s : marge large pour le page-par-page. Le script s'auto-borne en réalité (REWRITE_TIME_BUDGET)
        // pour toujours finir et retirer le surlignage même si GPT est lent ; ce timeout n'est qu'un garde-fou.
        timeout: 600000,
      },
    );
    try { fs.unlinkSync(ctxPath); } catch { /* ignore */ }

    if (proc.stderr) proc.stderr.split('\n').filter(Boolean).forEach((l) => console.log(`[py] ${l}`));
    if (proc.status !== 0 || !fs.existsSync(outputPdf)) {
      console.warn(`[MemoireGenerator] Script Python échec (status=${proc.status}, err=${proc.error?.message || ''}) → repli sans réécriture.`);
      return fallback();
    }
    try {
      const line = (proc.stdout || '').trim().split('\n').filter(Boolean).pop() || '{}';
      const r = JSON.parse(line);
      return { regions: Number(r.regions) || 0, filled: Number(r.filled) || 0 };
    } catch {
      return { regions: 0, filled: 0 };
    }
  }

  /**
   * Remplit les cadres « Zone d'image » du PDF par des images GÉNÉRÉES (OpenAI Images) via le script
   * Python (PyMuPDF → OpenAI Images → PyMuPDF). PyMuPDF repère chaque cadre blanc et le contexte texte
   * de la page, OpenAI génère une image photoréaliste adaptée au thème/au client, puis PyMuPDF dessine
   * l'image pour remplir le cadre. Opère SUR PLACE (input = output, via un fichier temporaire). Étape
   * non bloquante : en cas d'échec, le PDF d'origine est conservé (cadres intacts).
   */
  private fillImageZonesPython(
    pdfPath: string, analysisData: any, gssContext: string, sites: string[],
  ): { zones: number; filled: number } {
    const baseDir = path.resolve(__dirname, '../../');
    const scriptPath = path.resolve(baseDir, 'python/fill_image_zones.py');
    if (!fs.existsSync(scriptPath)) {
      console.warn(`[MemoireGenerator] Script Python introuvable: ${scriptPath} → cadres image non remplis.`);
      return { zones: 0, filled: 0 };
    }

    const ctx = {
      clientName: analysisData?.clientName || 'le client',
      sites: (sites || []).filter(Boolean),
      analysis: analysisData ?? {},
      gssContext: (gssContext || '').slice(0, 8000),
    };
    const ctxPath = path.join(this.responseDir, `_imgctx_${Date.now()}.json`);
    fs.writeFileSync(ctxPath, JSON.stringify(ctx), 'utf8');
    const tmpOut = pdfPath.replace(/\.pdf$/, '.img.pdf');

    const pythonBin = process.env.PYTHON_BIN || 'py';
    const proc = spawnSync(
      pythonBin,
      [scriptPath, '--input', pdfPath, '--output', tmpOut, '--context', ctxPath],
      {
        env: { ...process.env, OPENAI_API_KEY: getSettings().openaiApiKey, IMAGE_MODEL },
        encoding: 'utf8',
        timeout: 900000, // jusqu'à 15 min : ~11 images générées en parallèle, avec backoff sur 429
      },
    );
    try { fs.unlinkSync(ctxPath); } catch { /* ignore */ }

    if (proc.stderr) proc.stderr.split('\n').filter(Boolean).forEach((l) => console.log(`[py-img] ${l}`));
    if (proc.status !== 0 || !fs.existsSync(tmpOut)) {
      console.warn(`[MemoireGenerator] Script image échec (status=${proc.status}, err=${proc.error?.message || ''}) → cadres conservés.`);
      try { fs.unlinkSync(tmpOut); } catch { /* ignore */ }
      return { zones: 0, filled: 0 };
    }
    // Remplace le PDF par la version avec images (in-place).
    try { fs.renameSync(tmpOut, pdfPath); } catch { try { fs.copyFileSync(tmpOut, pdfPath); fs.unlinkSync(tmpOut); } catch { /* ignore */ } }

    try {
      const line = (proc.stdout || '').trim().split('\n').filter(Boolean).pop() || '{}';
      const r = JSON.parse(line);
      return { zones: Number(r.zones) || 0, filled: Number(r.filled) || 0 };
    } catch {
      return { zones: 0, filled: 0 };
    }
  }

  /** Récupère client / titre / référence pour la page de garde (base puis analyse DCE). */
  private async getCoverInfo(dossierId: string): Promise<{ client: string; title: string; ref: string }> {
    const fallback = { client: 'GSS — Global Security Service', title: 'Mémoire technique', ref: '' };
    if (!dossierId || dossierId === 'export') return fallback;
    try {
      const dossier = await DB.getDossier(dossierId);
      if (dossier && (dossier.acheteur || dossier.reference || dossier.objet)) {
        return {
          client: dossier.acheteur || fallback.client,
          title: dossier.objet || fallback.title,
          ref: dossier.reference || '',
        };
      }
      const analysis = await this.analyzeDce(await this.getDceContext(dossierId));
      return {
        client: analysis?.clientName || fallback.client,
        title: analysis?.projectTitle || fallback.title,
        ref: analysis?.marketRef || '',
      };
    } catch (e: any) {
      console.warn(`[MemoireGenerator] Infos page de garde indisponibles: ${e.message}`);
      return fallback;
    }
  }

  /** Page de garde : label vert, gros titre blanc, client crème, référence. */
  private buildCoverXml(cover: { client: string; title: string; ref: string }): string {
    const spacer = () => paraX('', { after: 0 });
    const parts: string[] = [];
    for (let i = 0; i < 6; i++) parts.push(spacer());
    parts.push(paraX(runX('MÉMOIRE TECHNIQUE', { bold: true, size: 28, color: COL_ACCENT }), { align: 'center', after: 200 }));
    parts.push(paraX(runX((cover.title || '').toUpperCase(), { bold: true, size: 52, color: COL_TITLE }), { align: 'center', after: 240 }));
    parts.push(paraX(runX(cover.client || '', { bold: true, size: 32, color: COL_BODY }), { align: 'center', after: 120 }));
    if (cover.ref) parts.push(paraX(runX(cover.ref, { size: 24, color: COL_MUTED }), { align: 'center', after: 120 }));
    for (let i = 0; i < 4; i++) parts.push(spacer());
    parts.push(paraX(runX('GSS — Global Security Service', { bold: true, size: 24, color: COL_ACCENT }), { align: 'center', after: 0 }));
    return parts.join('');
  }

  /**
   * Export DOCX du cas "sans cadre imposé" (Mode B) tel que GSS-MT-Generator :
   * on reçoit la map plate des sections générées côté front ({id: texte}),
   * on la regroupe par chapitre via le mapping AI_SECTIONS_B, puis on assemble
   * le mémoire de référence GSS via assembleFromSections. Renvoie le chemin du
   * .docx produit (à streamer en téléchargement par la route /export-docx).
   */
  public async exportFromSectionsMap(
    sectionsMap: Record<string, string>,
    dossierId: string = 'export',
    onProgress?: (progress: number, message: string) => void,
  ): Promise<{ filePath: string; generatedData: Record<string, string> }> {
    const chapters: AssembleChapter[] = CHAPTER_ORDER_B.map((ch) => ({
      key: ch,
      title: CHAPTER_TITLES_B[ch],
      sections: AI_SECTIONS_B
        .filter((s) => s.chapter === ch && sectionsMap[s.id]?.trim())
        .map((s): AssembleSection => ({
          title: s.title,
          text: sectionsMap[s.id],
          id: s.id,
          illustration: undefined,
          d2Code: undefined,
        })),

    }));

    if (chapters.every((c) => c.sections.length === 0)) {
      throw new Error('Aucune section générée à exporter (map vide ou ids inconnus).');
    }

    const cover = await this.getCoverInfo(dossierId);

    // Génération automatique des schémas d'architecture D2 pour les sections les plus pertinentes (~15)
    onProgress?.(91, 'Génération des schémas d’architecture D2…');
    const D2_ELIGIBLE_SECTIONS = [
      'b_implantation', 'b_moyens_humains', 'b_encadrement',
      'b_recrutement_formation', 'b_dispositif_absence',
      'b_moyens_materiels', 'b_rondes', 'b_controle_acces', 'b_telesurveillance',
      'b_gestion_alarmes', 'b_organisation', 'b_planning',
      'b_suivi_qualite', 'b_procedures'
    ];

    const d2Promises: Promise<void>[] = [];
    for (const chapter of chapters) {
      for (const sec of chapter.sections) {
        if (!sec.d2Code && sec.text && sec.text.length > 100 && sec.id && D2_ELIGIBLE_SECTIONS.includes(sec.id)) {
          d2Promises.push((async () => {
            try {
              const d2Code = await D2Service.generateD2Code(sec.title, sec.text, cover.client);
              console.log("===== D2 GENERATED =====");
              console.log("Section :", sec.title);
              console.log(d2Code);
              console.log("========================");

              if (d2Code) sec.d2Code = d2Code;
            } catch (e: any) {
              console.warn(`[MemoireGenerator] Génération D2 ignorée pour ${sec.title}:`, e.message || e);
            }
          })());
        }
      }
    }
    
    if (d2Promises.length > 0) {
      await Promise.all(d2Promises);
    }

    // Bibliothèque d'images (base de données) : on charge le pool, puis on attribue
    // AU PLUS une image par slide selon le CONTEXTE du texte, chaque image utilisée
    // une seule fois sur tout le document (unicité stricte, compréhension par LLM).
    onProgress?.(92, 'Chargement des images de la bibliothèque…');
    const imageService = new ImageLibraryService();
    const imagePool = await imageService.loadPool();

    onProgress?.(93, 'Attribution contextuelle des illustrations…');
    const allSlides = MarpGenerator.enumerateContentSlides(chapters);
    // Exclure les slides du bilan pour ne pas leur attribuer d'image
    const slides = allSlides.filter(s => !(s.title?.toLowerCase() || '').includes('bilan'));
    const assignments = await imageService.assignImages(slides, imagePool);

    // Le rendu Marp/Chromium est bloquant et peut durer plusieurs minutes sur un
    // mémoire illustré : on signale l'étape pour que la barre ne semble pas figée.
    onProgress?.(95, `Rendu du PDF (${assignments.size} illustration(s))…`);
    const generator = new MarpGenerator(this.responseDir);
    const result = await generator.generatePdf(chapters, cover, assignments);

    return { filePath: result.filePath, generatedData: {} };
  }

  /**
   * Finalise la génération du mémoire avec cadre imposé après intervention de l'utilisateur.
   */
  public async finalizeMemoire(dossierId: string, userAnswers: Record<string, string>): Promise<{ filePath: string, generatedData: Record<string, string> }> {
    const dossier = await DB.getDossier(dossierId);
    if (!dossier || !dossier.memoire_cadre_state) {
      throw new Error("État de génération introuvable ou expiré.");
    }
    const state = dossier.memoire_cadre_state;

    // Charger le docx temporaire : local en priorité, sinon récupération CROSS-POSTE depuis le Storage
    // (le temp a pu être généré sur une autre machine → tempPath local injoignable ici).
    let content: Buffer;
    if (state.tempPath && fs.existsSync(state.tempPath)) {
      content = fs.readFileSync(state.tempPath);
    } else if (state.storageKey) {
      console.log(`[MemoireGenerator] Temp local absent → download depuis le Storage (${state.storageKey}).`);
      content = await downloadTempDocx(state.storageKey);
    } else {
      throw new Error("Le fichier temporaire est introuvable (ni local, ni Storage).");
    }
    const zip = new PizZip(content);
    const documentXml = zip.file('word/document.xml');
    if (!documentXml) throw new Error('word/document.xml introuvable dans le template temporaire');

    const docXmlStr = documentXml.asText();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(docXmlStr, 'text/xml');

    // Appliquer les réponses utilisateur sur les [CHAMP_XXX] restants
    let applied = 0;
    const tEls = getElementsWithLocalName(xmlDoc, 't');

    for (const mf of state.missingFields) {
      const answer = userAnswers[mf.id];
      if (answer) {
        tEls.forEach((tEl: any) => replaceTextInElement(xmlDoc, tEl, `[CHAMP_${mf.id}]`, answer));
        applied++;
      }
    }

    console.log(`[MemoireGenerator] Finalisation : ${applied} champs remplis par l'utilisateur.`);

    // Sauvegarde finale
    const serializer = new XMLSerializer();
    documentXml.name = 'word/document.xml';
    zip.file('word/document.xml', serializer.serializeToString(xmlDoc));

    const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    const finalPath = path.join(this.responseDir, `memoire_${dossierId}_${Date.now()}.docx`);
    fs.writeFileSync(finalPath, buf);

    // Nettoyage de l'état
    try { fs.unlinkSync(state.tempPath); } catch { /* ignore */ }
    await DB.saveDossier(dossierId, { memoire_cadre_state: null });

    return { filePath: finalPath, generatedData: userAnswers };
  }

  async evaluateMissingInfoChat(context: string, chatHistory: any[]): Promise<{ status: 'accepted' | 'rejected', extracted_value?: string, bot_reply: string }> {
    const prompt = `Vous êtes un assistant IA qui aide un utilisateur à remplir les informations manquantes d'un document professionnel (mémoire technique ou appel d'offres).

L'information manquante requise est décrite par ce contexte : 
"${context}"

Voici l'historique de la conversation actuelle (si vide, c'est que vous devez poser la première question) :
${JSON.stringify(chatHistory, null, 2)}

TACHE :
Si l'historique est vide ou si c'est le début de l'échange pour ce champ :
- status = "rejected"
- bot_reply = "Posez une question claire, courte et naturelle pour demander l'information décrite dans le contexte."

Si l'utilisateur a répondu, analysez son dernier message. Déterminez si l'information fournie répond complètement au contexte demandé.
1. Si la réponse est complète :
   - Extrayez la valeur formelle exacte et propre qui devra être insérée dans le document (ex: "12 Rue de la Paix, 75000 Paris", "M. Jean Dupont").
   - status = "accepted"
   - bot_reply = "Un message court de confirmation (ex: Merci, c'est noté.)"
2. Si la réponse est incomplète ou hors-sujet :
   - status = "rejected"
   - bot_reply = "Posez une question claire et polie pour demander la précision manquante."

FORMAT DE SORTIE (JSON EXACT) :
{
  "status": "accepted" ou "rejected",
  "extracted_value": "la valeur propre (uniquement si accepted)",
  "bot_reply": "votre message naturel à l'utilisateur"
}
`;

    const { getSettings } = require('../core/config');
    const openAiKey = getSettings().openaiApiKey;
    if (!openAiKey) throw new Error("Clé OpenAI manquante");

    const payload = {
      model: 'gpt-5.4-mini',
      messages: [{ role: 'system', content: prompt }],
      temperature: 0.2,
      response_format: { type: "json_object" }
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Erreur OpenAI: ${err}`);
    }

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  }
}
