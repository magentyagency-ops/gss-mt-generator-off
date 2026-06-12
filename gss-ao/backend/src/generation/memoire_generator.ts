import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import OpenAI from 'openai';
import { getSettings } from '../core/config';
// @ts-ignore
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

// ─── DOM Helpers (from GSS analyse prototype) ───

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
  // Multi-line: insert <w:br/> elements
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

/** Crée un paragraphe Word (<w:p>) avec un style optionnel et un texte simple. */
function makeParagraph(xmlDoc: any, text: string, styleName?: string): any {
  const p = xmlDoc.createElementNS(W_NS, 'w:p');
  if (styleName) {
    const pPr = xmlDoc.createElementNS(W_NS, 'w:pPr');
    const pStyle = xmlDoc.createElementNS(W_NS, 'w:pStyle');
    pStyle.setAttribute('w:val', styleName);
    pPr.appendChild(pStyle);
    p.appendChild(pPr);
  }
  const r = xmlDoc.createElementNS(W_NS, 'w:r');
  const t = xmlDoc.createElementNS(W_NS, 'w:t');
  t.setAttribute('xml:space', 'preserve');
  t.textContent = text;
  r.appendChild(t);
  p.appendChild(r);
  return p;
}

export interface AssembleChapter {
  /** Chapitre I..IV (ordre = ordre des Heading1 dans le template). */
  key: string;
  title: string;
  sections: Array<{ title: string; text: string }>;
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
      const normalized = f.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      return normalized.includes('memoire') && normalized.includes('technique') && normalized.endsWith('.docx');
    });
    return memoireFile ? path.join(dceDir, memoireFile) : null;
  }

  /** Extract text from a .docx file */
  private extractDocxText(filePath: string): string {
    try {
      const content = fs.readFileSync(filePath, 'binary');
      const zip = new PizZip(content);
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
      return doc.getFullText();
    } catch (e) {
      console.error(`[MemoireGenerator] Cannot extract text from ${filePath}:`, e);
      return '';
    }
  }

  /** Load all DCE context from actual DOCX files */
  private getDceContext(dossierId: string): string {
    const baseDir = path.resolve(__dirname, '../../../../');
    let context = '';

    // 1. Try loading from JSON output (if analysis was done)
    const rcPath = path.join(baseDir, `gss-ao/data/output/rc_${dossierId}.json`);
    const cctpPath = path.join(baseDir, `gss-ao/data/output/cctp_${dossierId}.json`);
    if (fs.existsSync(rcPath)) {
      context += `\n\n--- RC ---\n${fs.readFileSync(rcPath, 'utf8')}`;
    }
    if (fs.existsSync(cctpPath)) {
      context += `\n\n--- CCTP ---\n${fs.readFileSync(cctpPath, 'utf8')}`;
    }

    // 2. Also load raw DOCX files from the DCE folder for richer context
    const dceDirs = [
      path.resolve(baseDir, `gss-ao/data/output/dce_${dossierId}`),
      path.resolve(baseDir, 'DCEDCE MP2026_08'),
      path.resolve(baseDir, 'Cas-Univ-Rouen-MP2026-08'),
    ];

    for (const dceDir of dceDirs) {
      if (!fs.existsSync(dceDir)) continue;
      const files = fs.readdirSync(dceDir);
      
      for (const file of files) {
        const lower = file.toLowerCase();
        if (!lower.endsWith('.docx') && !lower.endsWith('.doc')) continue;
        // Skip the template itself
        if (lower.includes('memoire') && lower.includes('technique')) continue;
        // Skip BPU/DPGF (pricing, not technical)
        if (lower.includes('bpu') || lower.includes('dpgf')) continue;
        
        const filePath = path.join(dceDir, file);
        if (lower.endsWith('.docx')) {
          const text = this.extractDocxText(filePath);
          if (text.length > 100) {
            const label = file.replace(/\.docx$/i, '');
            // Limit each document to 15000 chars to stay within token limits
            context += `\n\n--- ${label} ---\n${text.substring(0, 15000)}`;
            console.log(`[MemoireGenerator] Loaded DCE file: ${file} (${text.length} chars)`);
          }
        }
      }
      
      if (context.length > 1000) break; // Don't load from multiple dirs if we found content
    }

    if (context.length < 100) {
      console.warn(`[MemoireGenerator] No DCE content found, using mock context.`);
      context += `\n\n--- CCTP (Mock) ---\nAppel d'offres MP2026-08 pour prestations de sécurité-sûreté et télésécurité (lots 1, 2 et 3) pour l'Université de Rouen Normandie. Certification APSAD requise. Sites: Mont-Saint-Aignan, Martainville, Pasteur, Madrillet, Evreux.`;
    }

    return context;
  }

  /**
   * Main generation — DOM-based approach inspired by GSS analyse prototype.
   */
  public async generate(dossierId: string): Promise<{ filePath: string, generatedData: Record<string, string> }> {
    const settings = getSettings();
    const baseDir = path.resolve(__dirname, '../../../../');
    const uploadedDceDir = path.resolve(baseDir, `gss-ao/data/output/dce_${dossierId}`);

    // 1. Find template
    let templatePath = this.findDceTemplate(uploadedDceDir);
    if (!templatePath) {
      const dceDir = settings.corpusDceDir;
      templatePath = this.findDceTemplate(dceDir);
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

    // 3. Walk the DOM to detect fillable fields and insert placeholders
    let fieldCounter = 1;
    const prompts: string[] = [];
    const descriptors: Array<{ id: number; type: string; element?: any; promptContext: string }> = [];
    const filledCells = new Set<any>();
    let currentHeading = 'Introduction / Généralités';

    const walkDOM = (node: any) => {
      if (node.nodeType !== 1) return;
      const localName = node.localName;

      // Track headings for context
      if (localName === 'p' && isHeadingParagraph(node)) {
        currentHeading = getElementText(node).trim();
      }

      // A. Table cells — find empty cells in rows that have mixed content
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
              const fullContext = `Section: "${currentHeading}" | Tableau: ${cellContext}`;
              prompts.push(`Champ [CHAMP_${id}] : Cellule de tableau vide. ${fullContext}`);
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

      // B. Paragraphs — detect dotted lines
      if (localName === 'p') {
        const parentCell = getParentWithLocalName(node, 'tc');
        if (parentCell && filledCells.has(parentCell)) {
          // Skip — already handled as a table cell
        } else {
          const fullText = getElementText(node).trim();
          const hasDotted = /(?:[_.\-…]\s*){3,}/.test(fullText);

          if (hasDotted) {
            let replacedDotted = false;
            const tElements = getElementsWithLocalName(node, 't');

            tElements.forEach((tEl: any) => {
              const text = tEl.textContent || '';
              // Pure dotted-line element
              if (/^[_.\-…\s]+$/.test(text) && text.trim().length > 0) {
                if (!replacedDotted) {
                  const id = fieldCounter++;
                  const fullContext = `Section: "${currentHeading}" | Pointillés à remplir. Contexte: "${fullText}"`;
                  prompts.push(`Champ [CHAMP_${id}] : ${fullContext}`);
                  descriptors.push({ id, type: 'text', promptContext: fullContext });
                  tEl.textContent = `[CHAMP_${id}]`;
                  replacedDotted = true;
                } else {
                  tEl.textContent = '';
                }
              }
              // Mixed text with dotted sections
              else if (/(?:[_.\-…]\s*){3,}/.test(text)) {
                let replacedText = text;
                const dotRegex = /(?:[_.\-…]\s*){3,}/g;
                let dotMatch;
                while ((dotMatch = dotRegex.exec(text)) !== null) {
                  const id = fieldCounter++;
                  const fullContext = `Section: "${currentHeading}" | Pointillés à remplir. Contexte: "${fullText}"`;
                  prompts.push(`Champ [CHAMP_${id}] : ${fullContext}`);
                  descriptors.push({ id, type: 'text', promptContext: fullContext });
                  replacedText = replacedText.replace(dotMatch[0], `[CHAMP_${id}]`);
                  replacedDotted = true;
                }
                tEl.textContent = replacedText;
              }
            });

            // Fallback: if dots were detected in fullText but no <w:t> was replaced, append placeholder
            if (!replacedDotted) {
              const id = fieldCounter++;
              const fullContext = `Section: "${currentHeading}" | Zone à remplir. Contexte: "${fullText}"`;
              prompts.push(`Champ [CHAMP_${id}] : ${fullContext}`);
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
        for (let i = 0; i < node.childNodes.length; i++) {
          walkDOM(node.childNodes[i]);
        }
      }
    };

    walkDOM(xmlDoc.documentElement);

    console.log(`[MemoireGenerator] Detected ${prompts.length} fillable fields in document.`);

    if (prompts.length === 0) {
      throw new Error("Aucun champ à remplir détecté dans le template Word.");
    }

    // 4. Call GPT to fill all fields at once
    const dceContext = this.getDceContext(dossierId);

    const systemPrompt = `Tu es un expert de haut niveau en marchés publics de sécurité privée et un rédacteur chevronné pour l'entreprise GSS (Global Security Service).
On te fournit l'analyse du DCE (CCTP, RC, annexes) et une liste de champs [CHAMP_X] repérés dans le cadre de réponse de l'acheteur.

Ta mission est de rédiger les valeurs à insérer dans chacun de ces champs de manière extrêmement professionnelle, complète, qualitative et sur-mesure, en exploitant AU MAXIMUM les informations du DCE fourni.

INFORMATIONS SUR GSS (à utiliser pour remplir les champs d'identification) :
- Dénomination : GSS - Global Security Service
- Siège social : 12 rue de la République, 76000 Rouen
- Agence locale : GSS Normandie - 45 avenue du Mont-Riboudet, 76000 Rouen
- SIRET : 812 345 678 00013
- N° CNAPS : AUT-076-2025-01-31-20200000001
- Date d'obtention autorisation CNAPS : 31/01/2025
- Dirigeant : M. Jean-Marc MARCHANI, Agrément dirigeant CNAPS : AGR-076-2024-12-31-20190000001
- PME : Oui
- Effectif France : ~250 agents
- Effectif Département 76 : ~80 agents
- Effectif Département 27 : ~35 agents
- Contact principal : Mme Vaché, Responsable Marchés Publics, mme.vache@gss-securite.fr, 02 35 XX XX XX
- Certifications : ISO 9001, APSAD R81, APSAD R31 (P3)
- Station télésurveillance : Rouen Centre, opérationnelle 24/7

RÈGLES DE RÉDACTION :
1. TON ET STYLE : Irréprochable, précis, technique et engageant. Évite ABSOLUMENT les réponses courtes, paresseuses ou génériques ("Conforme", "Disponible", "Oui"). Chaque réponse doit valoriser le professionnalisme de GSS.
2. TYPES DE CHAMPS :
   - Pour les cellules de tableaux et réponses factuelles (effectifs, diplômes, matériel) : concis et factuel (ex: "CQP APS + SSIAP1", "4 ETP", "90%").
   - Pour les questions ouvertes, descriptions ou pointillés : rédige des paragraphes complets, détaillés et structurés (3 à 8 phrases) décrivant organisation, contrôle CNAPS, gestion des plannings, rondes avec pointeaux NFC, gestion des alarmes, etc.
3. CONTEXTUALISATION : Utilise les informations exactes du CCTP et des annexes (noms des sites, effectifs demandés, horaires, contraintes) pour personnaliser chaque réponse. Cite les noms exacts des campus et les détails opérationnels.
4. PERSONNALISATION : Anticipe des problématiques opérationnelles non explicitement formulées par l'acheteur et propose les solutions GSS associées.
5. FORMAT : Renvoie UNIQUEMENT un objet JSON valide :
{"replacements": [ {"id": 1, "value": "Texte détaillé rédigé..."} ]}`;

    const userPrompt = `Voici le contenu complet des documents du DCE :
${dceContext}

Liste des ${prompts.length} champs à remplir dans le mémoire technique :
${prompts.join('\n')}

Renvoie uniquement un objet JSON valide contenant les ${prompts.length} valeurs à insérer. CHAQUE champ doit avoir une réponse.`;

    console.log(`[MemoireGenerator] Calling OpenAI GPT-4o to fill ${prompts.length} fields...`);
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
    });

    const aiResponse = completion.choices[0].message.content || '{}';
    let replacements: Array<{ id: number; value: string }> = [];
    try {
      const data = JSON.parse(aiResponse);
      replacements = data.replacements || [];
    } catch (e) {
      console.error('[MemoireGenerator] Failed to parse GPT response:', aiResponse);
    }

    console.log(`[MemoireGenerator] GPT returned ${replacements.length} values.`);

    // 5. Apply replacements in the DOM
    let applied = 0;
    replacements.forEach((rep: any) => {
      const desc = descriptors.find(d => d.id === rep.id);
      if (!desc) return;
      const value = String(rep.value);

      if (desc.type === 'text') {
        const tEls = getElementsWithLocalName(xmlDoc, 't');
        tEls.forEach((tEl: any) => {
          replaceTextInElement(xmlDoc, tEl, `[CHAMP_${rep.id}]`, value);
        });
        applied++;
      }
    });

    // 6. Clean up any remaining [CHAMP_X] placeholders
    const finalTEls = getElementsWithLocalName(xmlDoc, 't');
    finalTEls.forEach((tEl: any) => {
      const text = tEl.textContent || '';
      if (/\[CHAMP_\d+\]/.test(text)) {
        tEl.textContent = text.replace(/\[CHAMP_\d+\]/g, '');
      }
    });

    console.log(`[MemoireGenerator] Applied ${applied}/${replacements.length} replacements.`);

    // 7. Serialize and save
    const serializer = new XMLSerializer();
    const finalXml = serializer.serializeToString(xmlDoc);
    zip.file('word/document.xml', finalXml);

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

  /**
   * Cas "sans cadre imposé" (mode B / réponse libre) : les sections ont déjà été
   * rédigées par l'IA côté front. On part du mémoire de référence GSS
   * (Template/Mémoire technique/AO RNE.docx) et on REMPLACE le contenu de chaque
   * chapitre par le texte généré, en conservant la page de garde, le sommaire,
   * les styles et la section finale (sectPr). Aucun appel OpenAI ici.
   *
   * Le mapping chapitre → emplacement se fait par POSITION : le i-ème paragraphe
   * de style Heading1 du corps correspond au i-ème chapitre fourni (I..IV).
   */
  public async assembleFromSections(
    _dossierId: string,
    chapters: AssembleChapter[],
  ): Promise<{ filePath: string; generatedData: Record<string, string> }> {
    const templatePath = path.join(this.templateDir, 'Mémoire technique', 'AO RNE.docx');
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template de référence introuvable : ${templatePath}`);
    }
    console.log(`[MemoireGenerator] Assemblage depuis sections IA, template: ${templatePath}`);

    const content = fs.readFileSync(templatePath);
    const zip = new PizZip(content);
    const documentXml = zip.file('word/document.xml');
    if (!documentXml) throw new Error('word/document.xml introuvable dans le template');

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(documentXml.asText(), 'text/xml');

    const body = getElementsWithLocalName(xmlDoc.documentElement, 'body')[0];
    if (!body) throw new Error('Corps du document (w:body) introuvable');

    // Ancres de chapitre = paragraphes Heading1 non vides, dans l'ordre du document.
    const headings = Array.from(body.childNodes).filter(
      (n: any) =>
        n.nodeType === 1 &&
        n.localName === 'p' &&
        getParagraphStyle(n) === 'Heading1' &&
        getElementText(n).trim().length > 0,
    );
    console.log(`[MemoireGenerator] ${headings.length} chapitres détectés dans le template.`);

    let chaptersReplaced = 0;
    let sectionsInserted = 0;

    headings.forEach((heading: any, idx: number) => {
      const chapter = chapters[idx];
      if (!chapter || !chapter.sections || chapter.sections.length === 0) return; // chapitre non généré → on garde l'original

      const nextHeading = headings[idx + 1] || null;

      // 1. Supprimer tous les nœuds entre ce Heading1 et le suivant (ou avant le sectPr final).
      const toRemove: any[] = [];
      let cur = heading.nextSibling;
      while (cur && cur !== nextHeading) {
        if (!nextHeading && cur.nodeType === 1 && cur.localName === 'sectPr') break;
        toRemove.push(cur);
        cur = cur.nextSibling;
      }
      toRemove.forEach((n) => body.removeChild(n));

      // 2. Insérer le texte IA après le titre de chapitre (avant l'ancre suivante / sectPr).
      const anchor = heading.nextSibling; // nextHeading, sectPr ou null après suppression
      for (const sec of chapter.sections) {
        if (sec.title && sec.title.trim()) {
          body.insertBefore(makeParagraph(xmlDoc, sec.title.trim(), 'Heading2'), anchor);
        }
        const lines = String(sec.text || '').split(/\r?\n/);
        for (const line of lines) {
          if (line.trim() === '') continue;
          body.insertBefore(makeParagraph(xmlDoc, line, 'BodyText'), anchor);
        }
        sectionsInserted++;
      }
      chaptersReplaced++;
    });

    if (chaptersReplaced === 0) {
      throw new Error('Aucun chapitre généré à insérer (sections vides).');
    }

    const serializer = new XMLSerializer();
    zip.file('word/document.xml', serializer.serializeToString(xmlDoc));

    const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    const outputFileName = `Mémoire technique GSS_${Date.now()}.docx`;
    const outputPath = path.join(this.responseDir, outputFileName);
    fs.writeFileSync(outputPath, buf);

    console.log(
      `[MemoireGenerator] Assemblé : ${chaptersReplaced} chapitre(s), ${sectionsInserted} section(s) → ${outputPath}`,
    );

    return {
      filePath: outputPath,
      generatedData: {
        chapitres_remplaces: String(chaptersReplaced),
        sections_inserees: String(sectionsInserted),
      },
    };
  }
}
