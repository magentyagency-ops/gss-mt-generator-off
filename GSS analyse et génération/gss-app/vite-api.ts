import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import Pizzip from 'pizzip';
import mammoth from 'mammoth';
import OpenAI from 'openai';
// @ts-ignore
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const WORKSPACE_DIR = path.resolve(process.cwd(), '..');

// Helper functions for namespace-agnostic DOM operations
function getParentWithLocalName(node: any, name: string): any {
  let parent = node.parentNode;
  while (parent) {
    if (parent.nodeType === 1 && parent.localName === name) {
      return parent;
    }
    parent = parent.parentNode;
  }
  return null;
}

function findLocalNameChild(node: any, name: string): any {
  if (!node.childNodes) return null;
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i];
    if (child.nodeType === 1 && child.localName === name) {
      return child;
    }
  }
  return null;
}

function getElementsWithLocalName(node: any, name: string): any[] {
  const results: any[] = [];
  const walk = (n: any) => {
    if (n.nodeType === 1 && n.localName === name) {
      results.push(n);
    }
    if (n.childNodes) {
      for (let i = 0; i < n.childNodes.length; i++) {
        walk(n.childNodes[i]);
      }
    }
  };
  walk(node);
  return results;
}

function getDirectCells(tr: any): any[] {
  const cells: any[] = [];
  const walk = (node: any) => {
    if (node.nodeType === 1) {
      if (node.localName === 'tc') {
        cells.push(node);
        return;
      } else if (node.localName === 'tbl' || node.localName === 'tr') {
        return;
      }
    }
    if (node.childNodes) {
      for (let i = 0; i < node.childNodes.length; i++) {
        walk(node.childNodes[i]);
      }
    }
  };
  if (tr.childNodes) {
    for (let i = 0; i < tr.childNodes.length; i++) {
      walk(tr.childNodes[i]);
    }
  }
  return cells;
}

function getElementText(node: any): string {
  let text = '';
  const walk = (n: any) => {
    if (n.nodeType === 1 && n.localName === 't') {
      text += n.textContent || '';
    }
    if (n.childNodes) {
      for (let i = 0; i < n.childNodes.length; i++) {
        walk(n.childNodes[i]);
      }
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
      const val = pStyle.getAttribute('w:val') || pStyle.getAttributeNS('*', 'val') || '';
      if (/heading|titre|title/i.test(val)) {
        return true;
      }
    }
  }
  
  if (/^(?:[I|V|X|L|C]+\.|\d+(?:\.\d+)*\.?|[A-Z]\.)\s+[A-ZÀ-ÿ]/i.test(text)) {
    return true;
  }
  
  if (text.length > 5 && text === text.toUpperCase() && /[A-Z]/.test(text)) {
    return true;
  }
  
  return false;
}

function getTableCellContext(cell: any, tr: any): string {
  const directCells = getDirectCells(tr);
  const cellIndex = directCells.indexOf(cell);
  const rowContext = directCells.filter(c => c !== cell).map(c => getElementText(c).trim()).filter(Boolean).join(' | ');
  
  const tbl = getParentWithLocalName(tr, 'tbl');
  if (tbl) {
    const allRows = getElementsWithLocalName(tbl, 'tr');
    if (allRows.length > 0) {
      const headerCells = getDirectCells(allRows[0]);
      if (headerCells.length > 0) {
        if (allRows[0] === tr) {
          return `Cellule d'en-tête. Autre texte de la ligne: "${rowContext}"`;
        }
        
        let headerText = '';
        if (cellIndex >= 0 && cellIndex < headerCells.length) {
          headerText = getElementText(headerCells[cellIndex]).trim();
        }
        
        if (headerText) {
          return `Colonne: "${headerText}" | Contexte de la ligne: "${rowContext}"`;
        }
      }
    }
  }
  return `Contexte de la ligne: "${rowContext}"`;
}

function replaceTextInElement(doc: any, tEl: any, placeholder: string, value: string) {
  const text = tEl.textContent || '';
  if (!text.includes(placeholder)) return;
  
  if (!value.includes('\n') && !value.includes('\r')) {
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
    const tBefore = doc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:t');
    tBefore.setAttribute('xml:space', 'preserve');
    tBefore.textContent = parts[0];
    elementsToInsert.push(tBefore);
  }
  
  const lines = value.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (index > 0) {
      const br = doc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:br');
      elementsToInsert.push(br);
    }
    const tLine = doc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:t');
    tLine.setAttribute('xml:space', 'preserve');
    tLine.textContent = line;
    elementsToInsert.push(tLine);
  });
  
  if (parts[1]) {
    const tAfter = doc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:t');
    tAfter.setAttribute('xml:space', 'preserve');
    tAfter.textContent = parts[1];
    elementsToInsert.push(tAfter);
  }
  
  elementsToInsert.forEach(el => {
    parentRun.insertBefore(el, tEl);
  });
  
  parentRun.removeChild(tEl);
}


// Helper to convert DOC to TXT via Word COM Object in PowerShell
function convertDocToTxt(docPath: string): string {
  const tempTxtPath = path.join(WORKSPACE_DIR, `temp_${Date.now()}.txt`);
  const absoluteDocPath = path.resolve(docPath);
  const absoluteTxtPath = path.resolve(tempTxtPath);

  const psCommand = `$word = New-Object -ComObject Word.Application; $word.Visible = $false; $doc = $word.Documents.Open('${absoluteDocPath}'); $doc.Content.Text | Out-File -FilePath '${absoluteTxtPath}' -Encoding utf8; $doc.Close(); $word.Quit();`;
  
  try {
    execSync(`powershell -Command "${psCommand}"`, { stdio: 'ignore' });
    if (fs.existsSync(tempTxtPath)) {
      const text = fs.readFileSync(tempTxtPath, 'utf8');
      fs.unlinkSync(tempTxtPath);
      return text;
    }
  } catch (error) {
    console.error(`Error converting DOC to TXT: ${error}`);
  }
  return '';
}

// Helper to extract text from DOCX, DOC, or TXT
async function extractTextFromFile(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  const absolutePath = path.resolve(filePath);

  if (ext === '.docx') {
    try {
      const result = await mammoth.extractRawText({ path: absolutePath });
      return result.value;
    } catch (err) {
      console.error(`Mammoth error on ${filePath}:`, err);
      return '';
    }
  } else if (ext === '.doc') {
    return convertDocToTxt(absolutePath);
  } else if (ext === '.txt') {
    return fs.readFileSync(absolutePath, 'utf8');
  }
  return '';
}

