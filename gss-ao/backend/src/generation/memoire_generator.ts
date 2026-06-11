import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import OpenAI from 'openai';
import { getSettings } from '../core/config';
import { DB } from '../core/db';
import { extractPdfText, extractText } from '../ingestion/docConverter';
// @ts-ignore
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

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

function getTableCellContext(cell: any, tr: any): string {
  const directCells = getDirectCells(tr);
  const cellIndex = directCells.indexOf(cell);
  const rowContext = directCells.filter((c: any) => c !== cell).map((c: any) => getElementText(c).trim()).filter(Boolean).join(' | ');
  const tbl = getParentWithLocalName(tr, 'tbl');
  if (tbl) {
    const allRows = getElementsWithLocalName(tbl, 'tr');
    if (allRows.length > 0) {
      const headerCells = getDirectCells(allRows[0]);
      if (headerCells.length > 0 && allRows[0] !== tr) {
        let headerText = '';
        if (cellIndex >= 0 && cellIndex < headerCells.length) {
          headerText = getElementText(headerCells[cellIndex]).trim();
        }
        if (headerText) return `Colonne: "${headerText}" | Ligne: "${rowContext}"`;
      }
    }
  }
  return `Ligne: "${rowContext}"`;
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

// ─── Main Class ───

export class MemoireGenerator {
  private openai: OpenAI;
  private responseDir: string;
  private templateDir: string;

  constructor() {
    const settings = getSettings();
    this.openai = new OpenAI({ apiKey: settings.openaiApiKey });
    const baseDir = path.resolve(__dirname, '../../../../');
    this.responseDir = path.resolve(baseDir, 'response');
    this.templateDir = path.resolve(baseDir, 'Template');
    if (!fs.existsSync(this.responseDir)) fs.mkdirSync(this.responseDir, { recursive: true });
  }

  private findDceTemplate(dceDir: string): string | null {
    if (!fs.existsSync(dceDir)) return null;
    const files = fs.readdirSync(dceDir);
    const memoireFile = files.find(f => {
      const normalized = f.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      return normalized.includes('memoire') && (normalized.endsWith('.doc') || normalized.endsWith('.docx'));
    });
    return memoireFile ? path.join(dceDir, memoireFile) : null;
  }

  /** Load ALL DCE files (DOC/DOCX/PDF) recursively — no truncation */
  private async getDceContext(dossierId: string): Promise<string> {
    const baseDir = path.resolve(__dirname, '../../../../');
    const settings = getSettings();
    let context = '';

    // 1. Pre-parsed JSON outputs if available
    const rcPath = path.join(baseDir, `gss-ao/data/output/rc_${dossierId}.json`);
    const cctpPath = path.join(baseDir, `gss-ao/data/output/cctp_${dossierId}.json`);
    if (fs.existsSync(rcPath)) context += `\n\n--- RC (analysé) ---\n${fs.readFileSync(rcPath, 'utf8')}`;
    if (fs.existsSync(cctpPath)) context += `\n\n--- CCTP (analysé) ---\n${fs.readFileSync(cctpPath, 'utf8')}`;

    // 2. Load ALL raw files recursively
    const dceDirs = [
      path.resolve(baseDir, `gss-ao/data/output/dce_${dossierId}`),
      settings.corpusDceDir,
      path.resolve(baseDir, 'GSS analyse et génération/DCEDCE MP2026_08'),
      path.resolve(baseDir, 'DCEDCE MP2026_08'),
      path.resolve(baseDir, 'Cas-Univ-Rouen-MP2026-08'),
    ].filter(Boolean) as string[];

    const loadedFiles = new Set<string>();

    const scanDir = async (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
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

        if (text.length > 100) {
          const label = entry.name.replace(/\.(doc|docx|pdf)$/i, '');
          context += `\n\n--- ${label} ---\n${text}`;
          console.log(`[MemoireGenerator] DCE chargé: ${entry.name} (${text.length} chars)`);
        }
      }
    };

    for (const dceDir of dceDirs) await scanDir(dceDir);

    if (context.length < 100) {
      throw new Error('[MemoireGenerator] Aucun contenu DCE trouvé. Vérifiez que les fichiers du DCE sont bien présents.');
    }

    console.log(`[MemoireGenerator] Contexte DCE total: ${context.length} chars`);
    return context;
  }

  /** Load ALL GSS documentation from Template/Documentation GSS/ — no truncation */
  private async getGssDocumentation(): Promise<string> {
    const docGssDir = path.join(this.templateDir, 'Documentation GSS');
    if (!fs.existsSync(docGssDir)) {
      console.warn('[MemoireGenerator] Dossier Documentation GSS introuvable:', docGssDir);
      return '';
    }

    let gssDoc = '';
    const rubriques = fs.readdirSync(docGssDir)
      .filter(item => fs.statSync(path.join(docGssDir, item)).isDirectory())
      .sort();

    for (const rubrique of rubriques) {
      const rubriqueDir = path.join(docGssDir, rubrique);
      const pdfFiles = fs.readdirSync(rubriqueDir).filter(f => f.toLowerCase().endsWith('.pdf')).sort();
      if (pdfFiles.length === 0) continue;

      let rubriqueText = '';
      for (const file of pdfFiles) {
        try {
          const text = await extractPdfText(path.join(rubriqueDir, file));
          if (text && text.trim().length > 30) {
            rubriqueText += text.trim() + '\n';
            console.log(`[MemoireGenerator] GSS doc chargée: ${rubrique}/${file} (${text.trim().length} chars)`);
          } else {
            console.warn(`[MemoireGenerator] GSS doc illisible (PDF image?): ${rubrique}/${file}`);
          }
        } catch (_e) {
          console.warn(`[MemoireGenerator] Erreur lecture: ${rubrique}/${file}`);
        }
      }

      gssDoc += `\n--- ${rubrique} ---\n`;
      gssDoc += rubriqueText || `[Fichiers disponibles mais non lisibles: ${pdfFiles.join(', ')}]\n`;
    }

    console.log(`[MemoireGenerator] Documentation GSS totale: ${gssDoc.length} chars, ${rubriques.length} rubriques`);
    return gssDoc;
  }

  public async generate(dossierId: string): Promise<{ filePath: string, generatedData: Record<string, string> }> {
    const settings = getSettings();
    const baseDir = path.resolve(__dirname, '../../../../');
    const uploadedDceDir = path.resolve(baseDir, `gss-ao/data/output/dce_${dossierId}`);

    // 1. Find template
    let templatePath: string | null = null;

    const possibleDirs = [
      uploadedDceDir,
      settings.corpusDceDir,
      path.resolve(baseDir, 'GSS analyse et génération/DCEDCE MP2026_08'),
      path.resolve(baseDir, 'DCEDCE MP2026_08'),
      path.resolve(baseDir, 'Cas-Univ-Rouen-MP2026-08'),
    ];

    const dossier = DB.getDossier(dossierId);
    if (dossier && dossier.dce_files) {
      const templateFile = dossier.dce_files.find((f: any) => f.type === 'Mémoire (cadre)');
      if (templateFile && templateFile.nom) {
        const filename = path.basename(templateFile.nom);
        for (const dir of possibleDirs) {
          if (!dir) continue;
          const p = path.join(dir, filename);
          if (fs.existsSync(p)) { templatePath = p; break; }
        }
      }
    }

    if (!templatePath) {
      for (const dir of possibleDirs) {
        if (!dir) continue;
        const found = this.findDceTemplate(dir);
        if (found) { templatePath = found; break; }
      }
    }

    if (!templatePath) {
      templatePath = path.join(this.templateDir, 'Mémoire technique', 'AO RNE.docx');
      if (!fs.existsSync(templatePath)) {
        throw new Error(`Aucun template trouvé ni dans le DCE ni dans ${templatePath}`);
      }
    }

    console.log(`[MemoireGenerator] Using template: ${templatePath}`);

    // 2. Load DOCX and parse XML DOM
    const content = fs.readFileSync(templatePath);
    const zip = new PizZip(content);
    const documentXml = zip.file('word/document.xml');
    if (!documentXml) throw new Error('word/document.xml introuvable dans le template');

    const docXmlStr = documentXml.asText();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(docXmlStr, 'text/xml');

    // 3. Walk the DOM to detect fillable fields
    let fieldCounter = 1;
    const prompts: string[] = [];
    const descriptors: Array<{ id: number; type: string; element?: any; promptContext: string }> = [];
    const filledCells = new Set<any>();
    const filledEmptyParas = new Set<any>();
    let currentHeading = 'Introduction / Généralités';
    const recentParagraphs: string[] = [];
    let lastLabelText = '';

    const walkDOM = (node: any) => {
      if (node.nodeType !== 1) return;
      const localName = node.localName;

      // Track headings, recent paragraphs, and label state
      if (localName === 'p') {
        const pText = getElementText(node).trim();
        if (isHeadingParagraph(node)) {
          currentHeading = pText;
          recentParagraphs.length = 0;
          lastLabelText = '';
        } else if (pText && pText.length > 3 && !/^[_.\-…\s]+$/.test(pText)) {
          recentParagraphs.push(pText);
          if (recentParagraphs.length > 3) recentParagraphs.shift();
          if (pText.trimEnd().endsWith(':') && pText.length < 200) {
            lastLabelText = pText;
          } else if (!/\[CHAMP_/.test(pText)) {
            lastLabelText = '';
          }
        }
      }

      // A. Table cells — empty cells in rows with mixed content
      if (localName === 'tr') {
        const directCells = getDirectCells(node);
        const cellInfos = directCells.map((cell: any) => ({
          cell,
          text: getElementText(cell).trim(),
          isEmpty: getElementText(cell).trim() === ''
        }));
        const hasText = cellInfos.some((c: any) => !c.isEmpty);
        const hasEmpty = cellInfos.some((c: any) => c.isEmpty);

        if (hasText && hasEmpty) {
          cellInfos.forEach((cInfo: any) => {
            if (cInfo.isEmpty && !filledCells.has(cInfo.cell)) {
              filledCells.add(cInfo.cell);
              const id = fieldCounter++;
              const cellContext = getTableCellContext(cInfo.cell, node);
              const nearbyCtx = recentParagraphs.length > 0 ? ` | Contexte proche: "${recentParagraphs.slice(-2).join(' / ')}"` : '';
              const fullContext = `Section: "${currentHeading}" | Tableau: ${cellContext}${nearbyCtx}`;
              const hint = inferFieldHint(fullContext);
              prompts.push(`Champ [CHAMP_${id}] ${hint} : Cellule de tableau vide. ${fullContext}`);
              descriptors.push({ id, type: 'text', promptContext: fullContext });

              let p = findLocalNameChild(cInfo.cell, 'p') || getElementsWithLocalName(cInfo.cell, 'p')[0];
              if (!p) {
                p = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:p');
                cInfo.cell.appendChild(p);
              }
              const r = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:r');
              const t = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:t');
              t.textContent = `[CHAMP_${id}]`;
              r.appendChild(t);
              p.appendChild(r);
            }
          });
        }
      }

      // B. Paragraphs
      if (localName === 'p') {
        const parentCell = getParentWithLocalName(node, 'tc');
        if (parentCell && filledCells.has(parentCell)) {
          // already handled as table cell
        } else {
          const fullText = getElementText(node).trim();

          // F. Empty paragraph following a label ("Dénomination du candidat :\n[empty]")
          if (fullText === '' && lastLabelText && !filledEmptyParas.has(node)) {
            filledEmptyParas.add(node);
            const id = fieldCounter++;
            const fullContext = `Section: "${currentHeading}" | Champ à remplir pour: "${lastLabelText}"`;
            const hint = inferFieldHint(lastLabelText);
            prompts.push(`Champ [CHAMP_${id}] ${hint} : ${fullContext}`);
            descriptors.push({ id, type: 'text', promptContext: fullContext });
            const r = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:r');
            const t = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:t');
            t.textContent = `[CHAMP_${id}]`;
            r.appendChild(t);
            node.appendChild(r);
            lastLabelText = '';
          }

          // A. Legacy checkboxes
          const legacyCheckboxes = getElementsWithLocalName(node, 'checkBox');
          legacyCheckboxes.forEach((cb: any) => {
            const id = fieldCounter++;
            const fullContext = `Section: "${currentHeading}" | Case à cocher. Contexte: "${fullText}"`;
            const hint = inferFieldHint(fullContext);
            prompts.push(`Champ [CHAMP_${id}] ${hint} : ${fullContext}`);
            descriptors.push({ id, type: 'legacy_checkbox', element: cb, promptContext: fullContext });
          });

          // B. Symbol checkboxes (Wingdings)
          const symbols = getElementsWithLocalName(node, 'sym');
          symbols.forEach((sym: any) => {
            const font = sym.getAttribute('w:font') || sym.getAttributeNS('*', 'font');
            const char = sym.getAttribute('w:char') || sym.getAttributeNS('*', 'char');
            if (font === 'Wingdings' && (char === 'F0A8' || char === 'F0FE')) {
              const id = fieldCounter++;
              const fullContext = `Section: "${currentHeading}" | Case à cocher (symbole). Contexte: "${fullText}"`;
              const hint = inferFieldHint(fullContext);
              prompts.push(`Champ [CHAMP_${id}] ${hint} : ${fullContext}`);
              descriptors.push({ id, type: 'sym_checkbox', element: sym, promptContext: fullContext });
            }
          });

          // C. w14 content control checkboxes
          const w14Checkboxes = getElementsWithLocalName(node, 'checkbox');
          w14Checkboxes.forEach((w14: any) => {
            if (w14.namespaceURI === 'http://schemas.microsoft.com/office/word/2010/wordml' || w14.prefix === 'w14' || w14.localName === 'checkbox') {
              const id = fieldCounter++;
              const fullContext = `Section: "${currentHeading}" | Case à cocher (contrôle de contenu). Contexte: "${fullText}"`;
              const hint = inferFieldHint(fullContext);
              prompts.push(`Champ [CHAMP_${id}] ${hint} : ${fullContext}`);
              descriptors.push({ id, type: 'w14_checkbox', element: w14, promptContext: fullContext });
            }
          });

          // D. Text-based checkboxes (☐ / [] / ())
          const tElements = getElementsWithLocalName(node, 't');
          const hasTextCheckbox = /☐|\[\s*\]|\(\s*\)/.test(fullText);
          if (hasTextCheckbox) {
            tElements.forEach((tEl: any) => {
              const text = tEl.textContent || '';
              const regex = /☐|\[\s*\]|\(\s*\)/g;
              let match;
              let textWithPlaceholders = text;
              let replaced = false;
              while ((match = regex.exec(text)) !== null) {
                const id = fieldCounter++;
                const fullContext = `Section: "${currentHeading}" | Case à cocher. Contexte: "${fullText}"`;
                const hint = inferFieldHint(fullContext);
                prompts.push(`Champ [CHAMP_${id}] ${hint} : ${fullContext}`);
                descriptors.push({ id, type: 'text', promptContext: fullContext });
                textWithPlaceholders = textWithPlaceholders.replace(match[0], `[CHAMP_${id}]`);
                replaced = true;
              }
              if (replaced) tEl.textContent = textWithPlaceholders;
            });
          }

          // E. Dotted lines
          const hasDotted = /(?:[_.\-…]\s*){3,}/.test(fullText);
          if (hasDotted) {
            let replacedDotted = false;
            const nearbyCtx = recentParagraphs.length > 0 ? ` | Paragraphes précédents: "${recentParagraphs.slice(-2).join(' / ')}"` : '';

            tElements.forEach((tEl: any) => {
              const text = tEl.textContent || '';
              if (/^[_.\-…\s]+$/.test(text) && text.trim().length > 0) {
                if (!replacedDotted) {
                  const id = fieldCounter++;
                  const fullContext = `Section: "${currentHeading}" | Pointillés à remplir. Contexte: "${fullText}"${nearbyCtx}`;
                  const hint = inferFieldHint(fullContext);
                  prompts.push(`Champ [CHAMP_${id}] ${hint} : ${fullContext}`);
                  descriptors.push({ id, type: 'text', promptContext: fullContext });
                  tEl.textContent = `[CHAMP_${id}]`;
                  replacedDotted = true;
                } else {
                  tEl.textContent = '';
                }
              } else if (/(?:[_.\-…]\s*){3,}/.test(text)) {
                let replacedText = text;
                const dotRegex = /(?:[_.\-…]\s*){3,}/g;
                let dotMatch;
                while ((dotMatch = dotRegex.exec(text)) !== null) {
                  const id = fieldCounter++;
                  const fullContext = `Section: "${currentHeading}" | Pointillés à remplir. Contexte: "${fullText}"${nearbyCtx}`;
                  const hint = inferFieldHint(fullContext);
                  prompts.push(`Champ [CHAMP_${id}] ${hint} : ${fullContext}`);
                  descriptors.push({ id, type: 'text', promptContext: fullContext });
                  replacedText = replacedText.replace(dotMatch[0], `[CHAMP_${id}]`);
                  replacedDotted = true;
                }
                tEl.textContent = replacedText;
              }
            });

            if (!replacedDotted) {
              const id = fieldCounter++;
              const fullContext = `Section: "${currentHeading}" | Zone à remplir. Contexte: "${fullText}"${nearbyCtx}`;
              const hint = inferFieldHint(fullContext);
              prompts.push(`Champ [CHAMP_${id}] ${hint} : ${fullContext}`);
              descriptors.push({ id, type: 'text', promptContext: fullContext });
              const r = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:r');
              const t = xmlDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:t');
              t.textContent = ` [CHAMP_${id}] `;
              r.appendChild(t);
              node.appendChild(r);
            }
          }
        }
      }

      // Recurse
      if (node.childNodes) {
        for (let i = 0; i < node.childNodes.length; i++) walkDOM(node.childNodes[i]);
      }
    };

    walkDOM(xmlDoc.documentElement);

    console.log(`[MemoireGenerator] Detected ${prompts.length} fillable fields in document.`);
    if (prompts.length === 0) throw new Error("Aucun champ à remplir détecté dans le template Word.");

    // 4. Load context in parallel
    const [dceContext, gssDocumentation] = await Promise.all([
      this.getDceContext(dossierId),
      this.getGssDocumentation(),
    ]);

    const systemPrompt = `Tu es un Directeur d'Appels d'Offres (Bid Manager) Expert en Sécurité Privée pour l'entreprise GSS (Global Security Service).
Ta mission est de rédiger un Mémoire Technique gagnant pour un marché public, en remplaçant des balises [CHAMP_X] dans le cadre imposé par l'acheteur.

══════════════════════════════════════
RÈGLE N°1 — LONGUEUR ET FORMAT DE RÉPONSE (CRITIQUE)
══════════════════════════════════════
Chaque champ porte un tag définissant le format attendu. Respecte-le ABSOLUMENT :

[VALEUR COURTE]   → 1 à 6 mots maximum. Valeur brute, factuelle. (Ex: "812 345 678 00013", "80 agents", "Campus Pasteur", "Oui"). Aucune phrase introductive.
[LISTE]           → Éléments séparés par un tiret "- " et un saut de ligne. 3 à 10 items max. (Ex: "- CQP APS\n- SSIAP 1").
[PARAGRAPHE]      → Paragraphe dense, ultra-professionnel, argumenté et commercial (4 à 10 phrases). Tu dois VENDRE la prestation de GSS.
[CASE A COCHER]   → UNIQUEMENT "☑" ou "☐". (GSS se conforme toujours à 100%, donc mets "☑" pour valider nos engagements).

ATTENTION FORMATAGE WORD : N'UTILISE JAMAIS DE MARKDOWN (pas de **gras**, pas de #). Utilise uniquement des sauts de ligne et des tirets standards.

══════════════════════════════════════
RÈGLE N°2 — EXPLOITATION DU DCE ET PERSONNALISATION
══════════════════════════════════════
Un mémoire technique générique est un mémoire perdant.
- Cherche les particularités du besoin : noms exacts des sites, effectifs demandés, risques, horaires atypiques.
- Pour chaque [PARAGRAPHE], DÉMONTRE que tu as lu le CCTP en citant spécifiquement le contexte du client.
- Adapte nos procédures standards GSS à LEUR réalité opérationnelle.

══════════════════════════════════════
IDENTITÉ ET DONNÉES DE RÉFÉRENCE GSS
══════════════════════════════════════
- Dénomination : GSS - Global Security Service
- Siège social : 12 rue de la République, 76000 Rouen
- Agence locale : GSS Normandie - 45 avenue du Mont-Riboudet, 76000 Rouen
- SIRET : 812 345 678 00013
- N° CNAPS : AUT-076-2025-01-31-20200000001 (valide jusqu'au 31/01/2025)
- Dirigeant : M. Jean-Marc MARCHANI — Agrément CNAPS : AGR-076-2024-12-31-20190000001
- PME : Oui | Effectif France : ~250 agents | Effectif dép. 76 : ~80 agents | dép. 27 : ~35 agents
- Contact : Mme Vaché, Responsable Marchés Publics — mme.vache@gss-securite.fr
- Certifications : ISO 9001, APSAD R81, APSAD R31 (P3)
- Station télésurveillance : Rouen Centre, opérationnelle 24/7
- Moyens : rondes NFC TrackForce, PTI-GSM, main courante électronique

══════════════════════════════════════
DOCUMENTATION INTERNE GSS (procédures, moyens opérationnels)
══════════════════════════════════════
${gssDocumentation.trim() || '(Documentation PDF non lisible — utiliser les données de référence ci-dessus et les connaissances métiers sécurité privée)'}

FORMAT DE RÉPONSE : JSON valide uniquement.
{"replacements": [ {"id": 1, "value": "..."} ]}`;

    // 5. Process fields in batches of 15 to keep model attention focused
    const BATCH_SIZE = 15;
    const totalBatches = Math.ceil(prompts.length / BATCH_SIZE);
    const replacements: Array<{ id: number; value: string }> = [];

    console.log(`[MemoireGenerator] Processing ${prompts.length} fields in ${totalBatches} batch(es)...`);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchPrompts = prompts.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);
      const batchNum = batchIndex + 1;
      const hasParagraph = batchPrompts.some(p => p.includes('[PARAGRAPHE]'));
      const temperature = hasParagraph ? 0.4 : 0.2;

      const userPrompt = `Voici le contenu complet des documents du DCE :
${dceContext}

Liste des ${batchPrompts.length} champs à remplir (lot ${batchNum}/${totalBatches}) :
${batchPrompts.join('\n')}

Renvoie uniquement un objet JSON valide contenant les ${batchPrompts.length} valeurs. CHAQUE champ listé ci-dessus doit être présent dans la réponse.`;

      console.log(`[MemoireGenerator] Batch ${batchNum}/${totalBatches}: ${batchPrompts.length} fields, temperature=${temperature}`);

      try {
        const completion = await this.openai.chat.completions.create({
          model: 'gpt-4o',
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature,
        });

        const aiResponse = completion.choices[0].message.content || '{}';
        try {
          const data = JSON.parse(aiResponse);
          const batchResults: Array<{ id: number; value: string }> = data.replacements || [];
          replacements.push(...batchResults);
          console.log(`[MemoireGenerator] Batch ${batchNum}: ${batchResults.length} values returned.`);
        } catch (e) {
          console.error(`[MemoireGenerator] Batch ${batchNum}: Failed to parse GPT response:`, aiResponse.slice(0, 200));
        }
      } catch (e) {
        console.error(`[MemoireGenerator] Batch ${batchNum}: API call failed:`, e);
      }
    }

    console.log(`[MemoireGenerator] GPT returned ${replacements.length} values total.`);

    // 6. Apply replacements in the DOM
    let applied = 0;
    replacements.forEach((rep: any) => {
      const desc = descriptors.find(d => d.id === rep.id);
      if (!desc) return;
      const value = String(rep.value);
      const isChecked = value.includes('☑') || value.toLowerCase() === 'oui' || value.toLowerCase() === 'yes' || value === '1' || value === 'true';

      if (desc.type === 'text') {
        const tEls = getElementsWithLocalName(xmlDoc, 't');
        tEls.forEach((tEl: any) => replaceTextInElement(xmlDoc, tEl, `[CHAMP_${rep.id}]`, value));
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

    // 8. Serialize and save
    const serializer = new XMLSerializer();
    zip.file('word/document.xml', serializer.serializeToString(xmlDoc));
    const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    const outputFileName = `Mémoire technique GSS_${Date.now()}.docx`;
    const outputPath = path.join(this.responseDir, outputFileName);
    fs.writeFileSync(outputPath, buf);

    console.log(`[MemoireGenerator] Successfully generated ${outputPath}`);

    return {
      filePath: outputPath,
      generatedData: {
        total_suggestions: String(prompts.length),
        modifications_reussies: String(applied),
        details: JSON.stringify(replacements.map(r => ({
          recherche: `[CHAMP_${r.id}]`,
          remplacement: r.value
        })))
      }
    };
  }
}
