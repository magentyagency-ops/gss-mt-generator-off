import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import pdf from 'pdf-parse';
import { texteTropPauvre, transcrirePdf } from './ocr_pdf';
import { getSettings } from '../core/config';
import { ExtractionMethod } from '../schemas/common';

export class DocConverterError extends Error {}
export class LibreOfficeNotFoundError extends DocConverterError {}

// macOS common LibreOffice paths
const MACOS_SOFFICE_CANDIDATES = [
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/opt/homebrew/bin/soffice',
  '/usr/local/bin/soffice',
];

export function findSoffice(): string | null {
  const settings = getSettings();
  if (settings.sofficeBin && fs.existsSync(settings.sofficeBin)) {
    return settings.sofficeBin;
  }

  // Check PATH
  try {
    const checkCmd = process.platform === 'win32' ? 'where soffice' : 'which soffice';
    const out = execSync(checkCmd, { stdio: [] }).toString().trim();
    if (out) return out.split('\n')[0].trim();
  } catch (e) {}

  try {
    const checkCmd = process.platform === 'win32' ? 'where libreoffice' : 'which libreoffice';
    const out = execSync(checkCmd, { stdio: [] }).toString().trim();
    if (out) return out.split('\n')[0].trim();
  } catch (e) {}

  // Candidates for macOS
  if (process.platform === 'darwin') {
    for (const cand of MACOS_SOFFICE_CANDIDATES) {
      if (fs.existsSync(cand)) {
        return cand;
      }
    }
  }

  return null;
}

export function sofficeAvailable(): boolean {
  return findSoffice() !== null;
}

export function findTextutil(): string | null {
  if (process.platform !== 'darwin') return null;
  try {
    const out = execSync('which textutil', { stdio: [] }).toString().trim();
    if (out) return out;
  } catch (e) {}
  if (fs.existsSync('/usr/bin/textutil')) return '/usr/bin/textutil';
  return null;
}

export function convertDocToTextTextutil(src: string): string {
  if (!fs.existsSync(src)) {
    throw new DocConverterError(`Fichier introuvable : ${src}`);
  }
  const textutil = findTextutil();
  if (!textutil) {
    throw new DocConverterError('textutil introuvable (disponible uniquement sur macOS).');
  }
  try {
    const proc = spawnSync(textutil, ['-convert', 'txt', '-stdout', src], { timeout: 120000 });
    if (proc.status !== 0) {
      throw new DocConverterError(`Échec textutil (${path.basename(src)}) : ${proc.stderr?.toString()}`);
    }
    return proc.stdout.toString();
  } catch (e: any) {
    throw new DocConverterError(`Échec conversion textutil : ${e.message}`);
  }
}

export function convertDocToDocx(src: string, outDir?: string): string {
  if (!fs.existsSync(src)) {
    throw new DocConverterError(`Fichier introuvable : ${src}`);
  }
  const soffice = findSoffice();
  if (!soffice) {
    throw new LibreOfficeNotFoundError(
      "LibreOffice (soffice) est requis pour convertir les .doc legacy mais " +
      "n'a pas été trouvé. Installez-le puis réessayez, ou renseignez " +
      "SOFFICE_BIN dans .env."
    );
  }

  const outputDirectory = outDir || fs.mkdtempSync(path.join(path.dirname(src), 'gss_doc_'));
  const tempProfileDir = fs.mkdtempSync(path.join(path.dirname(src), 'gss_lo_profile_'));

  const args = [
    '--headless',
    '--norestore',
    `-env:UserInstallation=file:///${tempProfileDir.replace(/\\/g, '/')}`,
    '--convert-to',
    'docx',
    '--outdir',
    outputDirectory,
    src,
  ];

  try {
    const proc = spawnSync(soffice, args, { timeout: 120000 });
    if (proc.status !== 0) {
      throw new DocConverterError(
        `Échec conversion LibreOffice (${path.basename(src)}). code=${proc.status} stderr=${proc.stderr?.toString()}`
      );
    }
  } finally {
    try {
      fs.rmSync(tempProfileDir, { recursive: true, force: true });
    } catch (e) {}
  }

  const stem = path.basename(src, path.extname(src));
  const produced = path.join(outputDirectory, `${stem}.docx`);
  if (!fs.existsSync(produced)) {
    throw new DocConverterError(`Fichier converti non trouvé : ${produced}`);
  }
  return produced;
}