// Helper to list files recursively
function getFilesRecursively(dir: string): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(filePath));
    } else {
      results.push(filePath);
    }
  });
  return results;
}

// API functions
// Helper to find GIS internal template file
function findGisTemplate(): string | null {
  try {
    const templateDir = path.join(WORKSPACE_DIR, 'Template');
    if (fs.existsSync(templateDir)) {
      const files = getFilesRecursively(templateDir);
      const docx = files.find(f => f.toLowerCase().endsWith('.docx'));
      if (docx) return docx;
    }
    
    const rootFiles = fs.readdirSync(WORKSPACE_DIR);
    const docxRoot = rootFiles.find(f => 
      f.toLowerCase().endsWith('.docx') && 
      (f.toLowerCase().includes('memoire') || f.toLowerCase().includes('mémoire') || f.toLowerCase().includes('template'))
    );
    if (docxRoot) return path.join(WORKSPACE_DIR, docxRoot);
  } catch (err) {
    console.error('Error finding GIS template:', err);
  }
  return null;
}

// API functions
export async function handleScan() {
  // Find the subdirectory containing "DCE" in its name
  let scanDir = WORKSPACE_DIR;
  try {
    const parentFiles = fs.readdirSync(WORKSPACE_DIR);
    const dceFolder = parentFiles.find(file => {
      const fullPath = path.join(WORKSPACE_DIR, file);
      return file.toUpperCase().includes('DCE') && fs.statSync(fullPath).isDirectory();
    });
    if (dceFolder) {
      scanDir = path.join(WORKSPACE_DIR, dceFolder);
    }
  } catch (err) {
    console.error('Error locating DCE folder:', err);
  }

  const allFiles = getFilesRecursively(scanDir);
  
  const filesList = allFiles
    .filter(f => !f.includes('node_modules') && !f.includes('.git') && !f.includes('gss-app'))
    .map(f => {
      const relative = path.relative(WORKSPACE_DIR, f);
      const name = path.basename(f);
      const ext = path.extname(f).toLowerCase();
      const size = fs.statSync(f).size;
      
      let category = 'Autre';
      const lowercaseName = name.toLowerCase();
      if ((lowercaseName.includes('template') || lowercaseName.includes('cadre') || lowercaseName.includes('memoire') || lowercaseName.includes('mémoire') || lowercaseName.match(/m[eéèê]moire/)) && ext === '.docx') {
        category = 'Template Client';
      } else if (lowercaseName.includes('cctp') || lowercaseName.includes('ccp') || (lowercaseName.includes('technique') && ext === '.docx')) {
        category = 'CCTP';
      } else if (lowercaseName.includes('rc') || lowercaseName.includes('reglement') || lowercaseName.includes('règlement') || lowercaseName.match(/r[eéèê]glement/)) {
        category = 'RC';
      } else if (lowercaseName.includes('visite') && (lowercaseName.includes('rapport') || lowercaseName.includes('compte') || lowercaseName.includes('cr'))) {
        category = 'Rapport de Visite';
      } else if (lowercaseName.includes('visite') && (lowercaseName.includes('certificat') || lowercaseName.includes('attestation'))) {
        category = 'Certificat de Visite';
      } else if (lowercaseName.includes('bpu') || lowercaseName.includes('dqe') || lowercaseName.includes('prix')) {
        category = 'BPU';
      }

      return { name, relative, category, size, ext };
    });

  // Check checklist requirement status
  const hasCCTP = filesList.some(f => f.category === 'CCTP');
  const hasRC = filesList.some(f => f.category === 'RC');
  const hasVisitReport = filesList.some(f => f.category === 'Rapport de Visite');
  const hasBPU = filesList.some(f => f.category === 'BPU');
  
  let hasTemplateClient = filesList.some(f => f.category === 'Template Client');
  let templateName: string | null = null;
  const clientTemplate = filesList.find(f => f.category === 'Template Client');

  if (clientTemplate) {
    templateName = clientTemplate.name;
  } else {
    const gisTemplatePath = findGisTemplate();
    if (gisTemplatePath) {
      hasTemplateClient = true;
      templateName = path.basename(gisTemplatePath) + ' (GIS Interne)';
    }
  }

  return {
    workspacePath: WORKSPACE_DIR,
    files: filesList,
    checklist: {
      hasCCTP,
      hasRC,
      hasVisitReport,
      hasBPU,
      hasTemplateClient,
      templateName
    }
  };
}

export async function handleAnalyze(openaiApiKey: string) {
  if (!openaiApiKey) {
    throw new Error('La clé API OpenAI est requise.');
  }

  const scan = await handleScan();
  const cctpFile = scan.files.find(f => f.category === 'CCTP');
  const rcFile = scan.files.find(f => f.category === 'RC');
  const visitFile = scan.files.find(f => f.category === 'Rapport de Visite');

  if (!cctpFile) {
    throw new Error('Fichier CCTP manquant. Veuillez ajouter le CCTP pour l\'analyse.');
  }

  // Load and read main documents
  const cctpText = await extractTextFromFile(path.join(WORKSPACE_DIR, cctpFile.relative));
  const rcText = rcFile ? await extractTextFromFile(path.join(WORKSPACE_DIR, rcFile.relative)) : 'Aucun fichier RC fourni.';
  const visitText = visitFile ? await extractTextFromFile(path.join(WORKSPACE_DIR, visitFile.relative)) : 'Aucun rapport de visite fourni.';

  // DYNAMIC ANNEXES SCAN AND LOADING
  let annexesText = '';
  const annexesFiles = scan.files.filter(f => f.name.toLowerCase().includes('annexe') && (f.ext === '.docx' || f.ext === '.doc'));
  for (const annexe of annexesFiles) {
    try {
      const text = await extractTextFromFile(path.join(WORKSPACE_DIR, annexe.relative));
      annexesText += `\n\n--- DOCUMENT DU DOSSIER : ${annexe.name} ---\n${text.substring(0, 15000)}`;
    } catch (err) {
      console.error(`Error reading annexe ${annexe.name}:`, err);
    }
  }

  const openai = new OpenAI({ apiKey: openaiApiKey });

  const systemPrompt = `Tu es un expert en marchés publics de sécurité privée pour l'entreprise GIS (Générale d'Intervention et de Sécurité, ou GSS).
Ton process de réponse s'appuie sur deux rôles clés : Sacha, qui gère l'amont (analyse du DCE, vérification de l'obligation de visite, et rédaction des comptes-rendus de visite terrain) et Mme Vaché, qui pilote la rédaction du mémoire technique en y apportant une personnalisation forte (qui va au-delà du simple changement de nom et consiste à anticiper des problématiques opérationnelles non explicitement formulées par l'acheteur dans le CCTP).

Ta mission est d'analyser le CCTP, le RC, le compte-rendu de visite terrain rédigé par Sacha (très précieux car 60% d'entre eux contiennent des détails et contraintes du terrain absents du CCTP), et les annexes techniques jointes pour en extraire toutes les données clés et opérationnelles de manière structurée.

Pour la rédaction menée par Mme Vaché, tu devez particulièrement :
1. Identifier précisément le donneur d'ordre (client), la durée du marché et les sites concernés.
2. Analyser les besoins exacts en agents (coefficients, effectifs, profils requis : Agent de Prévention CQP APS, Sécurité Incendie SSIAP 1, SSIAP 2, SSIAP 3, encadrement).
3. Repérer les contraintes matérielles demandées (contrôle de rondes, nombre de pointeaux, PTI/DATI, tenues spécifiques, véhicules).
4. Analyser les données issues des annexes sur les profils d'agents déjà en place (reprise de personnel), les effectifs et les correspondants.
5. Détecter si la visite de site était obligatoire d'après le RC et croiser cela avec le rapport de visite de Sacha.
6. Proposer des "Arguments Différenciants" (forces de GIS pour ce dossier) et surtout des "Problématiques Anticipées" (anticiper des risques techniques ou humains que l'acheteur n'a pas forcément formulés dans le CCTP, comme des problèmes d'accès complexes ou de flux, et proposer la solution GIS associée).

Tu devez renvoyer un objet JSON contenant cette analyse détaillée et exhaustive de TOUS les documents.`;

  const userPrompt = `Voici les textes extraits des documents :

--- EXTRAIT CCTP PRINCIPAL ---
${cctpText.substring(0, 30000)}

--- EXTRAIT RC (Règlement de Consultation) ---
${rcText.substring(0, 10000)}

--- EXTRAIT RAPPORT DE VISITE TERRAIN ---
${visitText.substring(0, 8000)}

--- DOCUMENTS ET ANNEXES DU DOSSIER (AGENTS, PLANNINGS, POINTEAUX) ---
${annexesText}

Analyse ces documents et génère une réponse JSON valide respectant cette structure exacte :
{
  "clientName": "Nom exact du donneur d'ordre (ex: Université de Rouen Normandie)",
  "projectTitle": "Intitulé complet du marché (ex: Prestations de surveillance physique et de télésécurité)",
  "duration": "Durée exacte du marché (ex: 1 an renouvelable 3 fois)",
  "visitMandatory": true/false,
  "visitDetails": "Détails complets sur la visite de site et observations clés du terrain tirées du rapport de Sacha",
  "sites": [
    { "name": "Nom exact du site/campus", "requirements": "Détail précis des effectifs requis en ETP et qualifications (ex: ETP CQP APS, ETP SSIAP1 la nuit)" }
  ],
  "operationalSummary": {
    "agentProfiles": "Synthèse exhaustive des profils d'agents requis, taux de reprise du personnel et encadrement",
    "uniforms": "Besoins en tenues ou équipements spécifiques des agents",
    "equipment": "Moyens matériels requis (système de rondes, pointeaux requis par site, terminaux PTI, véhicules mobilisés)",
    "qualityControls": "Contrôles qualité exigés (ex: contrôles inopinés de nuit, réunions de suivi mensuelles, extranet)"
  },
  "legalRequirements": "Exigences légales d'autorisation d'exercer (CNAPS, agréments dirigeants, agrément de l'établissement local qui exécutera le marché)",
  "keyRisks": [
    "Risque ou contrainte opérationnelle identifiée dans le CCTP ou sur un campus spécifique"
  ],
  "proposalStrengths": [
    "Point fort et argument différenciant technique de la proposition de GIS pour ce marché"
  ],
  "anticipatedIssues": [
    "Problématique non explicitement formulée par l'acheteur mais identifiée/anticipée sur le terrain d'après le rapport de Sacha ET la solution concrète proposée par GIS"
  ]
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o', // We use GPT-4o for complex document multi-context analysis
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error("Réponse vide de l'API OpenAI");
  return JSON.parse(content);
}

export async function handleGenerate(openaiApiKey: string, analysisData: any, customFilename?: string, selectedPages?: number[]) {
  if (!openaiApiKey) {
    throw new Error('La clé API OpenAI est requise.');
  }

  const scan = await handleScan();
  const clientTemplateFile = scan.files.find(f => f.category === 'Template Client');
  
  let templatePath: string | null = null;
  let isClientTemplate = true;

  if (clientTemplateFile) {
    templatePath = path.join(WORKSPACE_DIR, clientTemplateFile.relative);
    isClientTemplate = true;
  } else {
    templatePath = findGisTemplate();
    isClientTemplate = false;
  }

  if (templatePath && fs.existsSync(templatePath)) {
    // CAS A : Remplissage direct du template Word
    const content = fs.readFileSync(templatePath);
    const zip = new Pizzip(content);
    const parser = new DOMParser();
    const serializer = new XMLSerializer();

    // Adapt static texts ONLY if it is NOT a client template (i.e. it is a GIS template used as inspiration)
    if (!isClientTemplate) {
      const xmlFilesToAdapt: string[] = [];
      Object.keys(zip.files).forEach(name => {
        if (name === "word/document.xml" || name.startsWith("word/header") || name.startsWith("word/footer")) {
          xmlFilesToAdapt.push(name);
        }
      });

      const adaptDOMStaticText = (xmlDoc: any) => {
        const clientName = analysisData.clientName;
        const projectTitle = analysisData.projectTitle;
        const sites = analysisData.sites || [];

        const oldClientTerms = [
          /Université de Rouen Normandie/g,
          /Université de Rouen/g,
          /l'Université de Rouen/g,
          /l’Université de Rouen/g
        ];

        const oldProjectTerms = [
          /MP n°2026-08/g,
          /2026-08/g
        ];

        const tEls = getElementsWithLocalName(xmlDoc, 't');
        tEls.forEach(tEl => {
          let text = tEl.textContent || '';
          if (!text) return;

          oldClientTerms.forEach(regex => {
            text = text.replace(regex, clientName);
          });

          if (projectTitle) {
            oldProjectTerms.forEach(regex => {
              text = text.replace(regex, projectTitle);
            });
          }

          if (sites.length > 0) {
            const getNewSiteName = (index: number) => {
              if (sites[index]) return sites[index].name;
              return "";
            };

            if (text.match(/Campus Mont-Saint-Aignan/i) || text.match(/INSPE/i)) {
              text = text.replace(/Campus Mont-Saint-Aignan \+ INSPE/gi, getNewSiteName(0))
                          .replace(/Campus Mont-Saint-Aignan/gi, getNewSiteName(0));
            }
            if (text.match(/Campus Martainville/i)) {
              text = text.replace(/Campus Martainville\s*\(UFR Santé\)/gi, getNewSiteName(1))
                          .replace(/Campus Martainville/gi, getNewSiteName(1));
            }
            if (text.match(/Campus Pasteur/i)) {
              text = text.replace(/Campus Pasteur\s*\(UFR DESP\)/gi, getNewSiteName(2))
                          .replace(/Campus Pasteur/gi, getNewSiteName(2));
            }
            if (text.match(/Madrillet/i)) {
              text = text.replace(/Campus du Madrillet/gi, getNewSiteName(3));
            }
            if (text.match(/Evreux/i)) {
              text = text.replace(/Campus Evreux Tilly-Navarre/gi, getNewSiteName(4))
                          .replace(/Campus Evreux/gi, getNewSiteName(4));
            }
          }

          tEl.textContent = text;
        });
      };

      xmlFilesToAdapt.forEach(xmlPathName => {
        const fileData = zip.file(xmlPathName);
        if (!fileData) return;
        
        const xmlStr = fileData.asText();
        const fileDoc = parser.parseFromString(xmlStr, 'text/xml');
        
        adaptDOMStaticText(fileDoc);
        
        const updatedXmlStr = serializer.serializeToString(fileDoc);
        zip.file(xmlPathName, updatedXmlStr);
      });
    }

    const documentXmlFile = zip.file("word/document.xml");
    if (!documentXmlFile) {
      throw new Error("Fichier word/document.xml introuvable dans le template.");
    }
    let docXml = documentXmlFile.asText();
    const doc = parser.parseFromString(docXml, 'text/xml');

    let fieldCounter = 1;
    const prompts: string[] = [];
    const descriptors: {
      id: number;
      type: 'text' | 'legacy_checkbox' | 'sym_checkbox' | 'w14_checkbox';
      element?: any;
      promptContext: string;
    }[] = [];

    const filledCells = new Set<any>();
    let currentHeading = 'Introduction / Généralités';

    // Walk the DOM tree in order to preserve headings and track sections
    const walk = (node: any) => {
      if (node.nodeType !== 1) return; // element nodes only
      
      const localName = node.localName;
      
      if (localName === 'p') {
        if (isHeadingParagraph(node)) {
          currentHeading = getElementText(node).trim();
        }
      }
      
      if (localName === 'tr') {
        const directCells = getDirectCells(node);
        const cellInfos = directCells.map(cell => {
          const text = getElementText(cell).trim();
          return { cell, text, isEmpty: text === '' };
        });
        
        const hasText = cellInfos.some(c => !c.isEmpty);
        const hasEmpty = cellInfos.some(c => c.isEmpty);
        
        if (hasText && hasEmpty) {
          cellInfos.forEach(cInfo => {
            if (cInfo.isEmpty && !filledCells.has(cInfo.cell)) {
              filledCells.add(cInfo.cell);
              const id = fieldCounter++;
              const cellContext = getTableCellContext(cInfo.cell, node);
              const fullContext = `Section: "${currentHeading}" | Tableau: ${cellContext}`;
              
              prompts.push(`Champ [CHAMP_${id}] : Cellule de tableau vide. Contexte: ${fullContext}`);
              descriptors.push({
                id,
                type: 'text',
                promptContext: fullContext
              });
              
              let p = findLocalNameChild(cInfo.cell, 'p') || getElementsWithLocalName(cInfo.cell, 'p')[0];
              if (!p) {
                p = doc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:p');
                cInfo.cell.appendChild(p);
              } else {
                const toRemove: any[] = [];
                for (let i = 0; i < p.childNodes.length; i++) {
                  const child = p.childNodes[i];
                  if (child.nodeType === 1 && child.localName === 'pPr') {
                    continue;
                  }
                  toRemove.push(child);
                }
                toRemove.forEach(child => p.removeChild(child));
              }
              
              const r = doc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:r');
              const t = doc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:t');
              t.textContent = `[CHAMP_${id}]`;
              r.appendChild(t);
              p.appendChild(r);
            }
          });
        }
      }
      
      if (localName === 'p') {
        const parentCell = getParentWithLocalName(node, 'tc');
        if (parentCell && filledCells.has(parentCell)) {
          return;
        }
        
        const fullText = getElementText(node).trim();
        
        // A. Legacy checkboxes
        const legacyCheckboxes = getElementsWithLocalName(node, 'checkBox');
        legacyCheckboxes.forEach(cb => {
          const id = fieldCounter++;
          const fullContext = `Section: "${currentHeading}" | Case à cocher. Contexte: "${fullText}"`;
          prompts.push(`Champ [CHAMP_${id}] : ${fullContext}`);
          descriptors.push({
            id,
            type: 'legacy_checkbox',
            element: cb,
            promptContext: fullContext
          });
        });
        
        // B. Symbol checkboxes
        const symbols = getElementsWithLocalName(node, 'sym');
        symbols.forEach(sym => {
          const font = sym.getAttribute('w:font') || sym.getAttributeNS('*', 'font');
          const char = sym.getAttribute('w:char') || sym.getAttributeNS('*', 'char');
          if (font === 'Wingdings' && (char === 'F0A8' || char === 'F0FE')) {
            const id = fieldCounter++;
            const fullContext = `Section: "${currentHeading}" | Case à cocher (symbole). Contexte: "${fullText}"`;
            prompts.push(`Champ [CHAMP_${id}] : ${fullContext}`);
            descriptors.push({
              id,
              type: 'sym_checkbox',
              element: sym,
              promptContext: fullContext
            });
          }
        });
        
        // C. w14 content control checkboxes
        const w14Checkboxes = getElementsWithLocalName(node, 'checkbox');
        w14Checkboxes.forEach(w14 => {
          if (w14.namespaceURI === 'http://schemas.microsoft.com/office/word/2010/wordml' || w14.prefix === 'w14' || w14.localName === 'checkbox') {
            const id = fieldCounter++;
            const fullContext = `Section: "${currentHeading}" | Case à cocher (contrôle de contenu). Contexte: "${fullText}"`;
            prompts.push(`Champ [CHAMP_${id}] : ${fullContext}`);
            descriptors.push({
              id,
              type: 'w14_checkbox',
              element: w14,
              promptContext: fullContext
            });
          }
        });
        
        // D. Text-based checkboxes
        const tElements = getElementsWithLocalName(node, 't');
        const hasTextCheckbox = /☐|\[\s*\]|\(\s*\)/.test(fullText);
        if (hasTextCheckbox) {
          tElements.forEach(tEl => {
            const text = tEl.textContent || '';
            const regex = /☐|\[\s*\]|\(\s*\)/g;
            let match;
            let textWithPlaceholders = text;
            let replaced = false;
            while ((match = regex.exec(text)) !== null) {
              const id = fieldCounter++;
              const fullContext = `Section: "${currentHeading}" | Case à cocher. Contexte: "${fullText}"`;
              prompts.push(`Champ [CHAMP_${id}] : ${fullContext}`);
              descriptors.push({
                id,
                type: 'text',
                promptContext: fullContext
              });
              textWithPlaceholders = textWithPlaceholders.replace(match[0], `[CHAMP_${id}]`);
              replaced = true;
            }
            if (replaced) {
              tEl.textContent = textWithPlaceholders;
            }
          });
        }
        
        // E. Dotted lines
        const hasDotted = /(?:[_.\-…]\s*){3,}/.test(fullText);
        if (hasDotted) {
          let replacedDotted = false;
          
          tElements.forEach(tEl => {
            const text = tEl.textContent || '';
            if (/^[_.\-…\s]+$/.test(text)) {
              if (!replacedDotted) {
                const id = fieldCounter++;
                const fullContext = `Section: "${currentHeading}" | Pointillés à remplir. Contexte: "${fullText}"`;
                prompts.push(`Champ [CHAMP_${id}] : ${fullContext}`);
                descriptors.push({
                  id,
                  type: 'text',
                  promptContext: fullContext
                });
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
                const fullContext = `Section: "${currentHeading}" | Pointillés à remplir. Contexte: "${fullText}"`;
                prompts.push(`Champ [CHAMP_${id}] : ${fullContext}`);
                descriptors.push({
                  id,
                  type: 'text',
                  promptContext: fullContext
                });
                replacedText = replacedText.replace(dotMatch[0], `[CHAMP_${id}]`);
                replacedDotted = true;
              }
              tEl.textContent = replacedText;
            }
          });
          
          if (!replacedDotted) {
            const id = fieldCounter++;
            const fullContext = `Section: "${currentHeading}" | Pointillés à remplir. Contexte: "${fullText}"`;
            prompts.push(`Champ [CHAMP_${id}] : ${fullContext}`);
            descriptors.push({
              id,
              type: 'text',
              promptContext: fullContext
            });
            const r = doc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:r');
            const t = doc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:t');
            t.textContent = ` [CHAMP_${id}] `;
            r.appendChild(t);
            node.appendChild(r);
          }
        }
      }

      if (node.childNodes) {
        for (let i = 0; i < node.childNodes.length; i++) {
          walk(node.childNodes[i]);
        }
      }
    };

    walk(doc.documentElement);

    if (prompts.length === 0) {
      throw new Error("Aucun champ à remplir (pointillés, cases à cocher ou tableaux vides) n'a été détecté dans le template Word.");
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });

    const systemPrompt = `Tu es un expert de haut niveau en marchés publics de sécurité privée et un rédacteur chevronné pour l'entreprise GIS (Générale d'Intervention et de Sécurité).