export interface DocxParagraph {
  text: string;
  styleName: string | null;
}

export interface DocxTable {
  rows: string[][];
}

export interface DocxStructure {
  paragraphs: DocxParagraph[];
  tables: DocxTable[];
  allElements: Array<{ type: 'paragraph'; text: string; styleName: string | null } | { type: 'table'; rows: string[][] }>;
}

export function loadDocxStructure(filePath: string): DocxStructure {
  if (!fs.existsSync(filePath)) {
    throw new DocConverterError(`Fichier non trouvé : ${filePath}`);
  }

  const zip = new AdmZip(filePath);
  const docXmlEntry = zip.getEntry('word/document.xml');
  if (!docXmlEntry) {
    throw new DocConverterError(`word/document.xml non trouvé dans le docx : ${filePath}`);
  }

  const xmlText = docXmlEntry.getData().toString('utf8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    // Texte des runs tel quel : sans cela, les espaces de début/fin de run disparaissaient (« deThiaiscomporte »)
    // et un run purement numérique était converti en nombre puis ignoré (« environ 7|5 points » lu « environ 7 »).
    trimValues: false,
    parseTagValue: false,
  });

  const jsonObj = parser.parse(xmlText);
  const body = jsonObj['w:document']?.['w:body'];
  if (!body) {
    throw new DocConverterError(`Structure XML du document non reconnue dans ${filePath}`);
  }

  const paragraphs: DocxParagraph[] = [];
  const tables: DocxTable[] = [];
  const allElements: DocxStructure['allElements'] = [];

  // Helper to extract text from a paragraph node w:p
  const extractTextFromParagraphNode = (pNode: any): string => {
    if (!pNode) return '';
    let text = '';
    // w:r can be an object or an array of objects
    const runs = Array.isArray(pNode['w:r']) ? pNode['w:r'] : [pNode['w:r']];
    for (const r of runs) {
      if (!r) continue;
      // w:t can be string, object (with attributes) or array of strings/objects
      const ts = Array.isArray(r['w:t']) ? r['w:t'] : [r['w:t']];
      for (const t of ts) {
        if (!t) continue;
        if (typeof t === 'string' || typeof t === 'number') {
          text += String(t);
        } else if (typeof t === 'object') {
          if (t['#text']) {
            text += t['#text'];
          }
        }
      }
    }
    return text;
  };

  // Helper to extract style name from w:pPr -> w:pStyle
  const extractStyleFromParagraphNode = (pNode: any): string | null => {
    const pPr = pNode?.['w:pPr'];
    if (!pPr) return null;
    const pStyle = pPr['w:pStyle'];
    if (!pStyle) return null;
    return pStyle['@_w:val'] || null;
  };

  // Process elements inside body
  // The body contains w:p and w:tbl directly. fast-xml-parser might keep them as properties or in order if configured,
  // but to preserve their document order, we can parse the XML using regex to extract elements in order.
  // Wait, let's look at the child nodes of body. Since fast-xml-parser parses keys, the order of keys like w:p and w:tbl
  // might not be preserved if we just iterate them.
  // To preserve strict order of paragraphs and tables, we can scan the raw XML for <w:p> and <w:tbl> tags.
  // Let's do that! It is extremely simple to tokenize the body.
  const bodyXmlMatch = xmlText.match(/<w:body>([\s\S]*?)<\/w:body>/);
  if (!bodyXmlMatch) {
    throw new DocConverterError(`w:body non trouvé dans document.xml`);
  }
  const bodyXml = bodyXmlMatch[1];

  // Regex to match top-level tags <w:p> and <w:tbl>
  // We can write a simple parser that steps through the XML:
  let idx = 0;
  while (idx < bodyXml.length) {
    const nextP = bodyXml.indexOf('<w:p', idx);
    const nextTbl = bodyXml.indexOf('<w:tbl', idx);

    if (nextP === -1 && nextTbl === -1) {
      break;
    }

    if (nextP !== -1 && (nextTbl === -1 || nextP < nextTbl)) {
      // It's a paragraph. Find matching closing tag </w:p>
      // We must handle nested tags correctly, but w:p cannot be nested under another w:p.
      const closeP = bodyXml.indexOf('</w:p>', nextP);
      if (closeP === -1) break;
      const pXml = bodyXml.substring(nextP, closeP + 6);
      idx = closeP + 6;

      const pObj = parser.parse(pXml)['w:p'];
      if (pObj) {
        const text = extractTextFromParagraphNode(pObj);
        const styleName = extractStyleFromParagraphNode(pObj);
        const p: DocxParagraph = { text, styleName };
        paragraphs.push(p);
        allElements.push({ type: 'paragraph', text, styleName });
      }
    } else {
      // It's a table. Find matching closing tag </w:tbl>
      // w:tbl cannot be nested under another w:tbl (nested tables exist but are rare in DCE, and even if they do, simple matching works).
      const closeTbl = bodyXml.indexOf('</w:tbl>', nextTbl);
      if (closeTbl === -1) break;
      const tblXml = bodyXml.substring(nextTbl, closeTbl + 8);
      idx = closeTbl + 8;

      const tblObj = parser.parse(tblXml)['w:tbl'];
      if (tblObj) {
        const rows: string[][] = [];
        const wTrs = Array.isArray(tblObj['w:tr']) ? tblObj['w:tr'] : [tblObj['w:tr']];
        for (const tr of wTrs) {
          if (!tr) continue;
          const rowCells: string[] = [];
          const wTcs = Array.isArray(tr['w:tc']) ? tr['w:tc'] : [tr['w:tc']];
          for (const tc of wTcs) {
            if (!tc) continue;
            // A table cell tc contains paragraphs w:p
            const tcPs = Array.isArray(tc['w:p']) ? tc['w:p'] : [tc['w:p']];
            const cellTextParts: string[] = [];
            for (const p of tcPs) {
              if (p) {
                cellTextParts.push(extractTextFromParagraphNode(p));
              }
            }
            rowCells.push(cellTextParts.join(' ').trim());
          }
          rows.push(rowCells);
        }
        tables.push({ rows });
        allElements.push({ type: 'table', rows });
      }
    }
  }

  return { paragraphs, tables, allElements };
}