On te fournit l'analyse stratégique et opérationnelle d'un marché public (contexte, sites, exigences, rapports de visite de Sacha, arguments clés de GIS, et problématiques terrain anticipées), ainsi qu'une liste de champs [CHAMP_X] repérés dans le cadre de réponse de l'acheteur.

Ta mission est de rédiger les valeurs à insérer dans chacun de ces champs de manière extrêmement professionnelle, complète, qualitative et sur-mesure.

Règles de rédaction des réponses :
1. TON ET STYLE : Le ton doit être irréprochable, précis, technique et extrêmement engageant. Évite absolument les réponses courtes, paresseuses ou génériques (comme "Conforme", "Disponible", ou "Oui"). Chaque réponse doit valoriser le professionnalisme de GIS.
2. TYPES DE CHAMPS :
   - Pour les cases à cocher : réponds STRICTEMENT par "☑" (coché) ou "☐" (non coché) selon si le critère correspond aux capacités/engagements de GIS (qui se conforme à 100% aux exigences).
   - Pour les tableaux et les réponses structurées (ex: effectifs, diplômes, matériel) : réponds de façon concise et factuelle, parfaitement alignée sur les colonnes du tableau (ex: "CQP APS - SST - EPI", "2 ETP", "100% conforme").
   - Pour les questions ouvertes ou les descriptions textuelles (par exemple, les pointillés de description de méthodologie, de contrôle qualité, de procédures d'urgence, ou de présentation de l'entreprise) : rédige des paragraphes complets, détaillés et structurés (3 à 8 phrases développées par champ) décrivant de manière approfondie l'organisation, le contrôle CNAPS, la gestion des plannings, les rondes avec pointeaux NFC, la gestion des alarmes, etc.