export function loadDocxText(filePath: string): string {
  const struct = loadDocxStructure(filePath);
  const lines: string[] = [];
  for (const el of struct.allElements) {
    if (el.type === 'paragraph') {
      lines.push(el.text);
    } else if (el.type === 'table') {
      for (const row of el.rows) {
        lines.push(row.join(' | '));
      }
    }
  }
  return lines.join('\n');
}

/**
 * Extraction ANNOTÉE d'un cadre de réponse (.docx) pour la DÉTECTION des champs à remplir.
 * Contrairement à loadDocxText (qui aplatit tout en texte), on préserve les éléments interactifs
 * du formulaire pour que l'IA repère ce qui reste à renseigner :
 *   • cases à cocher — form field `w:checkBox`, content control `w14:checkbox`, symboles Wingdings
 *     (☐ = F0A8, cochés = F0FE/F0FD/F06F/F0FB/F0FC) ou glyphes littéraux ☐ ☑ ☒ ✔ ✗
 *     → balisées « [CASE ☐ vide] » / « [CASE ☒ cochée] » ;
 *   • champs de formulaire texte (`FORMTEXT`) → « [CHAMP À REMPLIR] » ;
 *   • tableaux → rendus en grille, chaque cellule vide balisée « ⬚ » (à remplir).
 * Best-effort et tolérant (regex) : sert UNIQUEMENT à l'analyse des manques, jamais à la génération.
 */
export function loadDocxTemplateAnnotated(filePath: string): string {
  if (!fs.existsSync(filePath)) throw new DocConverterError(`Fichier non trouvé : ${filePath}`);
  const zip = new AdmZip(filePath);
  const entry = zip.getEntry('word/document.xml');
  if (!entry) throw new DocConverterError(`word/document.xml non trouvé : ${filePath}`);
  const xmlText = entry.getData().toString('utf8');
  const bodyMatch = xmlText.match(/<w:body>([\s\S]*?)<\/w:body>/);
  const bodyXml = bodyMatch ? bodyMatch[1] : xmlText;

  // Texte brut d'un fragment XML (concatène les <w:t>, décode les entités).
  const runText = (xml: string): string =>
    (xml.match(/<w:t[ >][\s\S]*?<\/w:t>/g) || [])
      .map((m) => m.replace(/<[^>]+>/g, ''))
      .join('')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'");

  const SYM_UNCHECKED = /w:char="F0A8"/i;                       // ☐ Wingdings
  const SYM_CHECKED = /w:char="(F0FE|F0FD|F06F|F0FB|F0FC)"/i;   // ☒/☑ Wingdings
  const LITERAL_UNCHECKED = /[☐❏❑⬜□]/; // ☐ ❏ ❑ ⬜ □
  const LITERAL_CHECKED = /[☑☒✅✔✓✗]/; // ☑ ☒ ✅ ✔ ✓ ✗

  // Analyse un fragment (paragraphe ou cellule) → ligne annotée (case à cocher / champ / texte).
  const analyzeFragment = (frag: string): string => {
    const text = runText(frag).trim();
    const hasCheckboxField = /<w:checkBox/.test(frag) || /<w14:checkbox/.test(frag);
    const checkedField = /<w:checked\b(?![^>]*w:val="0")/.test(frag) || /<w14:checked[^>]*w14:val="1"/.test(frag);
    const symUnchecked = SYM_UNCHECKED.test(frag);
    const symChecked = SYM_CHECKED.test(frag);
    const litUnchecked = LITERAL_UNCHECKED.test(text);
    const litChecked = LITERAL_CHECKED.test(text);
    const hasFormText = /FORMTEXT/.test(frag);

    if (hasCheckboxField || symUnchecked || symChecked || litUnchecked || litChecked) {
      const checked = (hasCheckboxField && checkedField) || symChecked || litChecked;
      const clean = text.replace(LITERAL_UNCHECKED, '').replace(LITERAL_CHECKED, '').replace(/\s+/g, ' ').trim();
      return `[CASE ${checked ? '☒ cochée' : '☐ vide'}] ${clean}`.trim();
    }
    if (hasFormText) return `[CHAMP À REMPLIR] ${text}`.trim();
    return text;
  };

  const lines: string[] = [];
  let idx = 0;
  while (idx < bodyXml.length) {
    const nextP = bodyXml.indexOf('<w:p', idx);
    const nextTbl = bodyXml.indexOf('<w:tbl', idx);
    if (nextP === -1 && nextTbl === -1) break;

    if (nextP !== -1 && (nextTbl === -1 || nextP < nextTbl)) {
      const closeP = bodyXml.indexOf('</w:p>', nextP);
      if (closeP === -1) break;
      const pXml = bodyXml.substring(nextP, closeP + 6);
      idx = closeP + 6;
      const line = analyzeFragment(pXml);
      if (line) lines.push(line);
    } else {
      const closeTbl = bodyXml.indexOf('</w:tbl>', nextTbl);
      if (closeTbl === -1) break;
      const tblXml = bodyXml.substring(nextTbl, closeTbl + 8);
      idx = closeTbl + 8;
      lines.push('[TABLEAU]');
      // Matrice des cellules ANALYSÉES (texte / case à cocher), puis annotation ligne↔colonne.
      const rowXmls = tblXml.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || [];
      const matrix: string[][] = rowXmls.map((trXml) => {
        const cellXmls = trXml.match(/<w:tc[ >][\s\S]*?<\/w:tc>/g) || [];
        return cellXmls.map((tc) => analyzeFragment(tc).trim());
      });
      // En-têtes de COLONNE = 1re ligne ; libellé de LIGNE = 1re cellule non vide de la ligne.
      const colHeaders = matrix[0] || [];
      matrix.forEach((row, r) => {
        const rowHeader = (row.find((c) => c !== '') || '').replace(/^\[[^\]]+\]\s*/, '').slice(0, 60);
        const cells = row.map((cell, c) => {
          if (cell !== '') return cell;
          // Cellule VIDE à remplir : on rattache colonne + ligne pour lever l'ambiguïté.
          const col = (colHeaders[c] || '').replace(/^\[[^\]]+\]\s*/, '').slice(0, 60);
          const parts: string[] = [];
          if (r > 0 && col) parts.push(`colonne: « ${col} »`);
          if (c > 0 && rowHeader) parts.push(`ligne: « ${rowHeader} »`);
          return parts.length ? `⬚ (à remplir — ${parts.join(', ')})` : '⬚ (à remplir)';
        });
        lines.push('| ' + cells.join(' | ') + ' |');
      });
      lines.push('[/TABLEAU]');
    }
  }
  return lines.join('\n');
}