3. CONTEXTUALISATION & PERSONNALISATION :
   - Utilise activement les détails de la visite de site de Sacha pour prouver notre parfaite connaissance du terrain (ex: configuration des accès, coactivité, points de vigilance observés).
   - Intègre les "Arguments Différenciants GIS" et les "Problématiques Terrain Anticipées" (avec leurs solutions associées) directement au cœur des rédactions pour démontrer à l'acheteur que nous avons anticipé des risques opérationnels non explicités dans son propre cahier des charges (ex: gestion des flux aux heures de pointe, sécurisation specific d'un bâtiment isolé, etc.).
   - Utilise le nom exact du client, le titre du projet et les noms exacts des sites pour que le texte soit totalement fluide et personnalisé.
4. FORMAT DU RETOUR : Renvoie uniquement un objet JSON valide contenant la liste des valeurs sous cette forme exacte :
{
  "replacements": [
    { "id": 1, "value": "Texte détaillé rédigé..." }
  ]
}`;

    const userPrompt = `Voici l'analyse du marché public :
${JSON.stringify(analysisData, null, 2)}

Liste des champs à remplir :
${prompts.join('\n')}

Renvoie uniquement un objet JSON valide contenant la liste des valeurs sous cette forme exacte :
{
  "replacements": [
    { "id": 1, "value": "Valeur à insérer" }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' }
    });

    const aiResContent = response.choices[0].message.content;
    if (!aiResContent) throw new Error("Réponse vide de l'API OpenAI.");
    const aiData = JSON.parse(aiResContent);
    const replacements = aiData.replacements || [];

    // Appliquer les remplacements dans le DOM
    replacements.forEach((rep: any) => {
      const desc = descriptors.find(d => d.id === rep.id);
      if (!desc) return;
      
      const value = String(rep.value);
      const isChecked = value.includes('☑') || value.toLowerCase() === 'oui' || value.toLowerCase() === 'yes' || value === '1' || value === 'true';

      if (desc.type === 'text') {
        const tEls = getElementsWithLocalName(doc, 't');
        tEls.forEach(tEl => {
          replaceTextInElement(doc, tEl, `[CHAMP_${rep.id}]`, value);
        });
      } else if (desc.type === 'legacy_checkbox') {
        let checkedEl = desc.element.getElementsByTagName('w:checked')[0] || desc.element.getElementsByTagNameNS('*', 'checked')[0];
        if (!checkedEl) checkedEl = findLocalNameChild(desc.element, 'checked');
        if (!checkedEl) {
          checkedEl = doc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:checked');
          desc.element.appendChild(checkedEl);
        }
        checkedEl.setAttribute('w:val', isChecked ? '1' : '0');

        let defaultEl = desc.element.getElementsByTagName('w:default')[0] || desc.element.getElementsByTagNameNS('*', 'default')[0];
        if (!defaultEl) defaultEl = findLocalNameChild(desc.element, 'default');
        if (defaultEl) {
          defaultEl.setAttribute('w:val', isChecked ? '1' : '0');
        }

        let beginRun = getParentWithLocalName(desc.element, 'r');
        if (beginRun) {
          let current = beginRun.nextSibling;
          let separateRun: any = null;
          let endRun: any = null;
          const runsBetween: any[] = [];
          
          while (current) {
            if (current.nodeType === 1 && current.localName === 'r') {
              const fldChars = current.getElementsByTagName('w:fldChar');
              let isSeparate = false;
              let isEnd = false;
              for (let i = 0; i < fldChars.length; i++) {
                const type = fldChars[i].getAttribute('w:fldCharType');
                if (type === 'separate') isSeparate = true;
                if (type === 'end') isEnd = true;
              }
              
              if (isSeparate) {
                separateRun = current;
              } else if (isEnd) {
                endRun = current;
                break;
              } else if (separateRun) {
                runsBetween.push(current);
              }
            }
            current = current.nextSibling;
          }
          
          if (separateRun && endRun) {
            runsBetween.forEach(rNode => {
              if (rNode.parentNode) {
                rNode.parentNode.removeChild(rNode);
              }
            });
            const newRun = doc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:r');
            const rPr = beginRun.getElementsByTagName('w:rPr')[0] || findLocalNameChild(beginRun, 'rPr');
            if (rPr) {
              newRun.appendChild(rPr.cloneNode(true));
            }
            const newT = doc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:t');
            newT.textContent = isChecked ? '☒' : '☐';
            newRun.appendChild(newT);
            
            if (endRun.parentNode) {
              endRun.parentNode.insertBefore(newRun, endRun);
            }
          }
        }
      } else if (desc.type === 'sym_checkbox') {
        desc.element.setAttribute('w:char', isChecked ? 'F0FE' : 'F0A8');
      } else if (desc.type === 'w14_checkbox') {
        let checkedEl = desc.element.getElementsByTagName('w14:checked')[0] || desc.element.getElementsByTagNameNS('*', 'checked')[0];
        if (!checkedEl) checkedEl = findLocalNameChild(desc.element, 'checked');
        if (!checkedEl) {
          checkedEl = doc.createElementNS('http://schemas.microsoft.com/office/word/2010/wordml', 'w14:checked');
          desc.element.appendChild(checkedEl);
        }
        checkedEl.setAttribute('w14:val', isChecked ? '1' : '0');

        let sdt = getParentWithLocalName(desc.element, 'sdt');
        if (sdt) {
          const tElements = getElementsWithLocalName(sdt, 't');
          for (let i = 0; i < tElements.length; i++) {
            tElements[i].textContent = isChecked ? '☒' : '☐';
          }
        }
      }
    });

    const finalTEls = getElementsWithLocalName(doc, 't');
    finalTEls.forEach(tEl => {
      const text = tEl.textContent || '';
      if (/\[CHAMP_\d+\]/.test(text)) {
        tEl.textContent = text.replace(/\[CHAMP_\d+\]/g, '');
      }
    });

    const finalXml = new XMLSerializer().serializeToString(doc);

    zip.file("word/document.xml", finalXml);
    const buffer = zip.generate({ type: "nodebuffer" });
    
    // Ensure "Reponse" folder exists
    const OUTPUT_DIR = path.join(WORKSPACE_DIR, 'Reponse');
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const cleanClientName = analysisData.clientName.replace(/[^a-zA-Z0-9]/g, '_');
    const outputFilename = customFilename 
      ? (customFilename.toLowerCase().endsWith('.docx') ? customFilename : `${customFilename}.docx`)
      : `Memoire_Technique_${cleanClientName}.docx`;
    const outputPath = path.join(OUTPUT_DIR, outputFilename);
    fs.writeFileSync(outputPath, buffer);

    return {
      success: true,
      outputPath,
      filename: outputFilename,
      format: 'docx'
    };
  } else {
    // CAS B : Génération et assemblage en slides PDF
    const templatePath = path.join(WORKSPACE_DIR, 'Template', 'Mémoire technique', 'AO RNE.pdf');
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Fichier modèle de mémoire technique introuvable : ${templatePath}`);
    }

    const templateBytes = fs.readFileSync(templatePath);
    const templateDoc = await PDFDocument.load(templateBytes);
    const pdfDoc = await PDFDocument.create();

    const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Heuristic function to extract client city
    const extractCity = (clientName: string): string => {
      if (!clientName) return 'Rouen';
      const clean = clientName
        .replace(/^(l'|l’|la |le |les |l’|l')/i, '')
        .replace(/^(université|mairie|ville|communauté|métropole|département|région)\s+(de\s+|d\s*’|d\s*')?/gi, '')
        .trim();
      const parts = clean.split(/[\s-]+/);
      if (parts.length > 0 && parts[0]) {
        return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
      }
      return 'Rouen';
    };

    const clientCity = extractCity(analysisData.clientName);

    // Selected Pages from template
    let pagesToCopy = selectedPages || [];
    if (pagesToCopy.length === 0) {
      const totalPages = templateDoc.getPageCount();
      for (let i = 1; i <= totalPages; i++) {
        pagesToCopy.push(i);
      }
    }

    // Helper for wrapping text and handling paragraphs/newlines
    const drawWrappedText = (page: any, text: string, x: number, y: number, maxWidth: number, fontSize: number, font: any, color = rgb(0.1, 0.1, 0.1), lineHeight = 16) => {
      const paragraphs = text.split(/\r?\n/);
      let currentY = y;
      
      for (const para of paragraphs) {
        if (!para.trim()) {
          currentY -= lineHeight;
          continue;
        }
        const words = para.split(/\s+/);
        let line = '';
        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + ' ';
          const testWidth = font.widthOfTextAtSize(testLine, fontSize);
          if (testWidth > maxWidth && n > 0) {
            page.drawText(line.trim(), { x, y: currentY, size: fontSize, font, color });
            line = words[n] + ' ';
            currentY -= lineHeight;
          } else {
            line = testLine;
          }
        }
        page.drawText(line.trim(), { x, y: currentY, size: fontSize, font, color });
        currentY -= lineHeight;
      }
      return currentY;
    };



    const hasCover = pagesToCopy.includes(1);
    
    if (hasCover) {
      // 1. Customized Cover Page
      try {
        const copiedPages = await pdfDoc.copyPages(templateDoc, [0]);
        const page = pdfDoc.addPage(copiedPages[0]);
        
        // Only mask the old project title and client name, preserving the entire template design
        page.drawRectangle({
          x: 60,
          y: 350,
          width: 480,
          height: 60,
          color: rgb(1, 1, 1) // White mask just for the title text area
        });

        const cleanTitle = analysisData.projectTitle || 'Prestations de Sécurité';
        const clientName = analysisData.clientName || 'Client';
        const fontColor = rgb(0.03, 0.03, 0.04); // Dark grey matching the original

        // Replace "SECURITE INCENDIE - SURETE POUR LE PARC DES"
        drawWrappedText(page, cleanTitle.toUpperCase(), 68.15, 390.98, 465, 19, fontHelvetica, fontColor, 20);

        // Replace "EXPOSITIONS DE ROUEN"
        page.drawText(clientName.toUpperCase(), {
          x: 183.49,
          y: 364.40,
          size: 19,
          font: fontHelvetica,
          color: fontColor
        });

      } catch (err) {
        console.error("Impossible de créer la page de garde :", err);
      }
    }


    // 3. Loop over selected template pages (skipping Page 1)
    for (const pageNum of pagesToCopy) {
      if (pageNum === 1) continue; // Skip cover page as it is already added at the beginning
      try {
        const copiedPages = await pdfDoc.copyPages(templateDoc, [pageNum - 1]);
        const page = pdfDoc.addPage(copiedPages[0]);

        // Process modifications on template pages in-place
        if (pageNum === 23) {
          // Page 23 (Références)
          page.drawRectangle({
            x: 55,
            y: 370,
            width: 470,
            height: 20,
            color: rgb(1, 1, 1)
          });
          const newText = `l'université Olympe de Gouges à Alençon ou encore pour ${analysisData.clientName}.`;
          drawWrappedText(page, newText, 59.55, 374.60, 465, 10, fontHelvetica, rgb(0.1, 0.1, 0.1), 14);
        }
        else if (pageNum === 24) {
          // Page 24 (CESI References)
          page.drawRectangle({
            x: 360,
            y: 660,
            width: 125,
            height: 20,
            color: rgb(1, 1, 1)
          });
          page.drawText(`: ${clientCity}, Caen, Lille`, {
            x: 364.57,
            y: 665.78,
            size: 10.5,
            font: fontHelvetica,
            color: rgb(0.1, 0.1, 0.1)
          });
        }
        else if (pageNum === 28) {
          // Page 28 (Références Région)
          page.drawRectangle({
            x: 62,
            y: 490,
            width: 470,
            height: 20,
            color: rgb(1, 1, 1)
          });
          const newText = `pour sécuriser les sièges de ${clientCity} et de Caen, mais aussi pour sécuriser`;
          page.drawText(newText, {
            x: 66.62,
            y: 494.71,
            size: 10,
            font: fontHelvetica,
            color: rgb(0.1, 0.1, 0.1)
          });
        }
        else if (pageNum === 30) {
          // Page 30 (QRM/Diochon References)
          page.drawRectangle({
            x: 230,
            y: 660,
            width: 165,
            height: 20,
            color: rgb(1, 1, 1)
          });
          page.drawText(`Quevilly ${clientCity} Metropole`, {
            x: 232.65,
            y: 665.20,
            size: 10.5,
            font: fontHelvetica,
            color: rgb(0.1, 0.1, 0.1)
          });

          page.drawRectangle({
            x: 360,
            y: 630,
            width: 150,
            height: 20,
            color: rgb(1, 1, 1)
          });
          page.drawText(`: ${clientCity} Stade Diochon`, {
            x: 364.57,
            y: 635.94,
            size: 10.5,
            font: fontHelvetica,
            color: rgb(0.1, 0.1, 0.1)
          });
        }
        else if (pageNum === 103) {
          // CV Laurent Porchaire
          page.drawRectangle({
            x: 265,
            y: 145,
            width: 80,
            height: 16,
            color: rgb(1, 1, 1)
          });
          page.drawText(`BASÉ À: ${clientCity.toUpperCase()}`, {
            x: 270.07,
            y: 150.96,
            size: 8,
            font: fontHelveticaBold,
            color: rgb(0.2, 0.2, 0.2)
          });
        }
        else if (pageNum === 104) {
          // CV Luis Da Silva Santos
          page.drawRectangle({
            x: 262,
            y: 150,
            width: 80,
            height: 16,
            color: rgb(1, 1, 1)
          });
          page.drawText(`BASÉ À: ${clientCity.toUpperCase()}`, {
            x: 267.82,
            y: 154.98,
            size: 8,
            font: fontHelveticaBold,
            color: rgb(0.2, 0.2, 0.2)
          });
        }
        else if (pageNum === 105) {
          // CV Marie Vattier
          page.drawRectangle({
            x: 272,
            y: 167,
            width: 95,
            height: 18,
            color: rgb(1, 1, 1)
          });
          page.drawText(`BASÉE À: ${clientCity.toUpperCase()}`, {
            x: 277.80,
            y: 172.17,
            size: 8,
            font: fontHelveticaBold,
            color: rgb(0.2, 0.2, 0.2)
          });
        }
      } catch (err) {
        console.error(`Impossible de copier/modifier la page ${pageNum} :`, err);
      }
    }

    const pdfBytes = await pdfDoc.save();
    
    const OUTPUT_DIR = path.join(WORKSPACE_DIR, 'Reponse');
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const cleanClientName = analysisData.clientName.replace(/[^a-zA-Z0-9]/g, '_');
    const outputFilename = customFilename 
      ? (customFilename.toLowerCase().endsWith('.pdf') ? customFilename : `${customFilename}.pdf`)
      : `Memoire_Technique_${cleanClientName}.pdf`;
    const outputPath = path.join(OUTPUT_DIR, outputFilename);
    fs.writeFileSync(outputPath, pdfBytes);

    return {
      success: true,
      outputPath,
      filename: outputFilename,
      format: 'pdf'
    };
  }
}