/**
 * Texte d'une page PDF avec les ESPACES entre les éléments d'une même ligne. Le rendu par défaut les collait :
 * dans un tableau, « 2 niveaux | 1183 places » devenait « 21183 » (le mémoire annonçait alors « 21 183 places »), et
 * « Parc ouvert 24h/24 | du lundi au samedi de 7h30 à 20h30 » mêlait deux colonnes. Un écart visible entre deux
 * éléments donne une espace ; un écart de colonne en donne trois. Le texte lui-même est inchangé.
 */
function rendrePagePdf(pageData: any): Promise<string> {
  return pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false }).then((contenu: any) => {
    let texte = '';
    let dernierY: number | null = null;
    let finX = 0;
    for (const el of contenu.items) {
      const x = el.transform[4];
      const y = el.transform[5];
      const hauteur = Math.abs(el.transform[3]) || Math.abs(el.transform[0]) || 10;
      if (dernierY !== null && Math.abs(y - dernierY) < 0.5) {
        const ecart = x - finX;
        if (ecart > hauteur * 1.2) texte += '   ';
        else if (ecart > hauteur * 0.25 && !/\s$/.test(texte) && !/^\s/.test(el.str)) texte += ' ';
      } else if (dernierY !== null) {
        texte += '\n';
      }
      texte += el.str;
      dernierY = y;
      finX = x + (el.width || 0);
    }
    return texte;
  });
}

/**
 * PDF sans couche texte dont la transcription a échoué (T10-COH-4) : chemins, pour que la génération dise à GSS quelle pièce
 * n'a pas pu être lue (jamais « aucun cahier des charges n'a été trouvé » quand le fichier est dans le dossier).
 */
export const pdfsIllisibles = new Set<string>();

export async function extractPdfText(filePath: string): Promise<string> {
  if (!fs.existsSync(filePath)) {
    throw new DocConverterError(`Fichier non trouvé : ${filePath}`);
  }
  const dataBuffer = fs.readFileSync(filePath);
  let data: any;
  try {
    data = await pdf(dataBuffer, { pagerender: rendrePagePdf });
  } catch (e: any) {
    throw new DocConverterError(`Échec extraction PDF : ${e.message}`);
  }
  // PDF sans couche texte (scan, « Microsoft Print To PDF ») : transcription par le modèle, sinon le
  // CCTP / RC n'était pas lu du tout (quelques centaines de caractères pour 30 pages).
  if (texteTropPauvre(data.text || '', data.numpages || 0)) {
    try {
      const transcrit = await transcrirePdf(filePath);
      if (transcrit.replace(/\s+/g, '').length > (data.text || '').replace(/\s+/g, '').length) { pdfsIllisibles.delete(filePath); return transcrit; }
    } catch (e: any) {
      console.warn(`[docConverter] Transcription du PDF ${path.basename(filePath)} impossible : ${e?.message || e}`);
    }
    pdfsIllisibles.add(filePath);
  }
  return data.text;
}

/**
 * Conversion .doc → .docx par Microsoft Word (macOS), qui conserve les tableaux du cadre (textutil les
 * aplatit). Word étant « bac à sable », le fichier passe par son dossier de conteneur, sous un nom unique ;
 * seul CE document est ouvert, enregistré puis fermé — jamais les autres documents ouverts de l'utilisateur.
 * Renvoie le chemin du .docx, ou null si Word n'est pas disponible ou si la conversion échoue.
 */