export async function handleAnalyzeSlides(openaiApiKey: string, analysisData: any) {
  if (!openaiApiKey) {
    throw new Error('La clé API OpenAI est requise.');
  }

  const slidesTextPath = path.join(WORKSPACE_DIR, 'Template', 'Mémoire technique', 'slides_text.json');
  if (!fs.existsSync(slidesTextPath)) {
    throw new Error(`Catalogue des slides introuvable à l'adresse : ${slidesTextPath}`);
  }

  const slidesText = JSON.parse(fs.readFileSync(slidesTextPath, 'utf8'));

  // Prepare a condensed version of slides to fit in token limits and optimize API speed
  const condensedSlides = slidesText.map((slide: any) => ({
    pageNumber: slide.pageNumber,
    title: slide.title,
    snippet: slide.snippet.substring(0, 150)
  }));

  const openai = new OpenAI({ apiKey: openaiApiKey });

  const systemPrompt = `Tu es un expert en marchés publics de sécurité privée pour l'entreprise GSS.
Ta mission est de passer en revue la liste des 119 diapositives du mémoire technique de référence ("AO RNE.pdf") et de recommander pour chacune si elle doit être CONSERVÉE ("keep"), MODIFIÉE ("modify") ou SUPPRIMÉE ("delete") par rapport aux besoins du nouveau marché décrit dans l'analyse du DCE.

Règles de décision :
1. Couverture & Sommaire :
   - Diapositive 1 (Couverture) : Toujours marquer "modify" pour la personnaliser pour le client.
   - Diapositives 2-3 (Sommaire) & Diapositive 4 (Présentation) : Toujours marquer "keep".
2. Diapositives techniques et profils d'agents :
   - Si le DCE ne mentionne PAS d'agents cynophiles (maîtres-chiens), marque "delete" pour toutes les diapositives concernant les agents cynophiles et leur formation (notamment les diapositives 5, 32, 44-45, etc.).
   - Si le DCE ne mentionne pas de besoin pour le Lot 3 (télésécurité / télésurveillance / interventions sur alarme), marque "delete" pour toutes les diapositives associées (intervenants, levée de doute, etc.).
   - Si le CCTP n'a pas de prestations événementielles, marque "delete" pour les diapositives événementielles (ex: 118-119).
3. Diapositives de références clients (Diapositives 16 à 30) :
   - Si le client est une université ou un établissement d'enseignement (ex: Université de Rouen Normandie), garde impérativement les références d'enseignement comme le CESI (diapositives 23-24) et les références locales comme la Région Normandie (diapositives 27-28). Supprime les références moins pertinentes (comme CIC, Schneider Electric ou Carrefour) pour garder un mémoire technique ciblé.
   - Si le client est industriel, garde Schneider Electric.
   - Si le client est une banque, garde CIC.
4. Diapositives générales (Valeurs, Recrutement, Tenues, Matériel standard, Planning, etc.) : Marquer "keep" si elles sont applicables.

Renvoie un objet JSON contenant la liste des diapositives avec cette structure exacte :
{
  "slides": [
    {
      "pageNumber": number,
      "recommendation": "keep" | "modify" | "delete",
      "reason": "Explication courte en français"
    }
  ]
}`;

  const userPrompt = `Voici l'analyse du marché public (DCE) actuel :
${JSON.stringify(analysisData, null, 2)}

Voici la liste des diapositives du document de référence :
${JSON.stringify(condensedSlides, null, 2)}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error("Réponse vide de l'API OpenAI");
  
  const aiData = JSON.parse(content);
  const mergedSlides = slidesText.map((slide: any) => {
    const rec = aiData.slides?.find((s: any) => s.pageNumber === slide.pageNumber) || {
      recommendation: 'keep',
      reason: 'Conservé par défaut'
    };
    return {
      pageNumber: slide.pageNumber,
      title: slide.title,
      snippet: slide.snippet,
      recommendation: rec.recommendation,
      reason: rec.reason
    };
  });

  return { slides: mergedSlides };
}