export function convertirDocAvecWord(src: string, outDir: string): string | null {
  if (process.platform !== 'darwin' || !fs.existsSync('/Applications/Microsoft Word.app')) return null;
  const conteneur = path.join(process.env.HOME || '', 'Library/Containers/com.microsoft.Word/Data/Documents/gss-conversion');
  const nom = `gss-cadre-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const entree = path.join(conteneur, `${nom}.doc`);
  const sortieWord = path.join(conteneur, `${nom}.docx`);
  const script = [
    'on run argv',
    'set src to item 1 of argv',
    'set dst to item 2 of argv',
    'tell application "Microsoft Word"',
    'open (POSIX file src)',
    'set d to document (item 3 of argv)',
    'save as d file name dst file format format document',
    'close document (item 4 of argv) saving no',
    'end tell',
    'end run',
  ].join('\n');
  try {
    fs.mkdirSync(conteneur, { recursive: true });
    fs.copyFileSync(src, entree);
    const r = spawnSync('osascript', ['-e', script, entree, sortieWord, `${nom}.doc`, `${nom}.docx`], { timeout: 120_000, encoding: 'utf-8' });
    if (!fs.existsSync(sortieWord) || !fs.statSync(sortieWord).size) {
      console.warn(`[docConverter] Conversion Word impossible (${(r.stderr || '').trim().slice(0, 200)}).`);
      return null;
    }
    fs.mkdirSync(outDir, { recursive: true });
    const cible = path.join(outDir, path.basename(src).replace(/\.doc$/i, '.docx'));
    fs.copyFileSync(sortieWord, cible);
    return cible;
  } catch (e: any) {
    console.warn(`[docConverter] Conversion Word impossible (${e?.message || e}).`);
    return null;
  } finally {
    for (const f of [entree, sortieWord, path.join(conteneur, `~$${nom}.doc`), path.join(conteneur, `~$${nom}.docx`)]) {
      try { fs.rmSync(f, { force: true }); } catch { /* ignore */ }
    }
  }
}

export function extractDocText(src: string): { text: string; method: ExtractionMethod } {
  if (sofficeAvailable()) {
    const tempDir = fs.mkdtempSync(path.join(path.dirname(src), 'gss_lo_temp_'));
    try {
      const converted = convertDocToDocx(src, tempDir);
      const text = loadDocxText(converted);
      return { text, method: ExtractionMethod.DOC_LIBREOFFICE };
    } catch (e) {
      // soffice présent mais inutilisable (ex. lien Homebrew vers une application désinstallée) :
      // repli sur textutil plutôt que de perdre la pièce.
      if (findTextutil() === null) throw e;
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}
    }
  }
  if (findTextutil() !== null) {
    return { text: convertDocToTextTextutil(src), method: ExtractionMethod.DOC_TEXTUTIL };
  }
  throw new LibreOfficeNotFoundError(
    "Aucune voie de conversion .doc disponible : ni LibreOffice (soffice) ni " +
    "textutil (macOS). Installez LibreOffice ou renseignez SOFFICE_BIN."
  );
}

export async function extractText(filePath: string, opts: { texteBrutSiIllisible?: boolean } = {}): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.docx') {
    try {
      return loadDocxText(filePath);
    } catch (e: any) {
      // Pièce du DCE seulement (option texteBrutSiIllisible, Z1-REG-1) : lecture structurée impossible (fast-xml-parser :
      // « Cannot read properties of undefined (reading 'addChild') » sur rouen_univ « Annexe 3 CCTP - Pointeaux à installer
      // v2026.docx », REG6-1) : texte brut par mammoth, plutôt que de retirer la pièce du DCE sans le dire. Sans l'option
      // (ingestion de la base de connaissances, pièces jointes de l'assistant), l'erreur remonte comme avant : chaque appelant
      // garde son propre repli.
      if (!opts.texteBrutSiIllisible) throw e;
      const mammoth = require('mammoth');
      const r = await mammoth.extractRawText({ path: filePath });
      console.warn(`[docConverter] ${path.basename(filePath)} : lecture structurée impossible (${e?.message || e}) → texte brut (mammoth, ${String(r?.value || '').length} caractères).`);
      return String(r?.value || '');
    }
  }
  if (ext === '.doc') {
    return extractDocText(filePath).text;
  }
  if (ext === '.pdf') {
    return extractPdfText(filePath);
  }
  throw new DocConverterError(`Format non supporté : ${ext} (${path.basename(filePath)})`);
}
